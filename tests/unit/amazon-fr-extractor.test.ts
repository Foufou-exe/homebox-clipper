import { firstField } from '@/content/merchants/amazon/extractor';
import { amazonFr } from './fixtures';

const ex = amazonFr();
import { Window } from 'happy-dom';
import { fixtureHtml, loadFixture, ORDER_URL } from './fixtures';

const extract = (name: string) => {
  const { doc, url } = loadFixture(name);
  return ex.extract(doc, url);
};
const isOrderPage = (name: string) => {
  const { doc, url } = loadFixture(name);
  return ex.isOrderPage(doc, url);
};

describe('amazonFrExtractor', () => {
  it('matchesUrl : uniquement https://www.amazon.fr', () => {
    expect(ex.matchesUrl(new URL('https://www.amazon.fr/gp/your-account/order-details'))).toBe(true);
    expect(ex.matchesUrl(new URL('https://www.amazon.de/gp/your-account/order-details'))).toBe(false);
    expect(ex.matchesUrl(new URL('http://www.amazon.fr/'))).toBe(false);
  });

  it('simple order with invoice: all fields', () => {
    const p = extract('order-single-item-invoice.html');
    expect(p.orderNumber.value).toBe('999-0000000-0000001');
    expect(p.orderDate.value).toBe('2026-10-22');
    expect(p.seller.value).toBe('Amazon EU S.à r.l.');
    expect(p.pageUrl).toBe('https://www.amazon.fr/your-orders/order-details');
    expect(p.products).toHaveLength(1);
    const [item] = p.products;
    expect(item?.key).toBe('B000TEST01');
    expect(item?.name.value).toBe('Clavier sans fil Exemple Pro, rétroéclairé, AZERTY');
    expect(item?.unitPrice.value).toBe(99.99);
    expect(item?.currency.value).toBe('EUR');
    expect(item?.quantity.value).toBe(1);
    expect(item?.imageUrl.value).toBe('https://m.media-amazon.com/images/I/test-keyboard.jpg');
    expect(p.documents).toEqual([
      {
        id: 'detected-0',
        origin: 'detected',
        kind: 'invoice',
        label: 'facture-amazon-999-0000000-0000001.pdf',
        url: 'https://www.amazon.fr/documents/download/aaaaaaaa-1111-2222-3333-444444444444/invoice.pdf',
      },
    ]);
  });

  it('commande multi-produits', () => {
    const p = extract('order-multi-item.html');
    expect(p.orderDate.value).toBe('2026-02-01');
    expect(p.products.map((x) => x.name.value)).toEqual([
      'Câble USB-C vers USB-C 2 m',
      'Tournevis de précision, coffret 24 embouts',
    ]);
    expect(p.products.map((x) => x.quantity.value)).toEqual([3, 1]);
    expect(p.products[1]?.unitPrice.value).toBe(1299);
    expect(p.documents).toHaveLength(1);
  });

  it('several invoices (multiple shipments)', () => {
    const p = extract('order-multi-shipment-invoices.html');
    expect(p.documents.map((d) => d.label)).toEqual([
      'facture-amazon-999-0000000-0000003.pdf',
      'facture-amazon-999-0000000-0000003-2.pdf',
    ]);
  });

  it('order without invoice', () => {
    expect(extract('order-no-invoice.html').documents).toEqual([]);
  });

  it('vendeur tiers', () => {
    expect(extract('order-marketplace-seller.html').seller.value).toBe('Boutique Exemple SARL');
  });

  it('old page layout: fields found via the fallback selectors', () => {
    const p = extract('order-alt-layout.html');
    expect(p.orderNumber).toEqual({ value: '999-0000000-0000006', selector: '.order-date-invoice-item' });
    expect(p.orderDate.value).toBe('2026-01-05');
    expect(p.products).toHaveLength(1);
    expect(p.products[0]?.name.value).toBe('Souris ergonomique verticale');
    expect(p.products[0]?.unitPrice.value).toBe(45.5);
    expect(p.products[0]?.quantity.value).toBe(2);
    expect(p.products[0]?.key).toBe('B000TEST07');
    expect(p.seller.value).toBe('Amazon EU S.à r.l.');
  });

  it("isOrderPage distinguishes a product page from an order page", () => {
    expect(isOrderPage('order-single-item-invoice.html')).toBe(true);
    expect(isOrderPage('order-alt-layout.html')).toBe(true);
    expect(isOrderPage('not-an-order.html')).toBe(false);
  });

  it('page non-commande : champs explicitement absents', () => {
    const p = extract('not-an-order.html');
    expect(p.products).toEqual([]);
    expect(p.orderNumber).toEqual({ value: null, reason: 'not_found' });
  });

  it("FR-010: only returns the DetectedPurchase fields (no address, no payment)", () => {
    const p = extract('order-single-item-invoice.html');
    expect(Object.keys(p).sort()).toEqual(
      ['documents', 'orderDate', 'orderNumber', 'pageUrl', 'products', 'seller', 'source'].sort(),
    );
    const serialized = JSON.stringify(p);
    expect(serialized).not.toContain('Jean Exemple');
    expect(serialized).not.toContain('rue Fictive');
    expect(serialized).not.toContain('0000"');
  });

  it('an invalid selector moves on to the next one', () => {
    const { doc } = loadFixture('order-single-item-invoice.html');
    const f = firstField(doc, ['::invalid((', '[data-component="orderId"]'], (el) => el.textContent);
    expect(f.value).toContain('999-0000000-0000001');
    expect(f.value !== null && f.selector).toBe('[data-component="orderId"]');
  });

  it('valeur non exploitable → reason unparsable', () => {
    const { doc } = loadFixture('order-single-item-invoice.html');
    expect(firstField(doc, ['h1'], () => null)).toEqual({ value: null, reason: 'unparsable' });
  });

  it('resolveDocuments loads the "Facture" menu (same origin only)', async () => {
    const { doc, url } = loadFixture('order-alt-layout.html');
    const fetchMock = vi.fn(async (url: string) => {
      void url;
      return new Response(fixtureHtml('invoice-popover.html'), { status: 200 });
    });
    const docs = await ex.resolveDocuments(doc, url, fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/^https:\/\/www\.amazon\.fr\/gp\/shared-cs\/ajax\/invoice\/invoice\.html/);
    expect(docs.map((d) => d.url)).toEqual([
      'https://www.amazon.fr/documents/download/dddddddd-0000-0000-0000-000000000001/invoice.pdf',
    ]);
    expect(docs[0]?.label).toBe('facture-amazon-999-0000000-0000006.pdf');
  });

  it('real page: image found in the left column for each item', () => {
    const { doc, url } = loadFixture('order-real-layout.html');
    const purchase = ex.extract(doc, url);
    expect(purchase.products.map((p) => p.imageUrl.value)).toEqual([
      'https://m.media-amazon.com/images/I/test-lampe.jpg',
      'https://m.media-amazon.com/images/I/test-support.jpg',
    ]);
    expect(purchase.products.map((p) => p.name.value)).toEqual(['Lampe de bureau LED', 'Support de téléphone']);
    expect(purchase.products.map((p) => p.key)).toEqual(['B000TEST07', 'B000TEST08']);
    expect(purchase.products[0]?.quantity.value).toBe(2);
    expect(purchase.seller.value).toBe('Boutique Factice SARL');
  });

  describe('image host (R6, FR-010)', () => {
    const ORIGINAL = '<img alt="" src="https://m.media-amazon.com/images/I/test-keyboard.jpg">';
    const withImages = (html: string) => {
      const window = new Window({ url: ORDER_URL });
      window.document.write(fixtureHtml('order-single-item-invoice.html').replace(ORIGINAL, html));
      return ex.extract(window.document as unknown as Document, new URL(ORDER_URL)).products[0];
    };

    it('disallowed host → { value: null, reason: not_found }, never the URL', () => {
      const product = withImages('<img alt="" src="https://tracker.example.invalid/pixel.gif">');
      expect(product?.imageUrl).toEqual({ value: null, reason: 'not_found' });
    });

    it('no image at all → not_found', () => {
      expect(withImages('')?.imageUrl).toEqual({ value: null, reason: 'not_found' });
    });

    it('lookalike host or http: refused', () => {
      expect(withImages('<img src="https://m.media-amazon.com.evil.example/a.jpg">')?.imageUrl.value).toBeNull();
      expect(withImages('<img src="http://m.media-amazon.com/images/I/a.jpg">')?.imageUrl.value).toBeNull();
    });

    it('a logo from another host is rejected and the next selector (productImage) finds the photo', () => {
      const product = withImages(
        '<img alt="" src="https://logo.example.invalid/logo.png"></a></div>' +
          '<img alt="" src="https://m.media-amazon.com/images/I/test-fallback.jpg">' +
          '<div hidden><a>',
      );
      expect(product?.imageUrl).toEqual({
        value: 'https://m.media-amazon.com/images/I/test-fallback.jpg',
        selector: 'img',
      });
    });

    it('the size token is rewritten to _SL1000_ (toPhotoUrl)', () => {
      const product = withImages('<img alt="" src="https://m.media-amazon.com/images/I/test-keyboard._SS284_.jpg">');
      expect(product?.imageUrl.value).toBe('https://m.media-amazon.com/images/I/test-keyboard._SL1000_.jpg');
    });

    it('Amazon.fr declares m.media-amazon.com as its only image host', () => {
      expect(ex.imageHosts).toEqual(['m.media-amazon.com']);
    });
  });

  it('real page: quantity read from the image column badge, without crossing rows', () => {
    const { doc, url } = loadFixture('order-real-layout-qty.html');
    const { products } = ex.extract(doc, url);
    expect(products.map((p) => p.quantity.value)).toEqual([6, 10, 1]);
    expect(products[2]?.quantity).toEqual({ value: 1, selector: 'default' });
  });

  it('real page: resolveDocuments follows the "Facture" popover (no summary or external link)', async () => {
    const { doc, url } = loadFixture('order-real-layout.html');
    const fetchMock = vi.fn(async (u: string) => {
      void u;
      return new Response(fixtureHtml('invoice-popover-real.html'), { status: 200 });
    });
    const docs = await ex.resolveDocuments(doc, url, fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://www.amazon.fr/your-orders/invoice/popover?orderId=999-0000000-0000007',
    );
    expect(docs.map((d) => d.url)).toEqual([
      'https://www.amazon.fr/documents/download/eeeeeeee-0000-0000-0000-000000000001/invoice.pdf',
      'https://www.amazon.fr/documents/download/eeeeeeee-0000-0000-0000-000000000002/invoice.pdf',
    ]);
    expect(docs.every((d) => d.url?.startsWith('https://www.amazon.fr/') === true)).toBe(true);
  });

  it("a row's image is not taken from another row", () => {
    const { doc, url } = loadFixture('order-multi-item.html');
    const [first, second] = ex.extract(doc, url).products;
    expect(first?.imageUrl.value).toBe('https://m.media-amazon.com/images/I/test-cable.jpg');
    expect(second?.imageUrl.value).toBeNull();
  });
});

/**
 * "real-*" fixtures: structure of real pages (captured on 2026-11-02), 100% fictional content
 * generated by script (see tests/fixtures/amazon-fr/README.md). The expected values are fictional.
 */
describe('amazonFrExtractor: anonymized fixtures of real pages', () => {
  const pdf = (n: number) =>
    `https://www.amazon.fr/documents/download/00000000-0000-0000-0000-00000000000${n}/invoice.pdf`;

  const cases = [
    {
      fixture: 'real-order-single.html',
      popover: 'real-invoice-popover-single.html',
      order: '999-0000000-0000021',
      prices: [11.11],
      quantities: [1],
      invoices: [pdf(1)],
    },
    {
      fixture: 'real-order-multi.html',
      popover: 'real-invoice-popover-multi.html',
      order: '999-0000000-0000022',
      prices: [11.11, 22.22],
      quantities: [1, 1],
      invoices: [pdf(1), pdf(2)],
    },
    {
      fixture: 'real-order-qty.html',
      // The "Facture" menu of this order has no fixture of its own: same structure as "single".
      popover: 'real-invoice-popover-single.html',
      order: '999-0000000-0000023',
      prices: [11.11, 22.22],
      quantities: [2, 3],
      invoices: [pdf(1)],
    },
    {
      fixture: 'real-order-no-invoice.html',
      popover: null,
      order: '999-0000000-0000024',
      prices: [11.11, 22.22, 33.33],
      quantities: [1, 1, 1],
      invoices: [],
    },
  ];

  describe.each(cases)('$fixture', ({ fixture, popover, order, prices, quantities, invoices }) => {
    const rowNumbers = prices.map((_, i) => i + 1);

    it('recognized as an order page, order fields detected', () => {
      expect(isOrderPage(fixture)).toBe(true);
      const p = extract(fixture);
      expect(p.orderNumber).toEqual({ value: order, selector: '[data-component="orderId"]' });
      expect(p.orderDate).toEqual({ value: '2024-03-15', selector: '[data-component="orderDate"]' });
      expect(p.seller).toEqual({ value: 'Vendeur Fictif', selector: '[data-component="orderedMerchant"]' });
    });

    it('number of rows and fields of each product', () => {
      const { products } = extract(fixture);
      expect(products).toHaveLength(prices.length);
      expect(products.map((x) => x.key)).toEqual(rowNumbers.map((n) => `B00FAKE00${n}`));
      expect(products.map((x) => x.name.value)).toEqual(rowNumbers.map((n) => `Produit fictif ${n}`));
      expect(products.map((x) => x.unitPrice.value)).toEqual(prices);
      expect(products.every((x) => x.currency.value === 'EUR')).toBe(true);
      expect(products.map((x) => x.quantity.value)).toEqual(quantities);
    });

    it('image found for each row, without crossing rows', () => {
      const { products } = extract(fixture);
      expect(products.map((x) => x.imageUrl.value)).toEqual(
        rowNumbers.map((n) => `https://m.media-amazon.com/images/I/test-${n}.jpg`),
      );
    });

    it('resolveDocuments: menu invoices only', async () => {
      const { doc, url } = loadFixture(fixture);
      const fetchMock = vi.fn(async (u: string) => {
        void u;
        return new Response(popover ? fixtureHtml(popover) : '', { status: popover ? 200 : 404 });
      });
      const docs = await ex.resolveDocuments(doc, url, fetchMock as unknown as typeof fetch);
      expect(docs.map((d) => d.url)).toEqual(invoices);
      expect(docs.map((d) => d.label)).toEqual(
        invoices.map((_, i) => `facture-amazon-${order}${i === 0 ? '' : `-${i + 1}`}.pdf`),
      );
      if (popover) {
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
          `https://www.amazon.fr/your-orders/invoice/popover?orderId=${order}`,
        );
      } else {
        expect(fetchMock).not.toHaveBeenCalled();
      }
    });

    it("no invoice is detected without going through the menu", () => {
      expect(extract(fixture).documents).toEqual([]);
    });
  });

  it('real-order-qty: the quantity comes from the image column badge', () => {
    const { products } = extract('real-order-qty.html');
    expect(products.map((x) => x.quantity)).toEqual([
      { value: 2, selector: '.od-item-view-qty span' },
      { value: 3, selector: '.od-item-view-qty span' },
    ]);
  });

  it('without a badge, the quantity defaults to 1', () => {
    const { products } = extract('real-order-single.html');
    expect(products[0]?.quantity).toEqual({ value: 1, selector: 'default' });
  });

  it("the menu's 'Récapitulatif de commande imprimable' link is not mistaken for an invoice", async () => {
    const { doc, url } = loadFixture('real-order-multi.html');
    const fetchMock = vi.fn(async () => new Response(fixtureHtml('real-invoice-popover-multi.html'), { status: 200 }));
    const docs = await ex.resolveDocuments(doc, url, fetchMock as unknown as typeof fetch);
    expect(docs.some((d) => d.url?.includes('print.html') === true)).toBe(false);
  });
});

describe('amazonFrExtractor : vendeur (expression régulière)', () => {
  const sellerFor = (label: string): { value: string | null; ms: number } => {
    const url = ORDER_URL;
    const window = new Window({ url });
    window.document.write(
      fixtureHtml('order-multi-item.html').replaceAll('Vendu par : Amazon EU S.à r.l.', label),
    );
    const t0 = performance.now();
    const p = ex.extract(window.document as unknown as Document, new URL(url));
    return { value: p.seller.value, ms: performance.now() - t0 };
  };

  it.each([
    ['Vendu par : Boutique A', 'Boutique A'],
    ['Vendu par: Boutique A', 'Boutique A'],
    ['Vendu par :Boutique A', 'Boutique A'],
    ['Vendu par Boutique A', 'Boutique A'],
    ['vendu PAR : Boutique A', 'Boutique A'],
    ['Vendu par   :   Boutique A  ', 'Boutique A'],
    ['Vendu par : A : B', 'A : B'],
    ['Vendu par :', ':'],
  ])('%j → %j', (label, expected) => {
    expect(sellerFor(label).value).toBe(expected);
  });

  it('sans « Vendu par » : vendeur non détecté', () => {
    expect(sellerFor('Expédié par Boutique A').value).toBeNull();
  });

  it('textes pathologiques de 50 000 caractères : traités vite', () => {
    const repeated = sellerFor('Vendu par '.repeat(5_000));
    const spaces = sellerFor(`${' '.repeat(50_000)}Vendu par`);
    const colons = sellerFor(`Vendu par${' :'.repeat(25_000)}`);
    for (const r of [repeated, spaces, colons]) expect(r.ms).toBeLessThan(250);
  });
});
