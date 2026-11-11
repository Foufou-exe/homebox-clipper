/**
 * Identifiers of the merchants (one per Amazon store), shared by the contracts (`DetectedPurchase.source`,
 * `DraftPhoto.merchantId`) and the merchant modules. Never renamed: persisted in `DraftPhoto.merchantId`.
 */
export type AmazonStoreId =
  | 'amazon.fr'
  | 'amazon.de'
  | 'amazon.es'
  | 'amazon.it'
  | 'amazon.com.be'
  | 'amazon.nl'
  | 'amazon.co.uk'
  | 'amazon.com';

export type MerchantId = AmazonStoreId;
