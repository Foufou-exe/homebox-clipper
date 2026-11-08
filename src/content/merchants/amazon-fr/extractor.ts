import type { DetectedProduct, DocumentRef, Field } from '@/shared/types';
import type { MerchantExtractor } from '../types';
import { isAllowedImageUrl } from '@/shared/image';
import { cleanText, parseDateFr, parseOrderNumber, parsePriceFr, parseQuantity, toPhotoUrl } from './parse';
import { SELECTORS } from './selectors';

export const AMAZON_FR_ORIGIN = 'https://www.amazon.fr';
const NAME_MAX = 255;
/** Only image host observed on order pages (V7). */
const IMAGE_HOSTS = ['m.media-amazon.com'] as const;

const missing = <T>(reason: 'not_found' | 'unparsable' = 'not_found'): Field<T> => ({ value: null, reason });

/**
 * Tries each selector in order; the first element whose `read` returns a value wins.
 * An exception (invalid selector, unexpected element) moves on to the next selector (principle III).
 */
export function firstField<T>(
  root: ParentNode,
  selectors: readonly string[],
  read: (el: Element) => T | null,
): Field<T> {
  let found = false;
  for (const selector of selectors) {
    try {
      for (const el of Array.from(root.querySelectorAll(selector))) {
        found = true;
        const value = read(el);
        if (value !== null) return { value, selector };
      }
    } catch {
      // next selector
    }
  }
  return missing(found ? 'unparsable' : 'not_found');
}

const text = (el: Element) => el.textContent ?? '';
const nonEmpty = (s: string) => (s === '' ? null : s);

function sellerFrom(el: Element): string | null {
  const match = cleanText(text(el)).match(/Vendu par\s*:?\s*(.+)$/i);
  return match?.[1] ? cleanText(match[1], NAME_MAX) : null;
}

function asinFrom(el: Element): string | null {
  return el.getAttribute('href')?.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ?? null;
}

/** The seller is displayed per product row: the first row that mentions it is used. */
function sellerOf(rows: Element[]): Field<string> {
  for (const row of rows) {
    const seller = firstField(row, SELECTORS.seller, sellerFrom);
    if (seller.value !== null) return seller;
  }
  return missing();
}

function productRows(doc: Document): Element[] {
  for (const selector of SELECTORS.productRow) {
    try {
      const rows = Array.from(doc.querySelectorAll(selector));
      if (rows.length) return rows;
    } catch {
      // next selector
    }
  }
  return [];
}

/**
 * Area to search for the image: the full row (left + right columns) if its container only
 * covers that row, otherwise the row alone (avoids picking another product's image).
 */
function imageScope(row: Element, rows: Element[]): Element {
  for (const selector of SELECTORS.productRowContainer) {
    try {
      const container = row.closest(selector);
      if (container && !rows.some((other) => other !== row && container.contains(other))) return container;
    } catch {
      // next selector
    }
  }
  return row;
}

/**
 * A logo or pixel from another host is rejected and the next selector is tried; without an
 * acceptable image, the absence is always `not_found`.
 */
function photoField(scope: Element): Field<string> {
  const found = firstField(scope, SELECTORS.productImage, (el) => {
    const src = el.getAttribute('src') ?? '';
    return isAllowedImageUrl(src, IMAGE_HOSTS) ? toPhotoUrl(src) : null;
  });
  return found.value === null ? missing('not_found') : found;
}

function extractProduct(row: Element, index: number, rows: Element[]): DetectedProduct {
  const price = firstField(row, SELECTORS.productPrice, (el) => parsePriceFr(text(el)));
  const asin = firstField(row, SELECTORS.productAsin, asinFrom);
  const scope = imageScope(row, rows);
  const readQuantity = (el: Element) => parseQuantity(text(el));
  // Quantity > 1: badge in the image column, outside the row; otherwise fall back to the image area.
  let quantity = firstField(row, SELECTORS.productQuantity, readQuantity);
  if (quantity.value === null && scope !== row) quantity = firstField(scope, SELECTORS.productQuantity, readQuantity);
  return {
    key: asin.value ?? `item-${index}`,
    name: firstField(row, SELECTORS.productName, (el) => nonEmpty(cleanText(text(el), NAME_MAX))),
    unitPrice: price.value ? { value: price.value.amount, selector: price.selector } : missing(price.reason),
    currency: price.value ? { value: price.value.currency, selector: price.selector } : missing(price.reason),
    quantity: quantity.value ? quantity : { value: 1, selector: 'default' },
    imageUrl: photoField(scope),
  };
}

function sameOriginUrl(href: string | null, pageUrl: URL): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, pageUrl);
    return url.origin === AMAZON_FR_ORIGIN ? url.href : null;
  } catch {
    return null;
  }
}

function collectLinks(root: ParentNode, selectors: readonly string[], pageUrl: URL): string[] {
  const urls = new Set<string>();
  for (const selector of selectors) {
    try {
      for (const el of Array.from(root.querySelectorAll(selector))) {
        const url = sameOriginUrl(el.getAttribute('href'), pageUrl);
        if (url) urls.add(url);
      }
    } catch {
      // next selector
    }
  }
  return [...urls];
}

function toDocuments(urls: string[], orderNumber: string | null): DocumentRef[] {
  const base = `facture-amazon${orderNumber ? `-${orderNumber}` : ''}`;
  return urls.map((url, i) => ({
    id: `detected-${i}`,
    origin: 'detected',
    kind: 'invoice',
    label: `${base}${i === 0 ? '' : `-${i + 1}`}.pdf`,
    url,
  }));
}

export const amazonFrExtractor: MerchantExtractor = {
  id: 'amazon.fr',
  domains: [new URL(AMAZON_FR_ORIGIN).hostname],
  imageHosts: IMAGE_HOSTS,

  matchesUrl(url) {
    return url.origin === AMAZON_FR_ORIGIN;
  },

  isOrderPage(doc) {
    return SELECTORS.orderPageMarker.some((s) => {
      try {
        return doc.querySelector(s) !== null;
      } catch {
        return false;
      }
    });
  },

  extract(doc, pageUrl) {
    const orderNumber = firstField(doc, SELECTORS.orderNumber, (el) => parseOrderNumber(text(el)));
    const rows = productRows(doc);
    // FR-010: only the DetectedPurchase fields are read — no address, no payment.
    return {
      source: 'amazon.fr',
      pageUrl: `${pageUrl.origin}${pageUrl.pathname}`,
      orderNumber,
      orderDate: firstField(doc, SELECTORS.orderDate, (el) => parseDateFr(text(el))),
      seller: sellerOf(rows),
      products: rows.map((row, i) => extractProduct(row, i, rows)),
      documents: toDocuments(collectLinks(doc, SELECTORS.invoiceLink, pageUrl), orderNumber.value),
    };
  },

  async resolveDocuments(doc, pageUrl, fetchSameOrigin) {
    const orderNumber = firstField(doc, SELECTORS.orderNumber, (el) => parseOrderNumber(text(el))).value;
    const urls = collectLinks(doc, SELECTORS.invoiceLink, pageUrl);

    const popoverUrls = new Set<string>();
    for (const selector of SELECTORS.invoicePopoverTrigger) {
      try {
        for (const el of Array.from(doc.querySelectorAll(selector))) {
          const fromHref = sameOriginUrl(el.getAttribute('href'), pageUrl);
          const fromData = (el.getAttribute('data-a-popover') ?? '').match(/"url"\s*:\s*"([^"]+)"/)?.[1];
          const url = fromHref ?? sameOriginUrl(fromData ?? null, pageUrl);
          if (url) popoverUrls.add(url);
        }
      } catch {
        // next selector
      }
    }

    for (const url of popoverUrls) {
      try {
        const res = await fetchSameOrigin(url, { credentials: 'include' });
        if (!res.ok) continue;
        const popover = new DOMParser().parseFromString(await res.text(), 'text/html');
        for (const link of collectLinks(popover, SELECTORS.invoicePopoverPdfLink, pageUrl)) {
          if (!urls.includes(link)) urls.push(link);
        }
      } catch {
        // menu unavailable: keep the direct links
      }
    }
    return toDocuments(urls, orderNumber);
  },
};
