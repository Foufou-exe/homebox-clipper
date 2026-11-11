/**
 * Generates the "testing" fixtures of the Amazon stores (research.md, R7) from the ALREADY ANONYMIZED
 * Amazon.fr fixtures only (`tests/fixtures/amazon-fr/real-*.html`). It never reads a raw capture.
 *
 *   bun scripts/fixtures/reconstruct-amazon.ts
 *
 * For each store and page language: sets `<html lang>`, replaces the generic labels (invoice, "sold by",
 * order date) by those of the language, rewrites the fictional dates and prices in the format of the
 * language and the currency of the store (day ≤ 12 to catch a day/month swap, amount ≥ 1000 to catch a
 * factor of 1000), and rewrites the absolute links to the origin of the store.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_LOCALES, type PageLocale } from '../../src/content/merchants/amazon/page-locales';
import {
  AMAZON_STORES,
  type AmazonStore,
  type PageLanguage,
} from '../../src/content/merchants/amazon/stores';

type FixtureLabels = PageLocale['fixtureLabels'];
/** Page languages of the fixtures: the readable ones, plus Turkish for the "unrecognized language" case. */
export type FixtureLanguage = PageLanguage | 'tr';

export interface Variant {
  store: AmazonStore;
  lang: FixtureLanguage;
  htmlLang: string;
  /** Appended to the file names (`reconstructed-order-single-en.html`); empty for the main language. */
  suffix: string;
}

/** Fictional order date of the reconstructed pages: day ≤ 12 and day ≠ month (SC-002). */
export const FICTIONAL_DATE = '2026-11-09';

const SOURCE_DATE = '15 mars 2024';
const SOURCE_ORIGIN = 'https://www.amazon.fr';

/** Turkish page (not readable by the extension): labels and date for the "unknown language" fixture only. */
const TURKISH: FixtureLabels = {
  invoice: 'Fatura',
  soldBy: 'Satıcı:',
  orderedOn: 'Sipariş tarihi',
};

const HTML_LANG: Record<string, string> = {
  'amazon.de:de': 'de-de',
  'amazon.de:en': 'en-gb',
  'amazon.de:tr': 'tr-tr',
  'amazon.es:es': 'es-es',
  'amazon.it:it': 'it-it',
  'amazon.com.be:fr': 'fr-be',
  'amazon.com.be:nl': 'nl-be',
  'amazon.nl:nl': 'nl-nl',
  'amazon.co.uk:en': 'en-gb',
  'amazon.com:en': 'en-us',
};

/** Variants generated per store: main language, plus the language variants of R7 (US1-4, FR-003, FR-004). */
export function variantsOf(store: AmazonStore): Variant[] {
  const langs: FixtureLanguage[] =
    store.id === 'amazon.de'
      ? ['de', 'en', 'tr']
      : store.id === 'amazon.com.be'
        ? ['fr', 'nl']
        : [store.pageLanguages[0] ?? 'en'];
  return langs.map((lang, i) => ({
    store,
    lang,
    htmlLang: HTML_LANG[`${store.id}:${lang}`] ?? `${lang}-${store.country.toLowerCase()}`,
    suffix: i === 0 ? '' : `-${lang}`,
  }));
}

export function setHtmlLang(html: string, htmlLang: string): string {
  return html.replace(/<html lang="[^"]*">/, `<html lang="${htmlLang}">`);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces the Amazon.fr generic labels, only at the start of a text node (never inside a value or attribute). */
export function replaceLabels(html: string, to: FixtureLabels): string {
  const from = PAGE_LOCALES.fr.fixtureLabels;
  let out = html;
  for (const key of ['soldBy', 'orderedOn', 'invoice'] as const) {
    out = out.replace(
      new RegExp(`(>\\s*)${escapeRegExp(from[key])}(?=[\\s<])`, 'g'),
      `$1${to[key]}`,
    );
  }
  return out;
}

const monthName = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** Date as displayed in the language (formats of contracts/page-parsers.md). */
export function formatFixtureDate(
  iso: string,
  lang: FixtureLanguage,
  order: 'DMY' | 'MDY',
): string {
  const [year, , day] = iso.split('-').map(Number);
  const month = monthName(iso, lang);
  switch (lang) {
    case 'de':
      return `${day}. ${month} ${year}`;
    case 'es':
      return `${day} de ${month} de ${year}`;
    case 'en':
      return order === 'MDY' ? `${month} ${day}, ${year}` : `${day} ${month} ${year}`;
    default:
      return `${day} ${month} ${year}`;
  }
}

const NBSP = '\u00a0';
const NNBSP = '\u202f';
const SYMBOL = { EUR: '€', GBP: '£', USD: '$' } as const;

/** Price as displayed in the language, with the currency of the store. */
export function formatFixturePrice(
  amount: number,
  lang: FixtureLanguage,
  currency: 'EUR' | 'GBP' | 'USD',
): string {
  const [int = '0', dec = '00'] = amount.toFixed(2).split('.');
  const group = (sep: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  if (lang === 'en') return `${SYMBOL[currency]}${group(',')}.${dec}`;
  const number = lang === 'fr' ? `${group(NNBSP)},${dec}` : `${group('.')},${dec}`;
  return lang === 'nl'
    ? `${SYMBOL[currency]}${NBSP}${number}`
    : `${number}${NBSP}${SYMBOL[currency]}`;
}

const TURKISH_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export function rewriteDates(html: string, lang: FixtureLanguage, order: 'DMY' | 'MDY'): string {
  const [year, month = 1, day] = FICTIONAL_DATE.split('-').map(Number);
  const date =
    lang === 'tr'
      ? `${day} ${TURKISH_MONTHS[month - 1]} ${year}`
      : formatFixtureDate(FICTIONAL_DATE, lang, order);
  return html.split(SOURCE_DATE).join(date);
}

/** « 11,11 € » → 1111.11, « 22,22 € » → 2222.22: amounts ≥ 1000 (SC-003). */
export function rewritePrices(
  html: string,
  lang: FixtureLanguage,
  currency: 'EUR' | 'GBP' | 'USD',
): string {
  return html.replace(/(\d\d),(\d\d)[ \u00a0]€/g, (_m, int: string, dec: string) =>
    formatFixturePrice(Number(`${int}${int}.${dec}`), lang === 'tr' ? 'de' : lang, currency),
  );
}

export function rewriteOrigin(html: string, origin: string): string {
  return html.split(SOURCE_ORIGIN).join(origin);
}

const labelsOf = (lang: FixtureLanguage): FixtureLabels =>
  lang === 'tr' ? TURKISH : PAGE_LOCALES[lang].fixtureLabels;

/** Turns an anonymized Amazon.fr page into the page of a store in a language. */
export function reconstruct(html: string, v: Variant): string {
  let out = setHtmlLang(html, v.htmlLang);
  out = replaceLabels(out, labelsOf(v.lang));
  out = rewriteDates(out, v.lang, v.store.numericDateOrder);
  out = rewritePrices(out, v.lang, v.store.defaultCurrency);
  out = rewriteOrigin(out, v.store.origin);
  return out.replace(
    /<!-- Fixture anonymisée[^>]*-->/,
    `<!-- Reconstructed fixture (status "testing"): generated by scripts/fixtures/reconstruct-amazon.ts from the anonymized Amazon.fr pages, 100 % fictional content. -->`,
  );
}

/** Removes the "Facture" menu: a single-product order without invoice. */
export function withoutInvoice(html: string): string {
  return html.replace(
    /\s*<div data-component="orderInvoice">[\s\S]*?<\/div>/,
    '\n<div data-component="orderInvoice"></div>',
  );
}

/** "Invoice" menu without PDF (Amazon.com: printable HTML summary only, R2.5). */
export function withoutPdf(html: string): string {
  return html.replace(
    /\s*<li>\s*<span class="a-list-item">\s*<a [^>]*\/documents\/download\/[\s\S]*?<\/li>/g,
    '',
  );
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FR_DIR = resolve(ROOT, 'tests/fixtures/amazon-fr');

/** Files of a store: name → content. */
export function filesFor(
  store: AmazonStore,
  read: (name: string) => string,
): Record<string, string> {
  const files: Record<string, string> = {};
  for (const v of variantsOf(store)) {
    files[`reconstructed-order-single${v.suffix}.html`] = reconstruct(
      withoutInvoice(read('real-order-single.html')),
      v,
    );
    files[`reconstructed-order-multi${v.suffix}.html`] = reconstruct(
      read('real-order-qty.html'),
      v,
    );
    files[`reconstructed-order-invoice${v.suffix}.html`] = reconstruct(
      read('real-order-single.html'),
      v,
    );
  }
  const [main] = variantsOf(store);
  if (main) {
    const popover = reconstruct(read('real-invoice-popover-single.html'), main);
    files['reconstructed-invoice-popover.html'] =
      store.id === 'amazon.com' ? withoutPdf(popover) : popover;
  }
  return files;
}

function main(): void {
  const read = (name: string) => readFileSync(resolve(FR_DIR, name), 'utf8');
  for (const store of AMAZON_STORES.filter((s) => s.id !== 'amazon.fr')) {
    const dir = resolve(ROOT, 'tests/fixtures', store.fixturesDir);
    mkdirSync(dir, { recursive: true });
    const files = filesFor(store, read);
    for (const [name, content] of Object.entries(files)) writeFileSync(resolve(dir, name), content);
    console.log(`${store.fixturesDir}: ${Object.keys(files).length} files`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
