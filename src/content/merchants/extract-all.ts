import type { DetectedPurchase } from '@/shared/types';
import type { MerchantExtractor } from './types';

/**
 * Extraction run by the injected script (`amazon/extract`): the page itself, then, in parallel, the documents
 * (invoice menus) and, for a merchant that offers it, the product pages (spec 027). Each lookup falls back to what the
 * page gave on failure; never throws.
 */
export async function extractWithLookups(
  merchant: MerchantExtractor,
  doc: Document,
  pageUrl: URL,
  fetchSameOrigin: typeof fetch,
): Promise<DetectedPurchase> {
  const purchase = merchant.extract(doc, pageUrl);
  const documents = merchant.resolveDocuments(doc, pageUrl, fetchSameOrigin).catch(() => purchase.documents);
  const products = merchant.resolveProductIdentifiers
    ? merchant.resolveProductIdentifiers(purchase.products, fetchSameOrigin).catch(() => purchase.products)
    : Promise.resolve(purchase.products);
  const [docs, prods] = await Promise.all([documents, products]);
  return { ...purchase, documents: docs, products: prods };
}
