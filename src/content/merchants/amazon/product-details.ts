import { cleanIdentifier, identifierTooLong } from '@/shared/identifiers';
import type { DetectedProduct, Field } from '@/shared/types';
import { PAGE_LOCALES } from './page-locales';
import { SELECTORS } from './selectors';

/*
 * Spec 027 (contracts/product-page.md): manufacturer and model read on the Amazon product page of each product of the
 * order. Runs in the injected script, on the origin of the order page only; no key, no HomeBox data, nothing logged.
 */

export const MAX_PRODUCT_PAGES = 10;
export const PRODUCT_PAGE_CONCURRENCY = 3;
export const PRODUCT_PAGE_TIMEOUT_MS = 8000;
/** Total time of the product page lookup of one order: the extraction answer (documents) never waits longer. */
export const PRODUCT_LOOKUP_BUDGET_MS = 10_000;
/** Declared size and bytes actually read (streamed, cancelled beyond): 5 MB at most. */
export const MAX_PRODUCT_PAGE_BYTES = 5_000_000;

const ASIN = /^[A-Z0-9]{10}$/;
const DIACRITICS = /[\u0300-\u036f]/g;
const APOSTROPHES = /[\u2018\u2019\u02bc]/g;

export interface PageIdentifiers {
  manufacturer: Field<string>;
  modelNumber: Field<string>;
}

const notFound = (): Field<string> => ({ value: null, reason: 'not_found' });

/** Comparable form of a label: invisible marks, final colons, case, accents and typographic apostrophes ignored. */
export function labelKey(raw: string): string {
  let s = cleanIdentifier(raw);
  while (s.endsWith(':')) s = s.slice(0, -1).trimEnd();
  return s.normalize('NFD').replace(DIACRITICS, '').replace(APOSTROPHES, "'").toLowerCase();
}

/** Labels of every language, in priority order within each language (the page language may differ from the order's). */
function labelsOf(kind: 'manufacturer' | 'modelNumber'): string[] {
  return Object.values(PAGE_LOCALES).flatMap((l) => l.productDetailLabels[kind].map(labelKey));
}
const MANUFACTURER_LABELS = labelsOf('manufacturer');
const MODEL_LABELS = labelsOf('modelNumber');

function firstIn(root: Element, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    try {
      const el = root.querySelector(selector);
      if (el) return el;
    } catch {
      // next selector
    }
  }
  return null;
}

/** Label → raw value of the detail rows; the first value of a label wins, in the order of the selectors. */
function detailValues(doc: Document): Map<string, string> {
  const values = new Map<string, string>();
  for (const selector of SELECTORS.productDetailRow) {
    let rows: Element[];
    try {
      rows = Array.from(doc.querySelectorAll(selector));
    } catch {
      continue;
    }
    for (const row of rows) {
      const label = firstIn(row, SELECTORS.productDetailLabel);
      const value = firstIn(row, SELECTORS.productDetailValue);
      if (!label || !value) continue;
      const key = labelKey(label.textContent ?? '');
      if (key !== '' && !values.has(key)) values.set(key, value.textContent ?? '');
    }
  }
  return values;
}

/** First usable value of the labels, in order; a label found with an empty or too long value is `unparsable`. */
function identifierField(values: Map<string, string>, labels: readonly string[]): Field<string> {
  let found = false;
  for (const label of labels) {
    const raw = values.get(label);
    if (raw === undefined) continue;
    const value = cleanIdentifier(raw);
    if (value !== '' && !identifierTooLong(value))
      return { value, selector: `productDetail:${label}` };
    found = true;
  }
  return found ? { value: null, reason: 'unparsable' } : notFound();
}

/** Pure reading of a product page document. Never throws. */
export function readProductIdentifiers(doc: Document): PageIdentifiers {
  const values = detailValues(doc);
  return {
    manufacturer: identifierField(values, MANUFACTURER_LABELS),
    modelNumber: identifierField(values, MODEL_LABELS),
  };
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** FR-002: `ok`, final address on the same origin, HTML (or undeclared), declared size within bounds. */
function acceptable(res: Response, origin: string): boolean {
  if (!res.ok) return false;
  if (res.url !== '' && !sameOrigin(res.url, origin)) return false;
  const type = (res.headers.get('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (type !== '' && type !== 'text/html') return false;
  return Number(res.headers.get('Content-Length') ?? 0) <= MAX_PRODUCT_PAGE_BYTES;
}

/**
 * Body read as a stream, bytes counted: beyond `MAX_PRODUCT_PAGE_BYTES` the read is cancelled and the request aborted
 * (`null`), whatever `Content-Length` said (chunked answers have none). Decoded as UTF-8.
 */
async function readCapped(res: Response, controller: AbortController): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read(); // NOSONAR: a stream is read chunk after chunk
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PRODUCT_PAGE_BYTES) {
      controller.abort();
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * One product page, without cookie nor referrer, abandoned after its time limit or when `stop` aborts (total budget).
 * `null`: the page was not read (failure of any kind); the product then carries no identifier field at all.
 */
async function readProductPage(
  url: string,
  origin: string,
  fetchImpl: typeof fetch,
  stop: AbortSignal,
): Promise<PageIdentifiers | null> {
  if (stop.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, PRODUCT_PAGE_TIMEOUT_MS);
  stop.addEventListener('abort', abort);
  try {
    const res = await fetchImpl(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!acceptable(res, origin)) return null;
    const html = await readCapped(res, controller);
    if (html === null) return null;
    return readProductIdentifiers(new DOMParser().parseFromString(html, 'text/html'));
  } catch {
    // network, abort, unreadable body: no value (FR-006)
    return null;
  } finally {
    clearTimeout(timer);
    stop.removeEventListener('abort', abort);
  }
}

/**
 * Reads the product page of each product with an ASIN (distinct ASINs, `MAX_PRODUCT_PAGES` at most,
 * `PRODUCT_PAGE_CONCURRENCY` at a time) on `origin`, within `PRODUCT_LOOKUP_BUDGET_MS` in total, and returns the
 * products with `manufacturer` and `modelNumber` for each page actually read (`not_found` there means: read, no such
 * row). A product whose page was not read (no ASIN, beyond the limit, failure, budget exceeded) is returned unchanged,
 * without these fields. Never throws.
 */
export async function lookUpProductIdentifiers(
  products: readonly DetectedProduct[],
  origin: string,
  fetchImpl: typeof fetch,
): Promise<DetectedProduct[]> {
  const asins = [...new Set(products.map((p) => p.key).filter((k) => ASIN.test(k)))].slice(
    0,
    MAX_PRODUCT_PAGES,
  );
  const results = new Map<string, PageIdentifiers>();
  const stop = new AbortController();
  let next = 0;
  const worker = async () => {
    while (next < asins.length && !stop.signal.aborted) {
      const asin = asins[next] ?? '';
      next += 1;
      // Sequential per worker on purpose: bounded concurrency towards the merchant.
      const read = await readProductPage(`${origin}/dp/${asin}`, origin, fetchImpl, stop.signal); // NOSONAR
      if (read && !stop.signal.aborted) results.set(asin, read);
    }
  };
  let budget: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    budget = setTimeout(() => {
      stop.abort();
      resolve();
    }, PRODUCT_LOOKUP_BUDGET_MS);
  });
  const workers = Array.from({ length: Math.min(PRODUCT_PAGE_CONCURRENCY, asins.length) }, () =>
    worker(),
  );
  await Promise.race([Promise.all(workers), deadline]);
  clearTimeout(budget);
  stop.abort();
  return products.map((p) => {
    const read = results.get(p.key);
    return read ? { ...p, ...read } : { ...p };
  });
}
