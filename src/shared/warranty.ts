/**
 * Warranty of an imported object (spec 011): pure functions only. No DOM, storage, network, clock or message
 * catalog: the texts are passed in (interface language). Dates are handled as `YYYY-MM-DD` strings with integer
 * arithmetic, never through a time zone.
 */
import type { EntityUpdate } from '@/background/homebox/types';
import type { PageWarranty, WarrantyDraft } from './types';

const MIN_YEAR = 1900;
const MAX_YEAR = 2200;
const MAX_MONTHS = 1200;
const MAX_DETAILS = 1000;

/** User setting stored under `warrantySettings` (spec 011, data-model.md section 2). */
export interface WarrantySettings {
  v: 1;
  enabled: boolean;
  /** `null`: the legal duration of the country; otherwise an integer from 1 to 10. */
  years: number | null;
}

export const DEFAULT_WARRANTY_SETTINGS: WarrantySettings = { v: 1, enabled: true, years: null };

const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseIso(value: unknown): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/** Real calendar date `YYYY-MM-DD`, year 1900 to 2200. */
export function isValidIsoDate(value: unknown): value is string {
  return parseIso(value) !== null;
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

/**
 * Adds `months` calendar months (integer, 1 to 1200) and caps the day to the last day of the target month
 * (29 February + 2 years = 28 February). Invalid date or duration, or result out of 1900 to 2200: `null`.
 */
export function addMonths(isoDate: string | null, months: number): string | null {
  const parts = parseIso(isoDate);
  if (!parts || typeof months !== 'number' || !Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return null;
  }
  const total = parts.y * 12 + (parts.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  const d = Math.min(parts.d, daysInMonth(y, m));
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/**
 * Legal warranty of conformity, in months, per country of the store. Each line is tied to its official source
 * (specs/011-warranty-fields/legal-sources.md, read on 2026-11-15). Adding a country without a sourced line in
 * that file is forbidden: a country that is not here has no default warranty (frozen by a snapshot test).
 */
export const LEGAL_WARRANTY_MONTHS: Readonly<Record<string, number>> = {
  // France: Code de la consommation, art. L217-3. https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044142579
  FR: 24,
  // Germany: BGB § 438 Abs. 1 Nr. 3. https://www.gesetze-im-internet.de/bgb/__438.html
  DE: 24,
  // Italy: Codice del consumo, art. 133 c.1. https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-09-06;206~art133
  IT: 24,
  // Belgium: ancien Code civil, art. 1649quater § 1er. https://www.ejustice.just.fgov.be/eli/loi/2022/03/20/2022031422/justel
  BE: 24,
  // Spain: RDL 1/2007, art. 120.1. https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555
  ES: 36,
};

/** Legal duration in months for a country of the table; any other code (or `null`): `null`, no default. */
export function legalWarrantyMonths(country: string | null): number | null {
  if (country === null || !Object.hasOwn(LEGAL_WARRANTY_MONTHS, country)) return null;
  return LEGAL_WARRANTY_MONTHS[country] ?? null;
}

/** NFKD, no diacritical marks, lower case, anything that is not a letter or digit becomes a space, spaces collapsed. */
export function normalizeSeller(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Is the seller the store itself? `'any'`: a merchant without marketplace. Otherwise exact equality after
 * normalization (never "contains"); an unknown or empty seller is not the store.
 */
export function isStoreSeller(seller: string | null, ownSellers: readonly string[] | 'any'): boolean {
  if (ownSellers === 'any') return true;
  if (seller === null) return false;
  const normalized = normalizeSeller(seller);
  if (normalized === '') return false;
  return ownSellers.some((own) => normalizeSeller(own) === normalized);
}

export interface WarrantyTexts {
  /** `Garantie légale de conformité (2 ans)`. */
  legal(months: number): string;
  /** `Garantie par défaut (3 ans)`: a duration chosen by the user that differs from the legal one. */
  fallback(months: number): string;
  /** `<detail> ; indiqué sur la page : « <label> »`. */
  withPage(detail: string, pageLabel: string): string;
}

export interface WarrantyInput {
  purchaseDate: string | null;
  /** Country of the store (ISO); `null`: unknown store or manual entry. */
  country: string | null;
  /** Result of `isStoreSeller` on the seller detected for this product (`false` if unknown). */
  sellerIsStore: boolean;
  settings: WarrantySettings;
  pageWarranty: PageWarranty | null;
  texts: WarrantyTexts;
}

/** Why the section is empty: in this order of priority. */
export type NoDefaultReason = 'disabled' | 'country' | 'seller';

export interface WarrantyProposal {
  warranty: WarrantyDraft | null;
  /** Set only when `warranty` is `null`. */
  reason: NoDefaultReason | null;
}

function draftOf(
  origin: WarrantyDraft['origin'],
  purchaseDate: string | null,
  months: number,
  details: string,
): WarrantyDraft {
  return {
    origin,
    expires: addMonths(purchaseDate, months),
    lifetime: false,
    details,
    durationMonths: months,
    edited: false,
  };
}

/** Duration of the default warranty: the user's years, otherwise the legal duration of the country. */
function defaultDuration(settings: WarrantySettings, legal: number): number {
  return settings.years === null ? legal : settings.years * 12;
}

/**
 * Proposed warranty, or an empty section with its reason (research.md R4). The default exists only when the
 * setting is on, the country is in the table and the seller is the store; the longest of default and page wins
 * (a tie goes to the page, a lifetime page beats everything). The setting never removes the page warranty.
 */
export function proposeWarranty(input: WarrantyInput): WarrantyProposal {
  const { purchaseDate, country, sellerIsStore, settings, pageWarranty, texts } = input;
  const legal = legalWarrantyMonths(country);
  const defaultMonths = settings.enabled && sellerIsStore && legal !== null ? defaultDuration(settings, legal) : null;

  if (pageWarranty?.lifetime) {
    return {
      warranty: {
        origin: 'page',
        expires: null,
        lifetime: true,
        details: pageWarranty.label,
        durationMonths: null,
        edited: false,
      },
      reason: null,
    };
  }

  const pageMonths = pageWarranty?.months ?? null;
  if (pageWarranty && pageMonths !== null && (defaultMonths === null || pageMonths >= defaultMonths)) {
    return { warranty: draftOf('page', purchaseDate, pageMonths, pageWarranty.label), reason: null };
  }

  if (defaultMonths !== null) {
    const detail = defaultMonths === legal ? texts.legal(defaultMonths) : texts.fallback(defaultMonths);
    const details = pageWarranty ? texts.withPage(detail, pageWarranty.label) : detail;
    return { warranty: draftOf('legal', purchaseDate, defaultMonths, details), reason: null };
  }

  if (!settings.enabled) return { warranty: null, reason: 'disabled' };
  if (legal === null) return { warranty: null, reason: 'country' };
  return { warranty: null, reason: 'seller' };
}

/** Duration (months) proposed by "Add a warranty": the setting, else the legal duration of the country, else 24. */
export function manualWarrantyMonths(settings: WarrantySettings, country: string | null): number {
  if (settings.years !== null) return settings.years * 12;
  return legalWarrantyMonths(country) ?? 24;
}

/**
 * Recomputes the expiry when the purchase date changes. An edited or lifetime warranty is returned as is
 * (same reference); otherwise `expires` follows the date (`null` when it is absent or invalid).
 */
export function reconcileWarranty(w: WarrantyDraft, purchaseDate: string | null): WarrantyDraft {
  if (w.edited || w.lifetime || w.durationMonths === null) return w;
  const expires = addMonths(purchaseDate, w.durationMonths);
  return expires === w.expires ? w : { ...w, expires };
}

/** HomeBox empty values: absent, `null`, empty string or the zero date. */
const isEmptyHomeBox = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (typeof value === 'string' && value.startsWith('0001-01-01'));

/**
 * Fields to add to the PUT (contracts/homebox-warranty.md). Never a date together with lifetime, never
 * `lifetimeWarranty: false`, and a field already filled on the object is never overwritten.
 */
export function warrantyPatch(
  w: WarrantyDraft | null | undefined,
  existing: { warrantyExpires?: string; warrantyDetails?: string; lifetimeWarranty?: boolean },
): Partial<Pick<EntityUpdate, 'lifetimeWarranty' | 'warrantyExpires' | 'warrantyDetails'>> {
  if (!w) return {};
  const patch: Partial<Pick<EntityUpdate, 'lifetimeWarranty' | 'warrantyExpires' | 'warrantyDetails'>> = {};
  if (w.lifetime) {
    if (existing.lifetimeWarranty !== true) patch.lifetimeWarranty = true;
  } else if (isValidIsoDate(w.expires) && isEmptyHomeBox(existing.warrantyExpires)) {
    patch.warrantyExpires = w.expires;
  }
  const details = w.details.trim();
  if (details !== '' && details.length <= MAX_DETAILS && isEmptyHomeBox(existing.warrantyDetails)) {
    patch.warrantyDetails = details;
  }
  return patch;
}
