import { Window } from 'happy-dom';
import { createAmazonExtractor } from '@/content/merchants/amazon/extractor';
import {
  MAX_PRODUCT_PAGES,
  PRODUCT_LOOKUP_BUDGET_MS,
  PRODUCT_PAGE_CONCURRENCY,
  labelKey,
  lookUpProductIdentifiers,
  readProductIdentifiers,
} from '@/content/merchants/amazon/product-details';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';
import { extractWithLookups } from '@/content/merchants/extract-all';
import type { DetectedProduct } from '@/shared/types';
import { amazonFr, fixtureHtml, loadFixture } from './fixtures';

/** Spec 027 (contracts/product-page.md): reading the manufacturer and model on the Amazon product page. */
const ORIGIN = 'https://www.amazon.fr';
const page = (html: string): Document => {
  const window = new Window({ url: `${ORIGIN}/dp/B000000001` });
  window.document.write(html);
  return window.document as unknown as Document;
};
const fixture = (name: string) => page(fixtureHtml(name, 'product-pages-amazon'));

describe('readProductIdentifiers on the fictional fixtures (research R2, R3)', () => {
  it.each([
    ['product-techspec-fr.html', 'Fabricant Fictif', 'MOD-0001'],
    ['product-detail-bullets-de.html', 'Fiktiver Hersteller GmbH', 'MOD-0002'],
    ['product-technical-specs-en.html', 'Fictional Maker Ltd', 'MOD-0003'],
    ['product-techspec-es.html', 'Fabricante Ficticio', 'MOD-0004'],
    ['product-detail-bullets-it.html', 'Produttore Fittizio', 'MOD-0005'],
    ['product-techspec-nl.html', 'Fictieve Fabrikant', 'REF-0006'],
  ])('%s: manufacturer %j, model %j, invisible marks removed', (name, manufacturer, model) => {
    const ids = readProductIdentifiers(fixture(name));
    expect(ids.manufacturer.value).toBe(manufacturer);
    expect(ids.modelNumber.value).toBe(model);
  });

  it('the brand is never used as the manufacturer', () => {
    const doc = page(
      '<table id="productDetails_techSpec_section_1"><tr><th>Marque</th><td>Marque Fictive</td></tr></table>',
    );
    expect(readProductIdentifiers(doc).manufacturer).toEqual({ value: null, reason: 'not_found' });
  });

  it('the item model number wins over the manufacturer reference and the part number', () => {
    expect(readProductIdentifiers(fixture('product-techspec-fr.html')).modelNumber.value).toBe(
      'MOD-0001',
    );
    expect(
      readProductIdentifiers(fixture('product-technical-specs-en.html')).modelNumber.value,
    ).toBe('MOD-0003');
  });

  it('a page without detail block gives not_found for both', () => {
    const ids = readProductIdentifiers(fixture('product-no-details.html'));
    expect(ids.manufacturer).toEqual({ value: null, reason: 'not_found' });
    expect(ids.modelNumber).toEqual({ value: null, reason: 'not_found' });
  });

  it('an empty or too long value is unparsable, never truncated (research R5)', () => {
    const doc = page(
      `<table id="productDetails_techSpec_section_1"><tr><th>Fabricant</th><td>${'x'.repeat(256)}</td></tr>` +
        '<tr><th>Numéro de modèle</th><td> \u200e </td></tr></table>',
    );
    const ids = readProductIdentifiers(doc);
    expect(ids.manufacturer).toEqual({ value: null, reason: 'unparsable' });
    expect(ids.modelNumber).toEqual({ value: null, reason: 'unparsable' });
  });

  it('an unusable first label falls back to the next one', () => {
    const doc = page(
      '<table id="productDetails_techSpec_section_1"><tr><th>Item model number</th><td></td></tr>' +
        '<tr><th>Model Number</th><td>MOD-0007</td></tr></table>',
    );
    expect(readProductIdentifiers(doc).modelNumber.value).toBe('MOD-0007');
  });

  it('labelKey ignores case, accents, colons, typographic apostrophes and invisible marks', () => {
    expect(labelKey(' Numéro du modèle de l’article \u200f : \u200e')).toBe(
      "numero du modele de l'article",
    );
    expect(labelKey('FABRICANT\u00a0:')).toBe('fabricant');
  });
});

describe('lookUpProductIdentifiers: requests (FR-001, FR-002, research R7)', () => {
  const product = (key: string): DetectedProduct => ({
    key,
    name: { value: `Produit fictif ${key}`, selector: 's' },
    unitPrice: { value: 11.11, selector: 's' },
    currency: { value: 'EUR', selector: 's' },
    quantity: { value: 1, selector: 's' },
    imageUrl: { value: null, reason: 'not_found' },
  });
  const html = fixtureHtml('product-techspec-fr.html', 'product-pages-amazon');
  const okResponse = (
    url: string,
    body = html,
    headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' },
  ) => {
    const res = new Response(body, { status: 200, headers });
    Object.defineProperty(res, 'url', { value: url });
    return res;
  };

  it('one GET per ASIN product on <origin>/dp/<ASIN>, without cookie nor referrer', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      return okResponse(url);
    });
    const out = await lookUpProductIdentifiers(
      [product('B000000001'), product('item-1')],
      ORIGIN,
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://www.amazon.fr/dp/B000000001');
    expect(init).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toBeUndefined();
    expect(out[0]?.manufacturer?.value).toBe('Fabricant Fictif');
    expect(out[0]?.modelNumber?.value).toBe('MOD-0001');
    // No ASIN: no request, no field (nothing was tried: no « not found on the product page » notice).
    expect(out[1]).not.toHaveProperty('manufacturer');
    expect(out[1]).not.toHaveProperty('modelNumber');
    // The other fields of the product are unchanged.
    expect(out[0]?.name).toEqual(product('B000000001').name);
  });

  it(`at most ${MAX_PRODUCT_PAGES} pages, ${PRODUCT_PAGE_CONCURRENCY} at a time, one per distinct ASIN`, async () => {
    let running = 0;
    let peak = 0;
    const fetchMock = vi.fn(async (url: string) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return okResponse(url);
    });
    const keys = Array.from({ length: 12 }, (_, i) => `B0000000${String(i + 10)}`);
    const products = [...keys, keys[0] ?? ''].map(product);
    const out = await lookUpProductIdentifiers(
      products,
      ORIGIN,
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(MAX_PRODUCT_PAGES);
    expect(peak).toBeLessThanOrEqual(PRODUCT_PAGE_CONCURRENCY);
    expect(out.slice(0, 10).every((p) => p.manufacturer?.value === 'Fabricant Fictif')).toBe(true);
    expect(out[10]).not.toHaveProperty('manufacturer');
    // Same ASIN twice: one request, both rows filled.
    expect(out[12]?.manufacturer?.value).toBe('Fabricant Fictif');
  });

  it.each([
    ['network error', () => Promise.reject(new TypeError('network'))],
    [
      'HTTP 503',
      (url: string) => {
        const res = new Response(html, { status: 503 });
        Object.defineProperty(res, 'url', { value: url });
        return Promise.resolve(res);
      },
    ],
    [
      'redirect to another origin',
      () => Promise.resolve(okResponse('https://www.amazon.de/dp/B000000001')),
    ],
    [
      'sign-in page of the same origin but not HTML',
      (url: string) =>
        Promise.resolve(okResponse(url, '{}', { 'Content-Type': 'application/json' })),
    ],
    [
      'declared size over 5 MB',
      (url: string) =>
        Promise.resolve(
          okResponse(url, html, { 'Content-Type': 'text/html', 'Content-Length': '6000000' }),
        ),
    ],
    [
      'body over 5 MB',
      (url: string) =>
        Promise.resolve(okResponse(url, 'x'.repeat(5_000_001), { 'Content-Type': 'text/html' })),
    ],
  ])('%s: page not read, no field, nothing thrown (FR-006)', async (_name, impl) => {
    const fetchMock = vi.fn(impl);
    const out = await lookUpProductIdentifiers(
      [product('B000000001')],
      ORIGIN,
      fetchMock as unknown as typeof fetch,
    );
    expect(out[0]).not.toHaveProperty('manufacturer');
    expect(out[0]).not.toHaveProperty('modelNumber');
    expect(out[0]).toEqual(product('B000000001'));
  });

  it('a page read without detail rows (robot check) gives not_found: read, nothing found', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      okResponse(url, fixtureHtml('product-no-details.html', 'product-pages-amazon')),
    );
    const out = await lookUpProductIdentifiers(
      [product('B000000001')],
      ORIGIN,
      fetchMock as unknown as typeof fetch,
    );
    expect(out[0]?.manufacturer).toEqual({ value: null, reason: 'not_found' });
    expect(out[0]?.modelNumber).toEqual({ value: null, reason: 'not_found' });
  });

  it('a body without Content-Length is read as a stream and abandoned beyond 5 000 000 bytes', async () => {
    let pulled = 0;
    let cancelled = false;
    let signal: AbortSignal | undefined;
    const chunk = new Uint8Array(1_000_000).fill(0x78);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      });
      const res = new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
      Object.defineProperty(res, 'url', { value: url });
      return res;
    });
    const out = await lookUpProductIdentifiers(
      [product('B000000001')],
      ORIGIN,
      fetchMock as unknown as typeof fetch,
    );
    expect(out[0]).not.toHaveProperty('manufacturer');
    expect(cancelled).toBe(true);
    expect(signal?.aborted).toBe(true);
    // 6 chunks of 1 000 000 bytes at most were pulled before the cancellation: never the whole (endless) body.
    expect(pulled).toBeLessThanOrEqual(7);
  });

  it('a multi-byte page is decoded as UTF-8 from the stream', async () => {
    const page =
      '<table id="productDetails_techSpec_section_1"><tr><th>Fabricant</th><td>Éditions Fictives</td></tr></table>';
    const fetchMock = vi.fn(async (url: string) => okResponse(url, page));
    const out = await lookUpProductIdentifiers(
      [product('B000000001')],
      ORIGIN,
      fetchMock as unknown as typeof fetch,
    );
    expect(out[0]?.manufacturer?.value).toBe('Éditions Fictives');
  });

  it('a page slower than the time limit is abandoned (8 s)', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      const pending = lookUpProductIdentifiers(
        [product('B000000001')],
        ORIGIN,
        fetchMock as unknown as typeof fetch,
      );
      await vi.advanceTimersByTimeAsync(8000);
      const out = await pending;
      expect(out[0]).not.toHaveProperty('manufacturer');
    } finally {
      vi.useRealTimers();
    }
  });

  it(`the whole lookup ends within ${PRODUCT_LOOKUP_BUDGET_MS} ms; pages read by then are kept, the others get no field`, async () => {
    vi.useFakeTimers();
    try {
      // B000000010 answers at once; every other page answers just before its own 8 s limit (worst case: 4 rounds).
      const fetchMock = vi.fn(
        (url: string, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
            const delay = url.endsWith('B000000010') ? 0 : 7900;
            setTimeout(() => resolve(okResponse(url)), delay);
          }),
      );
      const keys = Array.from({ length: 10 }, (_, i) => `B0000000${String(i + 10)}`);
      let done = false;
      const pending = lookUpProductIdentifiers(
        keys.map(product),
        ORIGIN,
        fetchMock as unknown as typeof fetch,
      ).then((r) => {
        done = true;
        return r;
      });
      await vi.advanceTimersByTimeAsync(PRODUCT_LOOKUP_BUDGET_MS - 1);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toBe(true);
      const out = await pending;
      expect(out[0]?.manufacturer?.value).toBe('Fabricant Fictif');
      // Pages started after the budget are never requested; unfinished ones carry no field.
      expect(fetchMock.mock.calls.length).toBeLessThan(10);
      expect(out[9]).not.toHaveProperty('manufacturer');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Amazon extractor contract (principle III)', () => {
  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))(
    '%s: requests only its own origin',
    async (_id, s) => {
      const fetchMock = vi.fn(async (url: string) => okHtml(url));
      const ex = createAmazonExtractor(s);
      expect(ex.resolveProductIdentifiers).toBeTypeOf('function');
      const p = { key: 'B000000001', name: { value: 'x', selector: 's' } } as DetectedProduct;
      await ex.resolveProductIdentifiers?.([p], fetchMock as unknown as typeof fetch);
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([`${s.origin}/dp/B000000001`]);
    },
  );
});

function okHtml(url: string): Response {
  const res = new Response('<html></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
  Object.defineProperty(res, 'url', { value: url });
  return res;
}

describe('extractWithLookups: documents and product pages read in parallel, failures isolated (US3-2)', () => {
  it('fills the identifiers and keeps the documents', async () => {
    const { doc, url } = loadFixture('real-order-single.html');
    const productPage = (u: string) => {
      const res = new Response(fixtureHtml('product-techspec-fr.html', 'product-pages-amazon'), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
      Object.defineProperty(res, 'url', { value: u });
      return res;
    };
    const fetchMock = vi.fn(async (u: string) =>
      u.includes('/dp/') ? productPage(u) : new Response('', { status: 404 }),
    );
    const purchase = await extractWithLookups(
      amazonFr(),
      doc,
      url,
      fetchMock as unknown as typeof fetch,
    );
    expect(purchase.products.length).toBeGreaterThan(0);
    expect(purchase.products.every((p) => p.manufacturer?.value === 'Fabricant Fictif')).toBe(true);
  });

  it('slow product pages delay the answer (documents included) by the lookup budget at most', async () => {
    vi.useFakeTimers();
    try {
      const { doc, url } = loadFixture('real-order-single.html');
      const fetchMock = vi.fn((u: string, init?: RequestInit) => {
        if (!u.includes('/dp/')) return Promise.resolve(new Response('', { status: 404 }));
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        });
      });
      let done = false;
      const pending = extractWithLookups(
        amazonFr(),
        doc,
        url,
        fetchMock as unknown as typeof fetch,
      ).then((p) => {
        done = true;
        return p;
      });
      await vi.advanceTimersByTimeAsync(PRODUCT_LOOKUP_BUDGET_MS);
      expect(done).toBe(true);
      const purchase = await pending;
      expect(purchase.products.every((p) => p.manufacturer === undefined)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a product page lookup that throws leaves the purchase as extracted', async () => {
    const { doc, url } = loadFixture('real-order-single.html');
    const ex = {
      ...amazonFr(),
      resolveProductIdentifiers: () => Promise.reject(new Error('boom')),
    };
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }));
    const purchase = await extractWithLookups(ex, doc, url, fetchMock as unknown as typeof fetch);
    expect(purchase.products).toEqual(amazonFr().extract(doc, url).products);
  });

  it('a merchant without the optional method is unchanged', async () => {
    const { doc, url } = loadFixture('real-order-single.html');
    const base = amazonFr();
    const ex = { ...base, resolveProductIdentifiers: undefined };
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }));
    const purchase = await extractWithLookups(ex, doc, url, fetchMock as unknown as typeof fetch);
    expect(fetchMock.mock.calls.some((c) => String((c as unknown[])[0]).includes('/dp/'))).toBe(
      false,
    );
    expect(purchase.products.every((p) => p.manufacturer === undefined)).toBe(true);
  });
});
