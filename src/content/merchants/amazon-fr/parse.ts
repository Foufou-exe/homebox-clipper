/** Parseurs purs pour les valeurs affichées par Amazon.fr (R6, R7). Sans accès au DOM. */

const SPACES = /[\s\u00a0\u202f\u2009]+/g;

export function cleanText(input: string, maxLength = Infinity): string {
  return input.replace(SPACES, ' ').trim().slice(0, maxLength);
}

const CURRENCIES: [RegExp, string][] = [
  [/€|\bEUR\b/i, 'EUR'],
  [/US\$|\$|\bUSD\b/i, 'USD'],
  [/£|\bGBP\b/i, 'GBP'],
  [/\bCHF\b/i, 'CHF'],
];

/** « 1 299,99 € » → { amount: 1299.99, currency: "EUR" } */
export function parsePriceFr(input: string): { amount: number; currency: string } | null {
  const text = input.replace(SPACES, '');
  const spaced = input.replace(SPACES, ' ');
  const currency = CURRENCIES.find(([re]) => re.test(spaced))?.[1];
  const match = text.match(/\d[\d.,]*/);
  if (!currency || !match) return null;

  let raw = match[0].replace(/[.,]$/, '');
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    raw = raw.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    raw = raw.replace(/,/g, '.');
  } else if (lastDot >= 0 && /\.\d{3}$/.test(raw) && currency === 'EUR') {
    raw = raw.replace(/\./g, '');
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return { amount: Math.round(amount * 100) / 100, currency };
}

const MONTHS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1,
  fevrier: 2, fevr: 2, fev: 2,
  mars: 3,
  avril: 4, avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7, juil: 7,
  aout: 8,
  septembre: 9, sept: 9, sep: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  decembre: 12, dec: 12,
};

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** « 22 octobre 2026 », « 1er févr. 2026 » → « 2026-10-22 » */
export function parseDateFr(input: string): string | null {
  const text = stripAccents(input.replace(SPACES, ' ')).toLowerCase();
  const match = text.match(/(\d{1,2})(?:er)?\s+([a-z]+)\.?\s+(\d{4})/);
  if (!match) return null;
  const [, d, m, y] = match;
  const month = MONTHS[m ?? ''];
  const day = Number(d);
  const year = Number(y);
  if (!month) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Numéro de commande physique (123-1234567-1234567) ou numérique (D01-…). */
export function parseOrderNumber(input: string): string | null {
  return input.match(/(?<![\d-])(?:\d{3}|D\d{2})-\d{7}-\d{7}(?![\d-])/)?.[0] ?? null;
}

export function parseQuantity(input: string): number | null {
  const n = Number(input.match(/\d+/)?.[0]);
  return Number.isInteger(n) && n >= 1 ? n : null;
}
