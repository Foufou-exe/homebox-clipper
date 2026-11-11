import type { DetectedProduct, DetectedPurchase } from '@/shared/types';
import type { MerchantId } from '@/shared/merchant-ids';
import { MERCHANT_CATALOG } from '@/content/merchants/catalog';
import { draftFrom, emptyDraft } from '@/ui/popup/drafts';
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
