import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { downloadDocument } from '@/content/merchants/amazon/download';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';

const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n');

function respond(body: BodyInit | null, init: ResponseInit & { url?: string } = {}) {
  const res = new Response(body, init);
  if (init.url) Object.defineProperty(res, 'url', { value: init.url });
  return vi.fn(async () => res) as unknown as typeof fetch;
}

/** Invoices are only downloaded from the origin of the store of the order (FR-008, Q-U9). */
describe.each(AMAZON_STORES.map((s) => [s.id, s.origin] as const))(
  'downloadDocument on %s',
  (_id, origin) => {
    const pdfUrl = `${origin}/documents/download/x/invoice.pdf`;

    it('same origin: PDF downloaded with the page cookies', async () => {
      const f = respond(PDF, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
      expect((await downloadDocument(pdfUrl, origin, f)).ok).toBe(true);
      expect(f).toHaveBeenCalledWith(pdfUrl, { credentials: 'include', redirect: 'follow' });
    });

    it.each([
      ...AMAZON_STORES.filter((s) => s.origin !== origin).map(
        (s) => `${s.origin}/documents/download/x/invoice.pdf`,
      ),
      'https://evil.example.com/invoice.pdf',
      `${origin.replace('https:', 'http:')}/documents/download/x/invoice.pdf`,
      `${origin}.evil.example/documents/download/x/invoice.pdf`,
    ])('link %s → DOWNLOAD_REFUSED without a network call', async (url) => {
      const f = respond(PDF, { status: 200 });
      expect(await downloadDocument(url, origin, f)).toMatchObject({
        ok: false,
        error: 'DOWNLOAD_REFUSED',
      });
      expect(f).not.toHaveBeenCalled();
    });

    it('redirect to the login page → DOWNLOAD_REFUSED', async () => {
      const f = respond('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        url: `${origin}/ap/signin?x=1`,
      });
      expect(await downloadDocument(pdfUrl, origin, f)).toMatchObject({
        ok: false,
        error: 'DOWNLOAD_REFUSED',
      });
    });

    it.each([401, 403])('%i → DOWNLOAD_REFUSED', async (status) => {
      expect(await downloadDocument(pdfUrl, origin, respond(null, { status }))).toMatchObject({
        ok: false,
        error: 'DOWNLOAD_REFUSED',
      });
    });
  },
);

describe('content script: the allowed origin comes from the extractor, never from the message', () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/entrypoints/amazon.content.ts'),
    'utf8',
  );

  it('amazon/download passes the origin of the extractor found for location', () => {
    expect(source).toMatch(/downloadDocument\(\s*raw\.url\s*,\s*\w+\.origin\b/);
    expect(source).not.toMatch(/raw\.origin|raw\.allowedOrigin/);
  });

  it('the extractor is looked up from location (matchesUrl), not from the message', () => {
    expect(source).toMatch(/MERCHANTS\.find\(\s*\(\w+\)\s*=>\s*\w+\.matchesUrl\(/);
    expect(source).toMatch(/new URL\(location\.href\)/);
  });
});
