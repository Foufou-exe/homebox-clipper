import {
  DEFAULT_WARRANTY_SETTINGS,
  manualWarrantyMonths,
  proposeWarranty,
  type WarrantyInput,
  type WarrantyTexts,
} from '@/shared/warranty';
import type { PageWarranty } from '@/shared/types';

const texts: WarrantyTexts = {
  legal: (m) => `L${m}`,
  fallback: (m) => `F${m}`,
  withPage: (d, p) => `${d}|${p}`,
};

const page = (months: number, label = `page ${months}`): PageWarranty => ({ months, lifetime: false, label });
const lifetimePage: PageWarranty = { months: null, lifetime: true, label: 'A vie' };

const input = (over: Partial<WarrantyInput> = {}): WarrantyInput => ({
  purchaseDate: '2026-11-03',
  country: 'FR',
  sellerIsStore: true,
  settings: { v: 1, enabled: true, years: null },
  pageWarranty: null,
  texts,
  ...over,
});

const legal = (months: number, expires: string | null, details: string) => ({
  warranty: { origin: 'legal', expires, lifetime: false, details, durationMonths: months, edited: false },
  reason: null,
});

describe('proposeWarranty: legal default (011, Q-U4, FR-002, SC-001)', () => {
  it('Amazon.fr sold by the store: 24 months', () => {
    expect(proposeWarranty(input())).toEqual(legal(24, '2028-11-03', 'L24'));
  });

  it('Spain: 36 months', () => {
    expect(proposeWarranty(input({ country: 'ES' }))).toEqual(legal(36, '2029-11-03', 'L36'));
  });

  it.each(['DE', 'IT', 'BE'])('%s: 24 months', (country) => {
    expect(proposeWarranty(input({ country }))).toEqual(legal(24, '2028-11-03', 'L24'));
  });

  it('29 February + legal 2 years: 28 February', () => {
    expect(proposeWarranty(input({ purchaseDate: '2028-02-29' }))).toEqual(legal(24, '2030-02-28', 'L24'));
  });

  it.each([null, '', '2026-02-30', '03/11/2026'])('purchase date %j: no expiry invented', (purchaseDate) => {
    expect(proposeWarranty(input({ purchaseDate }))).toEqual(legal(24, null, 'L24'));
  });
});

describe('proposeWarranty: no default (011, FR-003, SC-003, clarifications 1 and 2)', () => {
  it.each(['NL', 'US', 'GB', null, 'XX', 'AT', 'fr'])('country %j: empty section, reason country', (country) => {
    expect(proposeWarranty(input({ country }))).toEqual({ warranty: null, reason: 'country' });
  });

  it('third-party seller: empty section, reason seller', () => {
    expect(proposeWarranty(input({ sellerIsStore: false }))).toEqual({ warranty: null, reason: 'seller' });
  });

  it('third-party seller with a 3-year page warranty: the page one, no legal', () => {
    const r = proposeWarranty(input({ sellerIsStore: false, pageWarranty: page(36) }));
    expect(r.warranty).toMatchObject({ origin: 'page', expires: '2029-11-03', durationMonths: 36 });
    expect(r.reason).toBeNull();
  });

  it('setting turned off, nothing on the page: reason disabled', () => {
    expect(proposeWarranty(input({ settings: { v: 1, enabled: false, years: null } }))).toEqual({
      warranty: null,
      reason: 'disabled',
    });
  });

  it('order of reasons: disabled, then country, then seller', () => {
    const off = { v: 1 as const, enabled: false, years: null };
    expect(proposeWarranty(input({ settings: off, country: 'NL', sellerIsStore: false })).reason).toBe('disabled');
    expect(proposeWarranty(input({ country: 'NL', sellerIsStore: false })).reason).toBe('country');
    expect(proposeWarranty(input({ country: 'FR', sellerIsStore: false })).reason).toBe('seller');
  });
});

describe('proposeWarranty: the user setting (011, FR-007, US3)', () => {
  it('3 years in France: replaces the legal duration, detail "fallback"', () => {
    expect(proposeWarranty(input({ settings: { v: 1, enabled: true, years: 3 } }))).toEqual(
      legal(36, '2029-11-03', 'F36'),
    );
  });

  it('3 years in Spain (= legal): the legal detail', () => {
    expect(proposeWarranty(input({ country: 'ES', settings: { v: 1, enabled: true, years: 3 } }))).toEqual(
      legal(36, '2029-11-03', 'L36'),
    );
  });

  it('2 years in Spain: fallback detail, 24 months', () => {
    expect(proposeWarranty(input({ country: 'ES', settings: { v: 1, enabled: true, years: 2 } }))).toEqual(
      legal(24, '2028-11-03', 'F24'),
    );
  });

  it('3 years outside the table: never a default', () => {
    expect(proposeWarranty(input({ country: 'NL', settings: { v: 1, enabled: true, years: 3 } }))).toEqual({
      warranty: null,
      reason: 'country',
    });
  });

  it('setting off with a 3-year page warranty: the page is still proposed (US3-3)', () => {
    const r = proposeWarranty(input({ settings: { v: 1, enabled: false, years: null }, pageWarranty: page(36, 'Garantie 3 ans') }));
    expect(r.warranty).toEqual({
      origin: 'page',
      expires: '2029-11-03',
      lifetime: false,
      details: 'Garantie 3 ans',
      durationMonths: 36,
      edited: false,
    });
  });
});

describe('proposeWarranty: the longest wins (011, FR-004, R4)', () => {
  it('page 36 > default 24: the page, its label', () => {
    expect(proposeWarranty(input({ pageWarranty: page(36, 'Garantie 3 ans') })).warranty).toEqual({
      origin: 'page',
      expires: '2029-11-03',
      lifetime: false,
      details: 'Garantie 3 ans',
      durationMonths: 36,
      edited: false,
    });
  });

  it('page 12 < default 24: legal, detail mentions both', () => {
    expect(proposeWarranty(input({ pageWarranty: page(12, 'Garantie 1 an') }))).toEqual(
      legal(24, '2028-11-03', 'L24|Garantie 1 an'),
    );
  });

  it('page 24 = default 24: the page wins', () => {
    const r = proposeWarranty(input({ pageWarranty: page(24, 'Garantie 2 ans') }));
    expect(r.warranty).toMatchObject({ origin: 'page', details: 'Garantie 2 ans', durationMonths: 24 });
  });

  it('Spain, page 24 < legal 36: legal, detail mentions the page', () => {
    expect(proposeWarranty(input({ country: 'ES', pageWarranty: page(24, 'Garantie 2 ans') }))).toEqual(
      legal(36, '2029-11-03', 'L36|Garantie 2 ans'),
    );
  });

  it('lifetime page: lifetime, no date, longer than anything', () => {
    expect(proposeWarranty(input({ pageWarranty: lifetimePage })).warranty).toEqual({
      origin: 'page',
      expires: null,
      lifetime: true,
      details: 'A vie',
      durationMonths: null,
      edited: false,
    });
  });

  it('page alone outside the table (GB, 24 months)', () => {
    const r = proposeWarranty(input({ country: 'GB', pageWarranty: page(24) }));
    expect(r.warranty).toMatchObject({ origin: 'page', expires: '2028-11-03' });
  });

  it('extension: 60 months', () => {
    const r = proposeWarranty(input({ pageWarranty: page(60, 'Garantie 2 ans + extension 3 ans') }));
    expect(r.warranty).toMatchObject({ expires: '2031-11-03', details: 'Garantie 2 ans + extension 3 ans' });
  });
});

describe('manualWarrantyMonths and purity (011)', () => {
  it.each([
    [3, 'NL', 36],
    [null, 'ES', 36],
    [null, 'FR', 24],
    [null, 'NL', 24],
    [null, 'US', 24],
    [null, null, 24],
  ])('years %j, country %j: %i months', (years, country, expected) => {
    expect(manualWarrantyMonths({ v: 1, enabled: true, years }, country)).toBe(expected);
  });

  it('proposeWarranty is pure: same output, input not mutated', () => {
    const i = input({ pageWarranty: page(12) });
    const data = { ...i, texts: undefined };
    const copy = structuredClone(data);
    expect(proposeWarranty(i)).toEqual(proposeWarranty(i));
    expect(data).toEqual(copy);
  });

  it('default settings: enabled, no custom duration', () => {
    expect(DEFAULT_WARRANTY_SETTINGS).toEqual({ v: 1, enabled: true, years: null });
  });
});
