import { entityOutToUpdate } from '@/background/homebox/client';
import type { EntityOut, EntityUpdate } from '@/background/homebox/types';
import { ok, type ErrorCode, type Result } from '@/shared/errors';
import type { ImportDraft, OrderFieldValue, PendingImport } from '@/shared/types';
import { applyOrderFields, currentFields, orderFieldsMatch } from '../order-fields';
import { fieldsFor, fieldsMatch, templatePatch } from '../template-patch';
import type { StepContext } from './context';
import { knowsTags, settleTags, tagIdsFor, tagsOnlyStep, type ResolvedTags } from './tags';
import {
  hasTemplate,
  remainingTemplate,
  settleTemplateFields,
  templateFieldsOnlyStep,
  type TemplateDraft,
} from './templates';
import {
  isAccessError,
  purchaseBase,
  purchasePatch,
  purchasePut,
  updateFailure,
  type UpdateErrors,
} from './update';

export type OrderDraft = ImportDraft & { orderFields: OrderFieldValue[] };
/** Spec 019: order fields to write. Without them (option off), no new code runs (invariant 1, FR-025). */
export const hasOrderFields = (d: ImportDraft): d is OrderDraft => Boolean(d.orderFields?.length);

/** Records the outcome of the order fields (spec 019): `done` only after a conforming read-back (FR-023). */
export function settleOrderFields(p: PendingImport, matched: boolean): ErrorCode | null {
  if (matched) {
    p.steps.orderFields = 'done';
    delete p.orderFieldsError;
    return null;
  }
  p.steps.orderFields = 'failed';
  p.orderFieldsError = 'ORDER_FIELDS_FAILED';
  return 'ORDER_FIELDS_FAILED';
}

/** Purchase patch of the order-fields PUT, without (fallback) and with the order fields (contracts §2, §3). */
function orderPatches(
  draft: OrderDraft,
  current: EntityOut,
): { without: Partial<EntityUpdate>; withOrder: Partial<EntityUpdate> } {
  if (hasTemplate(draft)) {
    const fields = fieldsFor(current.fields, draft.template.fields);
    const without = { ...purchaseBase(draft, current), ...templatePatch(draft), fields };
    return {
      without,
      withOrder: { ...without, fields: applyOrderFields(fields, draft.orderFields) },
    };
  }
  const without = purchasePatch(draft, current);
  return {
    without,
    withOrder: {
      ...without,
      fields: applyOrderFields(currentFields(current.fields), draft.orderFields),
    },
  };
}

/**
 * PUT carrying the order fields (spec 019, research D3.5). A definite refusal (known HTTP status, not 401/403) is sent
 * again once without them, from the same state read before the first PUT (`purchasePut`, which keeps its own fallback
 * without tags). A lost answer or a refused key: no fallback (unknown outcome). `orderSent`: the order fields were
 * accepted.
 */
async function orderFieldsPut(
  ctx: StepContext,
  entityId: string,
  current: EntityOut,
  patches: { without: Partial<EntityUpdate>; withOrder: Partial<EntityUpdate> },
  tags: ResolvedTags | null,
): Promise<{ res: Result<unknown>; applied: boolean; orderSent: boolean }> {
  const withTags = tags !== null && tags.resolved.length > 0 && knowsTags(current);
  const tagIds = withTags ? { tagIds: tagIdsFor(current, tags) } : {};
  const res = await ctx.client.updateEntity(
    entityId,
    entityOutToUpdate(current, { ...patches.withOrder, ...tagIds }),
  );
  if (res.ok || res.httpStatus === undefined || isAccessError(res.error)) {
    return { res, applied: res.ok && withTags, orderSent: res.ok };
  }
  return {
    ...(await purchasePut(ctx, entityId, current, patches.without, tags)),
    orderSent: false,
  };
}

/**
 * One read-back for both field checks (spec 018 and 019): only after a PUT carrying fields to check. Settles the
 * template fields (when they remain) and the order fields; returns their errors.
 */
async function settleFieldSteps(
  ctx: StepContext,
  p: PendingImport,
  draft: OrderDraft,
  entityId: string,
  template: TemplateDraft | null,
  outcome: { putOk: boolean; orderSent: boolean },
): Promise<{ templateFieldsError: ErrorCode | null; orderFieldsError: ErrorCode | null }> {
  const needed = outcome.orderSent || (template !== null && outcome.putOk);
  const read = needed ? await ctx.client.getEntity(entityId) : null;
  const fields = read?.ok ? read.value.fields : null;
  const templateFieldsError = template
    ? settleTemplateFields(
        p,
        outcome.putOk && fields !== null && fieldsMatch(fields, template.template.fields),
      )
    : null;
  const orderFieldsError = settleOrderFields(
    p,
    outcome.orderSent && fields !== null && orderFieldsMatch(fields, draft.orderFields),
  );
  return { templateFieldsError, orderFieldsError };
}

/**
 * Order-fields path (spec 019, contracts/import-order-fields.md §2, §3): the existing purchase PUT also carries the
 * order fields (no extra write), then the object is read again once. Purchase already saved: resume (§4).
 */
export async function orderFieldsUpdateStep(
  ctx: StepContext,
  p: PendingImport,
  draft: OrderDraft,
  entityId: string,
  created: EntityOut | null,
  tags: ResolvedTags | null,
): Promise<UpdateErrors> {
  if (p.steps.update === 'done')
    return { updateError: null, ...(await orderFieldsResumeStep(ctx, p, draft, entityId, tags)) };
  const current = created ? ok(created) : await ctx.client.getEntity(entityId);
  const put = current.ok
    ? await orderFieldsPut(ctx, entityId, current.value, orderPatches(draft, current.value), tags)
    : { res: current, applied: false, orderSent: false };
  p.steps.update = put.res.ok ? 'done' : 'failed';
  const tagsError = tags ? settleTags(p, tags, put.applied) : null;
  const template = hasTemplate(draft) ? draft : null;
  const fieldErrors = await settleFieldSteps(ctx, p, draft, entityId, template, {
    putOk: put.res.ok,
    orderSent: put.orderSent,
  });
  await ctx.persist(p);
  return { updateError: updateFailure(put.res), tagsError, ...fieldErrors };
}

/**
 * Fields-only PUT of a resume (contracts §4): never touches the purchase data. The order fields, the template fields
 * when they remain, and the tags when they remain too, on the object read again. Returns the PUT outcome.
 */
async function fieldsOnlyPut(
  ctx: StepContext,
  draft: OrderDraft,
  entityId: string,
  template: TemplateDraft | null,
  tags: ResolvedTags | null,
): Promise<{ putOk: boolean; applied: boolean }> {
  const current = await ctx.client.getEntity(entityId);
  if (!current.ok) return { putOk: false, applied: false };
  const withTags = tags !== null && tags.resolved.length > 0 && knowsTags(current.value);
  const base = template
    ? fieldsFor(current.value.fields, template.template.fields)
    : currentFields(current.value.fields);
  const patch: Partial<EntityUpdate> = {
    ...(template ? templatePatch(template) : {}),
    fields: applyOrderFields(base, draft.orderFields),
    ...(withTags ? { tagIds: tagIdsFor(current.value, tags) } : {}),
  };
  const res = await ctx.client.updateEntity(entityId, entityOutToUpdate(current.value, patch));
  return { putOk: res.ok, applied: res.ok && withTags };
}

/** Resume once the purchase is saved (contracts §4): the confirmed names and values of `draft.orderFields` only. */
async function orderFieldsResumeStep(
  ctx: StepContext,
  p: PendingImport,
  draft: OrderDraft,
  entityId: string,
  tags: ResolvedTags | null,
): Promise<Omit<UpdateErrors, 'updateError'>> {
  const template = remainingTemplate(p, draft);
  if (p.steps.orderFields === 'done') {
    if (template)
      return {
        ...(await templateFieldsOnlyStep(ctx, p, template, entityId, tags)),
        orderFieldsError: null,
      };
    return {
      tagsError: tags ? await tagsOnlyStep(ctx, p, entityId, tags) : null,
      templateFieldsError: null,
      orderFieldsError: null,
    };
  }
  const { putOk, applied } = await fieldsOnlyPut(ctx, draft, entityId, template, tags);
  const tagsError = tags ? settleTags(p, tags, applied) : null;
  const fieldErrors = await settleFieldSteps(ctx, p, draft, entityId, template, {
    putOk,
    orderSent: putOk,
  });
  await ctx.persist(p);
  return { tagsError, ...fieldErrors };
}
