import type { EntityOut } from '@/background/homebox/types';
import { fail, type ErrorCode, type Result } from '@/shared/errors';
import { flattenTree } from '@/shared/locations';
import type { ImportDraft, LocationChoice, PendingImport, TemplateChoice } from '@/shared/types';
import { findDuplicatesByName } from '../duplicates';
import { initialPhotoStep } from './attachments';
import type { StepContext } from './context';
import { hasOrderFields } from './order-fields';
import { hasTemplate } from './templates';

/** Spec 023: `entityTypeId` only when the draft carries one; the creation body is otherwise unchanged. */
const entityTypeOf = (d: ImportDraft): { entityTypeId?: string } =>
  d.entityTypeId ? { entityTypeId: d.entityTypeId } : {};

/** Initial state of a product to create: every step pending, the optional steps only when the draft asks for them. */
export function creationPending(id: string, tabId: number, draft: ImportDraft): PendingImport {
  return {
    id,
    tabId,
    pageUrl: draft.pageUrl,
    draft,
    entityId: null,
    steps: {
      create: 'pending',
      update: 'pending',
      attachments: Object.fromEntries(draft.documents.map((d) => [d.id, 'pending'])),
      photo: initialPhotoStep(draft.photo),
      // Only with tags: without them, the persisted state is unchanged (invariant 1).
      ...(draft.tags?.length ? { tags: 'pending' as const } : {}),
      // Only with a template (spec 018, invariant 1).
      ...(draft.template ? { templateFields: 'pending' as const } : {}),
      // Only with order fields (spec 019, invariant 1).
      ...(hasOrderFields(draft) ? { orderFields: 'pending' as const } : {}),
      // Only with the order link (spec 025, invariant 1).
      ...(draft.orderLink ? { orderLink: 'pending' as const } : {}),
    },
    status: 'running',
    error: null,
    photoError: null,
    photoAttempted: false,
  };
}

/** Retry (invariant 3): the location of an existing object is fixed; spec 018: no "without location" with a template. */
export function locationChangeRefused(
  p: PendingImport,
  location: LocationChoice | null | undefined,
): boolean {
  if (location === undefined) return false;
  return Boolean(p.entityId) || (location === null && Boolean(p.draft.template));
}

/**
 * A definite POST failure with a chosen location: HomeBox answers 404 without creating anything if the `parentId`
 * is unknown (V4), but this status alone does not tell whether the parent is the missing piece. The tree is read again:
 * identifier absent → `LOCATION_NOT_FOUND`, present or re-read impossible → `CREATE_FAILED` (R3).
 */
async function creationFailureFor(
  ctx: StepContext,
  location: LocationChoice | null | undefined,
): Promise<ErrorCode> {
  if (!location) return 'CREATE_FAILED';
  const tree = await ctx.client.listLocations();
  if (!tree.ok) return 'CREATE_FAILED';
  return flattenTree(tree.value).some((l) => l.id === location.id)
    ? 'CREATE_FAILED'
    : 'LOCATION_NOT_FOUND';
}

/** Definite failure of `create-item` (spec 018): the template read again; deleted → `TEMPLATE_NOT_FOUND`. */
async function templateCreationFailureFor(
  ctx: StepContext,
  template: TemplateChoice,
  location: LocationChoice | null | undefined,
): Promise<ErrorCode> {
  const read = await ctx.client.getTemplate(template.id);
  if (!read.ok && read.error === 'TEMPLATE_NOT_FOUND') return 'TEMPLATE_NOT_FOUND';
  return creationFailureFor(ctx, location);
}

/**
 * Spec 023: after a definite creation failure with a chosen type, the list of types is read again once: a type that
 * is gone (or is a location type) is `ENTITY_TYPE_NOT_FOUND`; otherwise, or if the list cannot be read, `code`.
 */
async function entityTypeFailureFor(
  ctx: StepContext,
  entityTypeId: string | undefined,
  code: ErrorCode,
): Promise<ErrorCode> {
  if (!entityTypeId || code !== 'CREATE_FAILED') return code;
  const list = await ctx.client.listEntityTypes();
  if (!list.ok) return code;
  return list.value.some((t) => t.id === entityTypeId && !t.isLocation)
    ? code
    : 'ENTITY_TYPE_NOT_FOUND';
}

/** Code of a definite creation failure: the location, the template (spec 018), then the entity type (spec 023). */
async function definiteFailureFor(ctx: StepContext, p: PendingImport): Promise<ErrorCode> {
  const code = p.draft.template
    ? await templateCreationFailureFor(ctx, p.draft.template, p.draft.location)
    : await creationFailureFor(ctx, p.draft.location);
  return entityTypeFailureFor(ctx, p.draft.entityTypeId, code);
}

/**
 * Uncertain creation (lost response, or service worker stopped during the POST): the object may have been created
 * without its identifier being saved. Its exact name is searched for before sending another POST; the duplicate risk
 * is only reduced, not eliminated (renamed object, lagging search index). `null`: the retry may go on.
 */
export async function uncertainDuplicate(
  ctx: StepContext,
  pending: PendingImport,
): Promise<Result<never> | null> {
  const uncertain = pending.createUncertain || (pending.orphaned && pending.createAttempted);
  if (pending.entityId || !uncertain) return null;
  const dup = await findDuplicatesByName(ctx.client, pending.draft.name);
  if (!dup.ok) return fail(dup.error);
  return dup.value.length > 0 ? fail('DUPLICATE_SUSPECTED') : null;
}

/**
 * Definite or uncertain creation failure: the import ends `failed`. Lost response (network, timeout): the POST
 * may have succeeded. An explicit HTTP error is a definite failure. Unreadable 2xx response or one without `id`:
 * the object may exist too, same handling.
 */
async function createFailed(
  ctx: StepContext,
  p: PendingImport,
  error: ErrorCode,
  httpStatus: number | undefined,
): Promise<void> {
  p.steps.create = 'failed';
  p.status = 'failed';
  const acceptedButUnreadable = httpStatus !== undefined && httpStatus >= 200 && httpStatus < 300;
  if (error !== 'CREATE_FAILED') p.error = error;
  else if (acceptedButUnreadable) p.error = await creationFailureFor(ctx, p.draft.location);
  else p.error = await definiteFailureFor(ctx, p);
  if (error === 'HOMEBOX_UNREACHABLE' || acceptedButUnreadable) p.createUncertain = true;
  else p.createAttempted = false;
  await ctx.persist(p);
}

/** POST /entities. Returns the created object, or `null` after a failure (import already persisted `failed`). */
async function createStep(ctx: StepContext, p: PendingImport): Promise<EntityOut | null> {
  const { client, persist } = ctx;
  // Early write (R8): if the service worker stops during the POST, the orphaned import will know
  // that the object may have been created.
  const draft = p.draft;
  const location = draft.location;
  // Spec 018 (invariant 4): a template always needs a location; refused before any request.
  if (hasTemplate(draft) && !location) {
    p.steps.create = 'failed';
    p.status = 'failed';
    p.error = 'BAD_MESSAGE';
    await persist(p);
    return null;
  }
  p.createAttempted = true;
  delete p.createUncertain;
  await persist(p);
  const res =
    hasTemplate(draft) && location
      ? // Spec 018: created from the template, never a fallback to POST /entities (FR-021).
        await client.createFromTemplate(draft.template.id, {
          name: draft.name,
          description: draft.description || undefined,
          quantity: draft.quantity,
          parentId: location.id,
          ...entityTypeOf(draft),
        })
      : await client.createEntity({
          name: draft.name,
          description: draft.description || undefined,
          quantity: draft.quantity,
          // `parentId` only when a location is chosen: with no choice, the body stays that of spec 001.
          ...(location ? { parentId: location.id } : {}),
          ...entityTypeOf(draft),
        });
  if (!res.ok) {
    await createFailed(ctx, p, res.error, res.httpStatus);
    return null;
  }
  p.entityId = res.value.id;
  p.steps.create = 'done';
  await persist(p);
  return res.value;
}

/**
 * Invariant (FR-021): once `entityId` is set, the object is never created again. `null`: the creation failed.
 * `created` is the POST response, reused by the PUT instead of reading the object again.
 */
export async function ensureEntity(
  ctx: StepContext,
  p: PendingImport,
): Promise<{ entityId: string; created: EntityOut | null } | null> {
  if (p.entityId) return { entityId: p.entityId, created: null };
  const created = await createStep(ctx, p);
  return created ? { entityId: created.id, created } : null;
}

/** Writes the last-entity-type memory (spec 023): the type of the last product created; never blocks the import. */
export async function rememberType(
  ctx: StepContext,
  results: PendingImport[],
  typesRead: boolean,
): Promise<void> {
  const last = results.findLast((r) => r.entityId && !r.draft.complete);
  if (!last || !ctx.deps.rememberEntityType) return;
  const id = last.draft.entityTypeId ?? null;
  // Without a type list read at opening, « no type » says nothing: the remembered type is kept.
  if (id === null && !typesRead) return;
  try {
    await ctx.deps.rememberEntityType(id);
  } catch {
    // memory not written: no consequence for the import
  }
}
