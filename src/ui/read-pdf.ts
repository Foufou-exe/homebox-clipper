import type { ErrorCode } from '@/shared/errors';
import { MAX_DOCUMENT_BYTES, bytesToBase64, isPdf } from '@/shared/pdf';
import type { DocumentRef, ManualFile } from '@/shared/types';

export interface PickedDocument {
  doc: DocumentRef;
  file: ManualFile;
  replaceDetected: boolean;
}

/** Reads and validates a local file: real PDF (%PDF- signature) and <= 15 MB (FR-014, FR-019). */
export async function readPdf(
  file: Blob,
): Promise<{ ok: true; base64: string } | { ok: false; error: ErrorCode }> {
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: 'FILE_TOO_LARGE' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(bytes)) return { ok: false, error: 'NOT_A_PDF' };
  return { ok: true, base64: bytesToBase64(bytes) };
}
