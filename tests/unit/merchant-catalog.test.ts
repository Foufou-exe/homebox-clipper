import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MERCHANT_CATALOG, storeForPageUrl } from '@/content/merchants/catalog';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';

describe('MERCHANT_CATALOG (reduced view of AMAZON_STORES)', () => {
  it('same order, id, displayName, origin, status and defaultCurrency as the table', () => {
    expect(MERCHANT_CATALOG.map((e) => [e.id, e.displayName, e.origin, e.status, e.defaultCurrency])).toEqual(
      AMAZON_STORES.map((s) => [s.id, s.displayName, s.origin, s.status, s.defaultCurrency]),
    );
  });

  // ADAPTED (spec 014, T010 a): 'tagName' added; only expectation of this file that changes.
  it('entries only carry id, displayName, origin, status, defaultCurrency, country, ownSellers and tagName (no extraction data)', () => {
    for (const e of MERCHANT_CATALOG) {
      expect(Object.keys(e).sort()).toEqual([
        'country',
        'defaultCurrency',
        'displayName',
        'id',
        'origin',
        'ownSellers',
        'status',
        'tagName',
      ]);
    }
  });

  it('country and ownSellers are the same as in the table, store by store (011)', () => {
    expect(MERCHANT_CATALOG.map((e) => [e.country, e.ownSellers])).toEqual(
      AMAZON_STORES.map((s) => [s.country, s.ownSellers]),
    );
  });
});

describe('storeForPageUrl: exact origin, never a suffix', () => {
  it.each(AMAZON_STORES.map((s) => [s.id, s.origin] as const))(
    '%s: recognized from its order page',
    (id, origin) => {
      expect(storeForPageUrl(`${origin}/your-orders/order-details`)?.id).toBe(id);
    },
  );

  it.each([
    null,
    '',
    'not a url',
    'http://www.amazon.de/your-orders/order-details',
    'https://www.amazon.com.evil.example/your-orders/order-details',
    'https://amazon.de/your-orders/order-details',
    'https://www.amazon.ca/your-orders/order-details',
    'https://www.amazon.de:8443/your-orders/order-details',
  ])('%s → null', (url) => {
    expect(storeForPageUrl(url)).toBeNull();
  });
});

describe('catalog.ts and stores.ts: pure data (source test)', () => {
  it.each(['src/content/merchants/catalog.ts', 'src/content/merchants/amazon/stores.ts'])(
    '%s: no DOM, network, storage or log access',
    (file) => {
      const source = readFileSync(resolve(__dirname, '../..', file), 'utf8');
      expect(source).not.toMatch(
        /\b(document|window|fetch|localStorage|chrome|browser|console)\b\s*[.(]/,
      );
      expect(source).not.toMatch(/from ['"]@\/platform/);
      expect(source).not.toMatch(
        /from ['"](?!\.\/amazon\/stores|@\/shared\/merchant-ids)/,
      );
    },
  );

  it('stores.ts imports nothing but the shared identifier type', () => {
    const source = readFileSync(resolve(__dirname, '../../src/content/merchants/amazon/stores.ts'), 'utf8');
    expect(source.match(/^import\s.*$/gm)).toEqual(["import type { AmazonStoreId } from '@/shared/merchant-ids';"]);
  });

  it('src/shared does not depend on the merchant modules (M8)', () => {
    for (const file of ['src/shared/types.ts', 'src/shared/merchant-ids.ts']) {
      expect(readFileSync(resolve(__dirname, '../..', file), 'utf8')).not.toMatch(/@\/content\//);
    }
  });
});

describe('tagName: store brand proposed as a tag (014, Q-U9, E1)', () => {
  const AMAZON_X8 = ['Amazon', 'Amazon', 'Amazon', 'Amazon', 'Amazon', 'Amazon', 'Amazon', 'Amazon'];

  it('the eight catalog entries carry the brand « Amazon »', () => {
    expect(MERCHANT_CATALOG.map((e) => e.tagName)).toEqual(AMAZON_X8);
  });

  it('the eight stores of the table carry the brand « Amazon »', () => {
    expect(AMAZON_STORES.map((s) => s.tagName)).toEqual(AMAZON_X8);
  });

  it('tagName is plain data, never a selector', () => {
    for (const e of MERCHANT_CATALOG) expect(e.tagName).toMatch(/^[A-Za-z]+$/);
  });
});
