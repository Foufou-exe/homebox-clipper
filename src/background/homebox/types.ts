import type { AttachmentType } from '@/shared/document-kinds';

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

/** `repo.EntityFieldData` (Swagger v0.27.1): custom field of an object, same shape when read and when updated. */
export interface EntityField {
  /** Kept on update so HomeBox updates the field instead of recreating it. */
  id?: string;
  name: string;
  /** `text`, `number`, `boolean` or `time`. */
  type: string;
  textValue?: string;
  numberValue?: number;
  booleanValue?: boolean;
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
  /** `null` (Go nil slice) means no tag. */
  tags?: { id: string }[] | null;
  attachments?: { id: string; type?: string; primary?: boolean }[];
  /** Custom fields; `null` (Go nil slice) or absent means none. */
  fields?: EntityField[] | null;
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
  /** Custom fields: the PUT replaces them all, so the current ones must be sent back (#109). */
  fields?: EntityField[];
}

/** Subset of `repo.TagSummary` (Swagger v0.27.1) used by the extension (spec 014). */
export interface TagSummary {
  id: string;
  name: string;
}

/** Subset of `repo.TagCreate`: only the name is ever sent (no color, icon, description or parent). */
export interface TagCreate {
  name: string;
}

export interface EntitySummary {
  id: string;
  name: string;
  createdAt?: string;
}

export interface AttachmentUpload {
  bytes: Uint8Array;
  filename: string;
  type: AttachmentType;
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

/** `repo.EntityTemplateSummary` (Swagger v0.27.1, spec 018): entry of `GET /templates`. */
export interface TemplateSummary {
  id: string;
  name: string;
  description?: string;
  updatedAt?: string;
}

/** `repo.TemplateField`. `timeValue` is read but never used (creation timestamp, research R1). */
export interface TemplateField {
  id?: string;
  type: string;
  name: string;
  textValue?: string;
  numberValue?: number;
  booleanValue?: boolean;
  timeValue?: string;
}

/** `repo.EntityTemplateOut` (subset). */
export interface TemplateOut {
  id: string;
  name: string;
  description?: string;
  updatedAt?: string;
  defaultDescription?: string;
  defaultQuantity?: number;
  defaultInsured?: boolean;
  defaultManufacturer?: string;
  defaultModelNumber?: string;
  defaultLifetimeWarranty?: boolean;
  defaultWarrantyDetails?: string;
  defaultLocation?: { id: string; name?: string } | null;
  defaultTags?: { id: string; name: string }[] | null;
  fields?: TemplateField[] | null;
}

/** `v1.EntityTemplateCreateItemRequest`: only these keys are ever sent (research D2). */
export interface TemplateCreateItem {
  /** 1 to 255 characters. */
  name: string;
  /** <= 1000; omitted when empty. */
  description?: string;
  quantity: number;
  /** Required by HomeBox: identifier of the effective location. */
  parentId: string;
}
