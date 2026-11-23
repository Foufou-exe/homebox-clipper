import { preservingUpdate } from '@/background/homebox/client';
import type { EntityOut } from '@/background/homebox/types';
import type { ErrorCode } from '@/shared/errors';
import { tagKey } from '@/shared/tags';
import type {
  CompletionChoice,
  CompletionKey,
  DraftPhoto,
  ImportDraft,
  OrderFieldValue,
  PendingImport,
  PhotoStep,
  TagChoice,
} from '@/shared/types';
import {
  attachmentPresent,
  completionPatch,
  hasPrimaryPhoto,
  orderNoteLine,
  photoCount,
  quantityPlan,
  tagPresent,
} from '../completion';
import { orderFieldsMatch } from '../order-fields';
import { attachDocument, photoFor, type FileMap, type PhotoMap } from './attachments';
import type { StepContext } from './context';
import { settleOrderFields } from './order-fields';
import {
  knowsTags,
  resolveTags,
  settleTags,
  tagIdsFor,
  type ResolvedTags,
  type TagCache,
} from './tags';
import { updateFailure, type UpdateErrors } from './update';

/** Spec 021: tags checked in the summary whose `tag:<key>` was confirmed for the completion. */
function confirmedTags(draft: ImportDraft, keys: ReadonlySet<CompletionKey>): TagChoice[] {
  return (draft.tags ?? []).filter((c) => keys.has(`tag:${tagKey(c.name)}`));
}

/** Spec 021: photo step of a completion; only a confirmed, checked photo is sent. */
function completionPhotoInit(photo: DraftPhoto | null, confirmed: boolean): PhotoStep {
  if (!photo) return 'unavailable';
  return confirmed && photo.include ? 'pending' : 'not_requested';
}

/**
 * Spec 021 (data-model §5, invariant 2): import state of a product completed instead of created. The item exists:
 * `entityId` is set and the creation step is done from the start, so nothing can ever create it. Only the confirmed
 * documents are kept in the draft; the tag and order-fields steps exist only when such keys were confirmed.
 */
export function completionPending(
  id: string,
  tabId: number,
  draft: ImportDraft,
  choice: CompletionChoice,
): PendingImport {
  const keys = new Set(choice.keys);
  const documents = draft.documents.filter((d) => keys.has(`doc:${d.id}`));
  const withTags = confirmedTags(draft, keys).length > 0;
  const withFields = choice.keys.some((k) => k.startsWith('field:'));
  return {
    id,
    tabId,
    pageUrl: draft.pageUrl,
    draft: { ...draft, documents },
    entityId: choice.entityId,
    steps: {
      create: 'done',
      update: 'pending',
      attachments: Object.fromEntries(documents.map((d) => [d.id, 'pending'])),
      photo: completionPhotoInit(draft.photo, keys.has('photo')),
      ...(withTags ? { tags: 'pending' as const } : {}),
      ...(withFields ? { orderFields: 'pending' as const } : {}),
    },
    status: 'running',
    error: null,
    photoError: null,
    photoAttempted: false,
    completion: { skipped: [], present: [] },
  };
}

/**
 * Resume guard of the completion photo (spec 021, research D3): after an attempt with an unknown outcome, more photos
 * on the item read than before the POST means it was attached; otherwise it is sent again.
 */
function reconcileCompletionPhoto(p: PendingImport, read: EntityOut): void {
  if (p.steps.photo !== 'sending' && p.steps.photo !== 'failed') return;
  const before = p.completion?.photoCountBefore;
  p.steps.photo = before !== undefined && photoCount(read) > before ? 'done' : 'pending';
  if (p.steps.photo === 'done') p.photoError = null;
}

/** Completion state of an import (spec 021), created empty on first use. */
function completionState(p: PendingImport): NonNullable<PendingImport['completion']> {
  p.completion ??= { skipped: [], present: [] };
  return p.completion;
}

/** A document found on the item: done; reported as "already present" unless our own earlier attempt sent it. */
function markAttached(p: PendingImport, docId: string, ownAttempt: boolean): void {
  p.steps.attachments[docId] = 'done';
  const c = completionState(p);
  if (!ownAttempt && !c.present.includes(docId)) c.present.push(docId);
}

/** Adds keys to `completion.skipped`, without duplicates (FR-009). */
function addSkipped(p: PendingImport, keys: readonly CompletionKey[]): void {
  const c = completionState(p);
  for (const k of keys) if (!c.skipped.includes(k)) c.skipped.push(k);
}

/**
 * Spec 021 (FR-016, research R5): quantity to send, from the base and target remembered across resumes; written to the
 * state (persisted before the PUT). Only on the first PUT, and only when the box was checked.
 */
function completionQuantity(
  p: PendingImport,
  choice: CompletionChoice,
  read: EntityOut,
): number | undefined {
  if (choice.quantityIncrease === undefined || p.steps.update === 'done') return undefined;
  const c = completionState(p);
  const plan = quantityPlan(
    typeof read.quantity === 'number' ? read.quantity : 0,
    choice.quantityIncrease,
    c,
  );
  c.quantityBase = plan.base;
  c.quantityTarget = plan.target;
  if (plan.skipped) addSkipped(p, ['quantity']);
  return plan.send;
}

/** The PUT of a completion still has something to do: first attempt, or tags / order fields left. */
function completionPutRemains(p: PendingImport): boolean {
  const { update, tags, orderFields } = p.steps;
  return (
    update !== 'done' ||
    (tags !== undefined && tags !== 'done') ||
    (orderFields !== undefined && orderFields !== 'done')
  );
}

/**
 * Keys still to write on a resume once the PUT succeeded: only the order fields, when their step remains. Purchase,
 * notes and quantity are never computed again (they would look "filled meanwhile").
 */
function remainingChoice(p: PendingImport, choice: CompletionChoice): CompletionChoice {
  if (p.steps.update !== 'done') return choice;
  const fieldsLeft = p.steps.orderFields !== undefined && p.steps.orderFields !== 'done';
  const keys = choice.keys.filter((k) => fieldsLeft && k.startsWith('field:'));
  return { entityId: choice.entityId, itemName: choice.itemName, keys };
}

/**
 * Spec 021: tags confirmed for the completion and still missing from the item read. `null`: nothing to add (the step
 * is then done). Only called when the tags of the item are known (`completionTagsUnknown` otherwise).
 */
async function completionTags(
  ctx: StepContext,
  p: PendingImport,
  choice: CompletionChoice,
  read: EntityOut,
  cache: TagCache,
): Promise<ResolvedTags | null> {
  if (p.steps.tags === undefined || p.steps.tags === 'done') return null;
  const wanted = confirmedTags(p.draft, new Set(choice.keys)).filter((c) => !tagPresent(read, c));
  if (wanted.length === 0) {
    p.steps.tags = 'done';
    delete p.failedTags;
    return null;
  }
  return resolveTags(ctx, { ...p, draft: { ...p.draft, tags: wanted } }, cache);
}

/** Spec 021 (FR-014): the order fields added are checked on a new read; skipped ones close the step. */
async function settleCompletionFields(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
  added: OrderFieldValue[],
  putOk: boolean,
): Promise<ErrorCode | null> {
  if (p.steps.orderFields === undefined || p.steps.orderFields === 'done') return null;
  if (added.length === 0) return settleOrderFields(p, true);
  if (!putOk) return settleOrderFields(p, false);
  const again = await ctx.client.getEntity(entityId);
  return settleOrderFields(p, again.ok && orderFieldsMatch(again.value.fields, added));
}

/** Spec 021 (C5, FR-017): nothing left to write, no PUT; the tags that could not be resolved are reported. */
async function completionNoPut(
  ctx: StepContext,
  p: PendingImport,
  tags: ResolvedTags | null,
): Promise<UpdateErrors> {
  if (p.steps.update === 'pending') completionState(p).noChange = true;
  p.steps.update = 'done';
  const tagsError = tags ? settleTags(p, tags, false) : null;
  const orderFieldsError =
    p.steps.orderFields && p.steps.orderFields !== 'done' ? settleOrderFields(p, true) : null;
  await ctx.persist(p);
  return { updateError: null, tagsError, templateFieldsError: null, orderFieldsError };
}

/**
 * Spec 021 (FR-013): the tags of the item read are unknown, so no PUT can keep them. Nothing is written; the update
 * step fails (retryable), and so do the tags and the order fields still to write.
 */
async function completionTagsUnknown(
  ctx: StepContext,
  p: PendingImport,
  choice: CompletionChoice,
): Promise<UpdateErrors> {
  p.steps.update = 'failed';
  const wanted = confirmedTags(p.draft, new Set(choice.keys)).map((c) => c.name);
  const tagsError =
    p.steps.tags && p.steps.tags !== 'done'
      ? settleTags(p, { resolved: [], failed: wanted, error: 'TAG_FAILED' }, false)
      : null;
  const orderFieldsError =
    p.steps.orderFields && p.steps.orderFields !== 'done' ? settleOrderFields(p, false) : null;
  await ctx.persist(p);
  return { updateError: 'UPDATE_FAILED', tagsError, templateFieldsError: null, orderFieldsError };
}

/**
 * Spec 021 (contracts/homebox-completion.md §2): one PUT built by `preservingUpdate` on the item read just before,
 * carrying only the confirmed changes still applicable (the others are `skipped`), the union of the tags, and the
 * quantity when checked. Never a second PUT without the added parts (unlike the creation): a refusal fails the step.
 */
async function completionUpdateStep(
  ctx: StepContext,
  p: PendingImport,
  choice: CompletionChoice,
  read: EntityOut,
  cache: TagCache,
): Promise<UpdateErrors> {
  if (!completionPutRemains(p))
    return {
      updateError: null,
      tagsError: null,
      templateFieldsError: null,
      orderFieldsError: null,
    };
  // A PUT without `tagIds` would remove every tag of the item: tags unknown ⇒ no PUT at all, retryable (FR-013).
  if (!knowsTags(read)) return completionTagsUnknown(ctx, p, choice);
  const entityId = choice.entityId;
  const tags = await completionTags(ctx, p, choice, read, cache);
  const quantity = completionQuantity(p, choice, read);
  const plan = completionPatch(
    read,
    p.draft,
    remainingChoice(p, choice),
    orderNoteLine(p.draft),
    quantity,
  );
  addSkipped(p, plan.skipped);
  const tagIds = tags && tags.resolved.length > 0 ? tagIdsFor(read, tags) : null;
  if (Object.keys(plan.patch).length === 0 && !tagIds) return completionNoPut(ctx, p, tags);
  // Early write (R5): base and target of the quantity, and the skipped keys, are known before the PUT.
  await ctx.persist(p);
  const res = await ctx.client.updateEntity(
    entityId,
    preservingUpdate(read, { ...plan.patch, ...(tagIds ? { tagIds } : {}) }),
  );
  p.steps.update = res.ok ? 'done' : 'failed';
  const tagsError = tags ? settleTags(p, tags, res.ok && tagIds !== null) : null;
  const orderFieldsError = await settleCompletionFields(ctx, p, entityId, plan.fields, res.ok);
  await ctx.persist(p);
  return {
    updateError: updateFailure(res),
    tagsError,
    templateFieldsError: null,
    orderFieldsError,
  };
}

/**
 * Spec 021 (FR-018): confirmed documents whose title is not on the item read; the others are "already present". A
 * document whose own earlier POST failed (answer lost) and whose title is now there is simply done, not "present".
 */
async function completionAttachmentsStep(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
  read: EntityOut,
  files: FileMap,
): Promise<ErrorCode | null> {
  let firstError: ErrorCode | null = null;
  for (const doc of p.draft.documents) {
    if (p.steps.attachments[doc.id] === 'done') continue;
    if (attachmentPresent(read, doc)) {
      markAttached(p, doc.id, p.steps.attachments[doc.id] === 'failed');
      await ctx.persist(p); // NOSONAR: sequential on purpose (state saved after each document)
      continue;
    }
    const error = await attachDocument(ctx, p, entityId, doc, files); // NOSONAR: sequential on purpose (one instance, resume state per document)
    firstError ??= error;
  }
  return firstError;
}

/**
 * Spec 021 (FR-019, research D3): photo of a completion. Primary only when the item has no primary photo; the
 * number of photos is remembered before the POST, and a resume that reads more photos does not send it again.
 */
async function sendCompletionPhoto(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
  read: EntityOut,
  photos: PhotoMap,
): Promise<void> {
  const photo = p.draft.photo;
  if (!photo) return;
  const fetched = await photoFor(ctx, photo, photos);
  if (!fetched.ok) {
    p.steps.photo = 'failed';
    p.photoError = fetched.error;
    return;
  }
  completionState(p).photoCountBefore = photoCount(read);
  p.steps.photo = 'sending';
  p.photoAttempted = true;
  await ctx.persist(p);
  const res = await ctx.client.addAttachment(entityId, {
    bytes: fetched.value.bytes,
    filename: fetched.value.filename,
    type: 'photo',
    mimeType: fetched.value.mimeType,
    primary: !hasPrimaryPhoto(read),
  });
  p.steps.photo = res.ok ? 'done' : 'failed';
  p.photoError = res.ok ? null : 'PHOTO_UPLOAD_FAILED';
}

/** Photo step of a completion: guard by number of photos (never `reconcilePhoto`, kept for the creation). */
async function completionPhotoStep(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
  read: EntityOut,
  photos: PhotoMap,
): Promise<ErrorCode | null> {
  p.steps.photo ??= 'not_requested';
  p.photoError ??= null;
  reconcileCompletionPhoto(p, read);
  if (p.steps.photo === 'pending') {
    await sendCompletionPhoto(ctx, p, entityId, read, photos);
    await ctx.persist(p);
  }
  if (p.steps.photo === 'failed') return p.photoError;
  p.photoError = null;
  return null;
}

/** Caches of a call, shared by its products. */
export interface CallCaches {
  files: FileMap;
  photos: PhotoMap;
  tagCache: TagCache;
}

/**
 * Spec 021: the steps of a product completed instead of created, on the item read at the start of the run. Each step
 * runs even if a previous one failed; returns the first error to report, if any.
 */
export async function completionSteps(
  ctx: StepContext,
  p: PendingImport,
  choice: CompletionChoice,
  read: EntityOut,
  caches: CallCaches,
): Promise<ErrorCode | null> {
  const { updateError, tagsError, orderFieldsError } = await completionUpdateStep(
    ctx,
    p,
    choice,
    read,
    caches.tagCache,
  );
  const attachmentsError = await completionAttachmentsStep(
    ctx,
    p,
    choice.entityId,
    read,
    caches.files,
  );
  const photoError = await completionPhotoStep(ctx, p, choice.entityId, read, caches.photos);
  return updateError ?? orderFieldsError ?? attachmentsError ?? photoError ?? tagsError;
}
