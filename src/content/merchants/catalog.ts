/**
 * Reduced view of the merchants for the UI and the service worker, without extraction code
 * (contracts/amazon-stores.md). Pure data.
 */
import type { MerchantId } from '@/shared/merchant-ids';
import { AMAZON_STORES } from './amazon/stores';

export type { MerchantId };

export interface CatalogEntry {
  readonly id: MerchantId;
  readonly displayName: string;
  readonly origin: string;
  readonly status: 'supported' | 'testing';
  /** Currency proposed when the price is not detected (never converted). */
  readonly defaultCurrency: 'EUR' | 'GBP' | 'USD';
  /** ISO 3166-1 alpha-2 country of the store (presentation data: selects the legal warranty, spec 011). */
  readonly country: string;
  /** Names of the seller "the store itself", or `'any'` (no marketplace). */
  readonly ownSellers: readonly string[] | 'any';
}

/** Same order as AMAZON_STORES. */
export const MERCHANT_CATALOG: readonly CatalogEntry[] = AMAZON_STORES.map(
  ({ id, displayName, origin, status, defaultCurrency, country, ownSellers }) => ({
    id,
    displayName,
    origin,
    status,
    defaultCurrency,
    country,
    ownSellers,
  }),
);

/** Entry whose origin is exactly that of the URL; null if the URL is absent, invalid or unknown (never a suffix). */
export function storeForPageUrl(url: string | null): CatalogEntry | null {
  if (!url) return null;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  return MERCHANT_CATALOG.find((e) => e.origin === origin) ?? null;
}
