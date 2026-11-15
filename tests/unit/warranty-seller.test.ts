import { Window } from 'happy-dom';
import { createAmazonExtractor } from '@/content/merchants/amazon/extractor';
import { AMAZON_STORES } from '@/content/merchants/amazon/stores';
import { isStoreSeller, normalizeSeller } from '@/shared/warranty';
import { fixtureHtml, storeOrderUrl } from './fixtures';

const OWN = ['Amazon', 'Amazon.fr', 'Amazon EU S.à r.l.', 'Amazon EU SARL'];

describe('normalizeSeller (011, R5)', () => {
  it('diacritics, dots and case are folded', () => {
    expect(normalizeSeller('Amazon EU S.à r.l.')).toBe('amazon eu s a r l');
    expect(normalizeSeller('AMAZON EU S.A R.L.')).toBe('amazon eu s a r l');
  });

  it('NBSP, multiple spaces and punctuation', () => {
    expect(normalizeSeller('  Amazon  EU   SARL  ')).toBe('amazon eu sarl');
    expect(normalizeSeller('Amazon.fr')).toBe('amazon fr');
    expect(normalizeSeller('')).toBe('');
  });
});

describe('isStoreSeller: exact match after normalization, never "contains" (011, Q-U3b, SC-003)', () => {
  it.each([
    'Amazon',
    'amazon',
    'AMAZON',
    'Amazon.fr',
    'Amazon EU S.à r.l.',
    'AMAZON EU S.A R.L.',
    'Amazon EU S.a.r.l',
    'Amazon EU SARL',
    'Amazon EU SARL',
    '  Amazon  EU  SARL  ',
  ])('%j is the store itself', (seller) => {
    expect(isStoreSeller(seller, OWN)).toBe(true);
  });

  it.each([
    'Amazon Warehouse',
    'Amazon Seconde Main',
    'Amazon Services Europe',
    'Amazonas Shop',
    'Amazon Reseller GmbH',
    'Boutique Exemple SARL',
    'Vendeur Fictif',
  ])('%j is not the store itself', (seller) => {
    expect(isStoreSeller(seller, OWN)).toBe(false);
  });

  it.each([null, '', '   '])('unknown seller %j is not the store', (seller) => {
    expect(isStoreSeller(seller, OWN)).toBe(false);
  });

  it("ownSellers 'any' accepts every seller, even an unknown one", () => {
    expect(isStoreSeller(null, 'any')).toBe(true);
    expect(isStoreSeller('Whoever', 'any')).toBe(true);
  });

  it('empty ownSellers never matches', () => {
    expect(isStoreSeller('Amazon', [])).toBe(false);
  });
});

describe('seller read per row, in every page language (011, R5, V-7)', () => {
  const extract = (dir: string, file: string, storeId: string, replaceBy: string | null) => {
    const store = AMAZON_STORES.find((s) => s.id === storeId)!;
    const url = storeOrderUrl(store);
    const window = new Window({ url });
    const html = fixtureHtml(file, dir);
    window.document.write(replaceBy === null ? html : html.replaceAll('Vendeur Fictif', replaceBy));
    const purchase = createAmazonExtractor(store).extract(window.document as unknown as Document, new URL(url));
    return { store, purchase };
  };

  // Labels: "Vendu par", "Verkauf durch", "Vendido por", "Venduto da", "Verkocht door", "Sold by".
  it.each([
    ['amazon-de', 'amazon.de'],
    ['amazon-es', 'amazon.es'],
    ['amazon-it', 'amazon.it'],
    ['amazon-nl', 'amazon.nl'],
    ['amazon-com-be', 'amazon.com.be'],
    ['amazon-co-uk', 'amazon.co.uk'],
    ['amazon-com', 'amazon.com'],
  ])('%s: the same proper name "Amazon" is read and recognized; "Vendeur Fictif" is not', (dir, id) => {
    const { store, purchase } = extract(dir, 'reconstructed-order-single.html', id, 'Amazon');
    const [product] = purchase.products;
    expect(product?.seller?.value).toBe('Amazon');
    expect(isStoreSeller(product?.seller?.value ?? null, store.ownSellers)).toBe(true);

    const { purchase: other } = extract(dir, 'reconstructed-order-single.html', id, null);
    expect(other.products[0]?.seller?.value).toBe('Vendeur Fictif');
    expect(isStoreSeller(other.products[0]?.seller?.value ?? null, store.ownSellers)).toBe(false);
  });

  it('amazon-fr order-multi-item: sold by Amazon EU S.à r.l. is the store itself', () => {
    const { store, purchase } = extract('amazon-fr', 'order-multi-item.html', 'amazon.fr', null);
    for (const product of purchase.products) {
      expect(product.seller?.value).toBe('Amazon EU S.à r.l.');
      expect(isStoreSeller(product.seller?.value ?? null, store.ownSellers)).toBe(true);
    }
  });
});
