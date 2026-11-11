import type { DetectedProduct, DocumentRef, Field } from '@/shared/types';
import type { MerchantExtractor } from '../types';
import { isAllowedImageUrl } from '@/shared/image';
import {
  cleanText,
  parseOrderDate,
  parseOrderNumber,
  parsePrice,
  parseQuantity,
  parseSeller,
  resolvePageLanguage,
  toPhotoUrl,
} from './parse';
import { SELECTORS } from './selectors';
import type { AmazonStore, PageLanguage } from './stores';

const NAME_MAX = 255;

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

/** Store of the page and language used to read it (`'unknown'`: language-dependent fields absent). */
interface PageContext {
  store: AmazonStore;
  lang: PageLanguage | 'unknown';
}

function asinFrom(el: Element): string | null {
  return el.getAttribute('href')?.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ?? null;
}

/** The seller is displayed per product row: the first row that mentions it is used. */
function sellerOf(rows: Element[], ctx: PageContext): Field<string> {
  for (const row of rows) {
    const seller = firstField(row, SELECTORS.seller, (el) => parseSeller(text(el), ctx.lang));
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
function photoField(scope: Element, ctx: PageContext): Field<string> {
  const found = firstField(scope, SELECTORS.productImage, (el) => {
    const src = el.getAttribute('src') ?? '';
    return isAllowedImageUrl(src, ctx.store.imageHosts) ? toPhotoUrl(src) : null;
  });
  return found.value === null ? missing('not_found') : found;
}

function extractProduct(row: Element, index: number, rows: Element[], ctx: PageContext): DetectedProduct {
  const price = firstField(row, SELECTORS.productPrice, (el) => parsePrice(text(el), ctx.lang));
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
    imageUrl: photoField(scope, ctx),
  };
}

/** Absolute URL of a link if it is on the origin of the store (FR-008), otherwise null. */
function sameOriginUrl(href: string | null, pageUrl: URL, origin: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, pageUrl);
    return url.origin === origin ? url.href : null;
  } catch {
    return null;
  }
}

function collectLinks(root: ParentNode, selectors: readonly string[], pageUrl: URL, origin: string): string[] {
  const urls = new Set<string>();
  for (const selector of selectors) {
    try {
      for (const el of Array.from(root.querySelectorAll(selector))) {
        const url = sameOriginUrl(el.getAttribute('href'), pageUrl, origin);
        if (url) urls.add(url);
      }
    } catch {
      // next selector
    }
  }
  return [...urls];
}

function toDocuments(urls: string[], orderNumber: string | null): DocumentRef[] {
  const orderSuffix = orderNumber ? `-${orderNumber}` : '';
  const base = `facture-amazon${orderSuffix}`;
  return urls.map((url, i) => {
    const indexSuffix = i === 0 ? '' : `-${i + 1}`;
    return {
      id: `detected-${i}`,
      origin: 'detected',
      kind: 'invoice',
      label: `${base}${indexSuffix}.pdf`,
      url,
    };
  });
}

/** URL of the "Invoice" menu of a trigger: its `href`, otherwise the `url` of its `data-a-popover`. Same origin only. */
function popoverUrlOf(el: HTMLElement, pageUrl: URL, origin: string): string | null {
  const fromHref = sameOriginUrl(el.getAttribute('href'), pageUrl, origin);
  const fromData = /"url"\s*:\s*"([^"]+)"/.exec(el.dataset.aPopover ?? '')?.[1];
  return fromHref ?? sameOriginUrl(fromData ?? null, pageUrl, origin);
}

/** URLs of the "Facture" menus, deduplicated, in the order of the selectors then of the page. */
function popoverUrls(doc: Document, pageUrl: URL, origin: string): Set<string> {
  const urls = new Set<string>();
  for (const selector of SELECTORS.invoicePopoverTrigger) {
    try {
      for (const el of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
        const url = popoverUrlOf(el, pageUrl, origin);
        if (url) urls.add(url);
      }
    } catch {
      // next selector
    }
  }
  return urls;
}

/** PDF links of one "Facture" menu; an unavailable menu gives none (the direct links are kept). */
async function popoverPdfLinks(url: string, pageUrl: URL, origin: string, fetchSameOrigin: typeof fetch): Promise<string[]> {
  try {
    const res = await fetchSameOrigin(url, { credentials: 'include' });
    if (!res.ok) return [];
    const popover = new DOMParser().parseFromString(await res.text(), 'text/html');
    return collectLinks(popover, SELECTORS.invoicePopoverPdfLink, pageUrl, origin);
  } catch {
    // menu unavailable: keep the direct links
    return [];
  }
}

const hasAny = (doc: Document, selectors: readonly string[]) =>
  selectors.some((s) => {
    try {
      return doc.querySelector(s) !== null;
    } catch {
      return false;
    }
  });

/**
 * Language used to read the page (R2.1): the one of `<html lang>` if the store reads it. Without the
 * attribute, the store languages are tried in order: the first one that reads the most language-dependent
 * fields (order date, seller) wins, otherwise the main language. The seller breaks the tie when month names
 * are shared (« November » in German and English).
 */
function pageContext(doc: Document, store: AmazonStore, rows: Element[]): PageContext {
  const declared = resolvePageLanguage(doc, store);
  if (declared !== null) return { store, lang: declared };
  let best: PageContext = { store, lang: store.pageLanguages[0] ?? 'unknown' };
  let bestScore = 0;
  for (const lang of store.pageLanguages) {
    const ctx = { store, lang };
    const score = Number(orderDateOf(doc, ctx).value !== null) + Number(sellerOf(rows, ctx).value !== null);
    if (score > bestScore) {
      best = ctx;
      bestScore = score;
    }
  }
  return best;
}

function orderDateOf(doc: Document, ctx: PageContext): Field<string> {
  const { lang, store } = ctx;
  // Page language not recognized for this store: no date is guessed (FR-004).
  if (lang === 'unknown') return firstField<string>(doc, SELECTORS.orderDate, () => null);
  return firstField(doc, SELECTORS.orderDate, (el) => parseOrderDate(text(el), lang, store.numericDateOrder));
}

/** Extractor of one Amazon store (contracts/amazon-stores.md): same code, parameterized by the table. */
export function createAmazonExtractor(store: AmazonStore): MerchantExtractor {
  const { origin } = store;
  const orderNumberOf = (doc: Document) => firstField(doc, SELECTORS.orderNumber, (el) => parseOrderNumber(text(el)));

  return {
    id: store.id,
    displayName: store.displayName,
    domains: [new URL(origin).hostname],
    imageHosts: store.imageHosts,

    matchesUrl(url) {
      return url.origin === origin;
    },

    isOrderPage(doc, pageUrl) {
      if (hasAny(doc, SELECTORS.orderPageMarker)) return true;
      // The path widens the recognition (marker changed on a store), never restricts it (R3, SC-007).
      const knownPath = SELECTORS.orderDetailsPath.some((p) => pageUrl.pathname.startsWith(p));
      return knownPath && orderNumberOf(doc).value !== null;
    },

    extract(doc, pageUrl) {
      const rows = productRows(doc);
      const ctx = pageContext(doc, store, rows);
      const orderNumber = orderNumberOf(doc);
      // FR-010: only the DetectedPurchase fields are read — no address, no payment.
      return {
        source: store.id,
        pageUrl: `${pageUrl.origin}${pageUrl.pathname}`,
        orderNumber,
        orderDate: orderDateOf(doc, ctx),
        seller: sellerOf(rows, ctx),
        products: rows.map((row, i) => extractProduct(row, i, rows, ctx)),
        documents: toDocuments(collectLinks(doc, SELECTORS.invoiceLink, pageUrl, origin), orderNumber.value),
      };
    },

    async resolveDocuments(doc, pageUrl, fetchSameOrigin) {
      const orderNumber = orderNumberOf(doc).value;
      const urls = collectLinks(doc, SELECTORS.invoiceLink, pageUrl, origin);
      // One menu at a time, in the order of the triggers: the order of the documents is stable.
      for (const url of popoverUrls(doc, pageUrl, origin)) {
        for (const link of await popoverPdfLinks(url, pageUrl, origin, fetchSameOrigin)) {
          if (!urls.includes(link)) urls.push(link);
        }
      }
      return toDocuments(urls, orderNumber);
    },
  };
}

