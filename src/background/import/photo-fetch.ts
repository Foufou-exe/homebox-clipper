import { MERCHANTS } from '@/content/merchants/registry';
import { fail, ok, type Result } from '@/shared/errors';
import { MAX_IMAGE_BYTES, isAllowedImageUrl, sniffImage } from '@/shared/image';
import { log } from '@/shared/logger';
import type { DraftPhoto } from '@/shared/types';

/*
 * Module deliberately separate from the HomeBox client: the API key is not accessible here (FR-023).
 * It imports neither the vault, nor the configuration, nor the client.
 */

export const PHOTO_TIMEOUT_MS = 15_000;

export interface FetchedPhoto {
  bytes: Uint8Array;
  /** Set from the byte signature, not from the response header. */
  mimeType: string;
  filename: string;
}

/** Reads the body, stopping as soon as the limit is exceeded (stream without `Content-Length`). */
async function readLimited(res: Response): Promise<Uint8Array | null> {
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    return all.length > MAX_IMAGE_BYTES ? null : all;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Fetches the product photo from the merchant's server: anonymous GET (R5, R6). The URL is re-checked here,
 * against the merchant's list, even if the extractor has already filtered it. Logs `{ endpoint, status, ms }`,
 * never the URL.
 */
export async function fetchPhoto(photo: DraftPhoto, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<Result<FetchedPhoto>> {
  const hosts = MERCHANTS.find((m) => m.id === photo.merchantId)?.imageHosts;
  if (!hosts || !isAllowedImageUrl(photo.url, hosts)) return fail('PHOTO_UNAVAILABLE');

  const started = Date.now();
  let res: Response;
  try {
    res = await fetchImpl(photo.url, {
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
    });
  } catch {
    log('photo fetch failed', { endpoint: 'photo fetch', code: 'PHOTO_UNAVAILABLE' });
    return fail('PHOTO_UNAVAILABLE');
  }
  log('photo fetch', { endpoint: 'photo fetch', status: res.status, ms: Date.now() - started });

  if (!res.ok) return fail('PHOTO_UNAVAILABLE');
  if (!res.headers.get('Content-Type')?.toLowerCase().startsWith('image/')) return fail('PHOTO_NOT_IMAGE');
  const declared = Number(res.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return fail('PHOTO_TOO_LARGE');

  let bytes: Uint8Array | null;
  try {
    bytes = await readLimited(res);
  } catch {
    return fail('PHOTO_UNAVAILABLE');
  }
  if (bytes === null) return fail('PHOTO_TOO_LARGE');
  const kind = sniffImage(bytes);
  if (!kind) return fail('PHOTO_NOT_IMAGE');
  return ok({ bytes, mimeType: kind.mimeType, filename: `photo-produit.${kind.extension}` });
}
