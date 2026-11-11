import { createAmazonExtractor } from './amazon/extractor';
import { AMAZON_STORES } from './amazon/stores';
import type { MerchantExtractor } from './types';

/** Registry of merchant extractors: one per Amazon store. Any addition must also appear in MERCHANTS.md. */
export const MERCHANTS: readonly MerchantExtractor[] = AMAZON_STORES.map(createAmazonExtractor);
