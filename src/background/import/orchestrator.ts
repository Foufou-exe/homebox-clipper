import { entityOutToUpdate, type HomeBoxClient } from '@/background/homebox/client';
import type { EntityOut } from '@/background/homebox/types';
import { getMessage } from '@/platform/i18n';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { findDuplicatesByName } from './duplicates';
import { MAX_DOCUMENT_BYTES, base64Size, base64ToBytes, isPdf } from '@/shared/pdf';
import { flattenTree } from '@/shared/locations';
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
  /** Downloads a detected document via the script injected in the amazon.fr tab. */
  downloadDetected(tabId: number, url: string): Promise<Result<{ base64: string }>>;
  /** Fetches the photo from the merchant's server (separate module: it never has access to the key). */
  fetchPhoto(photo: DraftPhoto): Promise<Result<FetchedPhoto>>;
  /**
   * Remembers the last location used with this instance (R10): identifier only. Optional, and a
   * write error never interrupts the import.
   */
  rememberLocation?(locationId: string): Promise<void>;
  notify(p: PendingImport): void;
  newId(): string;
}

type FileMap = Map<string, Result<Uint8Array>>;
/** Photos fetched during a call, by URL: an order with several products downloads the image only once. */
type PhotoMap = Map<string, Result<FetchedPhoto>>;

function initialPhotoStep(photo: DraftPhoto | null): PhotoStep {
  if (!photo) return 'unavailable';
  return photo.include ? 'pending' : 'not_requested';
}

export function buildNotes(draft: ImportDraft): string | undefined {
  if (!draft.orderNumber) return undefined;
  return [getMessage('summary.orderNote', [draft.orderNumber]), draft.pageUrl].filter(Boolean).join('\n');
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

const attachmentName = (doc: DocumentRef) => (/\.pdf$/i.test(doc.label) ? doc.label : `${doc.label}.pdf`);

export function createOrchestrator(deps: OrchestratorDeps) {
  const { client, store, notify } = deps;

  async function persist(p: PendingImport): Promise<void> {
    await store.save(p);
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

  /**
   * Runs the remaining steps of an import. Invariant (FR-021): once `entityId`
   * is set, the object is never created again.
   */
  async function run(p: PendingImport, files: FileMap, photos: PhotoMap): Promise<PendingImport> {
    delete p.orphaned;
    p.status = 'running';
    p.error = null;
    await persist(p);

    let created: EntityOut | null = null;
    if (!p.entityId) {
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
        p.steps.create = 'failed';
        p.status = 'failed';
        p.error = res.error === 'CREATE_FAILED' ? await creationFailureFor(p.draft.location) : res.error;
        // Lost response (network, timeout): the POST may have succeeded. An explicit HTTP error is a definite failure.
        // Unreadable 2xx response or one without `id`: the object may exist too, same handling.
        const acceptedButUnreadable = res.httpStatus !== undefined && res.httpStatus >= 200 && res.httpStatus < 300;
        if (res.error === 'HOMEBOX_UNREACHABLE' || acceptedButUnreadable) p.createUncertain = true;
        else p.createAttempted = false;
        await persist(p);
        return p;
      }
      created = res.value;
      p.entityId = res.value.id;
      p.steps.create = 'done';
      await persist(p);
    }
    const entityId = p.entityId;

    let partialError: ErrorCode | null = null;

    if (p.steps.update !== 'done') {
      const current = created ? ok(created) : await client.getEntity(entityId);
      const res = current.ok
        ? await client.updateEntity(
            entityId,
            entityOutToUpdate(current.value, {
              purchasePrice: p.draft.purchasePrice ?? undefined,
              purchaseDate: p.draft.purchaseDate ?? undefined,
              purchaseFrom: p.draft.purchaseFrom || undefined,
              notes: buildNotes(p.draft),
              // A PUT without `parentId` would lose the location (V3): it is always sent.
              parentId: current.value.parent?.id ?? p.draft.location?.id,
            }),
          )
        : current;
      p.steps.update = res.ok ? 'done' : 'failed';
      if (!res.ok) partialError = res.error === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'UPDATE_FAILED';
      await persist(p);
    }

    for (const doc of p.draft.documents) {
      if (p.steps.attachments[doc.id] === 'done') continue;
      const bytes = await bytesFor(p, doc, files);
      const res = bytes.ok
        ? await client.addAttachment(entityId, {
            bytes: bytes.value,
            filename: attachmentName(doc),
            type: doc.kind === 'invoice' ? 'receipt' : 'attachment',
            mimeType: 'application/pdf',
          })
        : bytes;
      p.steps.attachments[doc.id] = res.ok ? 'done' : 'failed';
      if (!res.ok) {
        partialError ??=
          res.error === 'UNAUTHORIZED' || res.error === 'HOMEBOX_UNREACHABLE' || res.error === 'ATTACHMENT_FAILED'
            ? 'ATTACHMENT_FAILED'
            : res.error;
      }
      await persist(p);
    }

    p.steps.photo ??= 'not_requested';
    p.photoError ??= null;
    await reconcilePhoto(p, entityId);
    if (p.steps.photo === 'pending') {
      await sendPhoto(p, entityId, photos);
      await persist(p);
    }
    // As long as the photo has not failed, no photo error is kept.
    if (p.steps.photo !== 'failed') p.photoError = null;
    else partialError ??= p.photoError;

    if (partialError) {
      p.status = 'partial';
      p.error = partialError;
      await persist(p);
      return p;
    }
    p.status = 'success';
    notify(p);
    // FR-025: purchase data is erased as soon as the import has succeeded.
    await store.purge(p);
    return p;
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
        },
        status: 'running',
        error: null,
        photoError: null,
        photoAttempted: false,
      }));
      for (const pending of pendings) await store.save(pending);

      const results: PendingImport[] = [];
      for (const pending of pendings) results.push(await run(pending, files, photos));
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
      return ok(await run(pending, files, new Map()));
    },

    async abandonImport(pendingId: string): Promise<Result<void>> {
      const pending = await store.get(pendingId);
      if (pending) await store.purge(pending);
      return ok(undefined);
    },
  };
}

export type Orchestrator = ReturnType<typeof createOrchestrator>;
