import type { EntityOut, EntityUpdate } from '@/background/homebox/types';
import { IDENTIFIER_KEYS, type ProductIdentifiers } from '@/shared/identifiers';

/**
 * Spec 027 (contracts/import-identifiers.md, D4): the confirmed manufacturer, model and serial number, each only when
 * the item read (or just created) has no value for it: a value already present is never replaced. No key at all
 * otherwise (never `undefined`), so a draft without identifiers leaves the PUT unchanged. Pure, nothing logged.
 */
export function identifiersPatch(
  ids: ProductIdentifiers | undefined,
  current: EntityOut,
): Partial<EntityUpdate> {
  const patch: Partial<EntityUpdate> = {};
  if (!ids) return patch;
  for (const key of IDENTIFIER_KEYS) {
    const value = ids[key];
    if (value && (current[key] ?? '').trim() === '') patch[key] = value;
  }
  return patch;
}
