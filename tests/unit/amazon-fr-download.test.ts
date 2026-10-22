import { downloadDocument } from '@/content/merchants/amazon-fr/download';
import { base64ToBytes } from '@/shared/pdf';

const URL_PDF = 'https://www.amazon.fr/documents/download/x/invoice.pdf';
const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n');

function respond(body: BodyInit | null, init: ResponseInit & { url?: string } = {}) {
  const res = new Response(body, init);
  if (init.url) Object.defineProperty(res, 'url', { value: init.url });
  return vi.fn(async () => res) as unknown as typeof fetch;
}

describe('downloadDocument', () => {
  it('PDF 200 → base64 et taille', async () => {
    const f = respond(PDF, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    const r = await downloadDocument(URL_PDF, f);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.size).toBe(PDF.length);
      expect(base64ToBytes(r.value.base64)).toEqual(PDF);
    }
    expect(f).toHaveBeenCalledWith(URL_PDF, { credentials: 'include', redirect: 'follow' });
  });

  it('HTML 200 (récapitulatif imprimable) → NOT_A_PDF', async () => {
    const f = respond('<html>Récapitulatif</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    expect(await downloadDocument(URL_PDF, f)).toMatchObject({ ok: false, error: 'NOT_A_PDF' });
  });

  it('octet-stream sans signature PDF → NOT_A_PDF', async () => {
    const f = respond('PK\u0003\u0004', { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    expect(await downloadDocument(URL_PDF, f)).toMatchObject({ ok: false, error: 'NOT_A_PDF' });
  });

  it('redirection vers la page de connexion → DOWNLOAD_REFUSED', async () => {
    const f = respond('<html>Identifiez-vous</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
      url: 'https://www.amazon.fr/ap/signin?openid.return_to=x',
    });
    expect(await downloadDocument(URL_PDF, f)).toMatchObject({ ok: false, error: 'DOWNLOAD_REFUSED' });
  });

  it.each([401, 403])('%i → DOWNLOAD_REFUSED', async (status) => {
    expect(await downloadDocument(URL_PDF, respond(null, { status }))).toMatchObject({
      ok: false,
      error: 'DOWNLOAD_REFUSED',
    });
  });

  it('404 → INVOICE_UNAVAILABLE', async () => {
    expect(await downloadDocument(URL_PDF, respond(null, { status: 404 }))).toMatchObject({
      ok: false,
      error: 'INVOICE_UNAVAILABLE',
    });
  });

  it('> 15 Mo → FILE_TOO_LARGE', async () => {
    const big = new Uint8Array(15 * 1024 * 1024 + 1);
    big.set(PDF);
    const f = respond(big, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    expect(await downloadDocument(URL_PDF, f)).toMatchObject({ ok: false, error: 'FILE_TOO_LARGE' });
  });

  it('URL hors amazon.fr → refusée sans appel réseau', async () => {
    const f = respond(PDF, { status: 200 });
    expect(await downloadDocument('https://evil.example.com/invoice.pdf', f)).toMatchObject({
      ok: false,
      error: 'DOWNLOAD_REFUSED',
    });
    expect(f).not.toHaveBeenCalled();
  });
});
