import type { MerchantId } from './merchant-ids';
import type { ErrorCode } from './errors';

/** Value extracted from a page, or an explicit absence (principle III). */
export type Field<T> =
  | { value: T; selector: string }
  | { value: null; reason: 'not_found' | 'unparsable' };

export interface DetectedProduct {
  /** ASIN if present, otherwise index in the page. */
  key: string;
  name: Field<string>;
  unitPrice: Field<number>;
  /** Code ISO 4217. */
  currency: Field<string>;
  quantity: Field<number>;
  /**
   * URL of the photo offered for upload to HomeBox: already filtered by the merchant's `imageHosts` and
   * rewritten to the desired resolution.
   */
  imageUrl: Field<string>;
}

export interface DocumentRef {
  id: string;
  origin: 'detected' | 'manual';
  kind: 'invoice' | 'order_document';
  label: string;
  /** For `detected`: URL on the same origin as the store page. */
  url?: string;
  size?: number;
  pdfValid?: boolean;
}

export interface DetectedPurchase {
  /** Store of the order (set by its extractor, never read from the page). */
  source: MerchantId;
  /** URL of the order page, without query parameters. */
  pageUrl: string;
  orderNumber: Field<string>;
  /** YYYY-MM-DD */
  orderDate: Field<string>;
  seller: Field<string>;
  products: DetectedProduct[];
  documents: DocumentRef[];
}

/** Photo offered with the object. The bytes are never kept: only the URL is, until the purge. */
export interface DraftPhoto {
  url: string;
  /** Gives the `imageHosts` list used to re-check the URL in the service worker. */
  merchantId: MerchantId;
  /** True by default (FR-002); when unchecked, the photo is not fetched. */
  include: boolean;
}

/**
 * Location chosen for an object. `id` is the identifier of the location entity (sent as `parentId`); `path`
 * is the displayed path. Lives in memory and in `storage.session` for the duration of the import; never logged.
 */
export interface LocationChoice {
  id: string;
  path: string[];
}

/** Location offered in the list (flattened from the HomeBox tree). The name alone does not identify it: `id` is authoritative. */
export interface LocationOption {
  id: string;
  /** Last segment of the path. */
  name: string;
  /** From the root location to the location itself. */
  path: string[];
}

export interface ImportDraft {
  name: string;
  description: string;
  purchasePrice: number | null;
  currency: string;
  /** YYYY-MM-DD */
  purchaseDate: string | null;
  purchaseFrom: string;
  orderNumber: string | null;
  quantity: number;
  pageUrl: string | null;
  documents: DocumentRef[];
  /** `null`: no photo detected (or manual entry). */
  photo: DraftPhoto | null;
  /** `null`: no location, no `parentId` is sent (FR-012). Absent from a state persisted by a previous version. */
  location: LocationChoice | null;
}

export type PhotoStep = 'not_requested' | 'unavailable' | 'pending' | 'sending' | 'done' | 'failed';

export type StepState = 'pending' | 'done' | 'failed';

export interface PendingImport {
  id: string;
  tabId: number;
  pageUrl: string | null;
  draft: ImportDraft;
  entityId: string | null;
  steps: {
    create: StepState;
    update: StepState;
    attachments: Record<string, StepState>;
    /** Read with `?? 'not_requested'` as a precaution (state persisted by a previous version). */
    photo: PhotoStep;
  };
  status: 'running' | 'success' | 'partial' | 'failed';
  error: ErrorCode | null;
  /** Photo-specific error, displayed separately from `error`. */
  photoError: ErrorCode | null;
  /** True as soon as a photo POST may have been sent: triggers the duplicate-guard re-read on resume (R8). */
  photoAttempted: boolean;
  /** True as soon as the creation POST may have been sent (written before sending); reset to false after a definite failure (R8). */
  createAttempted?: boolean;
  /**
   * Creation with unknown outcome: the POST response was lost (network, timeout) or the service worker
   * stopped during the POST. The object may have been created without `entityId`: the resume searches for its name first (R8).
   */
  createUncertain?: boolean;
  /** Set when a `running` import is recovered after the service worker stopped (R8); cleared on resume. */
  orphaned?: boolean;
}

export interface LastCheck {
  status: 'ok' | 'error';
  code?: ErrorCode;
  version?: string;
  /** ISO 8601 */
  at: string;
}

/** View of the configuration exposed to the UI: never contains the key (principle I). */
export interface ConfigView {
  configured: boolean;
  baseUrl?: string;
  maskedKey?: string;
  lastCheck?: LastCheck | null;
  /** Encrypted key present but not yet unlocked for this session. */
  locked?: boolean;
  /** Key migrated from the old plaintext format: a passphrase must be set. */
  needsPassphrase?: boolean;
}

/** File chosen by the user, passed to the service worker. */
export interface ManualFile {
  docId: string;
  filename: string;
  base64: string;
}

export interface DuplicateMatch {
  id: string;
  name: string;
  url: string;
}
