/**
 * Table of the Amazon stores (contracts/amazon-stores.md). Pure data: only the shared identifier type is
 * imported; no DOM, network or storage access. One extractor is created per store (registry.ts).
 *
 * `status`: `supported` requires at least one anonymized `real-*.html` fixture in
 * `tests/fixtures/<fixturesDir>/` (FR-014, tested); a store checked on reconstructed pages only stays `testing`.
 */

import type { AmazonStoreId } from '@/shared/merchant-ids';

/** Languages of the Amazon pages that can be read (page-locales.ts). */
export type PageLanguage = 'fr' | 'de' | 'es' | 'it' | 'nl' | 'en';

export type { AmazonStoreId };

export interface AmazonStore {
  /** Host name without `www.`; never renamed (persisted in `DraftPhoto.merchantId`). */
  readonly id: AmazonStoreId;
  /** `https:` origin, without path, port or trailing slash. */
  readonly origin: string;
  /** Name shown in the interface and in the texts sent to HomeBox. */
  readonly displayName: string;
  /** ISO 3166-1 alpha-2. */
  readonly country: string;
  /** Recognized page languages; the first one is the main language. */
  readonly pageLanguages: readonly PageLanguage[];
  readonly defaultCurrency: 'EUR' | 'GBP' | 'USD';
  /** Order of a numeric date (`09/11/2026`): `MDY` for Amazon.com only. */
  readonly numericDateOrder: 'DMY' | 'MDY';
  /** Exact host names allowed for the product photo. */
  readonly imageHosts: readonly string[];
  readonly status: 'supported' | 'testing';
  /** Folder under `tests/fixtures/` (tests only). */
  readonly fixturesDir: string;
}

/** Only image host observed on order pages (003, V7); to confirm on real pages for the other stores. */
const IMAGE_HOSTS = ['m.media-amazon.com'] as const;

const AMAZON_FR: AmazonStore = {
  id: 'amazon.fr',
  origin: 'https://www.amazon.fr',
  displayName: 'Amazon.fr',
  country: 'FR',
  pageLanguages: ['fr'],
  defaultCurrency: 'EUR',
  numericDateOrder: 'DMY',
  imageHosts: IMAGE_HOSTS,
  status: 'supported',
  fixturesDir: 'amazon-fr',
};

export const AMAZON_STORES: readonly AmazonStore[] = [
  AMAZON_FR,
  {
    id: 'amazon.de',
    origin: 'https://www.amazon.de',
    displayName: 'Amazon.de',
    country: 'DE',
    pageLanguages: ['de', 'en'],
    defaultCurrency: 'EUR',
    numericDateOrder: 'DMY',
    imageHosts: IMAGE_HOSTS,
    status: 'testing',
    fixturesDir: 'amazon-de',
  },
  {
    id: 'amazon.es',
    origin: 'https://www.amazon.es',
    displayName: 'Amazon.es',
    country: 'ES',
    pageLanguages: ['es', 'en'],
    defaultCurrency: 'EUR',
    numericDateOrder: 'DMY',
    imageHosts: IMAGE_HOSTS,
    status: 'testing',
    fixturesDir: 'amazon-es',
  },
  {
    id: 'amazon.it',
    origin: 'https://www.amazon.it',
    displayName: 'Amazon.it',
    country: 'IT',
    pageLanguages: ['it', 'en'],
    defaultCurrency: 'EUR',
    numericDateOrder: 'DMY',
    imageHosts: IMAGE_HOSTS,
    status: 'testing',
    fixturesDir: 'amazon-it',
  },
  {
    id: 'amazon.com.be',
    origin: 'https://www.amazon.com.be',
    displayName: 'Amazon.com.be',
    country: 'BE',
    pageLanguages: ['fr', 'nl', 'en'],
    defaultCurrency: 'EUR',
    numericDateOrder: 'DMY',
    imageHosts: IMAGE_HOSTS,
    status: 'testing',
    fixturesDir: 'amazon-com-be',
  },
  {
    id: 'amazon.nl',
    origin: 'https://www.amazon.nl',
    displayName: 'Amazon.nl',
    country: 'NL',
    pageLanguages: ['nl', 'en'],
    defaultCurrency: 'EUR',
    numericDateOrder: 'DMY',
    imageHosts: IMAGE_HOSTS,
    status: 'testing',
    fixturesDir: 'amazon-nl',
  },
  {
    id: 'amazon.co.uk',
    origin: 'https://www.amazon.co.uk',
    displayName: 'Amazon.co.uk',
    country: 'GB',
    pageLanguages: ['en'],
    defaultCurrency: 'GBP',
    numericDateOrder: 'DMY',
    imageHosts: IMAGE_HOSTS,
    status: 'testing',
    fixturesDir: 'amazon-co-uk',
  },
  {
    id: 'amazon.com',
    origin: 'https://www.amazon.com',
    displayName: 'Amazon.com',
    country: 'US',
    pageLanguages: ['en'],
    defaultCurrency: 'USD',
    numericDateOrder: 'MDY',
    imageHosts: IMAGE_HOSTS,
    status: 'testing',
    fixturesDir: 'amazon-com',
  },
];
