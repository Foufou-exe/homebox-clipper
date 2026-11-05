/** Sous-ensemble du Swagger HomeBox v0.27 utilisé par l'extension (contracts/homebox-api.md). */

export interface EntityCreate {
  /** ≤ 255 caractères */
  name: string;
  /** ≤ 1000 caractères */
  description?: string;
  quantity?: number;
  /** Identifiant d'un lieu ; jamais `locationId` (inconnu = 422, R2). Absent sans choix : corps inchangé (SC-006). */
  parentId?: string;
}

export interface TreeItem {
  id: string;
  name: string;
  /** `location` ; `item` seulement avec `withItems`, que l'extension n'envoie pas. */
  type: string;
  /** Absent ou vide pour une feuille. */
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
  /** Type MIME du `Blob` : `application/pdf` pour les documents, celui de l'image pour la photo. */
  mimeType: string;
  /** Envoyé seulement si vrai : un PDF n'a jamais de champ `primary`. */
  primary?: boolean;
}

export interface StatusOut {
  health?: boolean;
  title?: string;
  build?: { version?: string };
}
