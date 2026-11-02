import { amazonFrExtractor as ex, firstField } from '@/content/merchants/amazon-fr/extractor';
import { fixtureHtml, loadFixture } from './fixtures';

const extract = (name: string) => {
  const { doc, url } = loadFixture(name);
  return ex.extract(doc, url);
};

describe('amazonFrExtractor', () => {
  it('matchesUrl : uniquement https://www.amazon.fr', () => {
    expect(ex.matchesUrl(new URL('https://www.amazon.fr/gp/your-account/order-details'))).toBe(true);
    expect(ex.matchesUrl(new URL('https://www.amazon.de/gp/your-account/order-details'))).toBe(false);
    expect(ex.matchesUrl(new URL('http://www.amazon.fr/'))).toBe(false);
  });

  it('commande simple avec facture : tous les champs', () => {
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

  it('plusieurs factures (expéditions multiples)', () => {
    const p = extract('order-multi-shipment-invoices.html');
    expect(p.documents.map((d) => d.label)).toEqual([
      'facture-amazon-999-0000000-0000003.pdf',
      'facture-amazon-999-0000000-0000003-2.pdf',
    ]);
  });

  it('commande sans facture', () => {
    expect(extract('order-no-invoice.html').documents).toEqual([]);
  });

  it('vendeur tiers', () => {
    expect(extract('order-marketplace-seller.html').seller.value).toBe('Boutique Exemple SARL');
  });

  it('ancienne mise en page : champs trouvés via les sélecteurs de secours', () => {
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

  it("isOrderPage distingue une page produit d'une page de commande", () => {
    expect(ex.isOrderPage(loadFixture('order-single-item-invoice.html').doc)).toBe(true);
    expect(ex.isOrderPage(loadFixture('order-alt-layout.html').doc)).toBe(true);
    expect(ex.isOrderPage(loadFixture('not-an-order.html').doc)).toBe(false);
  });

  it('page non-commande : champs explicitement absents', () => {
    const p = extract('not-an-order.html');
    expect(p.products).toEqual([]);
    expect(p.orderNumber).toEqual({ value: null, reason: 'not_found' });
  });

  it("FR-010 : ne renvoie que les champs de DetectedPurchase (ni adresse, ni paiement)", () => {
    const p = extract('order-single-item-invoice.html');
    expect(Object.keys(p).sort()).toEqual(
      ['documents', 'orderDate', 'orderNumber', 'pageUrl', 'products', 'seller', 'source'].sort(),
    );
    const serialized = JSON.stringify(p);
    expect(serialized).not.toContain('Jean Exemple');
    expect(serialized).not.toContain('rue Fictive');
    expect(serialized).not.toContain('0000"');
  });

  it('un sélecteur invalide passe au suivant', () => {
    const { doc } = loadFixture('order-single-item-invoice.html');
    const f = firstField(doc, ['::invalid((', '[data-component="orderId"]'], (el) => el.textContent);
    expect(f.value).toContain('999-0000000-0000001');
    expect(f.value !== null && f.selector).toBe('[data-component="orderId"]');
  });

  it('valeur non exploitable → reason unparsable', () => {
    const { doc } = loadFixture('order-single-item-invoice.html');
    expect(firstField(doc, ['h1'], () => null)).toEqual({ value: null, reason: 'unparsable' });
  });

  it('resolveDocuments charge le menu « Facture » (même origine uniquement)', async () => {
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

  it('page réelle : image trouvée dans la colonne de gauche pour chaque article', () => {
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

  it('page réelle : resolveDocuments suit le popover « Facture » (sans récapitulatif ni lien externe)', async () => {
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

  it('l’image d’une ligne n’est pas prise dans une autre ligne', () => {
    const { doc, url } = loadFixture('order-multi-item.html');
    const [first, second] = ex.extract(doc, url).products;
    expect(first?.imageUrl.value).toBe('https://m.media-amazon.com/images/I/test-cable.jpg');
    expect(second?.imageUrl.value).toBeNull();
  });
});
