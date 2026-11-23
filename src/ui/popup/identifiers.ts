import {
  cleanIdentifier,
  identifierTooLong,
  type IdentifierKey,
  type ProductIdentifiers,
} from '@/shared/identifiers';
import type { DetectedProduct } from '@/shared/types';

/*
 * Product identifiers in the summary (spec 027, contracts/ui.md). Pure functions; the state lives in the popup only and
 * is never logged nor persisted.
 */

export interface LineIdentifiers {
  manufacturer: string;
  modelNumber: string;
  /** Never read on a page: always empty at opening (user decision). */
  serialNumber: string;
  /** The product page was looked up and gave neither value: discreet mention only (FR-008). */
  notFound: boolean;
}

/** Values pre-filled from the product page (empty without one); the serial number is always empty. */
export function lineIdentifiersFor(product: DetectedProduct | null): LineIdentifiers {
  const manufacturer = product?.manufacturer?.value ?? '';
  const modelNumber = product?.modelNumber?.value ?? '';
  const lookedUp = product?.manufacturer !== undefined || product?.modelNumber !== undefined;
  return {
    manufacturer,
    modelNumber,
    serialNumber: '',
    notFound: lookedUp && manufacturer === '' && modelNumber === '',
  };
}

/** Keys among `keys` whose cleaned value exceeds 255 UTF-8 bytes (shown under the field, confirmation blocked). */
export function tooLongKeys(
  ids: LineIdentifiers,
  keys: ReadonlySet<IdentifierKey>,
): IdentifierKey[] {
  return [...keys].filter((k) => identifierTooLong(cleanIdentifier(ids[k])));
}

/**
 * `identifiers` of the draft (FR-009): the cleaned, non-empty values of `keys` only; no key at all without any.
 * With a template, pass `TEMPLATE_IDENTIFIER_KEYS` (D3).
 */
export function identifiersDraft(
  ids: LineIdentifiers,
  keys: ReadonlySet<IdentifierKey>,
): { identifiers?: ProductIdentifiers } {
  const out: ProductIdentifiers = {};
  for (const key of keys) {
    const value = cleanIdentifier(ids[key]);
    if (value !== '') out[key] = value;
  }
  return Object.keys(out).length ? { identifiers: out } : {};
}

/** D3: the manufacturer and model of a template, filled with the line's values only where the template has none. */
export function prefillTemplateValues<T extends { manufacturer: string; modelNumber: string }>(
  values: T,
  ids: LineIdentifiers,
): T {
  return {
    ...values,
    manufacturer:
      values.manufacturer === '' ? cleanIdentifier(ids.manufacturer) : values.manufacturer,
    modelNumber: values.modelNumber === '' ? cleanIdentifier(ids.modelNumber) : values.modelNumber,
  };
}
