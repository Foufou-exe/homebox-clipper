import type { DetectedProduct, DetectedPurchase, ImportDraft } from '@/shared/types';

export const DEFAULT_SELLER = 'Amazon.fr';

export function formatDateFr(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function defaultDescription(purchaseDate: string | null): string {
  return purchaseDate ? `Acheté sur Amazon.fr le ${formatDateFr(purchaseDate)}` : 'Acheté sur Amazon.fr';
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
  };
}

/** Brouillon modifiable pré-rempli avec les valeurs détectées (ou vides si non détectées). */
export function draftFrom(purchase: DetectedPurchase, product: DetectedProduct | null): ImportDraft {
  const date = purchase.orderDate.value;
  return {
    name: product?.name.value ?? '',
    description: defaultDescription(date),
    purchasePrice: product?.unitPrice.value ?? null,
    currency: product?.currency.value ?? 'EUR',
    purchaseDate: date,
    purchaseFrom: purchase.seller.value ?? DEFAULT_SELLER,
    orderNumber: purchase.orderNumber.value,
    quantity: product?.quantity.value ?? 1,
    pageUrl: purchase.pageUrl,
    documents: [],
  };
}

/** Champs non détectés, signalés dans le formulaire (FR-008). */
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

export function draftErrors(d: ImportDraft, today = new Date().toISOString().slice(0, 10)): string[] {
  const errors: string[] = [];
  if (d.name.trim() === '') errors.push('Le nom du produit est obligatoire.');
  if (d.name.length > 255) errors.push('Le nom ne doit pas dépasser 255 caractères.');
  if (d.description.length > 1000) errors.push('La description ne doit pas dépasser 1000 caractères.');
  if (d.purchasePrice !== null && (!Number.isFinite(d.purchasePrice) || d.purchasePrice < 0)) {
    errors.push('Le prix doit être un nombre positif.');
  }
  if (d.purchaseDate !== null && d.purchaseDate > today) errors.push("La date d'achat est dans le futur.");
  if (d.purchaseFrom.length > 255) errors.push('Le vendeur ne doit pas dépasser 255 caractères.');
  if (!Number.isInteger(d.quantity) || d.quantity < 1) errors.push('La quantité doit être un entier ≥ 1.');
  return errors;
}
