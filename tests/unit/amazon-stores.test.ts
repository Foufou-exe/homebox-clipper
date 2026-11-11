import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';
import { PAGE_LOCALES } from '@/content/merchants/amazon/page-locales';

const fixturesOf = (dir: string): string[] => {
  const path = resolve(__dirname, '../fixtures', dir);
  return existsSync(path) ? readdirSync(path) : [];
};

/** Table of the Amazon stores: invariants of contracts/amazon-stores.md (Q-U1). */
describe('AMAZON_STORES: invariants', () => {
  it('1. exactly 8 stores, unique id and origin', () => {
    expect(AMAZON_STORES).toHaveLength(8);
    expect(new Set(AMAZON_STORES.map((s) => s.id)).size).toBe(8);
    expect(new Set(AMAZON_STORES.map((s) => s.origin)).size).toBe(8);
  });

  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))(
    '2. %s: exact https origin, host = www. + id',
    (_id, s) => {
      const url = new URL(s.origin);
      expect(url.origin).toBe(s.origin);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe(`www.${s.id}`);
    },
  );

  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))(
    '3. %s: page languages known to PAGE_LOCALES',
    (_id, s) => {
      expect(s.pageLanguages.length).toBeGreaterThan(0);
      for (const lang of s.pageLanguages) expect(PAGE_LOCALES).toHaveProperty([lang]);
    },
  );

  it('4. numericDateOrder MDY only for amazon.com', () => {
    for (const s of AMAZON_STORES)
      expect(s.numericDateOrder === 'MDY', s.id).toBe(s.id === 'amazon.com');
  });

  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))(
    '5. %s: exact image host names, no wildcard',
    (_id, s) => {
      expect(s.imageHosts.length).toBeGreaterThan(0);
      for (const host of s.imageHosts) expect(host).toMatch(/^[a-z0-9.-]+$/);
    },
  );

  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))(
    '6. %s: "supported" requires at least one real-*.html fixture (FR-014)',
    (_id, s) => {
      if (s.status !== 'supported') return;
      expect(fixturesOf(s.fixturesDir).some((f) => /^real-.*\.html$/.test(f))).toBe(true);
    },
  );
});

describe('AMAZON_STORES: initial values (data-model.md, section 1)', () => {
  it('amazon.fr supported, the 7 others testing', () => {
    expect(AMAZON_STORES.map((s) => [s.id, s.status])).toEqual([
      ['amazon.fr', 'supported'],
      ['amazon.de', 'testing'],
      ['amazon.es', 'testing'],
      ['amazon.it', 'testing'],
      ['amazon.com.be', 'testing'],
      ['amazon.nl', 'testing'],
      ['amazon.co.uk', 'testing'],
      ['amazon.com', 'testing'],
    ]);
  });

  it('values of the table', () => {
    expect(
      AMAZON_STORES.map((s) => [
        s.id,
        s.displayName,
        s.country,
        s.pageLanguages,
        s.defaultCurrency,
        s.numericDateOrder,
        s.fixturesDir,
      ]),
    ).toEqual([
      ['amazon.fr', 'Amazon.fr', 'FR', ['fr'], 'EUR', 'DMY', 'amazon-fr'],
      ['amazon.de', 'Amazon.de', 'DE', ['de', 'en'], 'EUR', 'DMY', 'amazon-de'],
      ['amazon.es', 'Amazon.es', 'ES', ['es', 'en'], 'EUR', 'DMY', 'amazon-es'],
      ['amazon.it', 'Amazon.it', 'IT', ['it', 'en'], 'EUR', 'DMY', 'amazon-it'],
      ['amazon.com.be', 'Amazon.com.be', 'BE', ['fr', 'nl', 'en'], 'EUR', 'DMY', 'amazon-com-be'],
      ['amazon.nl', 'Amazon.nl', 'NL', ['nl', 'en'], 'EUR', 'DMY', 'amazon-nl'],
      ['amazon.co.uk', 'Amazon.co.uk', 'GB', ['en'], 'GBP', 'DMY', 'amazon-co-uk'],
      ['amazon.com', 'Amazon.com', 'US', ['en'], 'USD', 'MDY', 'amazon-com'],
    ]);
  });

  it('imageHosts = m.media-amazon.com for the 8 stores', () => {
    for (const s of AMAZON_STORES) expect(s.imageHosts, s.id).toEqual(['m.media-amazon.com']);
  });

  it('country: 2 upper-case letters; displayName: non-empty ASCII', () => {
    for (const s of AMAZON_STORES) {
      expect(s.country).toMatch(/^[A-Z]{2}$/);
      expect(s.displayName).toMatch(/^[\x21-\x7e]+$/);
    }
  });
});

/**
 * Invariant 7 (FR-013): each store has a simple order, a multi-product order and an order with an
 * invoice. Amazon.fr is covered by its current fixtures, with this documented correspondence.
 */
describe('AMAZON_STORES: fixtures per store (invariant 7)', () => {
  const AMAZON_FR_FIXTURES = {
    single: 'real-order-single.html',
    multi: 'real-order-multi.html',
    // Invoice through the "Facture" menu.
    invoice: 'real-order-single.html',
  };

  it.each(AMAZON_STORES.map((s) => [s.id, s] as const))(
    '%s: single, multi and invoice orders',
    (_id, s) => {
      const files = fixturesOf(s.fixturesDir);
      if (s.id === 'amazon.fr') {
        for (const name of Object.values(AMAZON_FR_FIXTURES)) expect(files).toContain(name);
        return;
      }
      for (const kind of ['single', 'multi', 'invoice']) {
        expect(
          files.some((f) => new RegExp(`^(reconstructed|real)-order-${kind}\\.html$`).test(f)),
          `${s.fixturesDir}: *-order-${kind}.html`,
        ).toBe(true);
      }
      expect(files, `${s.fixturesDir}/README.md`).toContain('README.md');
    },
  );
});
