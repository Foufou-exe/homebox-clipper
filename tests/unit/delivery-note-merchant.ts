import { documentId, documentLabel, isDeliveryNoteText } from '@/content/merchants/document-labels';
import type { MerchantExtractor } from '@/content/merchants/types';
import type { DocumentRef } from '@/shared/types';

/**
 * Fictional merchant of the tests (spec 007, T038): NOT part of the registry, never in production code.
 * It declares its own delivery-note selectors, as a real merchant module would (contracts/extraction-documents.md):
 * structural marker first, label as a fallback; exclusions; one class per link (mutual exclusion, V7);
 * same origin only.
 */
export const DELIVERY_SELECTORS = {
  deliveryMarker: ['a[data-doc="delivery-note"]'],
  invoiceMarker: ['a[data-doc="invoice"]'],
  anyLink: ['a[href]'],
} as const;

const PDF_LINK = /\.pdf(?:[?#]|$)/i;
const INVOICE_TEXT = /facture|invoice|rechnung/i;
const OTHER_EXCLUSIONS = /retour|return|rma|[ée]tiquette|label|avoir|credit|gutschrift|r[ée]capitulatif|summary|imprimable|printable/i;

const sameOriginPdf = (href: string | null, pageUrl: URL): string | null => {
  if (!href) return null;
  try {
    const url = new URL(href, pageUrl);
    return url.origin === pageUrl.origin && PDF_LINK.test(url.pathname + url.search) ? url.href : null;
  } catch {
    return null;
  }
};

const matches = (el: Element, selectors: readonly string[]) => selectors.some((s) => el.matches(s));

function classify(el: Element): 'delivery_note' | 'invoice' | null {
  const text = el.textContent ?? '';
  if (matches(el, DELIVERY_SELECTORS.deliveryMarker)) return 'delivery_note';
  if (matches(el, DELIVERY_SELECTORS.invoiceMarker)) return 'invoice';
  if (OTHER_EXCLUSIONS.test(text)) return null;
  if (INVOICE_TEXT.test(text)) return 'invoice';
  return isDeliveryNoteText(text) ? 'delivery_note' : null;
}

export function collect(doc: Document, pageUrl: URL): DocumentRef[] {
  const orderNumber = doc.querySelector('[data-order-number]')?.getAttribute('data-order-number') ?? null;
  const urls: Record<'delivery_note' | 'invoice', string[]> = { delivery_note: [], invoice: [] };
  for (const el of Array.from(doc.querySelectorAll(DELIVERY_SELECTORS.anyLink.join(',')))) {
    const kind = classify(el);
    const url = kind ? sameOriginPdf(el.getAttribute('href'), pageUrl) : null;
    if (kind && url && !urls[kind].includes(url)) urls[kind].push(url);
  }
  return [
    ...urls.invoice.map((url, i): DocumentRef => ({
      id: documentId('invoice', i),
      origin: 'detected',
      kind: 'invoice',
      label: documentLabel('invoice', 'shop', orderNumber, i),
      url,
    })),
    ...urls.delivery_note.map((url, i): DocumentRef => ({
      id: documentId('delivery_note', i),
      origin: 'detected',
      kind: 'delivery_note',
      label: documentLabel('delivery_note', 'shop', orderNumber, i),
      url,
    })),
  ];
}

export function deliveryNoteMerchant(): MerchantExtractor {
  return {
    // Test double: the identifier is only a placeholder for the closed union; it is never registered.
    id: 'amazon.fr',
    displayName: 'Boutique Exemple',
    domains: ['shop.example.com'],
    imageHosts: [],
    matchesUrl: (url) => url.origin === 'https://shop.example.com',
    isOrderPage: (doc) => doc.querySelector('#order') !== null,
    extract(doc, pageUrl) {
      return {
        source: 'amazon.fr',
        pageUrl: `${pageUrl.origin}${pageUrl.pathname}`,
        orderNumber: { value: '999-0000000-0000001', selector: '[data-order-number]' },
        orderDate: { value: null, reason: 'not_found' },
        seller: { value: null, reason: 'not_found' },
        products: [
          {
            key: 'p1',
            name: { value: 'Clavier sans fil Exemple Pro', selector: '.name' },
            unitPrice: { value: null, reason: 'not_found' },
            currency: { value: null, reason: 'not_found' },
            quantity: { value: 1, selector: 'default' },
            imageUrl: { value: null, reason: 'not_found' },
          },
        ],
        documents: collect(doc, pageUrl),
      };
    },
    async resolveDocuments(doc, pageUrl) {
      return collect(doc, pageUrl);
    },
  };
}
