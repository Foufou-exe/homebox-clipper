import { isStoreSeller } from '@/shared/warranty';
import type { DetectedPurchase } from '@/shared/types';
import { MERCHANT_CATALOG } from '@/content/merchants/catalog';
import { draftFrom, proposalFor } from '@/ui/popup/drafts';
import { setTestLanguage } from './i18n-harness';
import { loadFixture } from './fixtures';
import { warrantyMerchant } from './warranty-merchant';

const URL_ORDER = 'https://shop.example.com/orders/999-0000000-0000001';
const merchant = warrantyMerchant();
const extract = (name: string): DetectedPurchase => {
  const { doc, url } = loadFixture(name, URL_ORDER, 'warranty-test');
  return merchant.extract(doc, url);
};
const first = (name: string) => extract(name).products[0]!;

describe('page warranty on a fictional merchant (011, Q-U8, US2, FR-004, FR-011, principle VII)', () => {
  it('"Garantie 3 ans": 36 months, the label read', () => {
    expect(first('warranty-3y.html').pageWarranty?.value).toEqual({ months: 36, lifetime: false, label: 'Garantie 3 ans' });
  });

  it('"Garantie à vie": lifetime', () => {
    expect(first('warranty-lifetime.html').pageWarranty?.value).toMatchObject({ months: null, lifetime: true });
  });

  it('"Garantie 2 ans" + "Extension de garantie 3 ans": 60 months, the label mentions the extension', () => {
    const w = first('warranty-extension.html').pageWarranty?.value;
    expect(w?.months).toBe(60);
    expect(w?.label.toLowerCase()).toContain('extension');
  });

  it('an extension alone is not used', () => {
    const f = first('warranty-extension-only.html').pageWarranty;
    expect(f?.value).toBeNull();
    expect(['not_found', 'unparsable']).toContain((f as { reason: string }).reason);
  });

  it('"Garantie 15 ans" (out of bounds): unparsable', () => {
    expect(first('warranty-out-of-bounds.html').pageWarranty).toEqual({ value: null, reason: 'unparsable' });
  });

  it('"Satisfait ou remboursé 30 jours": not found', () => {
    expect(first('warranty-none.html').pageWarranty).toEqual({ value: null, reason: 'not_found' });
  });

  it('two products: one warranty each, no mixing', () => {
    const [a, b] = extract('warranty-two-products.html').products;
    expect(a?.pageWarranty?.value).toMatchObject({ months: 36, lifetime: false });
    expect(b?.pageWarranty?.value).toMatchObject({ months: null, lifetime: true });
  });

  it('primary selector absent, fallback present: the fallback is used', () => {
    const f = first('warranty-fallback-selector.html').pageWarranty;
    expect(f?.value).toMatchObject({ months: 36 });
    expect((f as { selector: string }).selector).toBe('[data-warranty]');
  });

  it('a 500-character label with markup: cut to 200, plain text', () => {
    const w = first('warranty-long-label.html').pageWarranty?.value;
    expect(w?.months).toBe(36);
    expect(w!.label.length).toBeLessThanOrEqual(200);
    expect(w!.label).not.toMatch(/[<>]/);
  });

  it('the seller is read on the row; absent: not_found', () => {
    const [a, b] = extract('warranty-seller.html').products;
    expect(a?.seller?.value).toBe('Boutique Exemple SARL');
    expect(b?.seller).toEqual({ value: null, reason: 'not_found' });
  });
});

describe('page warranty through the proposal (011, US2-1 to US2-4, US3-3)', () => {
  const draftOf = (name: string, ctx?: Parameters<typeof draftFrom>[2]) => {
    const purchase = extract(name);
    return draftFrom(purchase, purchase.products[0]!, ctx);
  };

  it('US2-1: 3 years on the page beats the legal 2 years; the label is the detail', () => {
    expect(draftOf('warranty-3y.html').warranty).toEqual({
      origin: 'page',
      expires: '2029-11-03',
      lifetime: false,
      details: 'Garantie 3 ans',
      durationMonths: 36,
      edited: false,
    });
  });

  it('US2-2: lifetime, no date', () => {
    expect(draftOf('warranty-lifetime.html').warranty).toMatchObject({ origin: 'page', lifetime: true, expires: null });
  });

  it('US2-3: extension, 5 years, the detail mentions the extension', () => {
    const w = draftOf('warranty-extension.html').warranty;
    expect(w).toMatchObject({ origin: 'page', expires: '2031-11-03', durationMonths: 60 });
    expect(w?.details.toLowerCase()).toContain('extension');
  });

  it('US2-4 (fr): page 1 year < legal 2 years: legal, the detail mentions both', () => {
    expect(draftOf('warranty-1y.html').warranty).toMatchObject({
      origin: 'legal',
      expires: '2028-11-03',
      details: 'Garantie légale de conformité (2 ans) ; indiqué sur la page : « Garantie 1 an »',
    });
  });

  it('US2-4 (en)', () => {
    setTestLanguage('en');
    expect(draftOf('warranty-1y.html').warranty?.details).toBe(
      'Legal guarantee of conformity (2 years); shown on the page: "Garantie 1 an"',
    );
  });

  it('US3-3: the page warranty is proposed even when the setting is off', () => {
    expect(draftOf('warranty-3y.html', { settings: { v: 1, enabled: false, years: null } }).warranty).toMatchObject({
      origin: 'page',
      durationMonths: 36,
    });
  });

  it('a third-party or unknown seller gets the page warranty, never the legal one', () => {
    const purchase = extract('warranty-seller.html');
    const [withPage, other] = purchase.products;
    const store = MERCHANT_CATALOG.find((e) => e.id === 'amazon.fr')!;
    expect(isStoreSeller(withPage!.seller?.value ?? null, store.ownSellers)).toBe(false);
    expect(proposalFor(purchase, withPage!).warranty).toMatchObject({ origin: 'page', durationMonths: 36 });
    expect(proposalFor(purchase, other!).warranty).toMatchObject({ origin: 'page', durationMonths: 24 });
  });

  it('page without a warranty: the legal default', () => {
    expect(draftOf('warranty-none.html').warranty).toMatchObject({ origin: 'legal', durationMonths: 24 });
  });
});
