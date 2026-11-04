import { fetchPhoto, PHOTO_TIMEOUT_MS } from '@/background/import/photo-fetch';
import { MAX_IMAGE_BYTES } from '@/shared/image';
import type { DraftPhoto } from '@/shared/types';

const URL_OK = 'https://m.media-amazon.com/images/I/test-1._SL1000_.jpg';
const photo = (over: Partial<DraftPhoto> = {}): DraftPhoto => ({
  url: URL_OK,
  merchantId: 'amazon.fr',
  include: true,
  ...over,
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 9]);

type Init = RequestInit & { headers?: unknown };
/** fetch simulé qui garde l'URL et les options exactes de chaque appel. */
function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: Init }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: Init = {}) => {
    calls.push({ url: String(input), init });
    return respond();
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}
const image = (body: Uint8Array, type = 'image/jpeg', headers: Record<string, string> = {}) =>
  new Response(body as BodyInit, { status: 200, headers: { 'Content-Type': type, ...headers } });

afterEach(() => vi.restoreAllMocks());

describe('photo-fetch : options de la requête (R6)', () => {
  it('credentials omit, redirect error, no-referrer, no-store, délai de 15 s, aucun en-tête', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const f = fakeFetch(() => image(JPEG));
    const res = await fetchPhoto(photo(), f.fetch);
    expect(res.ok).toBe(true);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.url).toBe(URL_OK);
    const init = f.calls[0]!.init;
    expect(init).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(PHOTO_TIMEOUT_MS).toBe(15_000);
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(init.method === undefined || init.method === 'GET').toBe(true);
  });
});

describe('photo-fetch : refus avant toute requête', () => {
  it.each([
    ['hôte non autorisé', photo({ url: 'https://evil.example/x.jpg' })],
    ['hôte lookalike', photo({ url: 'https://m.media-amazon.com.evil.example/x.jpg' })],
    ['http:', photo({ url: 'http://m.media-amazon.com/x.jpg' })],
    ['identifiants dans l’URL', photo({ url: 'https://u:p@m.media-amazon.com/x.jpg' })],
    ['merchantId inconnu', photo({ merchantId: 'inconnu.example' as DraftPhoto['merchantId'] })],
  ])('%s → PHOTO_UNAVAILABLE sans requête', async (_label, p) => {
    const f = fakeFetch(() => image(JPEG));
    expect(await fetchPhoto(p, f.fetch)).toEqual({ ok: false, error: 'PHOTO_UNAVAILABLE' });
    expect(f.fetch).not.toHaveBeenCalled();
  });
});

describe('photo-fetch : échecs réseau', () => {
  it('TypeError (réseau, CORS, redirection refusée) → PHOTO_UNAVAILABLE', async () => {
    const f = fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await fetchPhoto(photo(), f.fetch)).toEqual({ ok: false, error: 'PHOTO_UNAVAILABLE' });
  });

  it('délai dépassé → PHOTO_UNAVAILABLE', async () => {
    const f = fakeFetch(() => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    expect(await fetchPhoto(photo(), f.fetch)).toEqual({ ok: false, error: 'PHOTO_UNAVAILABLE' });
  });

  it.each([301, 302, 400, 403, 404, 500])('statut %i → PHOTO_UNAVAILABLE', async (status) => {
    const f = fakeFetch(() => new Response('x', { status }));
    expect(await fetchPhoto(photo(), f.fetch)).toEqual({ ok: false, error: 'PHOTO_UNAVAILABLE' });
  });
});

describe('photo-fetch : contenu refusé (FR-006)', () => {
  it('réponse HTML (scénario 5) → PHOTO_NOT_IMAGE', async () => {
    const html = new TextEncoder().encode('<!doctype html><html></html>');
    const f = fakeFetch(() => image(html, 'text/html; charset=utf-8'));
    expect(await fetchPhoto(photo(), f.fetch)).toEqual({ ok: false, error: 'PHOTO_NOT_IMAGE' });
  });

  it('Content-Type image/* mais signature HTML → PHOTO_NOT_IMAGE', async () => {
    const html = new TextEncoder().encode('<!doctype html><html></html>');
    const f = fakeFetch(() => image(html, 'image/jpeg'));
    expect(await fetchPhoto(photo(), f.fetch)).toEqual({ ok: false, error: 'PHOTO_NOT_IMAGE' });
  });

  it('Content-Type absent → PHOTO_NOT_IMAGE', async () => {
    const f = fakeFetch(() => new Response(JPEG as BodyInit, { status: 200 }));
    expect(await fetchPhoto(photo(), f.fetch)).toEqual({ ok: false, error: 'PHOTO_NOT_IMAGE' });
  });

  it.each([
    ['SVG', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'],
    ['GIF', new TextEncoder().encode('GIF89a\u0001\u0000'), 'image/gif'],
    ['corps vide', new Uint8Array(0), 'image/jpeg'],
  ])('%s → PHOTO_NOT_IMAGE', async (_label, body, type) => {
    const f = fakeFetch(() => image(body, type));
    expect(await fetchPhoto(photo(), f.fetch)).toEqual({ ok: false, error: 'PHOTO_NOT_IMAGE' });
  });
});

describe('photo-fetch : taille (R7)', () => {
  it('Content-Length excessif → PHOTO_TOO_LARGE sans lire le corps', async () => {
    const f = fakeFetch(() => image(JPEG, 'image/jpeg', { 'Content-Length': String(MAX_IMAGE_BYTES + 1) }));
    expect(await fetchPhoto(photo(), f.fetch)).toEqual({ ok: false, error: 'PHOTO_TOO_LARGE' });
  });

  it('flux sans Content-Length qui dépasse 5 Mio → PHOTO_TOO_LARGE, lecture interrompue', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set(JPEG);
    let pulled = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled >= 50) return controller.close();
        pulled++;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const f = fakeFetch(() => new Response(body, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }));
    expect(await fetchPhoto(photo(), f.fetch)).toEqual({ ok: false, error: 'PHOTO_TOO_LARGE' });
    expect(pulled).toBeLessThan(50);
    expect(cancelled).toBe(true);
  });

  it('exactement 5 Mio : accepté', async () => {
    const body = new Uint8Array(MAX_IMAGE_BYTES);
    body.set(JPEG);
    const f = fakeFetch(() => image(body));
    const res = await fetchPhoto(photo(), f.fetch);
    expect(res.ok && res.value.bytes.length).toBe(MAX_IMAGE_BYTES);
  });
});

describe('photo-fetch : succès, type et nom fixés par la signature', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg', 'photo-produit.jpg'],
    ['PNG', PNG, 'image/png', 'photo-produit.png'],
    ['WebP', WEBP, 'image/webp', 'photo-produit.webp'],
  ])('%s', async (_label, bytes, mimeType, filename) => {
    const f = fakeFetch(() => image(bytes, mimeType));
    const res = await fetchPhoto(photo(), f.fetch);
    expect(res).toEqual({ ok: true, value: { bytes, mimeType, filename } });
  });

  it('un Content-Type mensonger ne change pas le type : la signature fait foi', async () => {
    const f = fakeFetch(() => image(PNG, 'image/jpeg'));
    const res = await fetchPhoto(photo(), f.fetch);
    expect(res.ok && res.value).toMatchObject({ mimeType: 'image/png', filename: 'photo-produit.png' });
  });
});

describe('photo-fetch : journaux et isolation de la clé (FR-023, FR-026)', () => {
  it('ne journalise jamais l’URL, seulement { endpoint, status, ms }', async () => {
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    await fetchPhoto(photo(), fakeFetch(() => image(JPEG)).fetch);
    await fetchPhoto(photo(), fakeFetch(() => new Response('x', { status: 404 })).fetch);
    await fetchPhoto(photo(), fakeFetch(() => {
      throw new TypeError('x');
    }).fetch);
    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output).not.toContain('media-amazon');
    expect(output).not.toContain('test-1');
  });

  it('le module n’importe ni le client HomeBox ni le coffre de la clé', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, '../../src/background/import/photo-fetch.ts'), 'utf8');
    expect(source).not.toMatch(/homebox\/client|key-vault|config-store|apiKey|Authorization/i);
  });
});
