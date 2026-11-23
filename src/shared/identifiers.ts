import { utf8ByteLength } from './utf8';

/**
 * Product identifiers (spec 027, data-model §1): manufacturer and model read on the merchant's product page, serial
 * number typed by the user. Pure functions: no DOM, no network, nothing logged (the values are user data).
 */
export const IDENTIFIER_KEYS = ['manufacturer', 'modelNumber', 'serialNumber'] as const;
export type IdentifierKey = (typeof IDENTIFIER_KEYS)[number];
export type ProductIdentifiers = Partial<Record<IdentifierKey, string>>;

/** HomeBox `MaxLen(255)` on the three properties; ent compares bytes (research R5). */
export const MAX_IDENTIFIER_BYTES = 255;

/** Zero-width, soft hyphen and bidirectional marks Amazon inserts around labels and values (research R4). */
const INVISIBLE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const SPACES = /\s+/g;

/** Invisible characters removed, spaces (no-break ones included) collapsed, edges trimmed. */
export function cleanIdentifier(raw: string): string {
  return raw.replace(INVISIBLE, '').replace(SPACES, ' ').trim();
}

export function identifierTooLong(value: string): boolean {
  return utf8ByteLength(value) > MAX_IDENTIFIER_BYTES;
}

/** Keys a draft may carry: all three, or the serial number only with a template (D3). */
export const ALL_IDENTIFIER_KEYS: ReadonlySet<IdentifierKey> = new Set(IDENTIFIER_KEYS);
export const TEMPLATE_IDENTIFIER_KEYS: ReadonlySet<IdentifierKey> = new Set<IdentifierKey>([
  'serialNumber',
]);

const isCleanValue = (v: unknown): boolean =>
  typeof v === 'string' && v !== '' && v === cleanIdentifier(v) && !identifierTooLong(v);

/**
 * `ImportDraft.identifiers`: a non-empty object of `allowed` keys with clean, bounded values. With a template, the
 * manufacturer and model belong to the template section (D3): pass `TEMPLATE_IDENTIFIER_KEYS`.
 */
export function isProductIdentifiers(
  x: unknown,
  allowed: ReadonlySet<string> = ALL_IDENTIFIER_KEYS,
): boolean {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const entries = Object.entries(x);
  if (entries.length === 0) return false;
  return entries.every(([k, v]) => allowed.has(k) && isCleanValue(v));
}
