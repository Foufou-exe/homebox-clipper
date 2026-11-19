import { browser } from '@/platform';
import type { ErrorCode, Result } from './errors';
import { isDocumentKind } from './document-kinds';
import { isValidIsoDate } from './warranty';
import { isLockPolicy, type LockPolicy, type LockSettings } from './lock-policy';
import { isVersion } from './version';
import { MAX_TAGS_PER_PRODUCT, normalizeTagName, tagKey, tagNameError } from './tags';
import type {
  ConfigView,
  DetectedPurchase,
  DuplicateCheck,
  HistoryListView,
  ImportDraft,
  LocationChoice,
  LocationOption,
  ManualFile,
  PendingImport,
  TagOption,
  UpdateStateView,
} from './types';

/**
 * Messages internes (contracts/runtime-messages.md).
 * No message addressed to the injected script contains `baseUrl` or `apiKey`.
 */
export type Message =
  // UI → service worker
  | { type: 'config/get' }
  | { type: 'config/save'; baseUrl: string; apiKey: string; passphrase: string }
  | { type: 'config/test' }
  | { type: 'config/delete' }
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
  | { type: 'duplicate/check'; orderNumber: string; name: string }
  | { type: 'location/list' }
  // Automatic tags (014): read-only, extension pages only; never the address or the key.
  | { type: 'tag/list' }
  | {
      type: 'import/start';
      tabId: number;
      drafts: ImportDraft[];
      manualFiles: ManualFile[];
      /** Order-level choice: only used to remember the last location (R10). */
      orderLocationId?: string | null;
    }
  | {
      type: 'import/retry';
      pendingId: string;
      manualFiles?: ManualFile[];
      /** Absent: choice unchanged; `null`: no location. Refused if the object already exists. */
      location?: LocationChoice | null;
    }
  | { type: 'import/abandon'; pendingId: string }
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
  'config/save': Result<ConfigView>;
  'config/test': Result<ConfigView>;
  'config/delete': Result<void>;
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
  'tag/list': Result<{ tags: TagOption[] }>;
  'import/start': Result<PendingImport[]>;
  'import/retry': Result<PendingImport>;
  'import/abandon': Result<void>;
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
    (x.origin === 'legal' || x.origin === 'page' || x.origin === 'user') &&
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
        (c.id === undefined || (isStr(c.id) && c.id !== '')),
    ) &&
    new Set(x.map((c) => tagKey((c as { name: string }).name))).size === x.length);
const areDrafts = (x: unknown): boolean =>
  isArr(x) &&
  x.every(
    (d) =>
      isObj(d) &&
      isDraftPhoto(d.photo) &&
      isOptionalLocation(d.location) &&
      isWarrantyDraft(d.warranty) &&
      isTagChoices(d.tags) &&
      isArr(d.documents) &&
      d.documents.every(isDocumentRef),
  );

const validators: { [K in MessageType]: (m: Record<string, unknown>) => boolean } = {
  'config/get': () => true,
  'config/save': (m) => isStr(m.baseUrl) && isStr(m.apiKey) && isStr(m.passphrase),
  'config/test': () => true,
  'config/delete': () => true,
  'session/unlock': (m) => isStr(m.passphrase),
  'session/lock': () => true,
  'session/open': () => true,
  'session/get-policy': () => true,
  'session/set-policy': (m) => isLockPolicy(m.policy),
  'update/state': () => true,
  'update/dismiss': (m) => isVersion(m.version),
  'update/apply': () => true,
  'detect/run': (m) => isInt(m.tabId),
  'duplicate/check': (m) => isStr(m.orderNumber) && isStr(m.name),
  'location/list': () => true,
  'tag/list': () => true,
  'import/start': (m) =>
    isInt(m.tabId) &&
    areDrafts(m.drafts) &&
    isArr(m.manualFiles) &&
    (m.orderLocationId === undefined || m.orderLocationId === null || isStr(m.orderLocationId)),
  'import/retry': (m) =>
    isStr(m.pendingId) && (m.manualFiles === undefined || isArr(m.manualFiles)) && isOptionalLocation(m.location),
  'import/abandon': (m) => isStr(m.pendingId),
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
