import { Window } from 'happy-dom';
import { createAmazonExtractor } from '@/content/merchants/amazon/extractor';
import { AMAZON_STORES, type AmazonStore } from '@/content/merchants/amazon/stores';
import { MERCHANTS } from '@/content/merchants/registry';
import { amazonFr, fixtureHtml, loadFixture, ORDER_URL, storeOrderUrl } from './fixtures';

const amazonFrExtractor = amazonFr();

const store = (id: string): AmazonStore => AMAZON_STORES.find((s) => s.id === id)!;
const docAt = (html: string, url: string) => {
  const window = new Window({ url });
  window.document.write(html);
  return window.document as unknown as Document;
};

describe('one extractor per store (registry)', () => {
  it('MERCHANTS = one extractor per store, in the order of the table', () => {
    expect(MERCHANTS.map((m) => m.id)).toEqual(AMAZON_STORES.map((s) => s.id));
  });

  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))(
    '%s: id, displayName, domains, imageHosts',
    (_id, s) => {
      const ex = createAmazonExtractor(s);
      expect(ex.id).toBe(s.id);
      expect(ex.displayName).toBe(s.displayName);
      expect(ex.domains).toEqual([new URL(s.origin).hostname]);
      expect(ex.imageHosts).toEqual(s.imageHosts);
    },
  );
});

describe('matchesUrl: exact origin (Q-U11)', () => {
  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))(
    '%s accepts its own origin only',
    (_id, s) => {
      const ex = createAmazonExtractor(s);
      expect(ex.matchesUrl(new URL(storeOrderUrl(s)))).toBe(true);
      for (const other of AMAZON_STORES.filter((o) => o.id !== s.id)) {
        expect(ex.matchesUrl(new URL(storeOrderUrl(other))), other.id).toBe(false);
      }
    },
  );

  it.each([
    'http://www.amazon.de/your-orders/order-details',
    'https://www.amazon.com.evil.example/your-orders/order-details',
    'https://amazon.de/your-orders/order-details',
    'https://www.amazon.ca/your-orders/order-details',
  ])('%s: refused by every store', (url) => {
    expect(MERCHANTS.some((m) => m.matchesUrl(new URL(url)))).toBe(false);
  });
});

describe('isOrderPage(doc, pageUrl) (Q-U10, R3)', () => {
  const de = createAmazonExtractor(store('amazon.de'));
  const ORDER_DE = storeOrderUrl(store('amazon.de'));

  it('DOM marker: order page, whatever the path', () => {
    const doc = docAt('<div id="orderDetails"></div>', 'https://www.amazon.de/some/other/path');
    expect(de.isOrderPage(doc, new URL('https://www.amazon.de/some/other/path'))).toBe(true);
  });

  it.each([
    '/your-orders/order-details',
    '/gp/your-account/order-details',
    '/gp/css/order-details',
    '/gp/digital/your-account/order-summary.html',
  ])('without marker: path %s + readable order number → order page', (path) => {
    const url = `https://www.amazon.de${path}?orderID=999-0000000-0000001`;
    const doc = docAt('<div data-test-id="order-id">Bestellnr. 999-0000000-0000001</div>', url);
    expect(de.isOrderPage(doc, new URL(url))).toBe(true);
  });

  it('without marker: known path but no order number → not an order page', () => {
    expect(de.isOrderPage(docAt('<p>Hallo</p>', ORDER_DE), new URL(ORDER_DE))).toBe(false);
  });

  it('without marker: order number but unknown path → not an order page', () => {
    const url = 'https://www.amazon.de/dp/B00FAKE001';
    const doc = docAt('<div data-test-id="order-id">999-0000000-0000001</div>', url);
    expect(de.isOrderPage(doc, new URL(url))).toBe(false);
  });

  it('product page → refused, even on an order details path', () => {
    const { doc, url } = loadFixture('not-an-order.html');
    expect(createAmazonExtractor(store('amazon.fr')).isOrderPage(doc, url)).toBe(false);
    const onDe = loadFixture('not-an-order.html', ORDER_DE);
    expect(de.isOrderPage(onDe.doc, onDe.url)).toBe(false);
  });

  it.each([
    'order-single-item-invoice.html',
    'order-multi-item.html',
    'order-alt-layout.html',
    'order-real-layout.html',
    'real-order-single.html',
    'real-order-multi.html',
    'real-order-qty.html',
    'real-order-no-invoice.html',
  ])('Amazon.fr %s: still recognized (SC-007)', (name) => {
    const { doc, url } = loadFixture(name);
    expect(createAmazonExtractor(store('amazon.fr')).isOrderPage(doc, url)).toBe(true);
  });
});

describe('createAmazonExtractor(amazon.fr) = registered Amazon.fr extractor (SC-007)', () => {
  const fr = createAmazonExtractor(store('amazon.fr'));
  const popoverOf: Record<string, string | null> = {
    'real-order-single.html': 'real-invoice-popover-single.html',
    'real-order-multi.html': 'real-invoice-popover-multi.html',
    'real-order-qty.html': 'real-invoice-popover-single.html',
    'real-order-no-invoice.html': null,
    'order-real-layout.html': 'invoice-popover-real.html',
    'order-alt-layout.html': 'invoice-popover.html',
  };

  it.each(Object.entries(popoverOf))(
    '%s: same extraction and same documents',
    async (name, popover) => {
      const a = loadFixture(name);
      const b = loadFixture(name);
      expect(fr.extract(a.doc, a.url)).toEqual(amazonFrExtractor.extract(b.doc, b.url));
      const fetchMock = () =>
        vi.fn(
          async () =>
            new Response(popover ? fixtureHtml(popover) : '', { status: popover ? 200 : 404 }),
        ) as unknown as typeof fetch;
      expect(await fr.resolveDocuments(a.doc, a.url, fetchMock())).toEqual(
        await amazonFrExtractor.resolveDocuments(b.doc, b.url, fetchMock()),
      );
    },
  );

  it('source = amazon.fr', () => {
    const { doc, url } = loadFixture('real-order-single.html');
    expect(fr.extract(doc, url).source).toBe('amazon.fr');
  });
});

describe('extract: source and robustness', () => {
  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))(
    '%s: source = store id, pageUrl on the store origin',
    (_id, s) => {
      const url = storeOrderUrl(s);
      const p = createAmazonExtractor(s).extract(
        docAt(fixtureHtml('real-order-single.html'), url),
        new URL(url),
      );
      expect(p.source).toBe(s.id);
      expect(p.pageUrl).toBe(`${s.origin}/your-orders/order-details`);
    },
  );

  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))('%s: extract never throws', (_id, s) => {
    const ex = createAmazonExtractor(s);
    const url = new URL(storeOrderUrl(s));
    for (const html of [
      '',
      '<html lang=""><body></body></html>',
      '<html lang="xx"><div id="orderDetails">((</div></html>',
    ]) {
      expect(() => ex.extract(docAt(html, url.href), url)).not.toThrow();
    }
  });

  it('a link to another store is not taken as an invoice (FR-008)', () => {
    const url = storeOrderUrl(store('amazon.de'));
    const html =
      '<a href="https://www.amazon.fr/documents/download/x/invoice.pdf">x</a>' +
      '<a href="https://www.amazon.de/documents/download/y/invoice.pdf">y</a>';
    const docs = createAmazonExtractor(store('amazon.de')).extract(
      docAt(html, url),
      new URL(url),
    ).documents;
    expect(docs.map((d) => d.url)).toEqual([
      'https://www.amazon.de/documents/download/y/invoice.pdf',
    ]);
  });

  it('ORDER_URL stays the amazon.fr order page used by the existing tests', () => {
    expect(new URL(ORDER_URL).origin).toBe(store('amazon.fr').origin);
  });
});

/**
 * Fixtures per store (Q-U6, SC-001): reconstructed pages (status "testing") generated by
 * scripts/fixtures/reconstruct-amazon.ts from the anonymized Amazon.fr pages, then real anonymized pages.
 * Fictional values: date 2026-11-09 (day ≤ 12, SC-002), amounts ≥ 1000 (SC-003).
 */
const RECONSTRUCTED_DATE = '2026-11-09';
const pdfOn = (origin: string, n: number) =>
  `${origin}/documents/download/00000000-0000-0000-0000-00000000000${n}/invoice.pdf`;

interface StoreCase {
  name: string;
  order: string;
  date: string;
  prices: number[];
  quantities: number[];
  popover: string | null;
  invoices: number[];
}

function casesFor(s: AmazonStore, suffix = ''): StoreCase[] {
  if (s.id === 'amazon.fr') {
    return [
      {
        name: 'real-order-single.html',
        order: '999-0000000-0000021',
        date: '2024-03-15',
        prices: [11.11],
        quantities: [1],
        popover: 'real-invoice-popover-single.html',
        invoices: [1],
      },
      {
        name: 'real-order-multi.html',
        order: '999-0000000-0000022',
        date: '2024-03-15',
        prices: [11.11, 22.22],
        quantities: [1, 1],
        popover: 'real-invoice-popover-multi.html',
        invoices: [1, 2],
      },
    ];
  }
  // Amazon.com: printable HTML summary only, no PDF (R2.5).
  const invoices = s.id === 'amazon.com' ? [] : [1];
  return [
    {
      name: `reconstructed-order-single${suffix}.html`,
      order: '999-0000000-0000021',
      date: RECONSTRUCTED_DATE,
      prices: [1111.11],
      quantities: [1],
      popover: null,
      invoices: [],
    },
    {
      name: `reconstructed-order-multi${suffix}.html`,
      order: '999-0000000-0000023',
      date: RECONSTRUCTED_DATE,
      prices: [1111.11, 2222.22],
      quantities: [2, 3],
      popover: 'reconstructed-invoice-popover.html',
      invoices,
    },
    {
      name: `reconstructed-order-invoice${suffix}.html`,
      order: '999-0000000-0000021',
      date: RECONSTRUCTED_DATE,
      prices: [1111.11],
      quantities: [1],
      popover: 'reconstructed-invoice-popover.html',
      invoices,
    },
  ];
}

function checkStoreCase(s: AmazonStore, c: StoreCase) {
  const ex = createAmazonExtractor(s);
  const load = () => loadFixture(c.name, storeOrderUrl(s), s.fixturesDir);
  const rows = c.prices.map((_, i) => i + 1);

  it('recognized as an order page; order, date and seller detected', () => {
    const { doc, url } = load();
    expect(ex.isOrderPage(doc, url)).toBe(true);
    const p = ex.extract(doc, url);
    expect(p.source).toBe(s.id);
    expect(p.orderNumber.value).toBe(c.order);
    expect(p.orderDate.value).toBe(c.date);
    expect(p.seller.value).toBe('Vendeur Fictif');
  });

  it('every product field: name, price, currency, quantity, photo', () => {
    const { doc, url } = load();
    const { products } = ex.extract(doc, url);
    expect(products.map((x) => x.key)).toEqual(rows.map((n) => `B00FAKE00${n}`));
    expect(products.map((x) => x.name.value)).toEqual(rows.map((n) => `Produit fictif ${n}`));
    expect(products.map((x) => x.unitPrice.value)).toEqual(c.prices);
    expect(products.map((x) => x.currency.value)).toEqual(c.prices.map(() => s.defaultCurrency));
    expect(products.map((x) => x.quantity.value)).toEqual(c.quantities);
    expect(products.map((x) => x.imageUrl.value)).toEqual(
      rows.map((n) => `https://m.media-amazon.com/images/I/test-${n}.jpg`),
    );
  });

  it('invoice: through the menu of the store origin only', async () => {
    const { doc, url } = load();
    const fetchMock = vi.fn(async (u: string) => {
      void u;
      return new Response(c.popover ? fixtureHtml(c.popover, s.fixturesDir) : '', {
        status: c.popover ? 200 : 404,
      });
    });
    const docs = await ex.resolveDocuments(doc, url, fetchMock as unknown as typeof fetch);
    expect(docs.map((d) => d.url)).toEqual(c.invoices.map((n) => pdfOn(s.origin, n)));
    for (const [requested] of fetchMock.mock.calls)
      expect(new URL(requested).origin).toBe(s.origin);
    if (!c.popover) expect(fetchMock).not.toHaveBeenCalled();
  });
}

describe.each(
  AMAZON_STORES.filter((s) => s.defaultCurrency === 'EUR').map((s) => [s.id, s] as const),
)('EUR store %s: fixtures (US1, Q-U6)', (_id, s) => {
  describe.each(casesFor(s).map((c) => [c.name, c] as const))('%s', (_name, c) =>
    checkStoreCase(s, c),
  );
});

describe('EUR stores: product page refused, no invoice without menu', () => {
  it.each(AMAZON_STORES.filter((s) => s.defaultCurrency === 'EUR').map((s) => [s.id, s] as const))(
    '%s',
    (_id, s) => {
      const product = loadFixture('not-an-order.html', `${s.origin}/dp/B00FAKE001`);
      expect(createAmazonExtractor(s).isOrderPage(product.doc, product.url)).toBe(false);
      if (s.id === 'amazon.fr') return;
      const single = loadFixture(
        'reconstructed-order-single.html',
        storeOrderUrl(s),
        s.fixturesDir,
      );
      expect(createAmazonExtractor(s).extract(single.doc, single.url).documents).toEqual([]);
    },
  );
});

/** Secondary page languages (Q-U7, US1-4, FR-003) and unrecognized language (Q-U8, FR-004). */
describe('page languages', () => {
  describe.each([
    ['amazon.de', '-en'],
    ['amazon.com.be', ''],
    ['amazon.com.be', '-nl'],
  ] as const)('%s, variant "%s": same values as the main language', (id, suffix) => {
    const s = store(id);
    describe.each(casesFor(s, suffix).map((c) => [c.name, c] as const))('%s', (_name, c) =>
      checkStoreCase(s, c),
    );
  });

  it('declared languages of the variants', () => {
    const lang = (dir: string, name: string) =>
      loadFixture(name, ORDER_URL, dir).doc.documentElement.getAttribute('lang');
    expect(lang('amazon-de', 'reconstructed-order-single.html')).toBe('de-de');
    expect(lang('amazon-de', 'reconstructed-order-single-en.html')).toBe('en-gb');
    expect(lang('amazon-com-be', 'reconstructed-order-single.html')).toBe('fr-be');
    expect(lang('amazon-com-be', 'reconstructed-order-single-nl.html')).toBe('nl-be');
  });

  it('Amazon.de in Turkish: date and seller absent with a reason, nothing invented; name and price still read', () => {
    const s = store('amazon.de');
    const { doc, url } = loadFixture(
      'reconstructed-order-multi-tr.html',
      storeOrderUrl(s),
      s.fixturesDir,
    );
    expect(doc.documentElement.getAttribute('lang')).toBe('tr-tr');
    const p = createAmazonExtractor(s).extract(doc, url);
    expect(p.orderDate.value).toBeNull();
    expect(p.orderDate).toHaveProperty('reason');
    expect(p.seller.value).toBeNull();
    expect(p.seller).toHaveProperty('reason');
    expect(p.orderNumber.value).toBe('999-0000000-0000023');
    expect(p.products.map((x) => x.name.value)).toEqual(['Produit fictif 1', 'Produit fictif 2']);
    expect(p.products.map((x) => x.unitPrice.value)).toEqual([1111.11, 2222.22]);
  });

  it('without <html lang>: the store languages are tried in order (the one reading the date wins)', () => {
    const s = store('amazon.de');
    const html = fixtureHtml('reconstructed-order-single-en.html', 'amazon-de').replace(
      ' lang="en-gb"',
      '',
    );
    const url = storeOrderUrl(s);
    const p = createAmazonExtractor(s).extract(docAt(html, url), new URL(url));
    expect(p.orderDate.value).toBe(RECONSTRUCTED_DATE);
    expect(p.seller.value).toBe('Vendeur Fictif');
  });

  it('photo on a host not allowed: photo absent, the rest of the import continues (FR-017)', () => {
    const s = store('amazon.de');
    const html = fixtureHtml('reconstructed-order-single.html', 'amazon-de').replace(
      'https://m.media-amazon.com/images/I/test-1.jpg',
      'https://images-eu.ssl-images-amazon.com/images/I/test-1.jpg',
    );
    const url = storeOrderUrl(s);
    const [product] = createAmazonExtractor(s).extract(docAt(html, url), new URL(url)).products;
    expect(product?.imageUrl).toEqual({ value: null, reason: 'not_found' });
    expect(product?.name.value).toBe('Produit fictif 1');
    expect(product?.unitPrice.value).toBe(1111.11);
  });
});

/** Amazon.co.uk (GBP) and Amazon.com (USD): price, currency and date without guessing (US2, SC-002, SC-003). */
describe.each(
  AMAZON_STORES.filter((s) => s.defaultCurrency !== 'EUR').map((s) => [s.id, s] as const),
)('non-EUR store %s: fixtures (US2)', (_id, s) => {
  describe.each(casesFor(s).map((c) => [c.name, c] as const))('%s', (_name, c) =>
    checkStoreCase(s, c),
  );
});

describe('US2: prices, dates and invoices of Amazon.co.uk and Amazon.com', () => {
  const uk = store('amazon.co.uk');
  const us = store('amazon.com');
  const withText = (
    s: AmazonStore,
    from: string,
    to: string,
    name = 'reconstructed-order-single.html',
  ) => {
    const html = fixtureHtml(name, s.fixturesDir).split(from).join(to);
    expect(html).toContain(to);
    const url = storeOrderUrl(s);
    return createAmazonExtractor(s).extract(docAt(html, url), new URL(url));
  };

  it('£1,299.99 → 1299.99 GBP; $1,299.99 → 1299.99 USD (US2-1)', () => {
    const gbp = withText(uk, '£1,111.11', '£1,299.99').products[0];
    expect([gbp?.unitPrice.value, gbp?.currency.value]).toEqual([1299.99, 'GBP']);
    const usd = withText(us, '$1,111.11', '$1,299.99').products[0];
    expect([usd?.unitPrice.value, usd?.currency.value]).toEqual([1299.99, 'USD']);
  });

  it('Amazon.com: "November 9, 2026" → 2026-11-09, never swapped (US2-2)', () => {
    expect(fixtureHtml('reconstructed-order-single.html', 'amazon-com')).toContain(
      'November 9, 2026',
    );
    expect(withText(us, 'November 9, 2026', 'November 9, 2026').orderDate.value).toBe('2026-11-09');
  });

  it('09/11/2026: 11 September on Amazon.com, 9 November on Amazon.co.uk', () => {
    expect(withText(us, 'November 9, 2026', '09/11/2026').orderDate.value).toBe('2026-09-11');
    expect(withText(uk, '9 November 2026', '09/11/2026').orderDate.value).toBe('2026-11-09');
  });

  it('13/25/2026 on Amazon.com: date absent, never read in the other order', () => {
    const p = withText(us, 'November 9, 2026', '13/25/2026');
    expect(p.orderDate).toEqual({ value: null, reason: 'unparsable' });
  });

  it('ambiguous price £1.299: field absent and flagged, never ×1000 (SC-003)', () => {
    const [product] = withText(uk, '£1,111.11', '£1.299').products;
    expect(product?.unitPrice).toEqual({ value: null, reason: 'unparsable' });
    expect(product?.currency.value).toBeNull();
    expect(product?.name.value).toBe('Produit fictif 1');
  });

  it('Amazon.com without a PDF link (printable HTML summary only): no document, import possible', async () => {
    const { doc, url } = loadFixture(
      'reconstructed-order-invoice.html',
      storeOrderUrl(us),
      us.fixturesDir,
    );
    const ex = createAmazonExtractor(us);
    expect(ex.extract(doc, url).documents).toEqual([]);
    const fetchMock = vi.fn(
      async () =>
        new Response(fixtureHtml('reconstructed-invoice-popover.html', us.fixturesDir), {
          status: 200,
        }),
    );
    expect(await ex.resolveDocuments(doc, url, fetchMock as unknown as typeof fetch)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
