import { fail, ok, type Result } from '@/shared/errors';
import type { DownloadedDocument } from '@/shared/messages';
import { MAX_DOCUMENT_BYTES, bytesToBase64, isPdf } from '@/shared/pdf';
import { AMAZON_FR_ORIGIN } from './extractor';

const PDF_CONTENT_TYPES = ['application/pdf', 'application/octet-stream', 'binary/octet-stream'];

/**
 * Télécharge un document dans le contexte de la page amazon.fr (cookies de première partie, R10),
 * vérifie qu'il s'agit d'un vrai PDF puis l'encode en base64 pour le service worker.
 */
export async function downloadDocument(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<DownloadedDocument>> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail('INVOICE_UNAVAILABLE');
  }
  if (url.origin !== AMAZON_FR_ORIGIN) return fail('DOWNLOAD_REFUSED');

  let res: Response;
  try {
    res = await fetchImpl(url.href, { credentials: 'include', redirect: 'follow' });
  } catch {
    return fail('DOWNLOAD_REFUSED');
  }
  if (res.url.includes('/ap/signin')) return fail('DOWNLOAD_REFUSED', res.status);
  if (res.status === 401 || res.status === 403) return fail('DOWNLOAD_REFUSED', res.status);
  if (!res.ok) return fail('INVOICE_UNAVAILABLE', res.status);

  const declared = Number(res.headers.get('Content-Length'));
  if (declared > MAX_DOCUMENT_BYTES) return fail('FILE_TOO_LARGE');

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_DOCUMENT_BYTES) return fail('FILE_TOO_LARGE');

  const contentType = (res.headers.get('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (contentType !== '' && !PDF_CONTENT_TYPES.includes(contentType)) return fail('NOT_A_PDF');
  if (!isPdf(bytes)) return fail('NOT_A_PDF');

  return ok({ base64: bytesToBase64(bytes), size: bytes.length, contentType: 'application/pdf' });
}
