import type { DetectedPurchase, DocumentRef } from '@/shared/types';

/** Contract of a merchant extractor (contracts/merchant-extractor.md). */
export interface MerchantExtractor {
  id: DetectedPurchase['source'];
  /** Supported host names (used to keep MERCHANTS.md consistent with the code). */
  domains: readonly string[];
  /**
   * Exact hosts allowed for the product photo. Required: every merchant must declare one.
   * An empty list means "this merchant provides no photo".
   */
  imageHosts: readonly string[];
  /** True if the URL belongs to this merchant (tested before any injection). */
  matchesUrl(url: URL): boolean;
  /** True if the document is an order detail page. */
  isOrderPage(doc: Document): boolean;
  /** Pure extraction, with no network access or side effect. Never throws. */
  extract(doc: Document, pageUrl: URL): DetectedPurchase;
  /** Resolves the real PDF URLs (e.g. the "Facture" menu). Same origin only. */
  resolveDocuments(doc: Document, pageUrl: URL, fetchSameOrigin: typeof fetch): Promise<DocumentRef[]>;
}
