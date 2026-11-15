import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Window } from 'happy-dom';
import { createAmazonExtractor } from '@/content/merchants/amazon/extractor';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';
import { SELECTORS } from '@/content/merchants/amazon/selectors';
import { isStoreSeller } from '@/shared/warranty';
import { fixtureHtml, loadFixture } from './fixtures';

const FIXTURES = resolve(__dirname, '../fixtures');

/** First-level `.html` files of each `tests/fixtures/amazon-*` folder. Never descends into `raw/`. */
function pages(): { dir: string; file: string; path: string }[] {
  return readdirSync(FIXTURES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('amazon-'))
    .flatMap((d) =>
      readdirSync(resolve(FIXTURES, d.name), { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith('.html'))
        .map((f) => ({ dir: d.name, file: f.name, path: resolve(FIXTURES, d.name, f.name) })),
    );
}

const STORE_OF_DIR: Record<string, string> = {
  'amazon-fr': 'amazon.fr',
  'amazon-de': 'amazon.de',
  'amazon-es': 'amazon.es',
  'amazon-it': 'amazon.it',
  'amazon-nl': 'amazon.nl',
  'amazon-com-be': 'amazon.com.be',
  'amazon-co-uk': 'amazon.co.uk',
  'amazon-com': 'amazon.com',
};

const all = pages();

describe('Amazon reads no warranty from the page (011, Q-U9, SC-003, principle VII)', () => {
  it('guard: the sweep sees the eight store folders and never a raw/ path', () => {
    expect(new Set(all.map((p) => p.dir))).toEqual(new Set(Object.keys(STORE_OF_DIR)));
    for (const p of all) expect(p.path).not.toMatch(/[\\/]raw[\\/]/);
  });

  it.each(all.filter((p) => !p.file.includes('popover')).map((p) => [`${p.dir}/${p.file}`, p] as const))(
    '%s: no product has a pageWarranty property',
    (_name, p) => {
      const store = AMAZON_STORES.find((s) => s.id === STORE_OF_DIR[p.dir])!;
      const url = `${store.origin}/your-orders/order-details?orderID=999-0000000-0000001`;
      const window = new Window({ url });
      window.document.write(readFileSync(p.path, 'utf8'));
      const purchase = createAmazonExtractor(store).extract(window.document as unknown as Document, new URL(url));
      for (const product of purchase.products) {
        expect(Object.hasOwn(product, 'pageWarranty')).toBe(false);
        expect(Object.keys(product).sort()).toEqual([
          'currency',
          'imageUrl',
          'key',
          'name',
          'quantity',
          'seller',
          'unitPrice',
        ]);
      }
    },
  );

  it('DetectedPurchase keeps exactly its current keys', () => {
    const { doc, url } = loadFixture('order-mixed-sellers.html');
    const purchase = createAmazonExtractor(AMAZON_STORES.find((s) => s.id === 'amazon.fr')!).extract(doc, url);
    expect(Object.keys(purchase).sort()).toEqual([
      'documents',
      'orderDate',
      'orderNumber',
      'pageUrl',
      'products',
      'seller',
      'source',
    ]);
  });
});

describe('seller read per product row (011, R5)', () => {
  const fr = AMAZON_STORES.find((s) => s.id === 'amazon.fr')!;
  const extract = (name: string) => {
    const { doc, url } = loadFixture(name);
    return createAmazonExtractor(fr).extract(doc, url);
  };

  it('order-mixed-sellers: two different sellers; the order seller stays that of the first row', () => {
    const p = extract('order-mixed-sellers.html');
    expect(p.products.map((x) => x.seller?.value)).toEqual(['Amazon EU S.à r.l.', 'Boutique Exemple SARL']);
    expect(p.seller.value).toBe('Amazon EU S.à r.l.');
  });

  it('real-order-single: Vendeur Fictif', () => {
    expect(extract('real-order-single.html').products[0]?.seller?.value).toBe('Vendeur Fictif');
  });

  it('a row without seller mention: explicit absence', () => {
    const url = 'https://www.amazon.fr/your-orders/order-details?orderID=999-0000000-0000003';
    const window = new Window({ url });
    window.document.write(
      fixtureHtml('order-mixed-sellers.html').replace(/<div data-component="orderedMerchant">.*<\/div>\n/, ''),
    );
    const p = createAmazonExtractor(fr).extract(window.document as unknown as Document, new URL(url));
    expect(p.products[0]?.seller).toEqual({ value: null, reason: 'not_found' });
    expect(p.products[1]?.seller?.value).toBe('Boutique Exemple SARL');
  });

  it('only one product of the mixed order receives the default warranty', () => {
    const p = extract('order-mixed-sellers.html');
    expect(p.products.map((x) => isStoreSeller(x.seller?.value ?? null, fr.ownSellers))).toEqual([true, false]);
  });
});

describe('selectors.ts: no warranty selector (011, principle III)', () => {
  it('SELECTORS.seller is unchanged and no key mentions a warranty', () => {
    expect(SELECTORS.seller).toEqual(['[data-component="orderedMerchant"]', '.a-color-secondary', '.a-size-small']);
    expect(Object.keys(SELECTORS).filter((k) => /warrant|garantie/i.test(k))).toEqual([]);
  });

  it('the selectors source never mentions a warranty term', () => {
    const source = readFileSync(resolve(__dirname, '../../src/content/merchants/amazon/selectors.ts'), 'utf8');
    for (const term of ['warranty', 'garantie', 'Garantie', 'Gewährleistung', 'garantía', 'garanzia', 'waarborg']) {
      expect(source).not.toContain(term);
    }
  });
});
