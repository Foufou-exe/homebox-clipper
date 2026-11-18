import { entityOutToUpdate, type HomeBoxClient } from '@/background/homebox/client';
import type { EntityOut, TagSummary } from '@/background/homebox/types';
import { storeForPageUrl } from '@/content/merchants/catalog';
import { getMessage } from '@/platform/i18n';
import { homeboxTypeOf, isOptionalHomeboxType } from '@/shared/document-kinds';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { logError } from '@/shared/logger';
import { findDuplicatesByName } from './duplicates';
import { MAX_DOCUMENT_BYTES, base64Size, base64ToBytes, isPdf } from '@/shared/pdf';
import { flattenTree } from '@/shared/locations';
import { warrantyPatch } from '@/shared/warranty';
import { findExisting, normalizeTagName, tagKey, unionIds } from '@/shared/tags';
import type {
  DocumentRef,
  DraftPhoto,
  ImportDraft,
  LocationChoice,
  ManualFile,
  PendingImport,
  PhotoStep,
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

function manualBytes(file: ManualFile): Result<Uint8Array> {
  if (base64Size(file.base64) > MAX_DOCUMENT_BYTES) return fail('FILE_TOO_LARGE');
  const bytes = base64ToBytes(file.base64);
  // Re-check on the service worker side, even if the UI has already checked the file (R10).
  return isPdf(bytes) ? ok(bytes) : fail('NOT_A_PDF');
}

function filesFrom(manualFiles: ManualFile[]): FileMap {
  return new Map(manualFiles.map((f) => [f.docId, manualBytes(f)]));
}

/** A delivery note whose name already says what it is keeps it (no double prefix); otherwise the prefix is added. */
const EXPLICIT_DELIVERY_NOTE = /bon[-_ ]?de[-_ ]?livraison|delivery[-_ ]?note|packing[-_ ]?slip|bordereau/i;

function attachmentName(doc: DocumentRef): string {
  const base =
    doc.kind === 'delivery_note' && !EXPLICIT_DELIVERY_NOTE.test(doc.label)
      ? `${getMessage('documents.deliveryNotePrefix')}${doc.label}`
      : doc.label;
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

/** Error reported for a failed document: HomeBox-side failures are grouped under `ATTACHMENT_FAILED`. */
function attachmentError(error: ErrorCode): ErrorCode {
  return error === 'UNAUTHORIZED' || error === 'HOMEBOX_UNREACHABLE' || error === 'ATTACHMENT_FAILED'
    ? 'ATTACHMENT_FAILED'
    : error;
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

  /** Writes the last-location memory; never blocks the import. */
  async function remember(locationId: string | null | undefined, results: PendingImport[]): Promise<void> {
    if (!locationId || !deps.rememberLocation || !results.some((r) => r.entityId)) return;
    try {
      await deps.rememberLocation(locationId);
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
    p.error = error === 'CREATE_FAILED' ? await creationFailureFor(p.draft.location) : error;
    const acceptedButUnreadable = httpStatus !== undefined && httpStatus >= 200 && httpStatus < 300;
    if (error === 'HOMEBOX_UNREACHABLE' || acceptedButUnreadable) p.createUncertain = true;
    else p.createAttempted = false;
    await persist(p);
  }

  /** POST /entities. Returns the created object, or `null` after a failure (import already persisted `failed`). */
  async function createStep(p: PendingImport): Promise<EntityOut | null> {
    // Early write (R8): if the service worker stops during the POST, the orphaned import will know
    // that the object may have been created.
    p.createAttempted = true;
    delete p.createUncertain;
    await persist(p);
    const res = await client.createEntity({
      name: p.draft.name,
      description: p.draft.description || undefined,
      quantity: p.draft.quantity,
      // `parentId` only when a location is chosen: with no choice, the body stays that of spec 001.
      ...(p.draft.location ? { parentId: p.draft.location.id } : {}),
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
   * Tags of the product (spec 014), only after the object exists and if some are still to apply. Each choice is
   * matched against the list read once per call (`findExisting`); a choice without a match is created at most once
   * per call and per key (invariant 3), then found by the next products in the cached list. A failed creation
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
      let found = findExisting(choice, list.value);
      if (!found) {
        const key = tagKey(choice.name);
        let created = cache.created.get(key);
        if (!created) {
          created = await client.createTag(normalizeTagName(choice.name));
          cache.created.set(key, created);
          if (created.ok) list.value.push(created.value);
        }
        found = created.ok ? created.value : null;
      }
      if (found) resolved.push({ id: found.id, name: choice.name });
      else failed.push(choice.name);
    }
    return { resolved, failed, error: failed.length ? 'TAG_FAILED' : null };
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
   * PUT of the purchase data (and of the tags, when there are some to apply). Returns the error to report and the
   * tag error, if any. Without tags to apply, the patch has no `tagIds` key: the sequence is unchanged (invariant 1).
   */
  async function updateStep(
    p: PendingImport,
    entityId: string,
    created: EntityOut | null,
    tags: ResolvedTags | null,
  ): Promise<{ updateError: ErrorCode | null; tagsError: ErrorCode | null }> {
    const withTags = tags !== null && tags.resolved.length > 0;
    /**
     * The current tags of the object must be known before sending `tagIds` (which replaces them all). `null` is
     * a Go nil slice, always empty: known, no tag. An absent field (or another type) gets no `tagIds`: the chosen
     * tags are reported as failed and can be retried.
     */
    const knowsTags = (o: EntityOut) => Array.isArray(o.tags) || o.tags === null;
    if (p.steps.update === 'done') {
      if (!tags) return { updateError: null, tagsError: null };
      if (!withTags) {
        const tagsError = settleTags(p, tags, false);
        await persist(p);
        return { updateError: null, tagsError };
      }
      // PUT reserved to the tags: the object is read again so that nothing else is overwritten.
      const current = await client.getEntity(entityId);
      if (current.ok && !knowsTags(current.value)) {
        const tagsError = settleTags(p, tags, false);
        await persist(p);
        return { updateError: null, tagsError };
      }
      const res = current.ok
        ? await client.updateEntity(entityId, entityOutToUpdate(current.value, { tagIds: tagIdsFor(current.value, tags) }))
        : current;
      const tagsError = settleTags(p, tags, res.ok);
      await persist(p);
      return { updateError: null, tagsError };
    }
    const current = created ? ok(created) : await client.getEntity(entityId);
    let res: Result<EntityOut> = current;
    let applied = false;
    if (current.ok) {
      const purchase = {
        purchasePrice: p.draft.purchasePrice ?? undefined,
        purchaseDate: p.draft.purchaseDate ?? undefined,
        purchaseFrom: p.draft.purchaseFrom || undefined,
        notes: buildNotes(p.draft),
        // A PUT without `parentId` would lose the location (V3): it is always sent.
        parentId: current.value.parent?.id ?? p.draft.location?.id,
        // Never overwrites a warranty already filled on the object (FR-008).
        ...warrantyPatch(p.draft.warranty, current.value),
      };
      if (withTags && knowsTags(current.value)) {
        res = await client.updateEntity(entityId, entityOutToUpdate(current.value, { ...purchase, tagIds: tagIdsFor(current.value, tags) }));
        applied = res.ok;
        // A definite refusal may come from the tags (FR-012): the same PUT is sent again without the added tags.
        if (!res.ok && res.httpStatus !== undefined && res.error !== 'UNAUTHORIZED') {
          res = await client.updateEntity(entityId, entityOutToUpdate(current.value, purchase));
        }
      } else {
        res = await client.updateEntity(entityId, entityOutToUpdate(current.value, purchase));
      }
    }
    p.steps.update = res.ok ? 'done' : 'failed';
    // Tags unknown on the object: not applied, reported as a tag failure (never assumed empty).
    const tagsError = tags ? settleTags(p, tags, applied) : null;
    await persist(p);
    if (res.ok) return { updateError: null, tagsError };
    return { updateError: res.error === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'UPDATE_FAILED', tagsError };
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
   * Runs the remaining steps of an import. Invariant (FR-021): once `entityId`
   * is set, the object is never created again.
   */
  async function run(p: PendingImport, files: FileMap, photos: PhotoMap, tagCache: TagCache): Promise<PendingImport> {
    await begin(p);
    const entity = await ensureEntity(p);
    if (!entity) return p;
    // Tags (spec 014): only once the object exists; `null` without tags to apply (nothing else runs).
    const tags = await resolveTags(p, tagCache);
    // Each step runs even if a previous one failed; the first error is the one reported.
    const { updateError, tagsError } = await updateStep(p, entity.entityId, entity.created, tags);
    const attachmentsError = await attachmentsStep(p, entity.entityId, files);
    const photoError = await photoStep(p, entity.entityId, photos);
    return finish(p, updateError ?? attachmentsError ?? photoError ?? tagsError);
  }

  return {
    async startImport(
      tabId: number,
      drafts: ImportDraft[],
      manualFiles: ManualFile[],
      /** Order-level choice, for the last-location memory (R10). */
      orderLocationId: string | null = null,
    ): Promise<Result<PendingImport[]>> {
      if (drafts.some((d) => d.name.trim() === '')) return fail('PRODUCT_NOT_FOUND');
      const files = filesFrom(manualFiles);
      const photos: PhotoMap = new Map();
      // Invalid manual files are rejected before any HomeBox call.
      for (const result of files.values()) if (!result.ok) return result;

      // All imports of the batch are persisted before the first POST: if the service worker stops during
      // the first one, the following ones remain visible and retryable.
      const pendings: PendingImport[] = drafts.map((draft) => ({
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
      for (const pending of pendings) results.push(await run(pending, files, photos, tagCache));
      await remember(orderLocationId, results);
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
      // Invariant 3: the object already exists, its location can no longer be changed here. Refused before any request.
      if (location !== undefined && pending.entityId) return fail('BAD_MESSAGE');
      if (location !== undefined) pending.draft = { ...pending.draft, location };
      const files = filesFrom(manualFiles);
      for (const result of files.values()) if (!result.ok) return result;
      // Uncertain creation (lost response, or service worker stopped during the POST): the object may have been
      // created without its identifier being saved. Its exact name is searched for before sending another POST;
      // the duplicate risk is only reduced, not eliminated (renamed object, lagging search index).
      const uncertain = pending.createUncertain || (pending.orphaned && pending.createAttempted);
      if (!pending.entityId && uncertain) {
        const dup = await findDuplicatesByName(client, pending.draft.name);
        if (!dup.ok) return fail('DUPLICATE_CHECK_FAILED');
        if (dup.value.length > 0) return fail('DUPLICATE_SUSPECTED');
      }
      const needsManual = pending.draft.documents.some(
        (d) => d.origin === 'manual' && pending.steps.attachments[d.id] !== 'done' && !files.has(d.id),
      );
      if (needsManual) return fail('MANUAL_FILE_REQUIRED');
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
