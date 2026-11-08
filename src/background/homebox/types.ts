/** Subset of the HomeBox v0.27 Swagger used by the extension (contracts/homebox-api.md). */

export interface EntityCreate {
  /** <= 255 characters */
  name: string;
  /** <= 1000 characters */
  description?: string;
  quantity?: number;
  /** Location identifier; never `locationId` (unknown = 422, R2). Absent when none is chosen: body unchanged (SC-006). */
  parentId?: string;
}

export interface TreeItem {
  id: string;
  name: string;
  /** `location`; `item` only with `withItems`, which the extension does not send. */
  type: string;
  /** Absent or empty for a leaf. */
  children?: TreeItem[];
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
  attachments?: { id: string; type?: string; primary?: boolean }[];
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
  type: 'receipt' | 'attachment' | 'photo';
  /** MIME type of the `Blob`: `application/pdf` for documents, the image's own type for the photo. */
  mimeType: string;
  /** Sent only when true: a PDF never has a `primary` field. */
  primary?: boolean;
}

export interface StatusOut {
  health?: boolean;
  title?: string;
  build?: { version?: string };
}
