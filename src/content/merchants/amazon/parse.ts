/**
 * Pure parsers for the values displayed by the Amazon stores (contracts/page-parsers.md). No DOM access
 * (except resolvePageLanguage, which reads one attribute), no network, no log. They never throw: an
 * unrecognized input gives `null`.
 */
import { PAGE_LOCALES } from './page-locales';
import type { AmazonStore, PageLanguage } from './stores';

const SPACES = /[\s\u00a0\u202f\u2009]+/g;
const NAME_MAX = 255;

export function cleanText(input: string, maxLength = Infinity): string {
  return input.replace(SPACES, ' ').trim().slice(0, maxLength);
}

/** Currencies displayed by the supported stores (CHF is not: « CHF 1'299.00 » would be misread). */
const CURRENCIES: [RegExp, string][] = [
  [/€|\bEUR\b/i, 'EUR'],
  [/US\$|\$|\bUSD\b/i, 'USD'],
  [/£|\bGBP\b/i, 'GBP'],
];

/** Thousands separator of a page language: the other one than its decimal separator. */
const thousandsOf = (lang: PageLanguage): ',' | '.' => (PAGE_LOCALES[lang].decimalSeparator === ',' ? '.' : ',');

/** « 1.299,99 » / « 1,299.99 »: both separators present, the last one is the decimal separator. */
function normalizeBothSeparators(raw: string): string {
  const decimal = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
  const thousands = decimal === ',' ? '.' : ',';
  return raw.split(thousands).join('').replace(decimal, '.');
}

/**
 * A single kind of separator: followed by 1 or 2 digits it is decimal, whatever the language (Amazon
 * displays two decimals); followed by groups of 3 digits it is a thousands separator only if it is the one
 * of the language (the only ambiguous case); otherwise `null`.
 */
function normalizeSingleSeparator(raw: string, sep: ',' | '.', lang: PageLanguage | 'unknown'): string | null {
  const parts = raw.split(sep);
  if (parts.length === 2 && /^\d{1,2}$/.test(parts[1] ?? '')) return `${parts[0]}.${parts[1]}`;
  const grouped = /^\d{1,3}$/.test(parts[0] ?? '') && parts.slice(1).every((p) => /^\d{3}$/.test(p));
  if (!grouped || lang === 'unknown' || sep !== thousandsOf(lang)) return null;
  return parts.join('');
}

/** Number of a price with `.` as decimal separator, or `null` if its separators are ambiguous. */
function normalizeNumber(raw: string, lang: PageLanguage | 'unknown'): string | null {
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  if (hasComma && hasDot) return normalizeBothSeparators(raw);
  if (hasComma || hasDot) return normalizeSingleSeparator(raw, hasComma ? ',' : '.', lang);
  return raw;
}

/**
 * Amount of a price according to the language of the page (contracts/page-parsers.md, R2.3):
 * « 1 299,99 € » (fr), « 1.299,99 € » (de), « £1,299.99 » (en) → { amount: 1299.99, currency }.
 * Without a recognized currency, or in the only ambiguous case (a single separator followed by groups of
 * 3 digits that is not the thousands separator of the language), the answer is `null`: never a value off
 * by a factor of 1000 (SC-003).
 */
export function parsePrice(input: string, lang: PageLanguage | 'unknown'): { amount: number; currency: string } | null {
  const currency = CURRENCIES.find(([re]) => re.test(input.replace(SPACES, ' ')))?.[1];
  const match = /\d[\d.,]*/.exec(input.replace(SPACES, ''));
  if (!currency || !match) return null;
  const raw = normalizeNumber(match[0].replace(/[.,]$/, ''), lang);
  if (raw === null) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return { amount: Math.round(amount * 100) / 100, currency };
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** « 9 novembre 2026 », « 1er févr. 2026 », « 9. November 2026 », « 9 de noviembre de 2026 ». */
const DAY_MONTH_YEAR = /(\d{1,2})(?:er)?\.?\s+(?:de\s+)?([a-z]+)\.?\s+(?:de\s+)?(\d{4})/;
/** « November 9, 2026 » (English). */
const MONTH_DAY_YEAR = /\b([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/;
/** « 09/11/2026 », « 9.11.2026 », « 9-11-2026 ». */
const NUMERIC = /(?<![\d./-])(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?![\d./-])/;

/**
 * Order date in the language of the page (contracts/page-parsers.md, R2.2) → "YYYY-MM-DD", or `null`.
 * Textual date first, with the month table of the language only; otherwise a numeric date read in the
 * order of the store, never in the other order (SC-002). The year is required.
 */
export function parseOrderDate(input: string, lang: PageLanguage, numericOrder: 'DMY' | 'MDY'): string | null {
  const locale = PAGE_LOCALES[lang];
  const text = stripAccents(input.replace(SPACES, ' ')).toLowerCase();

  const dmy = locale.dayMonthYear ? DAY_MONTH_YEAR.exec(text) : null;
  if (dmy) {
    const month = locale.months[dmy[2] ?? ''];
    if (month) return isoDate(Number(dmy[3]), month, Number(dmy[1]));
  }
  const mdy = locale.monthDayYear ? MONTH_DAY_YEAR.exec(text) : null;
  if (mdy) {
    const month = locale.months[mdy[1] ?? ''];
    if (month) return isoDate(Number(mdy[3]), month, Number(mdy[2]));
  }
  if (dmy || mdy) return null;

  const numeric = NUMERIC.exec(text);
  if (!numeric) return null;
  const [first, second, year] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
  return numericOrder === 'MDY' ? isoDate(year, first, second) : isoDate(year, second, first);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SELLER_PATTERNS = new Map<PageLanguage, RegExp>();

function sellerPattern(lang: PageLanguage): RegExp {
  let re = SELLER_PATTERNS.get(lang);
  if (!re) {
    // cleanText leaves at most one space between words, so ` ?` is equivalent to `\s*` and cannot backtrack.
    re = new RegExp(`(?:${PAGE_LOCALES[lang].sellerLabels.map(escapeRegExp).join('|')}) ?:? ?(.+)$`, 'i');
    SELLER_PATTERNS.set(lang, re);
  }
  return re;
}

/** « Verkauf durch: Vendeur Fictif » (de) → "Vendeur Fictif"; `null` without a label of the page language. */
export function parseSeller(input: string, lang: PageLanguage | 'unknown'): string | null {
  if (lang === 'unknown') return null;
  const match = sellerPattern(lang).exec(cleanText(input));
  return match?.[1] ? cleanText(match[1], NAME_MAX) : null;
}

/**
 * Language of the page from `<html lang>` (R2.1): its base language if the store reads it, `'unknown'` if
 * the page is in another language (language-dependent fields are then absent), `null` without the attribute
 * (the caller tries the store languages in order).
 */
export function resolvePageLanguage(doc: Document, store: AmazonStore): PageLanguage | 'unknown' | null {
  const raw = (doc.documentElement?.getAttribute('lang') ?? '').trim();
  if (raw === '') return null;
  const base = raw.split(/[-_]/)[0]?.toLowerCase() ?? '';
  return store.pageLanguages.find((l) => l === base) ?? 'unknown';
}

/** Physical (123-1234567-1234567) or digital (D01-…) order number. */
export function parseOrderNumber(input: string): string | null {
  return /(?<![\d-])(?:\d{3}|D\d{2})-\d{7}-\d{7}(?![\d-])/.exec(input)?.[0] ?? null;
}

export function parseQuantity(input: string): number | null {
  const n = Number(/\d+/.exec(input)?.[0]);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

const SIZE_TOKEN = /^(https:\/\/[^/]+\/images\/I\/[^/.]+)\._[^/]*_\.([a-z0-9]+)$/;

/**
 * Replaces the size token of an Amazon image URL with `_SL1000_` (long side of 1000 px at most, R7).
 * Without a token, the URL is returned as is.
 */
export function toPhotoUrl(src: string): string {
  return src.replace(SIZE_TOKEN, '$1._SL1000_.$2');
}
