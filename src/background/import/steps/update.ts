import { entityOutToUpdate } from '@/background/homebox/client';
import type { EntityOut, EntityUpdate } from '@/background/homebox/types';
import { storeForPageUrl } from '@/content/merchants/catalog';
import { getMessage } from '@/platform/i18n';
import { ok, type ErrorCode, type Result } from '@/shared/errors';
import type { ImportDraft, PendingImport } from '@/shared/types';
import { warrantyPatch } from '@/shared/warranty';
import { identifiersPatch } from '../identifiers-patch';
import type { StepContext } from './context';
import { knowsTags, settleTags, tagIdsFor, tagsOnlyStep, type ResolvedTags } from './tags';

/** Errors of the PUT step and of the field steps that ride on it. */
export interface UpdateErrors {
  updateError: ErrorCode | null;
  tagsError: ErrorCode | null;
  templateFieldsError: ErrorCode | null;
  orderFieldsError: ErrorCode | null;
}

/** HomeBox note: the store of origin, found from the page of the order (FR-007), then the page address. */
export function buildNotes(draft: ImportDraft): string | undefined {
  if (!draft.orderNumber) return undefined;
  const store = storeForPageUrl(draft.pageUrl);
  const note = store
    ? getMessage('summary.orderNote', [store.displayName, draft.orderNumber])
    : getMessage('summary.orderNoteNoStore', [draft.orderNumber]);
  return [note, draft.pageUrl].filter(Boolean).join('\n');
}

/**
 * Purchase data of the PUT without the warranty (spec 018, research D3): the template path sends the warranty
 * explicitly (`templatePatch`) instead of `warrantyPatch`.
 */
export function purchaseBase(draft: ImportDraft, current: EntityOut): Partial<EntityUpdate> {
  return {
    purchasePrice: draft.purchasePrice ?? undefined,
    purchaseDate: draft.purchaseDate ?? undefined,
    purchaseFrom: draft.purchaseFrom || undefined,
    notes: buildNotes(draft),
    // Spec 027: only the identifiers the item does not already have; no key without any (sequence unchanged).
    ...identifiersPatch(draft.identifiers, current),
    // A PUT without `parentId` would lose the location (V3): it is always sent.
    parentId: current.parent?.id ?? draft.location?.id,
  };
}

/** Purchase data of the PUT, built from the draft and the object read (or created). */
export function purchasePatch(draft: ImportDraft, current: EntityOut): Partial<EntityUpdate> {
  return {
    ...purchaseBase(draft, current),
    // Never overwrites a warranty already filled on the object (FR-008).
    ...warrantyPatch(draft.warranty, current),
  };
}

/**
 * Errors that keep their own code instead of `UPDATE_FAILED`: a refused key, and (spec 024) a chosen collection that
 * can no longer be reached. Neither is sent again in another form (no fallback PUT).
 */
export function isAccessError(error: ErrorCode): boolean {
  return error === 'UNAUTHORIZED' || error === 'COLLECTION_UNAVAILABLE';
}

/** `UNAUTHORIZED` and `COLLECTION_UNAVAILABLE` pass through; every other failure of an update is `UPDATE_FAILED`. */
export function keepAccessError(error: ErrorCode): ErrorCode {
  return isAccessError(error) ? error : 'UPDATE_FAILED';
}

/** Error reported for a failed purchase PUT (unchanged mapping, plus spec 024). */
export function updateFailure(res: Result<unknown>): ErrorCode | null {
  if (res.ok) return null;
  return keepAccessError(res.error);
}

/**
 * Purchase PUT. With tags to apply (and the current tags known), `tagIds` is added; a definite refusal may come
 * from the tags (FR-012): the same PUT is then sent again without the added tags.
 */
export async function purchasePut(
  ctx: StepContext,
  entityId: string,
  current: EntityOut,
  purchase: Partial<EntityUpdate>,
  tags: ResolvedTags | null,
): Promise<{ res: Result<EntityOut>; applied: boolean }> {
  const { client } = ctx;
  if (!tags?.resolved.length || !knowsTags(current)) {
    return {
      res: await client.updateEntity(entityId, entityOutToUpdate(current, purchase)),
      applied: false,
    };
  }
  const res = await client.updateEntity(
    entityId,
    entityOutToUpdate(current, { ...purchase, tagIds: tagIdsFor(current, tags) }),
  );
  if (res.ok || res.httpStatus === undefined || isAccessError(res.error))
    return { res, applied: res.ok };
  return {
    res: await client.updateEntity(entityId, entityOutToUpdate(current, purchase)),
    applied: false,
  };
}

/**
 * PUT of the purchase data (and of the tags, when there are some to apply). Returns the error to report and the
 * tag error, if any. Without tags to apply, the patch has no `tagIds` key: the sequence is unchanged (invariant 1).
 */
export async function updateStep(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
  created: EntityOut | null,
  tags: ResolvedTags | null,
): Promise<{ updateError: ErrorCode | null; tagsError: ErrorCode | null }> {
  if (p.steps.update === 'done') {
    return {
      updateError: null,
      tagsError: tags ? await tagsOnlyStep(ctx, p, entityId, tags) : null,
    };
  }
  const current = created ? ok(created) : await ctx.client.getEntity(entityId);
  const { res, applied } = current.ok
    ? await purchasePut(ctx, entityId, current.value, purchasePatch(p.draft, current.value), tags)
    : { res: current, applied: false };
  p.steps.update = res.ok ? 'done' : 'failed';
  // Tags unknown on the object, or PUT refused: not applied, reported as a tag failure (never assumed empty).
  const tagsError = tags ? settleTags(p, tags, applied) : null;
  await ctx.persist(p);
  if (res.ok) return { updateError: null, tagsError };
  return { updateError: keepAccessError(res.error), tagsError };
}
