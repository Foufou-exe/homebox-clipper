import { MERCHANT_CATALOG } from '@/content/merchants/catalog';
import { formatDate, t } from '@/ui/i18n';
import type { DetectedProduct, DetectedPurchase, ImportDraft, WarrantyDraft } from '@/shared/types';
import {
  DEFAULT_WARRANTY_SETTINGS,
  isStoreSeller,
  isValidIsoDate,
  proposeWarranty,
  type WarrantyProposal,
  type WarrantySettings,
  type WarrantyTexts,
} from '@/shared/warranty';

export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return t('common.sizeBytes', [String(bytes)]);
  if (bytes < 1024 * 1024) return t('common.sizeKb', [String(Math.round(bytes / 1024))]);
  return t('common.sizeMb', [(bytes / 1024 / 1024).toFixed(1)]);
}

/** Description of the item: the store of origin and the purchase date in the interface language (FR-007). */
export function defaultDescription(purchaseDate: string | null, storeName: string): string {
  return purchaseDate
    ? t('summary.defaultDescription', [storeName, formatDate(purchaseDate)])
    : t('summary.defaultDescriptionNoDate', [storeName]);
}

export function emptyDraft(): ImportDraft {
  return {
    name: '',
    description: '',
    purchasePrice: null,
    currency: 'EUR',
    purchaseDate: null,
    purchaseFrom: '',
    orderNumber: null,
    quantity: 1,
    pageUrl: null,
    documents: [],
    photo: null,
    location: null,
    warranty: null,
  };
}

/** Context of the drafts: the warranty setting, read when the popup opens (spec 011). Optional everywhere. */
export interface DraftContext {
  settings: WarrantySettings;
}

/** Duration shown in the default details: always a whole number of years (24, 36, `years x 12`). */
function yearsLabel(months: number): string {
  const years = Math.round(months / 12);
  return years === 1 ? t('warranty.duration.one') : t('warranty.duration.other', [String(years)]);
}

/** Texts of the proposed warranty, in the interface language (FR-009). */
export function warrantyTexts(): WarrantyTexts {
  return {
    legal: (months) => t('warranty.detail.legal', [yearsLabel(months)]),
    fallback: (months) => t('warranty.detail.fallback', [yearsLabel(months)]),
    withPage: (detail, pageLabel) => t('warranty.detail.withPage', [detail, pageLabel]),
  };
}

/** Store of a detected purchase: `source` is always set by its extractor. */
function storeOf(purchase: DetectedPurchase) {
  return MERCHANT_CATALOG.find((e) => e.id === purchase.source);
}

/**
 * Warranty proposed for a product, with the reason of an empty section. The reason stays next to the draft
 * (never inside it, never sent nor persisted).
 */
export function proposalFor(
  purchase: DetectedPurchase,
  product: DetectedProduct | null,
  ctx?: DraftContext,
): WarrantyProposal {
  const store = storeOf(purchase);
  return proposeWarranty({
    purchaseDate: purchase.orderDate.value,
    country: store?.country ?? null,
    sellerIsStore: isStoreSeller(product?.seller?.value ?? null, store?.ownSellers ?? []),
    settings: ctx?.settings ?? DEFAULT_WARRANTY_SETTINGS,
    pageWarranty: product?.pageWarranty?.value ?? null,
    texts: warrantyTexts(),
  });
}

/** Editable draft pre-filled with the detected values (or empty if not detected). */
export function draftFrom(purchase: DetectedPurchase, product: DetectedProduct | null, ctx?: DraftContext): ImportDraft {
  const date = purchase.orderDate.value;
  const imageUrl = product?.imageUrl.value ?? null;
  const store = storeOf(purchase);
  const storeName = store?.displayName ?? purchase.source;
  return {
    name: product?.name.value ?? '',
    description: defaultDescription(date, storeName),
    purchasePrice: product?.unitPrice.value ?? null,
    // Price not detected: currency of the store (GBP on Amazon.co.uk), never a conversion (R9).
    currency: product?.currency.value ?? store?.defaultCurrency ?? 'EUR',
    purchaseDate: date,
    purchaseFrom: purchase.seller.value ?? storeName,
    orderNumber: purchase.orderNumber.value,
    quantity: product?.quantity.value ?? 1,
    pageUrl: purchase.pageUrl,
    documents: [],
    // Checked by default (FR-002); `null` without a detected photo or in manual entry.
    photo: imageUrl ? { url: imageUrl, merchantId: purchase.source, include: true } : null,
    // Resolved at submission from the order choice and the row choice (FR-014).
    location: null,
    warranty: proposalFor(purchase, product, ctx).warranty,
  };
}

/** Fields not detected, flagged in the form (FR-008). */
export function missingFields(purchase: DetectedPurchase | null, product: DetectedProduct | null): string[] {
  if (!purchase) return [];
  const missing: string[] = [];
  if (!product || product.name.value === null) missing.push('name');
  if (!product || product.unitPrice.value === null) missing.push('purchasePrice');
  if (purchase.orderDate.value === null) missing.push('purchaseDate');
  if (purchase.orderNumber.value === null) missing.push('orderNumber');
  if (purchase.seller.value === null) missing.push('purchaseFrom');
  return missing;
}

/** Errors of the main fields (everything but the warranty, which shows its own). */
export function fieldErrors(d: ImportDraft, today = new Date().toISOString().slice(0, 10)): string[] {
  const errors: string[] = [];
  if (d.name.trim() === '') errors.push(t('fields.errors.nameRequired'));
  if (d.name.length > 255) errors.push(t('fields.errors.nameTooLong'));
  if (d.description.length > 1000) errors.push(t('fields.errors.descriptionTooLong'));
  if (d.purchasePrice !== null && (!Number.isFinite(d.purchasePrice) || d.purchasePrice < 0)) {
    errors.push(t('fields.errors.priceInvalid'));
  }
  if (d.purchaseDate !== null && d.purchaseDate > today) errors.push(t('fields.errors.dateInFuture'));
  if (d.purchaseFrom.length > 255) errors.push(t('fields.errors.sellerTooLong'));
  if (!Number.isInteger(d.quantity) || d.quantity < 1) errors.push(t('fields.errors.quantityInvalid'));
  return errors;
}

/** Errors of the warranty section: invalid expiry date, details too long. */
export function warrantyErrors(w: WarrantyDraft | null | undefined): string[] {
  if (!w) return [];
  const errors: string[] = [];
  if (w.expires !== null && !isValidIsoDate(w.expires)) errors.push(t('warranty.errors.dateInvalid'));
  if (w.details.length > 1000) errors.push(t('warranty.errors.detailsTooLong'));
  return errors;
}

export function draftErrors(d: ImportDraft, today = new Date().toISOString().slice(0, 10)): string[] {
  return [...fieldErrors(d, today), ...warrantyErrors(d.warranty)];
}
