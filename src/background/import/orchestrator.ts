import { entityOutToUpdate, preservingUpdate, type HomeBoxClient } from '@/background/homebox/client';
import type { EntityOut, EntityUpdate, TagSummary } from '@/background/homebox/types';
import { storeForPageUrl } from '@/content/merchants/catalog';
import { getMessage } from '@/platform/i18n';
import { homeboxTypeOf, isOptionalHomeboxType } from '@/shared/document-kinds';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { logError } from '@/shared/logger';
import {
  attachmentName,
  attachmentPresent,
  completionPatch,
  hasPrimaryPhoto,
  orderNoteLine,
  photoCount,
  quantityPlan,
  tagPresent,
} from './completion';
import { findDuplicatesByName } from './duplicates';
import { fieldsFor, fieldsMatch, templatePatch } from './template-patch';
import { applyOrderFields, currentFields, orderFieldsMatch } from './order-fields';
import { normalizeTemplate } from '@/background/templates/normalize';
import { orderLinkUrl } from '@/shared/order-link';
import { MAX_DOCUMENT_BYTES, base64Size, base64ToBytes, isPdf } from '@/shared/pdf';
import { flattenTree } from '@/shared/locations';
import { warrantyPatch } from '@/shared/warranty';
import { findExisting, normalizeTagName, tagKey, unionIds } from '@/shared/tags';
import type {
  CompletionChoice,
  CompletionKey,
  DocumentRef,
  DraftPhoto,
  ImportDraft,
  LocationChoice,
  ManualFile,
  OrderFieldValue,
  PendingImport,
  PhotoStep,
  TagChoice,
  TemplateChoice,
} from '@/shared/types';
import type { FetchedPhoto } from './photo-fetch';

export interface OrchestratorDeps {
  client: HomeBoxClient;
  store: {
    save(p: PendingImport): Promise<void>;
    get(id: string): Promise<PendingImport | null>;
    purge(p: PendingImport): Promise<void>;
  };
  /** Downloads a detected document via the script injected in the tab of the Amazon store of the order. */
  downloadDetected(tabId: number, url: string): Promise<Result<{ base64: string }>>;
  /** Fetches the photo from the merchant's server (separate module: it never has access to the key). */
  fetchPhoto(photo: DraftPhoto): Promise<Result<FetchedPhoto>>;
  /**
   * Remembers the last location used with this instance (R10): identifier only. Optional, and a
   * write error never interrupts the import.
   */
  rememberLocation?(locationId: string): Promise<void>;
  /**
   * Remembers the last entity type used with this instance (spec 023): a type identifier, or `null` when the server
   * default was used (the memory is erased). Optional, and a write error never interrupts the import.
   */
  rememberEntityType?(entityTypeId: string | null): Promise<void>;
  /**
   * Local import history (spec 012), bound to the history key and to the instance by the caller. Optional:
   * without it, the import behaves exactly as before. A write error never interrupts the import.
   */
  history?: {
    start(p: PendingImport): Promise<void>;
    update(p: PendingImport): Promise<void>;
  };
  notify(p: PendingImport): void;
  newId(): string;
}

type FileMap = Map<string, Result<Uint8Array>>;
/** Photos fetched during a call, by URL: an order with several products downloads the image only once. */
type PhotoMap = Map<string, Result<FetchedPhoto>>;

/**
 * HomeBox tags read and created during a call (spec 014), shared by the products of the call like `PhotoMap`:
 * the list is read once per call (always again on a retry, invariant 4).
 */
interface TagCache {
  list?: Result<TagSummary[]>;
  created: Map<string, Result<TagSummary>>;
}
const newTagCache = (): TagCache => ({ created: new Map() });

/** Tags of a product resolved to HomeBox identifiers; `failed`: names that cannot be applied. */
interface ResolvedTags {
  /** Identifier and name of each resolved choice, in the order of the draft. */
  resolved: { id: string; name: string }[];
  failed: string[];
  error: ErrorCode | null;
}

function initialPhotoStep(photo: DraftPhoto | null): PhotoStep {
  if (!photo) return 'unavailable';
  return photo.include ? 'pending' : 'not_requested';
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
 * Outcome of the tags after the PUT: `done` only if a successful PUT carried every chosen tag (invariant 7),
 * otherwise `failed` with the names not applied. Returns the error to report, if any.
 */
function settleTags(p: PendingImport, tags: ResolvedTags, applied: boolean): ErrorCode | null {
  const failed = applied ? tags.failed : [...tags.resolved.map((r) => r.name), ...tags.failed];
  const ordered = (p.draft.tags ?? []).map((c) => c.name).filter((n) => failed.includes(n));
  if (ordered.length === 0) {
    p.steps.tags = 'done';
    delete p.failedTags;
    return null;
  }
  p.steps.tags = 'failed';
  p.failedTags = ordered;
  return tags.error ?? 'TAG_FAILED';
}

/** `tagIds` of a PUT: the current tags of the object first, never removed (FR-007, invariant 5). */
const tagIdsFor = (current: EntityOut, tags: ResolvedTags) =>
  unionIds(
    (current.tags ?? []).map((t) => t.id),
    tags.resolved.map((r) => r.id),
  );

/**
 * The current tags of the object must be known before sending `tagIds` (which replaces them all). `null` is a Go
 * nil slice, always empty: known, no tag. An absent field (or another type) gets no `tagIds`: the chosen tags are
 * reported as failed and can be retried.
 */
const knowsTags = (o: EntityOut) => Array.isArray(o.tags) || o.tags === null;

/**
 * Purchase data of the PUT without the warranty (spec 018, research D3): the template path sends the warranty
 * explicitly (`templatePatch`) instead of `warrantyPatch`.
 */
function purchaseBase(draft: ImportDraft, current: EntityOut): Partial<EntityUpdate> {
  return {
    purchasePrice: draft.purchasePrice ?? undefined,
    purchaseDate: draft.purchaseDate ?? undefined,
    purchaseFrom: draft.purchaseFrom || undefined,
    notes: buildNotes(draft),
    // A PUT without `parentId` would lose the location (V3): it is always sent.
    parentId: current.parent?.id ?? draft.location?.id,
  };
}

/** Purchase data of the PUT, built from the draft and the object read (or created). */
function purchasePatch(draft: ImportDraft, current: EntityOut): Partial<EntityUpdate> {
  return {
    ...purchaseBase(draft, current),
    // Never overwrites a warranty already filled on the object (FR-008).
    ...warrantyPatch(draft.warranty, current),
  };
}

type TemplateDraft = ImportDraft & { template: TemplateChoice };
/** Spec 023: `entityTypeId` only when the draft carries one; the creation body is otherwise unchanged. */
const entityTypeOf = (d: ImportDraft): { entityTypeId?: string } => (d.entityTypeId ? { entityTypeId: d.entityTypeId } : {});
const hasTemplate = (d: ImportDraft): d is TemplateDraft => d.template !== undefined;

type OrderDraft = ImportDraft & { orderFields: OrderFieldValue[] };
/** Spec 019: order fields to write. Without them (option off), no new code runs (invariant 1, FR-025). */
const hasOrderFields = (d: ImportDraft): d is OrderDraft => Boolean(d.orderFields?.length);

/**
 * Spec 025 (research R3): an external link attachment (`mimeType` `link/url`) with exactly this address is already on the
 * item. HomeBox does not de-duplicate links, so a resume checks before sending again.
 */
const linkPresent = (read: EntityOut, url: string): boolean =>
  (read.attachments ?? []).some((a) => a.mimeType === 'link/url' && a.path === url);

/** Spec 025 (FR-008): localized title, the merchant name (or the host of the address), never the order number. */
function orderLinkTitle(draft: ImportDraft, url: string): string {
  const name = storeForPageUrl(draft.pageUrl)?.displayName ?? new URL(url).hostname;
  return getMessage('orderLink.title', [name]).slice(0, 255);
}

/** Errors of the PUT step and of the field steps that ride on it. */
interface UpdateErrors {
  updateError: ErrorCode | null;
  tagsError: ErrorCode | null;
  templateFieldsError: ErrorCode | null;
  orderFieldsError: ErrorCode | null;
}

/** Error reported for a failed purchase PUT (unchanged mapping). */
function updateFailure(res: Result<unknown>): ErrorCode | null {
  if (res.ok) return null;
  return res.error === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'UPDATE_FAILED';
}

function manualBytes(file: ManualFile): Result<Uint8Array> {
  if (base64Size(file.base64) > MAX_DOCUMENT_BYTES) return fail('FILE_TOO_LARGE');
  const bytes = base64ToBytes(file.base64);
  // Re-check on the service worker side, even if the UI has already checked the file (R10).
  return isPdf(bytes) ? ok(bytes) : fail('NOT_A_PDF');
}

function filesFrom(manualFiles: ManualFile[]): FileMap {
  return new Map(manualFiles.map((f) => [f.docId, manualBytes(f)]));
}

/** Records the outcome of the template fields (spec 018): `done` only after a conforming read-back. */
function settleTemplateFields(p: PendingImport, matched: boolean): ErrorCode | null {
  if (matched) {
    p.steps.templateFields = 'done';
    delete p.templateFieldsError;
    return null;
  }
  p.steps.templateFields = 'failed';
  p.templateFieldsError = 'TEMPLATE_FIELDS_FAILED';
  return 'TEMPLATE_FIELDS_FAILED';
}

/** Records the outcome of the order fields (spec 019): `done` only after a conforming read-back (FR-023). */
function settleOrderFields(p: PendingImport, matched: boolean): ErrorCode | null {
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
function orderPatches(draft: OrderDraft, current: EntityOut): { without: Partial<EntityUpdate>; withOrder: Partial<EntityUpdate> } {
  if (hasTemplate(draft)) {
    const fields = fieldsFor(current.fields, draft.template.fields);
    const without = { ...purchaseBase(draft, current), ...templatePatch(draft), fields };
    return { without, withOrder: { ...without, fields: applyOrderFields(fields, draft.orderFields) } };
  }
  const without = purchasePatch(draft, current);
  return { without, withOrder: { ...without, fields: applyOrderFields(currentFields(current.fields), draft.orderFields) } };
}

/** Template whose fields still remain to be written (spec 018), or `null`. */
function remainingTemplate(p: PendingImport, draft: ImportDraft): TemplateDraft | null {
  return hasTemplate(draft) && p.steps.templateFields !== 'done' ? draft : null;
}

/** Retry (invariant 3): the location of an existing object is fixed; spec 018: no "without location" with a template. */
function locationChangeRefused(p: PendingImport, location: LocationChoice | null | undefined): boolean {
  if (location === undefined) return false;
  return Boolean(p.entityId) || (location === null && Boolean(p.draft.template));
}

/** First refused manual file, if any (same order as the map). */
function firstFileFailure(files: FileMap): Result<never> | null {
  for (const result of files.values()) if (!result.ok) return result;
  return null;
}

/** A manual document is missing: neither already attached nor provided. */
function needsManualFile(p: PendingImport, files: FileMap): boolean {
  return p.draft.documents.some((d) => d.origin === 'manual' && p.steps.attachments[d.id] !== 'done' && !files.has(d.id));
}

/** Name of the attachment of a document: moved to the pure completion module (spec 021), unchanged. */
export { attachmentName };

/** Error reported for a failed document: HomeBox-side failures are grouped under `ATTACHMENT_FAILED`. */
function attachmentError(error: ErrorCode): ErrorCode {
  return error === 'UNAUTHORIZED' || error === 'HOMEBOX_UNREACHABLE' || error === 'ATTACHMENT_FAILED'
    ? 'ATTACHMENT_FAILED'
    : error;
}

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
function completionPending(id: string, tabId: number, draft: ImportDraft, choice: CompletionChoice): PendingImport {
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
function completionQuantity(p: PendingImport, choice: CompletionChoice, read: EntityOut): number | undefined {
  if (choice.quantityIncrease === undefined || p.steps.update === 'done') return undefined;
  const c = completionState(p);
  const plan = quantityPlan(typeof read.quantity === 'number' ? read.quantity : 0, choice.quantityIncrease, c);
  c.quantityBase = plan.base;
  c.quantityTarget = plan.target;
  if (plan.skipped) addSkipped(p, ['quantity']);
  return plan.send;
}

/** The PUT of a completion still has something to do: first attempt, or tags / order fields left. */
function completionPutRemains(p: PendingImport): boolean {
  const { update, tags, orderFields } = p.steps;
  return update !== 'done' || (tags !== undefined && tags !== 'done') || (orderFields !== undefined && orderFields !== 'done');
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

export function createOrchestrator(deps: OrchestratorDeps) {
  const { client, store, notify } = deps;

  /** History write: secondary to the import, logged by a constant code only (no data, FR-010). */
  async function record(kind: 'start' | 'update', p: PendingImport): Promise<void> {
    if (!deps.history) return;
    try {
      await deps.history[kind](p);
    } catch {
      logError('history write failed', { endpoint: kind === 'start' ? 'history/start' : 'history/update' });
    }
  }

  async function persist(p: PendingImport): Promise<void> {
    await store.save(p);
    await record('update', p);
    notify(p);
  }

  async function bytesFor(p: PendingImport, doc: DocumentRef, files: FileMap): Promise<Result<Uint8Array>> {
    const cached = files.get(doc.id);
    if (cached) return cached;
    let result: Result<Uint8Array>;
    if (doc.origin === 'manual') {
      result = fail('MANUAL_FILE_REQUIRED');
    } else if (!doc.url) {
      result = fail('INVOICE_UNAVAILABLE');
    } else {
      const res = await deps.downloadDetected(p.tabId, doc.url);
      result = res.ok ? ok(base64ToBytes(res.value.base64)) : res;
    }
    // The same document can be attached to several objects: a single download.
    files.set(doc.id, result);
    return result;
  }

  /** Downloads the photo only once per URL during a call. */
  async function photoFor(photo: DraftPhoto, photos: PhotoMap): Promise<Result<FetchedPhoto>> {
    const cached = photos.get(photo.url);
    if (cached) return cached;
    const result = await deps.fetchPhoto(photo);
    photos.set(photo.url, result);
    return result;
  }

  /**
   * Duplicate guard (R8): after a send attempt with an unknown outcome, the object is read again. A photo
   * already attached (`type`, never `primary`) closes the step; a failed read fails it without sending.
   */
  async function reconcilePhoto(p: PendingImport, entityId: string): Promise<void> {
    const step = p.steps.photo;
    if (step !== 'sending' && step !== 'failed') return;
    if (!p.photoAttempted) {
      p.steps.photo = 'pending';
      return;
    }
    const current = await client.getEntity(entityId);
    if (!current.ok) {
      p.steps.photo = 'failed';
      p.photoError = 'PHOTO_UPLOAD_FAILED';
    } else if (current.value.attachments?.some((a) => a.type === 'photo')) {
      p.steps.photo = 'done';
      p.photoError = null;
    } else {
      p.steps.photo = 'pending';
    }
  }

  async function sendPhoto(p: PendingImport, entityId: string, photos: PhotoMap): Promise<void> {
    const photo = p.draft.photo;
    if (!photo) return;
    const fetched = await photoFor(photo, photos);
    if (!fetched.ok) {
      p.steps.photo = 'failed';
      p.photoError = fetched.error;
      return;
    }
    // Early write: if the service worker stops during the POST, the resume will read the object again.
    p.steps.photo = 'sending';
    p.photoAttempted = true;
    await persist(p);
    const res = await client.addAttachment(entityId, {
      bytes: fetched.value.bytes,
      filename: fetched.value.filename,
      type: 'photo',
      mimeType: fetched.value.mimeType,
      primary: true,
    });
    p.steps.photo = res.ok ? 'done' : 'failed';
    p.photoError = res.ok ? null : 'PHOTO_UPLOAD_FAILED';
  }

  /**
   * A definite POST failure with a chosen location: HomeBox answers 404 without creating anything if the `parentId`
   * is unknown (V4), but this status alone does not tell whether the parent is the missing piece. The tree is read again:
   * identifier absent → `LOCATION_NOT_FOUND`, present or re-read impossible → `CREATE_FAILED` (R3).
   */
  async function creationFailureFor(location: LocationChoice | null | undefined): Promise<ErrorCode> {
    if (!location) return 'CREATE_FAILED';
    const tree = await client.listLocations();
    if (!tree.ok) return 'CREATE_FAILED';
    return flattenTree(tree.value).some((l) => l.id === location.id) ? 'CREATE_FAILED' : 'LOCATION_NOT_FOUND';
  }

  /** Definite failure of `create-item` (spec 018): the template read again; deleted → `TEMPLATE_NOT_FOUND`. */
  async function templateCreationFailureFor(template: TemplateChoice, location: LocationChoice | null | undefined): Promise<ErrorCode> {
    const read = await client.getTemplate(template.id);
    if (!read.ok && read.error === 'TEMPLATE_NOT_FOUND') return 'TEMPLATE_NOT_FOUND';
    return creationFailureFor(location);
  }

  /**
   * Spec 023: after a definite creation failure with a chosen type, the list of types is read again once: a type that
   * is gone (or is a location type) is `ENTITY_TYPE_NOT_FOUND`; otherwise, or if the list cannot be read, `code`.
   */
  async function entityTypeFailureFor(entityTypeId: string | undefined, code: ErrorCode): Promise<ErrorCode> {
    if (!entityTypeId || code !== 'CREATE_FAILED') return code;
    const list = await client.listEntityTypes();
    if (!list.ok) return code;
    return list.value.some((t) => t.id === entityTypeId && !t.isLocation) ? code : 'ENTITY_TYPE_NOT_FOUND';
  }

  /** Code of a definite creation failure: the location, the template (spec 018), then the entity type (spec 023). */
  async function definiteFailureFor(p: PendingImport): Promise<ErrorCode> {
    const code = p.draft.template
      ? await templateCreationFailureFor(p.draft.template, p.draft.location)
      : await creationFailureFor(p.draft.location);
    return entityTypeFailureFor(p.draft.entityTypeId, code);
  }

  /**
   * Re-check of the templates of a batch (spec 018, FR-020, invariant 2): one read per distinct template, before any
   * persistence or creation. Deleted → `TEMPLATE_NOT_FOUND`; fingerprint different from the one confirmed →
   * `TEMPLATE_CHANGED`; another failure → its code. Never called for a batch without template.
   */
  async function verifyTemplates(drafts: readonly ImportDraft[]): Promise<Result<void>> {
    const byId = new Map<string, Set<string>>();
    for (const d of drafts) {
      if (!d.template) continue;
      const set = byId.get(d.template.id) ?? new Set<string>();
      set.add(d.template.fingerprint);
      byId.set(d.template.id, set);
    }
    for (const [id, fingerprints] of byId) {
      const read = await client.getTemplate(id); // NOSONAR: sequential on purpose (one instance, short list)
      if (!read.ok) return fail(read.error);
      const detail = await normalizeTemplate(read.value);
      if (!detail.ok) return fail(detail.error);
      if ([...fingerprints].some((f) => f !== detail.value.fingerprint)) return fail('TEMPLATE_CHANGED');
    }
    return ok(undefined);
  }

  /**
   * Uncertain creation (lost response, or service worker stopped during the POST): the object may have been created
   * without its identifier being saved. Its exact name is searched for before sending another POST; the duplicate risk
   * is only reduced, not eliminated (renamed object, lagging search index). `null`: the retry may go on.
   */
  async function uncertainDuplicate(pending: PendingImport): Promise<Result<never> | null> {
    const uncertain = pending.createUncertain || (pending.orphaned && pending.createAttempted);
    if (pending.entityId || !uncertain) return null;
    const dup = await findDuplicatesByName(client, pending.draft.name);
    if (!dup.ok) return fail('DUPLICATE_CHECK_FAILED');
    return dup.value.length > 0 ? fail('DUPLICATE_SUSPECTED') : null;
  }

  /**
   * Spec 018: before any creation, the template is checked again (US6-4); once the object exists, never (US6-3).
   * A template without location is refused and recorded as a failed creation. `null`: the retry may go on.
   */
  async function templateGate(pending: PendingImport): Promise<Result<never> | null> {
    if (pending.entityId || !pending.draft.template) return null;
    if (!pending.draft.location) {
      pending.steps.create = 'failed';
      pending.status = 'failed';
      pending.error = 'BAD_MESSAGE';
      await persist(pending);
      return fail('BAD_MESSAGE');
    }
    const verified = await verifyTemplates([pending.draft]);
    return verified.ok ? null : verified;
  }

  /** Writes the last-location memory; never blocks the import. */
  async function remember(locationId: string | null | undefined, results: PendingImport[]): Promise<void> {
    // Spec 021: only a product CREATED with this location counts; a completed item keeps its own location.
    if (!locationId || !deps.rememberLocation || !results.some((r) => r.entityId && !r.draft.complete)) return;
    try {
      await deps.rememberLocation(locationId);
    } catch {
      // memory not written: no consequence for the import
    }
  }

  /** Writes the last-entity-type memory (spec 023): the type of the last product created; never blocks the import. */
  async function rememberType(results: PendingImport[], typesRead: boolean): Promise<void> {
    const last = results.filter((r) => r.entityId && !r.draft.complete).at(-1);
    if (!last || !deps.rememberEntityType) return;
    const id = last.draft.entityTypeId ?? null;
    // Without a type list read at opening, « no type » says nothing: the remembered type is kept.
    if (id === null && !typesRead) return;
    try {
      await deps.rememberEntityType(id);
    } catch {
      // memory not written: no consequence for the import
    }
  }

  /** Start of a run: the import becomes `running` again and is no longer orphaned. */
  async function begin(p: PendingImport): Promise<void> {
    delete p.orphaned;
    p.status = 'running';
    p.error = null;
    await persist(p);
  }

  /**
   * Definite or uncertain creation failure: the import ends `failed`. Lost response (network, timeout): the POST
   * may have succeeded. An explicit HTTP error is a definite failure. Unreadable 2xx response or one without `id`:
   * the object may exist too, same handling.
   */
  async function createFailed(p: PendingImport, error: ErrorCode, httpStatus: number | undefined): Promise<void> {
    p.steps.create = 'failed';
    p.status = 'failed';
    const acceptedButUnreadable = httpStatus !== undefined && httpStatus >= 200 && httpStatus < 300;
    if (error !== 'CREATE_FAILED') p.error = error;
    else if (acceptedButUnreadable) p.error = await creationFailureFor(p.draft.location);
    else p.error = await definiteFailureFor(p);
    if (error === 'HOMEBOX_UNREACHABLE' || acceptedButUnreadable) p.createUncertain = true;
    else p.createAttempted = false;
    await persist(p);
  }

  /** POST /entities. Returns the created object, or `null` after a failure (import already persisted `failed`). */
  async function createStep(p: PendingImport): Promise<EntityOut | null> {
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
    const res = hasTemplate(draft) && location
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
      await createFailed(p, res.error, res.httpStatus);
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
  async function ensureEntity(p: PendingImport): Promise<{ entityId: string; created: EntityOut | null } | null> {
    if (p.entityId) return { entityId: p.entityId, created: null };
    const created = await createStep(p);
    return created ? { entityId: created.id, created } : null;
  }

  /**
   * HomeBox tag for one choice: the existing one (`findExisting`), otherwise created at most once per call and per
   * key (invariant 3), then added to the cached list so that the next products find it. `null`: creation failed.
   */
  async function tagFor(choice: TagChoice, list: TagSummary[], cache: TagCache): Promise<TagSummary | null> {
    const found = findExisting(choice, list);
    if (found) return found;
    // Spec 018 (FR-015): a default tag of a template is never created; it fails alone.
    if (choice.noCreate) return null;
    const key = tagKey(choice.name);
    let created = cache.created.get(key);
    if (!created) {
      created = await client.createTag(normalizeTagName(choice.name));
      cache.created.set(key, created);
      if (created.ok) list.push(created.value);
    }
    return created.ok ? created.value : null;
  }

  /**
   * Tags of the product (spec 014), only after the object exists and if some are still to apply. Each choice is
   * matched against the list read once per call; a choice without a match is created (`tagFor`). A failed creation
   * fails this tag only, never the object. Never logged.
   */
  async function resolveTags(p: PendingImport, cache: TagCache): Promise<ResolvedTags | null> {
    const choices = p.draft.tags;
    if (!choices?.length || p.steps.tags === 'done') return null;
    cache.list ??= await client.listTags();
    const list = cache.list;
    if (!list.ok) return { resolved: [], failed: choices.map((c) => c.name), error: 'TAGS_UNAVAILABLE' };
    const resolved: { id: string; name: string }[] = [];
    const failed: string[] = [];
    for (const choice of choices) {
      const found = await tagFor(choice, list.value, cache); // NOSONAR: sequential on purpose (one creation per tag key, shared cache)
      if (found) resolved.push({ id: found.id, name: choice.name });
      else failed.push(choice.name);
    }
    return { resolved, failed, error: failed.length ? 'TAG_FAILED' : null };
  }

  /** Records the tag outcome without any PUT (nothing applied), then persists. */
  async function tagsNotApplied(p: PendingImport, tags: ResolvedTags): Promise<ErrorCode | null> {
    const tagsError = settleTags(p, tags, false);
    await persist(p);
    return tagsError;
  }

  /** Purchase already saved: PUT reserved to the tags, on the object read again so that nothing else is overwritten. */
  async function tagsOnlyStep(p: PendingImport, entityId: string, tags: ResolvedTags): Promise<ErrorCode | null> {
    if (tags.resolved.length === 0) return tagsNotApplied(p, tags);
    const current = await client.getEntity(entityId);
    if (current.ok && !knowsTags(current.value)) return tagsNotApplied(p, tags);
    const res = current.ok
      ? await client.updateEntity(entityId, entityOutToUpdate(current.value, { tagIds: tagIdsFor(current.value, tags) }))
      : current;
    const tagsError = settleTags(p, tags, res.ok);
    await persist(p);
    return tagsError;
  }

  /**
   * Purchase PUT. With tags to apply (and the current tags known), `tagIds` is added; a definite refusal may come
   * from the tags (FR-012): the same PUT is then sent again without the added tags.
   */
  async function purchasePut(
    entityId: string,
    current: EntityOut,
    purchase: Partial<EntityUpdate>,
    tags: ResolvedTags | null,
  ): Promise<{ res: Result<EntityOut>; applied: boolean }> {
    if (!tags?.resolved.length || !knowsTags(current)) {
      return { res: await client.updateEntity(entityId, entityOutToUpdate(current, purchase)), applied: false };
    }
    const res = await client.updateEntity(entityId, entityOutToUpdate(current, { ...purchase, tagIds: tagIdsFor(current, tags) }));
    if (res.ok || res.httpStatus === undefined || res.error === 'UNAUTHORIZED') return { res, applied: res.ok };
    return { res: await client.updateEntity(entityId, entityOutToUpdate(current, purchase)), applied: false };
  }

  /**
   * PUT of the purchase data (and of the tags, when there are some to apply). Returns the error to report and the
   * tag error, if any. Without tags to apply, the patch has no `tagIds` key: the sequence is unchanged (invariant 1).
   */
  async function updateStep(
    p: PendingImport,
    entityId: string,
    created: EntityOut | null,
    tags: ResolvedTags | null,
  ): Promise<{ updateError: ErrorCode | null; tagsError: ErrorCode | null }> {
    if (p.steps.update === 'done') {
      return { updateError: null, tagsError: tags ? await tagsOnlyStep(p, entityId, tags) : null };
    }
    const current = created ? ok(created) : await client.getEntity(entityId);
    const { res, applied } = current.ok
      ? await purchasePut(entityId, current.value, purchasePatch(p.draft, current.value), tags)
      : { res: current, applied: false };
    p.steps.update = res.ok ? 'done' : 'failed';
    // Tags unknown on the object, or PUT refused: not applied, reported as a tag failure (never assumed empty).
    const tagsError = tags ? settleTags(p, tags, applied) : null;
    await persist(p);
    if (res.ok) return { updateError: null, tagsError };
    return { updateError: res.error === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'UPDATE_FAILED', tagsError };
  }

  /** Read-back of the object after a successful PUT (FR-018): every confirmed field with its exact values. */
  async function readBack(entityId: string, confirmed: TemplateChoice['fields']): Promise<boolean> {
    const read = await client.getEntity(entityId);
    return read.ok && fieldsMatch(read.value.fields, confirmed);
  }

  /**
   * Template path (spec 018, contracts/import-templates.md §2, §3): a single PUT carries the purchase data (without
   * `warrantyPatch`), the template values, the paired fields and the tags; then the object is read again. Purchase
   * already saved: PUT reserved to the template fields (and to the tags if they also remain), on the object read again.
   */
  async function templateUpdateStep(
    p: PendingImport,
    draft: TemplateDraft,
    entityId: string,
    created: EntityOut | null,
    tags: ResolvedTags | null,
  ): Promise<{ updateError: ErrorCode | null; tagsError: ErrorCode | null; templateFieldsError: ErrorCode | null }> {
    const confirmed = draft.template.fields;
    if (p.steps.update === 'done') {
      if (p.steps.templateFields === 'done') {
        return { updateError: null, tagsError: tags ? await tagsOnlyStep(p, entityId, tags) : null, templateFieldsError: null };
      }
      return { updateError: null, ...(await templateFieldsOnlyStep(p, draft, entityId, tags)) };
    }
    const current = created ? ok(created) : await client.getEntity(entityId);
    const { res, applied } = current.ok
      ? await purchasePut(
          entityId,
          current.value,
          { ...purchaseBase(draft, current.value), ...templatePatch(draft), fields: fieldsFor(current.value.fields, confirmed) },
          tags,
        )
      : { res: current, applied: false };
    p.steps.update = res.ok ? 'done' : 'failed';
    const tagsError = tags ? settleTags(p, tags, applied) : null;
    const templateFieldsError = settleTemplateFields(p, res.ok && (await readBack(entityId, confirmed)));
    await persist(p);
    if (res.ok) return { updateError: null, tagsError, templateFieldsError };
    return { updateError: res.error === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'UPDATE_FAILED', tagsError, templateFieldsError };
  }

  /** Fields step alone (resume): never touches the purchase data; the tags join the same PUT when they remain too. */
  async function templateFieldsOnlyStep(
    p: PendingImport,
    draft: TemplateDraft,
    entityId: string,
    tags: ResolvedTags | null,
  ): Promise<{ tagsError: ErrorCode | null; templateFieldsError: ErrorCode | null }> {
    const confirmed = draft.template.fields;
    const current = await client.getEntity(entityId);
    let applied = false;
    let putOk = false;
    if (current.ok) {
      const withTags = !!tags?.resolved.length && knowsTags(current.value);
      const patch: Partial<EntityUpdate> = {
        ...templatePatch(draft),
        fields: fieldsFor(current.value.fields, confirmed),
        ...(withTags ? { tagIds: tagIdsFor(current.value, tags) } : {}),
      };
      const res = await client.updateEntity(entityId, entityOutToUpdate(current.value, patch));
      putOk = res.ok;
      applied = res.ok && withTags;
    }
    const tagsError = tags ? settleTags(p, tags, applied) : null;
    const templateFieldsError = settleTemplateFields(p, putOk && (await readBack(entityId, confirmed)));
    await persist(p);
    return { tagsError, templateFieldsError };
  }

  /**
   * PUT carrying the order fields (spec 019, research D3.5). A definite refusal (known HTTP status, not 401/403) is sent
   * again once without them, from the same state read before the first PUT (`purchasePut`, which keeps its own fallback
   * without tags). A lost answer or a refused key: no fallback (unknown outcome). `orderSent`: the order fields were
   * accepted.
   */
  async function orderFieldsPut(
    entityId: string,
    current: EntityOut,
    patches: { without: Partial<EntityUpdate>; withOrder: Partial<EntityUpdate> },
    tags: ResolvedTags | null,
  ): Promise<{ res: Result<unknown>; applied: boolean; orderSent: boolean }> {
    const withTags = tags !== null && tags.resolved.length > 0 && knowsTags(current);
    const tagIds = withTags ? { tagIds: tagIdsFor(current, tags) } : {};
    const res = await client.updateEntity(entityId, entityOutToUpdate(current, { ...patches.withOrder, ...tagIds }));
    if (res.ok || res.httpStatus === undefined || res.error === 'UNAUTHORIZED') {
      return { res, applied: res.ok && withTags, orderSent: res.ok };
    }
    return { ...(await purchasePut(entityId, current, patches.without, tags)), orderSent: false };
  }

  /**
   * One read-back for both field checks (spec 018 and 019): only after a PUT carrying fields to check. Settles the
   * template fields (when they remain) and the order fields; returns their errors.
   */
  async function settleFieldSteps(
    p: PendingImport,
    draft: OrderDraft,
    entityId: string,
    template: TemplateDraft | null,
    outcome: { putOk: boolean; orderSent: boolean },
  ): Promise<{ templateFieldsError: ErrorCode | null; orderFieldsError: ErrorCode | null }> {
    const needed = outcome.orderSent || (template !== null && outcome.putOk);
    const read = needed ? await client.getEntity(entityId) : null;
    const fields = read?.ok ? read.value.fields : null;
    const templateFieldsError = template
      ? settleTemplateFields(p, outcome.putOk && fields !== null && fieldsMatch(fields, template.template.fields))
      : null;
    const orderFieldsError = settleOrderFields(p, outcome.orderSent && fields !== null && orderFieldsMatch(fields, draft.orderFields));
    return { templateFieldsError, orderFieldsError };
  }

  /**
   * Order-fields path (spec 019, contracts/import-order-fields.md §2, §3): the existing purchase PUT also carries the
   * order fields (no extra write), then the object is read again once. Purchase already saved: resume (§4).
   */
  async function orderFieldsUpdateStep(
    p: PendingImport,
    draft: OrderDraft,
    entityId: string,
    created: EntityOut | null,
    tags: ResolvedTags | null,
  ): Promise<UpdateErrors> {
    if (p.steps.update === 'done') return { updateError: null, ...(await orderFieldsResumeStep(p, draft, entityId, tags)) };
    const current = created ? ok(created) : await client.getEntity(entityId);
    const put = current.ok
      ? await orderFieldsPut(entityId, current.value, orderPatches(draft, current.value), tags)
      : { res: current, applied: false, orderSent: false };
    p.steps.update = put.res.ok ? 'done' : 'failed';
    const tagsError = tags ? settleTags(p, tags, put.applied) : null;
    const template = hasTemplate(draft) ? draft : null;
    const fieldErrors = await settleFieldSteps(p, draft, entityId, template, { putOk: put.res.ok, orderSent: put.orderSent });
    await persist(p);
    return { updateError: updateFailure(put.res), tagsError, ...fieldErrors };
  }

  /**
   * Fields-only PUT of a resume (contracts §4): never touches the purchase data. The order fields, the template fields
   * when they remain, and the tags when they remain too, on the object read again. Returns the PUT outcome.
   */
  async function fieldsOnlyPut(
    draft: OrderDraft,
    entityId: string,
    template: TemplateDraft | null,
    tags: ResolvedTags | null,
  ): Promise<{ putOk: boolean; applied: boolean }> {
    const current = await client.getEntity(entityId);
    if (!current.ok) return { putOk: false, applied: false };
    const withTags = tags !== null && tags.resolved.length > 0 && knowsTags(current.value);
    const base = template ? fieldsFor(current.value.fields, template.template.fields) : currentFields(current.value.fields);
    const patch: Partial<EntityUpdate> = {
      ...(template ? templatePatch(template) : {}),
      fields: applyOrderFields(base, draft.orderFields),
      ...(withTags ? { tagIds: tagIdsFor(current.value, tags) } : {}),
    };
    const res = await client.updateEntity(entityId, entityOutToUpdate(current.value, patch));
    return { putOk: res.ok, applied: res.ok && withTags };
  }

  /** Resume once the purchase is saved (contracts §4): the confirmed names and values of `draft.orderFields` only. */
  async function orderFieldsResumeStep(
    p: PendingImport,
    draft: OrderDraft,
    entityId: string,
    tags: ResolvedTags | null,
  ): Promise<Omit<UpdateErrors, 'updateError'>> {
    const template = remainingTemplate(p, draft);
    if (p.steps.orderFields === 'done') {
      if (template) return { ...(await templateFieldsOnlyStep(p, template, entityId, tags)), orderFieldsError: null };
      return { tagsError: tags ? await tagsOnlyStep(p, entityId, tags) : null, templateFieldsError: null, orderFieldsError: null };
    }
    const { putOk, applied } = await fieldsOnlyPut(draft, entityId, template, tags);
    const tagsError = tags ? settleTags(p, tags, applied) : null;
    const fieldErrors = await settleFieldSteps(p, draft, entityId, template, { putOk, orderSent: putOk });
    await persist(p);
    return { tagsError, ...fieldErrors };
  }

  /** PUT step of a product: the order-fields path only when the draft carries some (invariant 1). */
  async function updateSteps(
    p: PendingImport,
    entity: { entityId: string; created: EntityOut | null },
    tags: ResolvedTags | null,
  ): Promise<UpdateErrors> {
    const draft = p.draft;
    if (hasOrderFields(draft)) return orderFieldsUpdateStep(p, draft, entity.entityId, entity.created, tags);
    if (hasTemplate(draft)) return { ...(await templateUpdateStep(p, draft, entity.entityId, entity.created, tags)), orderFieldsError: null };
    return { ...(await updateStep(p, entity.entityId, entity.created, tags)), templateFieldsError: null, orderFieldsError: null };
  }

  /** Sends one document; returns the error to report, if any. */
  async function attachDocument(
    p: PendingImport,
    entityId: string,
    doc: DocumentRef,
    files: FileMap,
  ): Promise<ErrorCode | null> {
    const bytes = await bytesFor(p, doc, files);
    let res: Result<unknown> = bytes;
    if (bytes.ok) {
      // The HomeBox type is only ever computed here, from the validated kind (V4).
      const type = homeboxTypeOf(doc.kind);
      const upload = { bytes: bytes.value, filename: attachmentName(doc), mimeType: 'application/pdf' };
      res = await client.addAttachment(entityId, { ...upload, type });
      // An instance that refuses the manual/warranty type (422): one retry, same file, same instance (R1, V5).
      if (!res.ok && res.httpStatus === 422 && isOptionalHomeboxType(type)) {
        res = await client.addAttachment(entityId, { ...upload, type: 'attachment' });
        if (res.ok) (p.attachmentFallbacks ??= []).push(doc.id);
      }
    }
    p.steps.attachments[doc.id] = res.ok ? 'done' : 'failed';
    await persist(p);
    return res.ok ? null : attachmentError(res.error);
  }

  /** Documents not yet attached, in order. Returns the first error to report, if any. */
  async function attachmentsStep(p: PendingImport, entityId: string, files: FileMap): Promise<ErrorCode | null> {
    let firstError: ErrorCode | null = null;
    for (const doc of p.draft.documents) {
      if (p.steps.attachments[doc.id] === 'done') continue;
      const error = await attachDocument(p, entityId, doc, files);
      firstError ??= error;
    }
    return firstError;
  }

  /** Photo: duplicate guard on resume (R8), then sending. Returns the photo error to report, if any. */
  async function photoStep(p: PendingImport, entityId: string, photos: PhotoMap): Promise<ErrorCode | null> {
    p.steps.photo ??= 'not_requested';
    p.photoError ??= null;
    await reconcilePhoto(p, entityId);
    if (p.steps.photo === 'pending') {
      await sendPhoto(p, entityId, photos);
      await persist(p);
    }
    // As long as the photo has not failed, no photo error is kept.
    if (p.steps.photo === 'failed') return p.photoError;
    p.photoError = null;
    return null;
  }

  /** Records the outcome of the order link step (spec 025) and returns the error to report. */
  async function settleOrderLink(p: PendingImport, error: ErrorCode | null): Promise<ErrorCode | null> {
    p.steps.orderLink = error ? 'failed' : 'done';
    await persist(p);
    return error;
  }

  /**
   * Error of a failed POST of the link (spec 025, C6, FR-011): a 404 may come from an instance without the route or from
   * a deleted item; the item is read again to tell them apart. Any other failure is `ORDER_LINK_FAILED`.
   */
  async function orderLinkFailure(entityId: string, httpStatus: number | undefined): Promise<ErrorCode> {
    if (httpStatus !== 404) return 'ORDER_LINK_FAILED';
    const read = await client.getEntity(entityId);
    return read.ok ? 'ORDER_LINK_UNSUPPORTED' : 'ORDER_LINK_FAILED';
  }

  /**
   * Resume guard (spec 025, R3): after an attempt with an unknown outcome the item is read again. `true`: the link is
   * there; `false`: it is not; `null`: the item could not be read, nothing is sent (a duplicate is worse).
   */
  async function linkAlreadyAttached(entityId: string, url: string): Promise<boolean | null> {
    const read = await client.getEntity(entityId);
    return read.ok ? linkPresent(read.value, url) : null;
  }

  /**
   * Order page link (spec 025, contracts/import-order-link.md §3): after the photo, on an existing item, only when the
   * draft asked for it. Written as attempted before the POST; never interrupts the other steps.
   */
  async function orderLinkStep(p: PendingImport, entityId: string): Promise<ErrorCode | null> {
    if (p.steps.orderLink === undefined || p.steps.orderLink === 'done') return null;
    const url = orderLinkUrl(p.draft.pageUrl);
    if (!url) return settleOrderLink(p, 'ORDER_LINK_FAILED');
    if (p.orderLinkAttempted) {
      const there = await linkAlreadyAttached(entityId, url);
      if (there === null) return settleOrderLink(p, 'ORDER_LINK_FAILED');
      if (there) return settleOrderLink(p, null);
    }
    p.orderLinkAttempted = true;
    await persist(p);
    const res = await client.addExternalLink(entityId, { url, title: orderLinkTitle(p.draft, url) });
    return settleOrderLink(p, res.ok ? null : await orderLinkFailure(entityId, res.httpStatus));
  }

  /** Final status: `partial` keeps the state for a retry; `success` purges it (FR-025). */
  async function finish(p: PendingImport, partialError: ErrorCode | null): Promise<PendingImport> {
    if (partialError) {
      p.status = 'partial';
      p.error = partialError;
      await persist(p);
      return p;
    }
    p.status = 'success';
    notify(p);
    // The history entry becomes `complete` before the purge: the state of `p` is lost afterwards.
    await record('update', p);
    // FR-025: purchase data is erased as soon as the import has succeeded.
    await store.purge(p);
    return p;
  }

  /**
   * Spec 021: tags confirmed for the completion and still missing from the item read. `null`: nothing to add (the step
   * is then done). Only called when the tags of the item are known (`completionTagsUnknown` otherwise).
   */
  async function completionTags(p: PendingImport, choice: CompletionChoice, read: EntityOut, cache: TagCache): Promise<ResolvedTags | null> {
    if (p.steps.tags === undefined || p.steps.tags === 'done') return null;
    const wanted = confirmedTags(p.draft, new Set(choice.keys)).filter((c) => !tagPresent(read, c));
    if (wanted.length === 0) {
      p.steps.tags = 'done';
      delete p.failedTags;
      return null;
    }
    return resolveTags({ ...p, draft: { ...p.draft, tags: wanted } }, cache);
  }

  /** Spec 021 (FR-014): the order fields added are checked on a new read; skipped ones close the step. */
  async function settleCompletionFields(p: PendingImport, entityId: string, added: OrderFieldValue[], putOk: boolean): Promise<ErrorCode | null> {
    if (p.steps.orderFields === undefined || p.steps.orderFields === 'done') return null;
    if (added.length === 0) return settleOrderFields(p, true);
    if (!putOk) return settleOrderFields(p, false);
    const again = await client.getEntity(entityId);
    return settleOrderFields(p, again.ok && orderFieldsMatch(again.value.fields, added));
  }

  /** Spec 021 (C5, FR-017): nothing left to write, no PUT; the tags that could not be resolved are reported. */
  async function completionNoPut(p: PendingImport, tags: ResolvedTags | null): Promise<UpdateErrors> {
    if (p.steps.update === 'pending') completionState(p).noChange = true;
    p.steps.update = 'done';
    const tagsError = tags ? settleTags(p, tags, false) : null;
    const orderFieldsError = p.steps.orderFields && p.steps.orderFields !== 'done' ? settleOrderFields(p, true) : null;
    await persist(p);
    return { updateError: null, tagsError, templateFieldsError: null, orderFieldsError };
  }

  /**
   * Spec 021 (contracts/homebox-completion.md §2): one PUT built by `preservingUpdate` on the item read just before,
   * carrying only the confirmed changes still applicable (the others are `skipped`), the union of the tags, and the
   * quantity when checked. Never a second PUT without the added parts (unlike the creation): a refusal fails the step.
   */
  async function completionUpdateStep(p: PendingImport, choice: CompletionChoice, read: EntityOut, cache: TagCache): Promise<UpdateErrors> {
    if (!completionPutRemains(p)) return { updateError: null, tagsError: null, templateFieldsError: null, orderFieldsError: null };
    // A PUT without `tagIds` would remove every tag of the item: tags unknown ⇒ no PUT at all, retryable (FR-013).
    if (!knowsTags(read)) return completionTagsUnknown(p, choice);
    const entityId = choice.entityId;
    const tags = await completionTags(p, choice, read, cache);
    const quantity = completionQuantity(p, choice, read);
    const plan = completionPatch(read, p.draft, remainingChoice(p, choice), orderNoteLine(p.draft), quantity);
    addSkipped(p, plan.skipped);
    const tagIds = tags && tags.resolved.length > 0 ? tagIdsFor(read, tags) : null;
    if (Object.keys(plan.patch).length === 0 && !tagIds) return completionNoPut(p, tags);
    // Early write (R5): base and target of the quantity, and the skipped keys, are known before the PUT.
    await persist(p);
    const res = await client.updateEntity(entityId, preservingUpdate(read, { ...plan.patch, ...(tagIds ? { tagIds } : {}) }));
    p.steps.update = res.ok ? 'done' : 'failed';
    const tagsError = tags ? settleTags(p, tags, res.ok && tagIds !== null) : null;
    const orderFieldsError = await settleCompletionFields(p, entityId, plan.fields, res.ok);
    await persist(p);
    return { updateError: updateFailure(res), tagsError, templateFieldsError: null, orderFieldsError };
  }

  /**
   * Spec 021 (FR-013): the tags of the item read are unknown, so no PUT can keep them. Nothing is written; the update
   * step fails (retryable), and so do the tags and the order fields still to write.
   */
  async function completionTagsUnknown(p: PendingImport, choice: CompletionChoice): Promise<UpdateErrors> {
    p.steps.update = 'failed';
    const wanted = confirmedTags(p.draft, new Set(choice.keys)).map((c) => c.name);
    const tagsError = p.steps.tags && p.steps.tags !== 'done' ? settleTags(p, { resolved: [], failed: wanted, error: 'TAG_FAILED' }, false) : null;
    const orderFieldsError = p.steps.orderFields && p.steps.orderFields !== 'done' ? settleOrderFields(p, false) : null;
    await persist(p);
    return { updateError: 'UPDATE_FAILED', tagsError, templateFieldsError: null, orderFieldsError };
  }

  /**
   * Spec 021 (FR-018): confirmed documents whose title is not on the item read; the others are "already present". A
   * document whose own earlier POST failed (answer lost) and whose title is now there is simply done, not "present".
   */
  async function completionAttachmentsStep(p: PendingImport, entityId: string, read: EntityOut, files: FileMap): Promise<ErrorCode | null> {
    let firstError: ErrorCode | null = null;
    for (const doc of p.draft.documents) {
      if (p.steps.attachments[doc.id] === 'done') continue;
      if (attachmentPresent(read, doc)) {
        markAttached(p, doc.id, p.steps.attachments[doc.id] === 'failed');
        await persist(p); // NOSONAR: sequential on purpose (state saved after each document)
        continue;
      }
      const error = await attachDocument(p, entityId, doc, files); // NOSONAR: sequential on purpose (one instance, resume state per document)
      firstError ??= error;
    }
    return firstError;
  }

  /**
   * Spec 021 (FR-019, research D3): photo of a completion. Primary only when the item has no primary photo; the
   * number of photos is remembered before the POST, and a resume that reads more photos does not send it again.
   */
  async function sendCompletionPhoto(p: PendingImport, entityId: string, read: EntityOut, photos: PhotoMap): Promise<void> {
    const photo = p.draft.photo;
    if (!photo) return;
    const fetched = await photoFor(photo, photos);
    if (!fetched.ok) {
      p.steps.photo = 'failed';
      p.photoError = fetched.error;
      return;
    }
    completionState(p).photoCountBefore = photoCount(read);
    p.steps.photo = 'sending';
    p.photoAttempted = true;
    await persist(p);
    const res = await client.addAttachment(entityId, {
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
  async function completionPhotoStep(p: PendingImport, entityId: string, read: EntityOut, photos: PhotoMap): Promise<ErrorCode | null> {
    p.steps.photo ??= 'not_requested';
    p.photoError ??= null;
    reconcileCompletionPhoto(p, read);
    if (p.steps.photo === 'pending') {
      await sendCompletionPhoto(p, entityId, read, photos);
      await persist(p);
    }
    if (p.steps.photo === 'failed') return p.photoError;
    p.photoError = null;
    return null;
  }

  /** The item could not be read again: deleted (404) → `ITEM_NOT_FOUND`, nothing written; otherwise retryable. */
  async function completionReadFailed(p: PendingImport, read: { error: ErrorCode; httpStatus?: number }): Promise<PendingImport> {
    if (p.steps.update !== 'done') p.steps.update = 'failed';
    if (read.httpStatus !== 404) return finish(p, read.error === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'UPDATE_FAILED');
    p.status = 'failed';
    p.error = 'ITEM_NOT_FOUND';
    await persist(p);
    return p;
  }

  /**
   * Spec 021: runs the steps of a product completed instead of created. The item is read again at every run (first
   * one and resumes): every write is computed on that read, and each step is idempotent (FR-021).
   */
  async function runCompletion(p: PendingImport, choice: CompletionChoice, files: FileMap, photos: PhotoMap, tagCache: TagCache): Promise<PendingImport> {
    await begin(p);
    const read = await client.getEntity(choice.entityId);
    if (!read.ok) return completionReadFailed(p, read);
    const { updateError, tagsError, orderFieldsError } = await completionUpdateStep(p, choice, read.value, tagCache);
    const attachmentsError = await completionAttachmentsStep(p, choice.entityId, read.value, files);
    const photoError = await completionPhotoStep(p, choice.entityId, read.value, photos);
    return finish(p, updateError ?? orderFieldsError ?? attachmentsError ?? photoError ?? tagsError);
  }

  /**
   * Runs the remaining steps of an import. Invariant (FR-021): once `entityId`
   * is set, the object is never created again.
   */
  async function run(p: PendingImport, files: FileMap, photos: PhotoMap, tagCache: TagCache): Promise<PendingImport> {
    // Spec 021: a product completed instead of created has its own steps; the creation path below is unchanged.
    if (p.draft.complete) return runCompletion(p, p.draft.complete, files, photos, tagCache);
    await begin(p);
    const entity = await ensureEntity(p);
    if (!entity) return p;
    // Tags (spec 014): only once the object exists; `null` without tags to apply (nothing else runs).
    const tags = await resolveTags(p, tagCache);
    // Each step runs even if a previous one failed; the first error is the one reported.
    const { updateError, tagsError, templateFieldsError, orderFieldsError } = await updateSteps(p, entity, tags);
    const attachmentsError = await attachmentsStep(p, entity.entityId, files);
    const photoError = await photoStep(p, entity.entityId, photos);
    const orderLinkError = await orderLinkStep(p, entity.entityId);
    return finish(p, updateError ?? templateFieldsError ?? orderFieldsError ?? attachmentsError ?? photoError ?? orderLinkError ?? tagsError);
  }

  return {
    async startImport(
      tabId: number,
      drafts: ImportDraft[],
      manualFiles: ManualFile[],
      /** Order-level choice, for the last-location memory (R10). */
      orderLocationId: string | null = null,
      /** Spec 023: the type list was read at opening (otherwise the remembered type is never erased). */
      entityTypesRead = false,
    ): Promise<Result<PendingImport[]>> {
      if (drafts.some((d) => d.name.trim() === '')) return fail('PRODUCT_NOT_FOUND');
      // Spec 021 (defense, C4): a completed item never gets a template nor a location; refused before any request.
      if (drafts.some((d) => d.complete && (d.template || d.location || d.entityTypeId))) return fail('BAD_MESSAGE');
      const files = filesFrom(manualFiles);
      const photos: PhotoMap = new Map();
      // Invalid manual files are rejected before any HomeBox call.
      for (const result of files.values()) if (!result.ok) return result;
      // Spec 018: a template requires a location (defense), then every template of the batch is checked again
      // before anything is persisted or created (FR-020). A batch without template makes no extra call.
      if (drafts.some((d) => d.template && !d.location)) return fail('BAD_MESSAGE');
      if (drafts.some((d) => d.template)) {
        const verified = await verifyTemplates(drafts);
        if (!verified.ok) return verified;
      }

      // All imports of the batch are persisted before the first POST: if the service worker stops during
      // the first one, the following ones remain visible and retryable.
      // Spec 021: a product completed instead of created gets its own initial state (`completionPending`).
      const pendings: PendingImport[] = drafts.map((draft) => draft.complete ? completionPending(deps.newId(), tabId, draft, draft.complete) : ({
        id: deps.newId(),
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
      }));
      for (const pending of pendings) await store.save(pending);
      for (const pending of pendings) await record('start', pending);

      const tagCache = newTagCache();
      const results: PendingImport[] = [];
      for (const pending of pendings) results.push(await run(pending, files, photos, tagCache)); // NOSONAR: sequential on purpose (imports share the photo and tag caches)
      await remember(orderLocationId, results);
      await rememberType(results, entityTypesRead);
      return ok(results);
    },

    async retryImport(
      pendingId: string,
      manualFiles: ManualFile[] = [],
      /** Absent: choice unchanged; `null`: no location; otherwise a new choice (FR-018). */
      location?: LocationChoice | null,
    ): Promise<Result<PendingImport>> {
      const pending = await store.get(pendingId);
      if (!pending) return fail('BAD_MESSAGE');
      // Refused before any request (invariant 3; spec 018 FR-005).
      if (locationChangeRefused(pending, location)) return fail('BAD_MESSAGE');
      if (location !== undefined) pending.draft = { ...pending.draft, location };
      const files = filesFrom(manualFiles);
      const fileFailure = firstFileFailure(files);
      if (fileFailure) return fileFailure;
      // Uncertain creation (lost response, or service worker stopped during the POST): the object may have been
      // created without its identifier being saved. Its exact name is searched for before sending another POST;
      // the duplicate risk is only reduced, not eliminated (renamed object, lagging search index).
      const duplicate = await uncertainDuplicate(pending);
      if (duplicate) return duplicate;
      if (needsManualFile(pending, files)) return fail('MANUAL_FILE_REQUIRED');
      const refused = await templateGate(pending);
      if (refused) return refused;
      // A new cache: the retry always reads the tag list again before any creation (invariant 4).
      return ok(await run(pending, files, new Map(), newTagCache()));
    },

    async abandonImport(pendingId: string): Promise<Result<void>> {
      const pending = await store.get(pendingId);
      if (pending) await store.purge(pending);
      return ok(undefined);
    },
  };
}

export type Orchestrator = ReturnType<typeof createOrchestrator>;
