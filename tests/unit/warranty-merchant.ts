import { firstField } from '@/content/merchants/amazon/extractor';
import { parseSeller } from '@/content/merchants/amazon/parse';
import type { MerchantExtractor } from '@/content/merchants/types';
import { combineWarranties, parseWarrantyText } from '@/content/merchants/warranty-text';
import type { DetectedProduct, Field, PageWarranty } from '@/shared/types';

/**
 * Fictional merchant of the tests (spec 011, T041): NOT part of the registry, never in production code. It declares
 * its own warranty selectors, with an ordered list of fallbacks, and applies the rules of
 * contracts/extraction-warranty.md: per product, a value or an explicit absence, text analysed by `parseWarrantyText`,
 * extension added by `combineWarranties`, seller read on the row, no network.
 */
export const WARRANTY_SELECTORS = {
  productRow: ['.line'],
  warranty: ['.warranty', '[data-warranty]'],
  extension: ['.warranty-extension'],
  seller: ['.seller'],
  name: ['.name'],
} as const;

const text = (el: Element) => el.textContent ?? '';
const absent = <T>(reason: 'not_found' | 'unparsable'): Field<T> => ({ value: null, reason });

function pageWarrantyOf(row: Element): Field<PageWarranty> {
  const base = firstField(row, WARRANTY_SELECTORS.warranty, (el) => parseWarrantyText(text(el)));
  const extension = firstField(row, WARRANTY_SELECTORS.extension, (el) => parseWarrantyText(text(el)));
  if (extension.value !== null) {
    // An extension is only added to a base that was read; alone it is ambiguous and not used.
    if (base.value === null) return absent('unparsable');
    const total = combineWarranties(base.value, extension.value);
    return total ? { value: total, selector: `${base.selector}+${extension.selector}` } : absent('unparsable');
  }
  return base;
}

function productOf(row: Element, index: number): DetectedProduct {
  return {
    key: `p${index + 1}`,
    name: firstField(row, WARRANTY_SELECTORS.name, (el) => text(el).trim() || null),
    unitPrice: absent('not_found'),
    currency: absent('not_found'),
    quantity: { value: 1, selector: 'default' },
    imageUrl: absent('not_found'),
    seller: firstField(row, WARRANTY_SELECTORS.seller, (el) => parseSeller(text(el), 'fr')),
    pageWarranty: pageWarrantyOf(row),
  };
}

export function warrantyMerchant(): MerchantExtractor {
  return {
    // Test double: the identifier is only a placeholder for the closed union; it is never registered.
    id: 'amazon.fr',
    displayName: 'Boutique Exemple',
    domains: ['shop.example.com'],
    imageHosts: [],
    matchesUrl: (url) => url.origin === 'https://shop.example.com',
    isOrderPage: (doc) => doc.querySelector('#order') !== null,
    extract(doc, pageUrl) {
      const date = doc.querySelector('[data-order-date]')?.getAttribute('data-order-date') ?? null;
      return {
        source: 'amazon.fr',
        pageUrl: `${pageUrl.origin}${pageUrl.pathname}`,
        orderNumber: { value: '999-0000000-0000001', selector: '[data-order-number]' },
        orderDate: date ? { value: date, selector: '[data-order-date]' } : absent('not_found'),
        seller: absent('not_found'),
        products: Array.from(doc.querySelectorAll(WARRANTY_SELECTORS.productRow.join(','))).map(productOf),
        documents: [],
      };
    },
    async resolveDocuments() {
      return [];
    },
  };
}
