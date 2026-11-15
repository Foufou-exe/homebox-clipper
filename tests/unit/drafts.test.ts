import type { DetectedProduct, DetectedPurchase, ImportDraft, WarrantyDraft } from '@/shared/types';
import type { MerchantId } from '@/shared/merchant-ids';
import { MERCHANT_CATALOG } from '@/content/merchants/catalog';
import { draftErrors, draftFrom, emptyDraft, proposalFor } from '@/ui/popup/drafts';
import { setTestLanguage } from './i18n-harness';

const found = <T>(value: T) => ({ value, selector: 'x' });
const none = { value: null, reason: 'not_found' as const };

const product = (over: Partial<DetectedProduct> = {}): DetectedProduct => ({
  key: 'B00FAKE001',
  name: found('Produit fictif 1'),
  unitPrice: found(1111.11),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: none,
  ...over,
});

const purchase = (source: MerchantId, over: Partial<DetectedPurchase> = {}): DetectedPurchase => ({
  source,
  pageUrl: `${MERCHANT_CATALOG.find((e) => e.id === source)!.origin}/your-orders/order-details`,
  orderNumber: found('999-0000000-0000001'),
  orderDate: found('2026-11-09'),
  seller: found('Vendeur Fictif'),
  products: [product()],
  documents: [],
  ...over,
});

/** The store of origin in the item created in HomeBox (FR-007, Q-U12). */
describe('draftFrom: store of origin', () => {
  it('Amazon.de, English interface: "Purchased on Amazon.de on 9 November 2026"', () => {
    setTestLanguage('en');
    expect(draftFrom(purchase('amazon.de'), product()).description).toBe(
      'Purchased on Amazon.de on 9 November 2026',
    );
  });

  it('Amazon.de, French interface: "Acheté sur Amazon.de le 09/11/2026"', () => {
    expect(draftFrom(purchase('amazon.de'), product()).description).toBe(
      'Acheté sur Amazon.de le 09/11/2026',
    );
  });

  it('without a date: "Purchased on Amazon.de" / "Acheté sur Amazon.de"', () => {
    const p = purchase('amazon.de', { orderDate: none });
    expect(draftFrom(p, product()).description).toBe('Acheté sur Amazon.de');
    setTestLanguage('en');
    expect(draftFrom(p, product()).description).toBe('Purchased on Amazon.de');
  });

  it.each(MERCHANT_CATALOG.map((e) => [e.id, e.displayName] as const))(
    '%s: default seller = displayName of the store (%s)',
    (id, displayName) => {
      expect(draftFrom(purchase(id, { seller: none }), product()).purchaseFrom).toBe(displayName);
    },
  );

  it('detected seller kept', () => {
    expect(draftFrom(purchase('amazon.it'), product()).purchaseFrom).toBe('Vendeur Fictif');
  });

  it('photo: merchantId = store of the order', () => {
    const p = purchase('amazon.nl');
    const d = draftFrom(
      p,
      product({ imageUrl: found('https://m.media-amazon.com/images/I/test-1.jpg') }),
    );
    expect(d.photo).toEqual({
      url: 'https://m.media-amazon.com/images/I/test-1.jpg',
      merchantId: 'amazon.nl',
      include: true,
    });
  });
});

describe('Amazon.fr: texts identical character for character to the previous rendering (SC-007)', () => {
  const fr = purchase('amazon.fr', {
    orderDate: found('2026-10-22'),
    pageUrl: 'https://www.amazon.fr/your-orders/order-details',
  });

  it('French', () => {
    expect(draftFrom(fr, product()).description).toBe('Acheté sur Amazon.fr le 22/10/2026');
    expect(draftFrom({ ...fr, orderDate: none }, product()).description).toBe(
      'Acheté sur Amazon.fr',
    );
    expect(draftFrom({ ...fr, seller: none }, product()).purchaseFrom).toBe('Amazon.fr');
  });

  it('English', () => {
    setTestLanguage('en');
    expect(draftFrom(fr, product()).description).toBe('Purchased on Amazon.fr on 22 October 2026');
    expect(draftFrom({ ...fr, orderDate: none }, product()).description).toBe(
      'Purchased on Amazon.fr',
    );
  });
});

describe('emptyDraft (manual entry)', () => {
  it('keeps EUR and no store text', () => {
    const d = emptyDraft();
    expect(d.currency).toBe('EUR');
    expect(d.description).toBe('');
    expect(d.purchaseFrom).toBe('');
  });
});

/** Default currency of the store when the price is not detected (US2, R9). */
describe('draftFrom: currency', () => {
  const noPrice = product({ unitPrice: none, currency: none });

  it.each([
    ['amazon.co.uk', 'GBP'],
    ['amazon.com', 'USD'],
    ['amazon.de', 'EUR'],
    ['amazon.fr', 'EUR'],
  ] as const)('%s, price not detected → %s', (id, currency) => {
    expect(draftFrom(purchase(id), noPrice).currency).toBe(currency);
  });

  it('detected currency wins over the default of the store', () => {
    expect(draftFrom(purchase('amazon.de'), product({ currency: found('GBP') })).currency).toBe(
      'GBP',
    );
    expect(draftFrom(purchase('amazon.com'), product({ currency: found('USD') })).currency).toBe(
      'USD',
    );
  });

  it('no product (nothing detected): default currency of the store', () => {
    expect(draftFrom(purchase('amazon.co.uk'), null).currency).toBe('GBP');
  });

  it('emptyDraft (manual entry) keeps EUR', () => {
    expect(emptyDraft().currency).toBe('EUR');
  });
});

/** Spec 011 (Q-U10, FR-002, FR-003, FR-009, SC-001, SC-003). */
describe('draftFrom: warranty (011)', () => {
  const byStore = (over: Partial<DetectedProduct> = {}) =>
    product({ seller: found('Amazon EU S.à r.l.'), ...over });

  it('Amazon.fr sold by the store, French interface: legal 2 years', () => {
    const d = draftFrom(purchase('amazon.fr', { orderDate: found('2026-11-03') }), byStore());
    expect(d.warranty).toEqual({
      origin: 'legal',
      expires: '2028-11-03',
      lifetime: false,
      details: 'Garantie légale de conformité (2 ans)',
      durationMonths: 24,
      edited: false,
    });
  });

  it('English interface: the details are in English', () => {
    setTestLanguage('en');
    const d = draftFrom(purchase('amazon.fr', { orderDate: found('2026-11-03') }), byStore());
    expect(d.warranty?.details).toBe('Legal guarantee of conformity (2 years)');
  });

  it('Amazon.es: 36 months', () => {
    const d = draftFrom(purchase('amazon.es', { orderDate: found('2026-11-03') }), byStore());
    expect(d.warranty).toMatchObject({ expires: '2029-11-03', durationMonths: 36, details: 'Garantie légale de conformité (3 ans)' });
  });

  it.each(['amazon.de', 'amazon.it', 'amazon.com.be'] as const)('%s: 24 months', (id) => {
    const d = draftFrom(purchase(id, { orderDate: found('2026-11-03') }), byStore());
    expect(d.warranty).toMatchObject({ expires: '2028-11-03', durationMonths: 24 });
  });

  it.each(['amazon.nl', 'amazon.com', 'amazon.co.uk'] as const)('%s: no warranty, reason country', (id) => {
    expect(draftFrom(purchase(id), byStore()).warranty).toBeNull();
    expect(proposalFor(purchase(id), byStore())).toEqual({ warranty: null, reason: 'country' });
  });

  it('seller "Boutique Exemple SARL", or no seller read: no warranty, reason seller', () => {
    const p = purchase('amazon.fr');
    expect(proposalFor(p, product({ seller: found('Boutique Exemple SARL') }))).toEqual({ warranty: null, reason: 'seller' });
    expect(proposalFor(p, product())).toEqual({ warranty: null, reason: 'seller' });
    expect(proposalFor(p, product({ seller: none }))).toEqual({ warranty: null, reason: 'seller' });
    expect(draftFrom(p, product({ seller: found('Boutique Exemple SARL') })).warranty).toBeNull();
  });

  it('order known but no product detected, and the empty draft: no warranty (reason seller for a known store)', () => {
    const p = purchase('amazon.fr');
    expect(proposalFor(p, null).reason).toBe('seller');
    expect(emptyDraft().warranty).toBeNull();
  });

  it('purchase date absent: a warranty without expiry, nothing invented', () => {
    const d = draftFrom(purchase('amazon.fr', { orderDate: none }), byStore());
    expect(d.warranty).toMatchObject({ origin: 'legal', expires: null, durationMonths: 24 });
  });

  it('the reason is kept next to the draft, never inside it', () => {
    const d = draftFrom(purchase('amazon.nl'), byStore());
    expect(Object.keys(d)).not.toContain('reason');
    expect(JSON.stringify(d)).not.toContain('reason');
  });

  it('ctx is optional: the existing two-argument calls remain valid, and the setting is honoured', () => {
    const p = purchase('amazon.fr', { orderDate: found('2026-11-03') });
    expect(draftFrom(p, byStore()).warranty?.durationMonths).toBe(24);
    const off = proposalFor(p, byStore(), { settings: { v: 1, enabled: false, years: null } });
    expect(off).toEqual({ warranty: null, reason: 'disabled' });
    const three = draftFrom(p, byStore(), { settings: { v: 1, enabled: true, years: 3 } });
    expect(three.warranty).toMatchObject({ expires: '2029-11-03', details: 'Garantie par défaut (3 ans)' });
  });

  it('a page warranty on the product is proposed', () => {
    const p = purchase('amazon.fr', { orderDate: found('2026-11-03') });
    const withPage = byStore({ pageWarranty: found({ months: 36, lifetime: false, label: 'Garantie 3 ans' }) });
    expect(draftFrom(p, withPage).warranty).toMatchObject({ origin: 'page', expires: '2029-11-03', details: 'Garantie 3 ans' });
  });
});

describe('draftErrors: warranty (011)', () => {
  const withW = (over: Partial<WarrantyDraft>): ImportDraft => ({
    ...draftFrom(purchase('amazon.fr', { orderDate: found('2026-11-03') }), product({ seller: found('Amazon') })),
    warranty: { origin: 'legal', expires: '2028-11-03', lifetime: false, details: 'x', durationMonths: 24, edited: false, ...over },
  });

  it('invalid expiry: dateInvalid', () => {
    expect(draftErrors(withW({ expires: '2026-02-30' }))).toContain('La date d’expiration de la garantie n’est pas valide.');
  });

  it('details over 1000 characters: detailsTooLong', () => {
    expect(draftErrors(withW({ details: 'a'.repeat(1001) }))).toContain(
      'Le détail de la garantie ne doit pas dépasser 1000 caractères.',
    );
  });

  it('a valid or null warranty adds no error', () => {
    const base = draftFrom(purchase('amazon.nl'), product());
    expect(draftErrors(base)).toEqual([]);
    expect(draftErrors(withW({}))).toEqual([]);
  });
});
