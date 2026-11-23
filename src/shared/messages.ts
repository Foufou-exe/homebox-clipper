import { MAX_FIELD_NAME_BYTES, MAX_FIELD_TEXT_BYTES, utf8ByteLength } from './utf8';
import { browser } from '@/platform';
import type { ErrorCode, Result } from './errors';
import { isDocumentKind } from './document-kinds';
import { isValidIsoDate } from './warranty';
import { isLockPolicy, type LockPolicy, type LockSettings } from './lock-policy';
import { isVersion } from './version';
import { MAX_TAGS_PER_PRODUCT, normalizeTagName, tagKey, tagNameError } from './tags';
import { isOrderLinkSettings, orderLinkUrl, type OrderLinkSettings } from './order-link';
import { ORDER_FIELD_ROLES, fieldNameError, isOrderFieldSettings, orderValueError, type OrderFieldSettings } from './order-fields';
import { isCollectionId, type CollectionList } from './collections';
import type {
  CompletionPreview,
  ConfigView,
  DetectedPurchase,
  DuplicateCheck,
  EntityTypeListView,
  HistoryListView,
  ImportDraft,
  LocationChoice,
  LocationOption,
  ManualFile,
  PendingImport,
  TagOption,
  TemplateCheck,
  TemplateDetail,
  TemplateListView,
  DefaultTemplateRef,
  UpdateStateView,
} from './types';

/**
 * Messages internes (contracts/runtime-messages.md).
 * No message addressed to the injected script contains `baseUrl` or `apiKey`.
 */
export type Message =
  // UI → service worker
  | { type: 'config/get' }
  | { type: 'config/delete' }
  // Spec 016, delivery B: instance management, extension pages only (`instance/` prefix). Never answered with a key.
  | { type: 'instance/add'; baseUrl: string; apiKey: string; name: string; passphrase: string; newPassphrase: boolean }
  | {
      type: 'instance/update';
      instanceId: string;
      baseUrl: string;
      /** Empty: keep the current key (reopened with the passphrase). */
      apiKey: string;
      passphrase: string;
      newPassphrase: boolean;
    }
  | { type: 'instance/rename'; instanceId: string; name: string }
  | { type: 'instance/test'; instanceId: string }
  | { type: 'instance/delete'; instanceId: string }
  // Target collection (024): extension pages only (`instance/` prefix); the key is needed (HomeBox reads).
  | { type: 'instance/collections'; instanceId: string }
  | { type: 'instance/set-collection'; instanceId: string; collectionId: string | null }
  | { type: 'session/change-passphrase'; current: string; next: string }
  | { type: 'session/unlock'; passphrase: string }
  | { type: 'session/lock' }
  // Automatic lock (013): never the key, the passphrase or the activity timestamp.
  | { type: 'session/open' }
  | { type: 'session/get-policy' }
  | { type: 'session/set-policy'; policy: LockPolicy }
  // Updates (013): version numbers only, no network.
  | { type: 'update/state' }
  | { type: 'update/dismiss'; version: string }
  | { type: 'update/apply' }
  | { type: 'detect/run'; tabId: number }
  // Spec 016: every message that contacts HomeBox names its target instance; no fallback to a default one.
  | { type: 'duplicate/check'; instanceId: string; orderNumber: string; name: string }
  | { type: 'location/list'; instanceId: string }
  // Spec 023: item types of the target instance, read-only, extension pages only (`entity-type/` prefix).
  | { type: 'entity-type/list'; instanceId: string }
  // Automatic tags (014): read-only, extension pages only; never the address or the key.
  | { type: 'tag/list'; instanceId: string }
  // HomeBox item templates (018): extension pages only (`template/` prefix); never the address or the key.
  | { type: 'template/list'; instanceId: string }
  | { type: 'template/get'; instanceId: string; templateId: string }
  | { type: 'template/check'; instanceId: string; refs: { id: string; fingerprint: string }[] }
  | { type: 'template/get-default'; instanceId: string }
  | { type: 'template/set-default'; instanceId: string; templateId: string | null }
  // Order fields (019): extension pages only (`order-fields/` prefix); get/set without key nor network.
  | { type: 'order-fields/get'; instanceId: string }
  | { type: 'order-fields/set'; instanceId: string; settings: OrderFieldSettings }
  | { type: 'order-fields/names'; instanceId: string }
  // Order page link (025): extension pages only (`order-link/` prefix); get/set without key nor network.
  | { type: 'order-link/get'; instanceId: string }
  | { type: 'order-link/set'; instanceId: string; settings: OrderLinkSettings }
  | {
      type: 'import/start';
      instanceId: string;
      tabId: number;
      drafts: ImportDraft[];
      manualFiles: ManualFile[];
      /** Order-level choice: only used to remember the last location (R10). */
      orderLocationId?: string | null;
      /** Spec 023: the item types were read at opening; only then may a default-type import erase the remembered type. */
      entityTypesRead?: boolean;
    }
  | {
      type: 'import/retry';
      pendingId: string;
      manualFiles?: ManualFile[];
      /** Absent: choice unchanged; `null`: no location. Refused if the object already exists. */
      location?: LocationChoice | null;
    }
  | { type: 'import/abandon'; pendingId: string }
  // Spec 021: read the chosen item and list what completing it would add. Read-only, extension pages only.
  | { type: 'import/complete-preview'; instanceId: string; entityId: string; draft: ImportDraft }
  | { type: 'import/pending'; tabId: number }
  // Local import history (012): never the history key, the address or the API key.
  | { type: 'history/list' }
  | { type: 'history/delete'; id: string }
  | { type: 'history/clear' }
  | { type: 'history/set-enabled'; enabled: boolean }
  // service worker → injected script
  | { type: 'amazon/extract' }
  | { type: 'amazon/download'; url: string }
  // service worker → UI
  | { type: 'import/progress'; pending: PendingImport };

export type MessageType = Message['type'];
export type MessageOf<T extends MessageType> = Extract<Message, { type: T }>;

export interface DownloadedDocument {
  base64: string;
  size: number;
  contentType: string;
}

export interface DetectResult {
  purchase: DetectedPurchase;
  warnings: ErrorCode[];
}

/** Response of `update/apply` (013): closed result, no new error code. */
export type UpdateApplyResult = { applied: true } | { applied: false; reason: 'busy' | 'none' };

export interface ResponseMap {
  'config/get': ConfigView;
  'config/delete': Result<void>;
  'instance/add': Result<ConfigView>;
  'instance/update': Result<ConfigView>;
  'instance/rename': Result<ConfigView>;
  'instance/test': Result<ConfigView>;
  'instance/delete': Result<ConfigView>;
  'instance/collections': Result<CollectionList>;
  'instance/set-collection': Result<CollectionList>;
  /** `reenter`: ids of the instances whose key was unreadable and must be entered again. */
  'session/change-passphrase': Result<{ view: ConfigView; reenter: string[] }>;
  'session/unlock': Result<ConfigView>;
  'session/lock': ConfigView;
  'session/open': ConfigView;
  'session/get-policy': LockSettings;
  'session/set-policy': Result<LockSettings>;
  'update/state': UpdateStateView;
  'update/dismiss': Result<void>;
  'update/apply': UpdateApplyResult;
  'detect/run': Result<DetectResult>;
  'duplicate/check': Result<DuplicateCheck>;
  'location/list': Result<{ locations: LocationOption[]; lastUsedId: string | null }>;
  'entity-type/list': Result<EntityTypeListView>;
  'tag/list': Result<{ tags: TagOption[] }>;
  'template/list': Result<TemplateListView>;
  'template/get': Result<{ template: TemplateDetail }>;
  'template/check': Result<{ results: TemplateCheck[] }>;
  'template/get-default': Result<{ defaultTemplate: DefaultTemplateRef | null }>;
  'template/set-default': Result<{ defaultTemplate: DefaultTemplateRef | null }>;
  'order-fields/get': Result<{ settings: OrderFieldSettings }>;
  'order-fields/set': Result<{ settings: OrderFieldSettings }>;
  'order-fields/names': Result<{ names: string[] }>;
  'order-link/get': Result<{ settings: OrderLinkSettings }>;
  'order-link/set': Result<{ settings: OrderLinkSettings }>;
  'import/start': Result<PendingImport[]>;
  'import/retry': Result<PendingImport>;
  'import/abandon': Result<void>;
  'import/complete-preview': Result<CompletionPreview>;
  'import/pending': PendingImport[];
  'history/list': Result<HistoryListView>;
  'history/delete': Result<void>;
  'history/clear': Result<void>;
  'history/set-enabled': Result<void>;
  'amazon/extract': Result<DetectedPurchase>;
  'amazon/download': Result<DownloadedDocument>;
  'import/progress': undefined;
}

export type ResponseOf<T extends MessageType> = ResponseMap[T];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isStr = (x: unknown): x is string => typeof x === 'string';
const isInt = (x: unknown): x is number => Number.isInteger(x);
const isArr = Array.isArray;
/** Instance identifier (spec 016): non-empty string of 1 to 64 characters. */
export const isInstanceId = (x: unknown): x is string => isStr(x) && x.length >= 1 && x.length <= 64;

/** `ImportDraft.photo`: absent or `null` (no photo), otherwise a properly typed `{ url, merchantId, include }`. */
const isDraftPhoto = (x: unknown): boolean =>
  x === undefined ||
  x === null ||
  (isObj(x) && isStr(x.url) && isStr(x.merchantId) && typeof x.include === 'boolean');
/** `LocationChoice`: textual `id` and `path` as an array of strings. */
const isLocationChoice = (x: unknown): boolean =>
  isObj(x) && isStr(x.id) && isArr(x.path) && x.path.every(isStr);
const isOptionalLocation = (x: unknown): boolean => x === undefined || x === null || isLocationChoice(x);
/** `DocumentRef` as sent by the popup: closed `kind` and `origin`, textual `id` and `label` (spec 007, V1). */
const isDocumentRef = (x: unknown): boolean =>
  isObj(x) && isStr(x.id) && isStr(x.label) && (x.origin === 'detected' || x.origin === 'manual') && isDocumentKind(x.kind);
/** `ImportDraft.warranty` (spec 011): absent, `null` or conforming to the validation rules of data-model.md. */
const isWarrantyDraft = (x: unknown): boolean =>
  x === undefined ||
  x === null ||
  (isObj(x) &&
    (x.origin === 'legal' || x.origin === 'page' || x.origin === 'user' || x.origin === 'template') &&
    (x.expires === null || isValidIsoDate(x.expires)) &&
    typeof x.lifetime === 'boolean' &&
    !(x.lifetime === true && x.expires !== null) &&
    isStr(x.details) &&
    x.details.length <= 1000 &&
    (x.durationMonths === null || (isInt(x.durationMonths) && (x.durationMonths as number) >= 1 && (x.durationMonths as number) <= 1200)) &&
    typeof x.edited === 'boolean');
/**
 * `ImportDraft.tags` (spec 014): absent, or at most 50 objects with a normalised, valid `name` and an `id` absent or
 * non-empty text; two entries of the same key are refused.
 */
const isTagChoices = (x: unknown): boolean =>
  x === undefined ||
  (isArr(x) &&
    x.length <= MAX_TAGS_PER_PRODUCT &&
    x.every(
      (c) =>
        isObj(c) &&
        isStr(c.name) &&
        c.name === normalizeTagName(c.name) &&
        tagNameError(c.name) === null &&
        (c.id === undefined || (isStr(c.id) && c.id !== '')) &&
        // Spec 018: default tag of a template, never created; absent or exactly `true`.
        (c.noCreate === undefined || c.noCreate === true),
    ) &&
    new Set(x.map((c) => tagKey((c as { name: string }).name))).size === x.length);
const strLen = (x: unknown, min: number, max: number): x is string => isStr(x) && x.length >= min && x.length <= max;
/** Template identifier (spec 018): 1 to 64 characters. */
export const isTemplateId = (x: unknown): x is string => strLen(x, 1, 64);
const isFingerprint = (x: unknown): x is string => isStr(x) && /^[0-9a-f]{64}$/.test(x);
/** Like `strLen`, but the bounds are in UTF-8 bytes (HomeBox custom field name and value, #116). */
const byteLen = (x: unknown, min: number, max: number): x is string => {
  if (!isStr(x) || x.length > max) return false;
  const n = utf8ByteLength(x);
  return n >= min && n <= max;
};
const FIELD_KINDS: ReadonlySet<string> = new Set(['text', 'number', 'boolean', 'time', 'unknown']);
/** One confirmed field (data-model §3): bounds, then the consistency of the kind with the values (research D1). */
const isTemplateFieldValue = (f: unknown): boolean => {
  if (!isObj(f)) return false;
  if (!strLen(f.type, 1, 32) || !isStr(f.kind) || !FIELD_KINDS.has(f.kind) || !byteLen(f.name, 1, MAX_FIELD_NAME_BYTES)) return false;
  if (!byteLen(f.textValue, 0, MAX_FIELD_TEXT_BYTES) || !Number.isSafeInteger(f.numberValue) || typeof f.booleanValue !== 'boolean') return false;
  switch (f.kind) {
    case 'number':
      return f.textValue === '' ? f.numberValue === 0 : f.textValue === String(f.numberValue);
    case 'boolean':
      return f.textValue === String(f.booleanValue);
    case 'time':
      return f.textValue === '' || isValidIsoDate(f.textValue);
    default:
      return true;
  }
};
/** `ImportDraft.template` (spec 018): absent (never `null`), or conforming to the rules of data-model §3. */
const isTemplateChoice = (x: unknown): boolean =>
  x === undefined ||
  (isObj(x) &&
    isTemplateId(x.id) &&
    strLen(x.name, 1, 255) &&
    isFingerprint(x.fingerprint) &&
    typeof x.insured === 'boolean' &&
    strLen(x.manufacturer, 0, 255) &&
    strLen(x.modelNumber, 0, 255) &&
    isArr(x.fields) &&
    x.fields.length <= 100 &&
    x.fields.every(isTemplateFieldValue));
const ORDER_ROLES: ReadonlySet<unknown> = new Set(ORDER_FIELD_ROLES);
/** One confirmed order field (data-model §3, rules 2 to 4): trimmed, valid name and value; the number is the draft's. */
const isOrderFieldValue = (f: unknown, others: readonly string[], d: Record<string, unknown>): boolean => {
  if (!isObj(f) || !ORDER_ROLES.has(f.role) || !isStr(f.name) || !isStr(f.value)) return false;
  const { role, name, value } = f as { role: (typeof ORDER_FIELD_ROLES)[number]; name: string; value: string };
  if (name !== name.trim() || fieldNameError(name, others) !== null) return false;
  if (value !== value.trim() || value === '' || orderValueError(role, value) !== null) return false;
  return role !== 'orderNumber' || (isStr(d.orderNumber) && value === d.orderNumber);
};
/** Names of the template fields of the draft (trimmed), never shared with an order field (FR-016, invariant 3). */
const templateFieldNames = (d: Record<string, unknown>): string[] => {
  const t = d.template;
  if (!isObj(t) || !isArr(t.fields)) return [];
  return t.fields.flatMap((f) => (isObj(f) && isStr(f.name) ? [f.name.trim()] : []));
};
/** `ImportDraft.orderFields` (spec 019): absent (never `[]` nor `null`), or 1 to 3 valid entries of distinct roles. */
const isOrderFields = (x: unknown, d: Record<string, unknown>): boolean => {
  if (x === undefined) return true;
  if (!isArr(x) || x.length < 1 || x.length > ORDER_FIELD_ROLES.length || !x.every(isObj)) return false;
  if (new Set(x.map((f) => f.role)).size !== x.length) return false;
  const names = x.map((f) => (isStr(f.name) ? f.name : ''));
  const shared = new Set(templateFieldNames(d));
  return x.every((f, i) => isOrderFieldValue(f, names.filter((_, j) => j !== i), d)) && !names.some((n) => shared.has(n));
};
/**
 * `ImportDraft.orderLink` (spec 025): absent, or exactly `true` on a draft whose page address can be attached and which
 * does not complete an existing item (the spec 021 path never adds a link).
 */
const isOrderLink = (x: unknown, d: Record<string, unknown>): boolean => {
  if (x === undefined) return true;
  return x === true && d.complete === undefined && orderLinkUrl(isStr(d.pageUrl) ? d.pageUrl : null) !== null;
};
/** `template/check` refs: 1 to 50, distinct ids, 64-hex fingerprints. */
const isTemplateRefs = (x: unknown): boolean =>
  isArr(x) &&
  x.length >= 1 &&
  x.length <= 50 &&
  x.every((r) => isObj(r) && isTemplateId(r.id) && isFingerprint(r.fingerprint)) &&
  new Set(x.map((r) => (r as { id: string }).id)).size === x.length;
/** Fixed keys of a completion (spec 021); `quantity` is never a confirmed key. */
const COMPLETION_KEYS: ReadonlySet<unknown> = new Set([
  'photo',
  'notes',
  'purchasePrice',
  'purchaseDate',
  'purchaseFrom',
  'warrantyExpires',
  'lifetimeWarranty',
  'warrantyDetails',
]);
const MAX_COMPLETION_KEYS = 200;
/** Values a prefixed key may designate in the draft: document ids, keys of the checked tags, order roles. */
function completionTargets(d: Record<string, unknown>): Set<string> {
  const objects = (x: unknown): Record<string, unknown>[] => (isArr(x) ? x.filter(isObj) : []);
  const docs = objects(d.documents).filter((x) => isStr(x.id)).map((x) => `doc:${String(x.id)}`);
  const tags = objects(d.tags).filter((x) => isStr(x.name)).map((x) => `tag:${tagKey(String(x.name))}`);
  const fields = objects(d.orderFields).filter((x) => ORDER_ROLES.has(x.role)).map((x) => `field:${String(x.role)}`);
  return new Set([...docs, ...tags, ...fields]);
}
/** One confirmed key (contracts/runtime-messages.md §2): fixed, or a prefixed key designating something of the draft. */
const isCompletionKey = (k: unknown, targets: ReadonlySet<string>): boolean =>
  isStr(k) && (COMPLETION_KEYS.has(k) || (/^(doc|tag|field):./.test(k) && targets.has(k)));
/** `quantityIncrease`: absent, or the integer quantity of the draft (>= 1). */
const isQuantityIncrease = (x: unknown, d: Record<string, unknown>): boolean =>
  x === undefined || (isInt(x) && x >= 1 && x === d.quantity);
/**
 * `ImportDraft.complete` (spec 021, contracts/runtime-messages.md §2): absent (never `null`), or a valid choice on a
 * draft without template and with `location: null`.
 */
const isCompletionChoice = (x: unknown, d: Record<string, unknown>): boolean => {
  if (x === undefined) return true;
  if (!isObj(x) || isArr(x) || d.template !== undefined || d.location !== null) return false;
  if (!strLen(x.entityId, 1, 64) || !strLen(x.itemName, 1, 255) || !isQuantityIncrease(x.quantityIncrease, d)) return false;
  const keys = x.keys;
  if (!isArr(keys) || keys.length > MAX_COMPLETION_KEYS || new Set(keys).size !== keys.length) return false;
  const targets = completionTargets(d);
  return keys.every((k) => isCompletionKey(k, targets));
};
/** `ImportDraft.entityTypeId` (spec 023): absent (never `null`), or a string of 1 to 64 characters, never with `complete`. */
const isEntityTypeChoice = (d: Record<string, unknown>): boolean =>
  d.entityTypeId === undefined || (strLen(d.entityTypeId, 1, 64) && d.complete === undefined);
const areDrafts = (x: unknown): boolean =>
  isArr(x) &&
  x.every(
    (d) =>
      isObj(d) &&
      isCompletionChoice(d.complete, d) &&
      isEntityTypeChoice(d) &&
      isDraftPhoto(d.photo) &&
      isOptionalLocation(d.location) &&
      isTemplateChoice(d.template) &&
      isOrderFields(d.orderFields, d) &&
      isOrderLink(d.orderLink, d) &&
      // A template requires a location (FR-005).
      (d.template === undefined || isLocationChoice(d.location)) &&
      isWarrantyDraft(d.warranty) &&
      isTagChoices(d.tags) &&
      isArr(d.documents) &&
      d.documents.every(isDocumentRef),
  );

const validators: { [K in MessageType]: (m: Record<string, unknown>) => boolean } = {
  'config/get': () => true,
  'config/delete': () => true,
  'instance/add': (m) =>
    isStr(m.baseUrl) && isStr(m.apiKey) && isStr(m.name) && isStr(m.passphrase) && typeof m.newPassphrase === 'boolean',
  'instance/update': (m) =>
    isInstanceId(m.instanceId) &&
    isStr(m.baseUrl) &&
    isStr(m.apiKey) &&
    isStr(m.passphrase) &&
    typeof m.newPassphrase === 'boolean',
  'instance/rename': (m) => isInstanceId(m.instanceId) && isStr(m.name),
  'instance/test': (m) => isInstanceId(m.instanceId),
  'instance/delete': (m) => isInstanceId(m.instanceId),
  'instance/collections': (m) => isInstanceId(m.instanceId),
  'instance/set-collection': (m) => isInstanceId(m.instanceId) && (m.collectionId === null || isCollectionId(m.collectionId)),
  'session/change-passphrase': (m) => isStr(m.current) && isStr(m.next),
  'session/unlock': (m) => isStr(m.passphrase),
  'session/lock': () => true,
  'session/open': () => true,
  'session/get-policy': () => true,
  'session/set-policy': (m) => isLockPolicy(m.policy),
  'update/state': () => true,
  'update/dismiss': (m) => isVersion(m.version),
  'update/apply': () => true,
  'detect/run': (m) => isInt(m.tabId),
  'duplicate/check': (m) => isInstanceId(m.instanceId) && isStr(m.orderNumber) && isStr(m.name),
  'location/list': (m) => isInstanceId(m.instanceId),
  'entity-type/list': (m) => isInstanceId(m.instanceId),
  'tag/list': (m) => isInstanceId(m.instanceId),
  'template/list': (m) => isInstanceId(m.instanceId),
  'template/get': (m) => isInstanceId(m.instanceId) && isTemplateId(m.templateId),
  'template/check': (m) => isInstanceId(m.instanceId) && isTemplateRefs(m.refs),
  'template/get-default': (m) => isInstanceId(m.instanceId),
  'template/set-default': (m) => isInstanceId(m.instanceId) && (m.templateId === null || isTemplateId(m.templateId)),
  'order-fields/get': (m) => isInstanceId(m.instanceId),
  'order-fields/set': (m) => isInstanceId(m.instanceId) && isOrderFieldSettings(m.settings),
  'order-fields/names': (m) => isInstanceId(m.instanceId),
  'order-link/get': (m) => isInstanceId(m.instanceId),
  'order-link/set': (m) => isInstanceId(m.instanceId) && isOrderLinkSettings(m.settings),
  'import/start': (m) =>
    isInstanceId(m.instanceId) &&
    isInt(m.tabId) &&
    areDrafts(m.drafts) &&
    isArr(m.manualFiles) &&
    (m.orderLocationId === undefined || m.orderLocationId === null || isStr(m.orderLocationId)) &&
    (m.entityTypesRead === undefined || typeof m.entityTypesRead === 'boolean'),
  'import/retry': (m) =>
    isStr(m.pendingId) && (m.manualFiles === undefined || isArr(m.manualFiles)) && isOptionalLocation(m.location),
  'import/abandon': (m) => isStr(m.pendingId),
  // Spec 021: the previewed draft never carries a completion nor a template (contracts/runtime-messages.md §1).
  'import/complete-preview': (m) =>
    isInstanceId(m.instanceId) &&
    strLen(m.entityId, 1, 64) &&
    areDrafts([m.draft]) &&
    isObj(m.draft) &&
    m.draft.complete === undefined &&
    m.draft.entityTypeId === undefined &&
    m.draft.template === undefined,
  'import/pending': (m) => isInt(m.tabId),
  'history/list': () => true,
  'history/delete': (m) => isStr(m.id),
  'history/clear': () => true,
  'history/set-enabled': (m) => typeof m.enabled === 'boolean',
  'amazon/extract': () => true,
  'amazon/download': (m) => isStr(m.url),
  'import/progress': (m) => isObj(m.pending),
};

export function isMessage(x: unknown): x is Message {
  if (!isObj(x) || !isStr(x.type) || !Object.hasOwn(validators, x.type)) return false;
  return validators[x.type as MessageType](x);
}

/** Sends a message to the service worker. */
export function send<T extends MessageType>(msg: MessageOf<T>): Promise<ResponseOf<T>> {
  return browser.runtime.sendMessage(msg) as Promise<ResponseOf<T>>;
}

/** Sends a message to the script injected in a tab. */
export function sendToTab<T extends MessageType>(
  tabId: number,
  msg: MessageOf<T>,
): Promise<ResponseOf<T>> {
  return browser.tabs.sendMessage(tabId, msg) as Promise<ResponseOf<T>>;
}
