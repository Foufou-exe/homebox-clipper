import type { MerchantId } from './merchant-ids';
import type { ErrorCode } from './errors';
import type { DocumentKind } from './document-kinds';

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
  /** Opt-in per merchant: an absent property means this merchant reads no warranty from the page (spec 011). */
  pageWarranty?: Field<PageWarranty>;
  /** Name of the seller read on the product row (spec 011); absent or not read means unknown. */
  seller?: Field<string>;
}

/** Warranty shown on the order page of a merchant that chose to read it (spec 011). */
export interface PageWarranty {
  /** Total duration in months (integer, 1 to 120); `null` for a lifetime warranty. */
  months: number | null;
  /** `true` implies `months === null`. */
  lifetime: boolean;
  /** Text read on the page, cleaned, 1 to 200 characters. */
  label: string;
}

/** Where a proposed warranty comes from: the legal default, the order page, or the user. */
export type WarrantyOrigin = 'legal' | 'page' | 'user';

/** Warranty of an object as shown on the confirmation screen and sent to HomeBox (spec 011). */
export interface WarrantyDraft {
  origin: WarrantyOrigin;
  /** YYYY-MM-DD; `null`: no date (purchase date absent, or lifetime warranty). */
  expires: string | null;
  lifetime: boolean;
  /** Text sent as `warrantyDetails`; may be empty. */
  details: string;
  /** Base duration in months, used to recompute; `null`: unknown. */
  durationMonths: number | null;
  /** `true` as soon as the user acts in the section: no more recomputation. */
  edited: boolean;
}

export interface DocumentRef {
  id: string;
  origin: 'detected' | 'manual';
  kind: DocumentKind;
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

/** HomeBox tag offered to the interface: subset of `repo.TagSummary` (spec 014). */
export interface TagOption {
  id: string;
  name: string;
}

/** Tag chosen on the confirmation screen (spec 014). Only checked tags are ever sent. */
export interface TagChoice {
  /** Normalised, valid name; the HomeBox spelling if the tag existed in the summary. */
  name: string;
  /** HomeBox identifier known in the summary; absent for a "new" or "not verified" tag. */
  id?: string;
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
  /** `null` or absent: no warranty to send. Absent from a state persisted by a previous version. */
  warranty?: WarrantyDraft | null;
  /**
   * Tags checked at confirmation (spec 014). Absent or empty: no tag, the import sequence is unchanged
   * (no tag request, no `tagIds` key in the PUT). Absent from a state persisted by a previous version.
   */
  tags?: TagChoice[];
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
    /** Present only if `draft.tags` is non-empty (spec 014): without tags, nothing changes. */
    tags?: StepState;
  };
  /** Names (`draft.tags[].name`) not applied during the last run (spec 014). Absent until a tag failure happens. */
  failedTags?: string[];
  /**
   * Identifiers (`DocumentRef.id`) of `manual`/`warranty` documents attached as a plain `attachment` after the
   * instance refused their type (HTTP 422, spec 007). Absent until a fallback happens: never initialised elsewhere.
   */
  attachmentFallbacks?: string[];
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
  /**
   * Target instance (spec 016): set by the import handler (wrapped store and notify), never by the orchestrator;
   * read by `import/retry`. Absent only from a state written by a previous version.
   */
  instanceId?: string;
}

export interface LastCheck {
  status: 'ok' | 'error';
  code?: ErrorCode;
  version?: string;
  /** ISO 8601 */
  at: string;
}

/** Base64 AES-GCM seal; random 12-byte IV for every sealing (spec 016, data-model §2). */
export interface Sealed {
  iv: string;
  ct: string;
}

/** Passphrase vault shared by every instance (spec 016): one derivation, N keys. */
export interface Vault {
  kdf: 'PBKDF2-SHA256';
  /** 600 000 by default (DEFAULT_ITERATIONS). */
  iterations: number;
  /** base64, 16 bytes; copied as is from the former EncryptedKey at migration. */
  salt: string;
  /** Passphrase check seal: absent after migration, created at the first successful unlock. */
  check?: Sealed | null;
  /** Sealed history key (spec 012); absent/null before 012 or for a legacy key. */
  historyKey?: Sealed | null;
}

export interface StoredInstance {
  /** `crypto.randomUUID()`; `'migrated'` for the instance coming from the migration. Never changed. */
  id: string;
  /** 1 to 50 characters after trim, unique ignoring case (FR-005). */
  name: string;
  /** Normalized address (`normalizeBaseUrl`); unique (FR-004). Associated data of `key`. */
  baseUrl: string;
  /** Sealed API key (AES-GCM, vault key, AAD = baseUrl); null: legacy key in session, or key to re-enter. */
  key: Sealed | null;
  /** `maskKey()`: first 3 + •••• + last 4. */
  maskedKey: string;
  lastCheck: LastCheck | null;
}

/** `storage.local.homeboxInstances` (spec 016, data-model §2). */
export interface InstancesStore {
  v: 1;
  /** null: legacy key without passphrase (spec 005), a single instance, `key: null`. */
  vault: Vault | null;
  /** 1 to 10 elements, order of addition; the migrated instance first. */
  instances: StoredInstance[];
  /** Present if the object was created by the migration (used by steps 2 and 3, then ignored). */
  migratedFrom?: 'homeboxConfig';
}

/** Instance exposed to the UI: never the key (principle I). `keyState` is computed, never stored. */
export interface InstanceView {
  id: string;
  name: string;
  baseUrl: string;
  maskedKey: string;
  lastCheck: LastCheck | null;
  keyState: 'ready' | 'locked' | 'unreadable' | 'missing';
}

/** View of the configuration exposed to the UI: never contains the key (principle I). */
export interface ConfigView {
  configured: boolean;
  /** Increment 1 only (UI compatibility): copy of the default instance (spec 016). */
  baseUrl?: string;
  maskedKey?: string;
  lastCheck?: LastCheck | null;
  /** Encrypted key present but not yet unlocked for this session. */
  locked?: boolean;
  /** Key migrated from the old plaintext format: a passphrase must be set. */
  needsPassphrase?: boolean;
  /** Instances, in the order of the settings (spec 016). */
  instances?: InstanceView[];
  /** lastInstanceId if it designates an existing instance, otherwise instances[0].id (FR-012). */
  defaultInstanceId?: string | null;
  maxInstances?: 10;
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

/** Result of the duplicate check of one product (spec 015). Never stored. */
export interface DuplicateCheck {
  /** Certain duplicates (spec 001 FR-022, unchanged computation), all of them (FR-005, FR-010). */
  matches: DuplicateMatch[];
  /** Similar items (FR-004), at most 5, closest first; no id of `matches` (FR-009). */
  similar: DuplicateMatch[];
  /** More than 5 similar items existed (FR-010). */
  moreSimilar: boolean;
  /** At least one search for this product failed while another succeeded: product "not checked" (FR-013). */
  incomplete: boolean;
}

/** Result of an import as recorded in the local history (spec 012). `success` of `PendingImport` becomes `complete`. */
export type HistoryStatus = 'running' | 'complete' | 'partial' | 'failed';

/** What is missing from an object created in HomeBox, in this order (research.md R3.1). */
export type HistoryMissing = 'details' | 'invoice' | 'manual' | 'warranty' | 'deliveryNote' | 'documents' | 'photo';

/**
 * Entry of the local import history (data-model.md). Only exists in clear in the service worker memory and in
 * the `history/list` response when unlocked: stored encrypted (`importHistory:<id>`, FR-014). Built field by
 * field by `toEntry`: never the API key, address, payment, invoice, photo, page URL, price or location.
 */
export interface ImportHistoryEntry {
  v: 1;
  /** Identifier of the `PendingImport` (random UUID). Never changed. */
  id: string;
  /** ISO 8601 UTC, set at `start`, never changed. */
  importedAt: string;
  /** Trimmed, 1 to 255 characters. */
  name: string;
  /** Store identifier (never a URL); `null`: manual entry or unknown store. */
  merchantId: MerchantId | null;
  /** Trimmed, 1 to 64 characters, otherwise `null`. Used to group the products of an order. */
  orderNumber: string | null;
  /** YYYY-MM-DD, otherwise `null`. */
  purchaseDate: string | null;
  /** Normalized address of the instance at the time of the import. */
  instance: string;
  entityId: string | null;
  status: HistoryStatus;
  /** No duplicate, in the order details, invoice, documents, photo. */
  missing: HistoryMissing[];
  /** Error code, never a text. */
  reason: ErrorCode | null;
  /** Present only when the import was interrupted and reconciled. */
  interrupted?: true;
}

/**
 * Entry exposed to the UI: `resumable` is computed by `history/list`, never stored; `instanceId` comes from the
 * envelope (`inst`, spec 016), `null` for an entry not attached to an instance.
 */
export type HistoryEntryView = ImportHistoryEntry & { resumable: boolean; instanceId: string | null };

/** Response of `history/list`: never an entry outside `ready` (FR-014). */
export type HistoryListView =
  | { state: 'ready'; enabled: boolean; entries: HistoryEntryView[] }
  | { state: 'locked' | 'unavailable'; enabled: boolean; entries: [] };

/**
 * Response of `update/state` (spec 013): version numbers and a flag only, never personal data.
 * `blocked`: an import is running or can still be resumed, so "Update now" is disabled (FR-015).
 */
export interface UpdateStateView {
  /** Installed version (`getManifest().version`). */
  installed: string;
  /** Version to announce ("updated to vX"), or null. */
  notice: string | null;
  /** Version ready to apply (signalled by the browser), or null. */
  ready: string | null;
  blocked: boolean;
}
