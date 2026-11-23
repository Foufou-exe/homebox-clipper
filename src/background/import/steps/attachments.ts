import { homeboxTypeOf, isOptionalHomeboxType } from '@/shared/document-kinds';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { MAX_DOCUMENT_BYTES, base64Size, base64ToBytes, isPdf } from '@/shared/pdf';
import type { DocumentRef, DraftPhoto, ManualFile, PendingImport, PhotoStep } from '@/shared/types';
import { attachmentName } from '../completion';
import type { FetchedPhoto } from '../photo-fetch';
import type { StepContext } from './context';

export type FileMap = Map<string, Result<Uint8Array>>;
/** Photos fetched during a call, by URL: an order with several products downloads the image only once. */
export type PhotoMap = Map<string, Result<FetchedPhoto>>;

export function initialPhotoStep(photo: DraftPhoto | null): PhotoStep {
  if (!photo) return 'unavailable';
  return photo.include ? 'pending' : 'not_requested';
}

function manualBytes(file: ManualFile): Result<Uint8Array> {
  if (base64Size(file.base64) > MAX_DOCUMENT_BYTES) return fail('FILE_TOO_LARGE');
  const bytes = base64ToBytes(file.base64);
  // Re-check on the service worker side, even if the UI has already checked the file (R10).
  return isPdf(bytes) ? ok(bytes) : fail('NOT_A_PDF');
}

export function filesFrom(manualFiles: ManualFile[]): FileMap {
  return new Map(manualFiles.map((f) => [f.docId, manualBytes(f)]));
}

/** First refused manual file, if any (same order as the map). */
export function firstFileFailure(files: FileMap): Result<never> | null {
  for (const result of files.values()) if (!result.ok) return result;
  return null;
}

/** A manual document is missing: neither already attached nor provided. */
export function needsManualFile(p: PendingImport, files: FileMap): boolean {
  return p.draft.documents.some(
    (d) => d.origin === 'manual' && p.steps.attachments[d.id] !== 'done' && !files.has(d.id),
  );
}

/** Error reported for a failed document: HomeBox-side failures are grouped under `ATTACHMENT_FAILED`. */
function attachmentError(error: ErrorCode): ErrorCode {
  return error === 'UNAUTHORIZED' ||
    error === 'HOMEBOX_UNREACHABLE' ||
    error === 'ATTACHMENT_FAILED'
    ? 'ATTACHMENT_FAILED'
    : error;
}

async function bytesFor(
  ctx: StepContext,
  p: PendingImport,
  doc: DocumentRef,
  files: FileMap,
): Promise<Result<Uint8Array>> {
  const cached = files.get(doc.id);
  if (cached) return cached;
  let result: Result<Uint8Array>;
  if (doc.origin === 'manual') {
    result = fail('MANUAL_FILE_REQUIRED');
  } else if (!doc.url) {
    result = fail('INVOICE_UNAVAILABLE');
  } else {
    const res = await ctx.deps.downloadDetected(p.tabId, doc.url);
    result = res.ok ? ok(base64ToBytes(res.value.base64)) : res;
  }
  // The same document can be attached to several objects: a single download.
  files.set(doc.id, result);
  return result;
}

/** Downloads the photo only once per URL during a call. */
export async function photoFor(
  ctx: StepContext,
  photo: DraftPhoto,
  photos: PhotoMap,
): Promise<Result<FetchedPhoto>> {
  const cached = photos.get(photo.url);
  if (cached) return cached;
  const result = await ctx.deps.fetchPhoto(photo);
  photos.set(photo.url, result);
  return result;
}

/** Sends one document; returns the error to report, if any. */
export async function attachDocument(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
  doc: DocumentRef,
  files: FileMap,
): Promise<ErrorCode | null> {
  const bytes = await bytesFor(ctx, p, doc, files);
  let res: Result<unknown> = bytes;
  if (bytes.ok) {
    // The HomeBox type is only ever computed here, from the validated kind (V4).
    const type = homeboxTypeOf(doc.kind);
    const upload = {
      bytes: bytes.value,
      filename: attachmentName(doc),
      mimeType: 'application/pdf',
    };
    res = await ctx.client.addAttachment(entityId, { ...upload, type });
    // An instance that refuses the manual/warranty type (422): one retry, same file, same instance (R1, V5).
    if (!res.ok && res.httpStatus === 422 && isOptionalHomeboxType(type)) {
      res = await ctx.client.addAttachment(entityId, { ...upload, type: 'attachment' });
      if (res.ok) {
        p.attachmentFallbacks ??= [];
        p.attachmentFallbacks.push(doc.id);
      }
    }
  }
  p.steps.attachments[doc.id] = res.ok ? 'done' : 'failed';
  await ctx.persist(p);
  return res.ok ? null : attachmentError(res.error);
}

/** Documents not yet attached, in order. Returns the first error to report, if any. */
export async function attachmentsStep(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
  files: FileMap,
): Promise<ErrorCode | null> {
  let firstError: ErrorCode | null = null;
  for (const doc of p.draft.documents) {
    if (p.steps.attachments[doc.id] === 'done') continue;
    const error = await attachDocument(ctx, p, entityId, doc, files); // NOSONAR: sequential on purpose (one instance, resume state per document)
    firstError ??= error;
  }
  return firstError;
}

/**
 * Duplicate guard (R8): after a send attempt with an unknown outcome, the object is read again. A photo
 * already attached (`type`, never `primary`) closes the step; a failed read fails it without sending.
 */
async function reconcilePhoto(ctx: StepContext, p: PendingImport, entityId: string): Promise<void> {
  const step = p.steps.photo;
  if (step !== 'sending' && step !== 'failed') return;
  if (!p.photoAttempted) {
    p.steps.photo = 'pending';
    return;
  }
  const current = await ctx.client.getEntity(entityId);
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

async function sendPhoto(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
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
  // Early write: if the service worker stops during the POST, the resume will read the object again.
  p.steps.photo = 'sending';
  p.photoAttempted = true;
  await ctx.persist(p);
  const res = await ctx.client.addAttachment(entityId, {
    bytes: fetched.value.bytes,
    filename: fetched.value.filename,
    type: 'photo',
    mimeType: fetched.value.mimeType,
    primary: true,
  });
  p.steps.photo = res.ok ? 'done' : 'failed';
  p.photoError = res.ok ? null : 'PHOTO_UPLOAD_FAILED';
}

/** Photo: duplicate guard on resume (R8), then sending. Returns the photo error to report, if any. */
export async function photoStep(
  ctx: StepContext,
  p: PendingImport,
  entityId: string,
  photos: PhotoMap,
): Promise<ErrorCode | null> {
  p.steps.photo ??= 'not_requested';
  p.photoError ??= null;
  await reconcilePhoto(ctx, p, entityId);
  if (p.steps.photo === 'pending') {
    await sendPhoto(ctx, p, entityId, photos);
    await ctx.persist(p);
  }
  // As long as the photo has not failed, no photo error is kept.
  if (p.steps.photo === 'failed') return p.photoError;
  p.photoError = null;
  return null;
}
