/**
 * Reads a warranty out of the text of an order page (spec 011, contracts/extraction-warranty.md). Pure, like
 * `document-labels.ts`: no DOM, no browser API, no network. Amazon does not call it: it is the extension point
 * of the merchants whose order page shows a warranty (opt-in, the selectors live in each merchant module).
 */
import type { PageWarranty } from '@/shared/types';

const LABEL_MAX = 200;
const MAX_MONTHS = 120;

/** Text read on a page, ready to display: no HTML, no control character, one space between words, at most 200 characters. */
export function cleanLabel(text: string): string | null {
  let label = text
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (label.length > LABEL_MAX) {
    label = label.slice(0, LABEL_MAX);
    // Never leave half of a surrogate pair at the cut.
    const last = label.charCodeAt(label.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) label = label.slice(0, -1);
    label = label.trimEnd();
  }
  return label === '' ? null : label;
}

const LIFETIME =
  /garantie\s+(?:[àa]\s+vie|illimit[ée]e)|lifetime\s+warranty|lebenslange\s+garantie|garant[ií]a\s+(?:de\s+por\s+vida|ilimitada|vitalicia)|garanzia\s+a\s+vita|levenslange\s+garantie/i;

const WORD = String.raw`(?:garantie|warranty|garant[ií]a|garanzia)`;
const YEAR_UNIT = String.raw`(?:ans?|ann[ée]es?|years?|jahre[n]?|jahr|a[ñn]os?|anni|anno|jaar|jaren)`;
const MONTH_UNIT = String.raw`(?:mois|months?|monate[n]?|meses|mes|mesi|mese|maanden|maand)`;
const AMOUNT = String.raw`(?<![-\d.,])(\d+(?:[.,]\d+)?)\s*(${YEAR_UNIT}|${MONTH_UNIT})\b`;
const WORD_THEN_AMOUNT = new RegExp(String.raw`${WORD}\D{0,12}?${AMOUNT}`, 'gi');
const AMOUNT_THEN_WORD = new RegExp(String.raw`${AMOUNT}\s*(?:de\s+|of\s+)?${WORD}`, 'gi');
const YEARS = new RegExp(`^${YEAR_UNIT}$`, 'i');

/** `null` when the text does not state exactly one usable duration (1 to 120 months, a whole number). */
function monthsOf(text: string): number | null {
  const found = new Set<string>();
  const amounts: [string, string][] = [];
  for (const re of [WORD_THEN_AMOUNT, AMOUNT_THEN_WORD]) {
    for (const m of text.matchAll(re)) {
      const amount = m[1] ?? '';
      const unit = m[2] ?? '';
      if (found.has(`${amount}|${unit}`)) continue;
      found.add(`${amount}|${unit}`);
      amounts.push([amount, unit]);
    }
  }
  // Two different durations without a rule to add them: ambiguous, not used.
  const only = amounts.length === 1 ? amounts[0] : undefined;
  if (!only) return null;
  const [amount, unit] = only;
  if (!/^\d+$/.test(amount)) return null;
  const months = Number(amount) * (YEARS.test(unit) ? 12 : 1);
  return Number.isInteger(months) && months >= 1 && months <= MAX_MONTHS ? months : null;
}

/** Warranty stated by a text (fr, en, de, es, it, nl), or `null` when it is absent, ambiguous or out of bounds. */
export function parseWarrantyText(text: string): PageWarranty | null {
  const label = cleanLabel(text);
  if (label === null) return null;
  if (LIFETIME.test(label)) return { months: null, lifetime: true, label };
  const months = monthsOf(label);
  return months === null ? null : { months, lifetime: false, label };
}

/**
 * Total of a base warranty and an extension (months added, at most 120). An extension without a base is
 * ambiguous: `null`. The label keeps the extension text so that its mention of an "extension" is visible.
 */
export function combineWarranties(base: PageWarranty | null, extension: PageWarranty | null): PageWarranty | null {
  if (!base || !extension || base.lifetime || extension.lifetime) return null;
  const months = (base.months ?? 0) + (extension.months ?? 0);
  if (months < 1 || months > MAX_MONTHS) return null;
  const label = cleanLabel(`${base.label} + ${extension.label}`);
  return label === null ? null : { months, lifetime: false, label };
}
