/** Sous-ensemble du Swagger HomeBox v0.27 utilisé par l'extension (contracts/homebox-api.md). */

export interface EntityCreate {
  /** ≤ 255 caractères */
  name: string;
  /** ≤ 1000 caractères */
  description?: string;
  quantity?: number;
}

export interface EntityOut {
  id: string;
  name: string;
  description?: string;
  quantity?: number;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  assetId?: string;
  insured?: boolean;
  lifetimeWarranty?: boolean;
  archived?: boolean;
  notes?: string;
  purchaseFrom?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  warrantyDetails?: string;
  warrantyExpires?: string;
  locationId?: string;
  location?: { id: string } | null;
  parent?: { id: string } | null;
  entityType?: { id: string } | null;
  tags?: { id: string }[];
}

export interface EntityUpdate {
  id: string;
  name: string;
  description?: string;
  quantity?: number;
  /** YYYY-MM-DD */
  purchaseDate?: string;
  purchaseFrom?: string;
  purchasePrice?: number;
  notes?: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  assetId?: string;
  insured?: boolean;
  lifetimeWarranty?: boolean;
  archived?: boolean;
  warrantyDetails?: string;
  warrantyExpires?: string;
  locationId?: string;
  parentId?: string;
  entityTypeId?: string;
  tagIds?: string[];
}

export interface EntitySummary {
  id: string;
  name: string;
  createdAt?: string;
}

export interface AttachmentUpload {
  bytes: Uint8Array;
  filename: string;
  type: 'receipt' | 'attachment';
}

export interface StatusOut {
  health?: boolean;
  title?: string;
  build?: { version?: string };
}
