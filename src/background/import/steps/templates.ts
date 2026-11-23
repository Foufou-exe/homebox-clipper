import { entityOutToUpdate } from '@/background/homebox/client';
import type { EntityOut, EntityUpdate } from '@/background/homebox/types';
import { normalizeTemplate } from '@/background/templates/normalize';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import type { ImportDraft, PendingImport, TemplateChoice } from '@/shared/types';
import { fieldsFor, fieldsMatch, templatePatch } from '../template-patch';
import type { StepContext } from './context';
import { knowsTags, settleTags, tagIdsFor, tagsOnlyStep, type ResolvedTags } from './tags';
import { keepAccessError, purchaseBase, purchasePut } from './update';

export type TemplateDraft = ImportDraft & { template: TemplateChoice };
export const hasTemplate = (d: ImportDraft): d is TemplateDraft => d.template !== undefined;

/** Records the outcome of the template fields (spec 018): `done` only after a conforming read-back. */
export function settleTemplateFields(p: PendingImport, matched: boolean): ErrorCode | null {
  if (matched) {
    p.steps.templateFields = 'done';
    delete p.templateFieldsError;
    return null;
  }
  p.steps.templateFields = 'failed';
  p.templateFieldsError = 'TEMPLATE_FIELDS_FAILED';
  return 'TEMPLATE_FIELDS_FAILED';
}

/** Template whose fields still remain to be written (spec 018), or `null`. */
export function remainingTemplate(p: PendingImport, draft: ImportDraft): TemplateDraft | null {
  return hasTemplate(draft) && p.steps.templateFields !== 'done' ? draft : null;
}

/**
 * Re-check of the templates of a batch (spec 018, FR-020, invariant 2): one read per distinct template, before any
 * persistence or creation. Deleted → `TEMPLATE_NOT_FOUND`; fingerprint different from the one confirmed →
 * `TEMPLATE_CHANGED`; another failure → its code. Never called for a batch without template.
 */
export async function verifyTemplates(
  ctx: StepContext,
  drafts: readonly ImportDraft[],
): Promise<Result<void>> {
  const byId = new Map<string, Set<string>>();
  for (const d of drafts) {
    if (!d.template) continue;
    const set = byId.get(d.template.id) ?? new Set<string>();
    set.add(d.template.fingerprint);
    byId.set(d.template.id, set);
  }
  for (const [id, fingerprints] of byId) {
    const read = await ctx.client.getTemplate(id); // NOSONAR: sequential on purpose (one instance, short list)
    if (!read.ok) return fail(read.error);
    const detail = await normalizeTemplate(read.value);
    if (!detail.ok) return fail(detail.error);
    if ([...fingerprints].some((f) => f !== detail.value.fingerprint))
      return fail('TEMPLATE_CHANGED');
  }
  return ok(undefined);
}

/**
 * Spec 018: before any creation, the template is checked again (US6-4); once the object exists, never (US6-3).
 * A template without location is refused and recorded as a failed creation. `null`: the retry may go on.
 */
export async function templateGate(
  ctx: StepContext,
  pending: PendingImport,
): Promise<Result<never> | null> {
  if (pending.entityId || !pending.draft.template) return null;
  if (!pending.draft.location) {
    pending.steps.create = 'failed';
    pending.status = 'failed';
    pending.error = 'BAD_MESSAGE';
    await ctx.persist(pending);
    return fail('BAD_MESSAGE');
  }
  const verified = await verifyTemplates(ctx, [pending.draft]);
  return verified.ok ? null : verified;
}

/** Read-back of the object after a successful PUT (FR-018): every confirmed field with its exact values. */
async function readBack(
  ctx: StepContext,
  entityId: string,
  confirmed: TemplateChoice['fields'],
): Promise<boolean> {
  const read = await ctx.client.getEntity(entityId);
  return read.ok && fieldsMatch(read.value.fields, confirmed);
}

/**
 * Template path (spec 018, contracts/import-templates.md §2, §3): a single PUT carries the purchase data (without
 * `warrantyPatch`), the template values, the paired fields and the tags; then the object is read again. Purchase
 * already saved: PUT reserved to the template fields (and to the tags if they also remain), on the object read again.
 */
export async function templateUpdateStep(
  ctx: StepContext,
  p: PendingImport,
  draft: TemplateDraft,
  entityId: string,
  created: EntityOut | null,
  tags: ResolvedTags | null,
): Promise<{
  updateError: ErrorCode | null;
  tagsError: ErrorCode | null;
  templateFieldsError: ErrorCode | null;
}> {
  const confirmed = draft.template.fields;
  if (p.steps.update === 'done') {
    if (p.steps.templateFields === 'done') {
      return {
        updateError: null,
        tagsError: tags ? await tagsOnlyStep(ctx, p, entityId, tags) : null,
        templateFieldsError: null,
      };
    }
    return { updateError: null, ...(await templateFieldsOnlyStep(ctx, p, draft, entityId, tags)) };
  }
  const current = created ? ok(created) : await ctx.client.getEntity(entityId);
  const { res, applied } = current.ok
    ? await purchasePut(
        ctx,
        entityId,
        current.value,
        {
          ...purchaseBase(draft, current.value),
          ...templatePatch(draft),
          fields: fieldsFor(current.value.fields, confirmed),
        },
        tags,
      )
    : { res: current, applied: false };
  p.steps.update = res.ok ? 'done' : 'failed';
  const tagsError = tags ? settleTags(p, tags, applied) : null;
  const templateFieldsError = settleTemplateFields(
    p,
    res.ok && (await readBack(ctx, entityId, confirmed)),
  );
  await ctx.persist(p);
  if (res.ok) return { updateError: null, tagsError, templateFieldsError };
  return { updateError: keepAccessError(res.error), tagsError, templateFieldsError };
}

/** Fields step alone (resume): never touches the purchase data; the tags join the same PUT when they remain too. */
export async function templateFieldsOnlyStep(
  ctx: StepContext,
  p: PendingImport,
  draft: TemplateDraft,
  entityId: string,
  tags: ResolvedTags | null,
): Promise<{ tagsError: ErrorCode | null; templateFieldsError: ErrorCode | null }> {
  const confirmed = draft.template.fields;
  const current = await ctx.client.getEntity(entityId);
  let applied = false;
  let putOk = false;
  if (current.ok) {
    const withTags = !!tags?.resolved.length && knowsTags(current.value);
    const patch: Partial<EntityUpdate> = {
      ...templatePatch(draft),
      fields: fieldsFor(current.value.fields, confirmed),
      ...(withTags ? { tagIds: tagIdsFor(current.value, tags) } : {}),
    };
    const res = await ctx.client.updateEntity(entityId, entityOutToUpdate(current.value, patch));
    putOk = res.ok;
    applied = res.ok && withTags;
  }
  const tagsError = tags ? settleTags(p, tags, applied) : null;
  const templateFieldsError = settleTemplateFields(
    p,
    putOk && (await readBack(ctx, entityId, confirmed)),
  );
  await ctx.persist(p);
  return { tagsError, templateFieldsError };
}
