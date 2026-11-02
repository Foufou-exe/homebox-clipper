import type { DetectedProduct, DocumentRef, Field } from '@/shared/types';
import type { MerchantExtractor } from '../types';
import { cleanText, parseDateFr, parseOrderNumber, parsePriceFr, parseQuantity } from './parse';
import { SELECTORS } from './selectors';

export const AMAZON_FR_ORIGIN = 'https://www.amazon.fr';
const NAME_MAX = 255;

const missing = <T>(reason: 'not_found' | 'unparsable' = 'not_found'): Field<T> => ({ value: null, reason });

/**
 * Essaie chaque sélecteur dans l'ordre ; le premier élément dont `read` renvoie une valeur gagne.
 * Une exception (sélecteur invalide, élément inattendu) passe au sélecteur suivant (principe III).
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
      // sélecteur suivant
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

/** Le vendeur est affiché par ligne de produit : on prend la première ligne qui le mentionne. */
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
      // sélecteur suivant
    }
  }
  return [];
}

/**
 * Zone où chercher l'image : la ligne complète (colonnes gauche + droite) si son conteneur ne
 * couvre que cette ligne, sinon la ligne seule (évite de prendre l'image d'un autre produit).
 */
function imageScope(row: Element, rows: Element[]): Element {
  for (const selector of SELECTORS.productRowContainer) {
    try {
      const container = row.closest(selector);
      if (container && !rows.some((other) => other !== row && container.contains(other))) return container;
    } catch {
      // sélecteur suivant
    }
  }
  return row;
}

function extractProduct(row: Element, index: number, rows: Element[]): DetectedProduct {
  const price = firstField(row, SELECTORS.productPrice, (el) => parsePriceFr(text(el)));
  const asin = firstField(row, SELECTORS.productAsin, asinFrom);
  const scope = imageScope(row, rows);
  const readQuantity = (el: Element) => parseQuantity(text(el));
  // Quantité > 1 : badge dans la colonne image, hors de la ligne ; sinon repli sur la zone image.
  let quantity = firstField(row, SELECTORS.productQuantity, readQuantity);
  if (quantity.value === null && scope !== row) quantity = firstField(scope, SELECTORS.productQuantity, readQuantity);
  return {
    key: asin.value ?? `item-${index}`,
    name: firstField(row, SELECTORS.productName, (el) => nonEmpty(cleanText(text(el), NAME_MAX))),
    unitPrice: price.value ? { value: price.value.amount, selector: price.selector } : missing(price.reason),
    currency: price.value ? { value: price.value.currency, selector: price.selector } : missing(price.reason),
    quantity: quantity.value ? quantity : { value: 1, selector: 'default' },
    imageUrl: firstField(scope, SELECTORS.productImage, (el) => {
      const src = el.getAttribute('src') ?? '';
      return src.startsWith('https://') ? src : null;
    }),
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
      // sélecteur suivant
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
    // FR-010 : seuls les champs de DetectedPurchase sont lus — ni adresse, ni paiement.
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
        // sélecteur suivant
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
        // menu indisponible : on garde les liens directs
      }
    }
    return toDocuments(urls, orderNumber);
  },
};
