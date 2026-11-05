import { browser } from '@/platform';
import type { ErrorCode, Result } from './errors';
import type {
  ConfigView,
  DetectedPurchase,
  DuplicateMatch,
  ImportDraft,
  LocationChoice,
  LocationOption,
  ManualFile,
  PendingImport,
} from './types';

/**
 * Messages internes (contracts/runtime-messages.md).
 * Aucun message à destination du script injecté ne contient `baseUrl` ni `apiKey`.
 */
export type Message =
  // UI → service worker
  | { type: 'config/get' }
  | { type: 'config/save'; baseUrl: string; apiKey: string; passphrase: string }
  | { type: 'config/test' }
  | { type: 'config/delete' }
  | { type: 'session/unlock'; passphrase: string }
  | { type: 'session/lock' }
  | { type: 'detect/run'; tabId: number }
  | { type: 'duplicate/check'; orderNumber: string; name: string }
  | { type: 'location/list' }
  | {
      type: 'import/start';
      tabId: number;
      drafts: ImportDraft[];
      manualFiles: ManualFile[];
      /** Choix au niveau de la commande : sert seulement à mémoriser le dernier emplacement (R10). */
      orderLocationId?: string | null;
    }
  | {
      type: 'import/retry';
      pendingId: string;
      manualFiles?: ManualFile[];
      /** Absent : choix inchangé ; `null` : sans emplacement. Refusé si l'objet existe déjà. */
      location?: LocationChoice | null;
    }
  | { type: 'import/abandon'; pendingId: string }
  | { type: 'import/pending'; tabId: number }
  // service worker → script injecté
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

export interface ResponseMap {
  'config/get': ConfigView;
  'config/save': Result<ConfigView>;
  'config/test': Result<ConfigView>;
  'config/delete': Result<void>;
  'session/unlock': Result<ConfigView>;
  'session/lock': ConfigView;
  'detect/run': Result<DetectResult>;
  'duplicate/check': Result<{ matches: DuplicateMatch[] }>;
  'location/list': Result<{ locations: LocationOption[]; lastUsedId: string | null }>;
  'import/start': Result<PendingImport[]>;
  'import/retry': Result<PendingImport>;
  'import/abandon': Result<void>;
  'import/pending': PendingImport[];
  'amazon/extract': Result<DetectedPurchase>;
  'amazon/download': Result<DownloadedDocument>;
  'import/progress': undefined;
}

export type ResponseOf<T extends MessageType> = ResponseMap[T];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isStr = (x: unknown): x is string => typeof x === 'string';
const isInt = (x: unknown): x is number => Number.isInteger(x);
const isArr = Array.isArray;

/** `ImportDraft.photo` : absente ou `null` (aucune photo), sinon `{ url, merchantId, include }` bien typé. */
const isDraftPhoto = (x: unknown): boolean =>
  x === undefined ||
  x === null ||
  (isObj(x) && isStr(x.url) && isStr(x.merchantId) && typeof x.include === 'boolean');
/** `LocationChoice` : `id` textuel et `path` tableau de textes. */
const isLocationChoice = (x: unknown): boolean =>
  isObj(x) && isStr(x.id) && isArr(x.path) && x.path.every(isStr);
const isOptionalLocation = (x: unknown): boolean => x === undefined || x === null || isLocationChoice(x);
const areDrafts = (x: unknown): boolean =>
  isArr(x) && x.every((d) => isObj(d) && isDraftPhoto(d.photo) && isOptionalLocation(d.location));

const validators: { [K in MessageType]: (m: Record<string, unknown>) => boolean } = {
  'config/get': () => true,
  'config/save': (m) => isStr(m.baseUrl) && isStr(m.apiKey) && isStr(m.passphrase),
  'config/test': () => true,
  'config/delete': () => true,
  'session/unlock': (m) => isStr(m.passphrase),
  'session/lock': () => true,
  'detect/run': (m) => isInt(m.tabId),
  'duplicate/check': (m) => isStr(m.orderNumber) && isStr(m.name),
  'location/list': () => true,
  'import/start': (m) =>
    isInt(m.tabId) &&
    areDrafts(m.drafts) &&
    isArr(m.manualFiles) &&
    (m.orderLocationId === undefined || m.orderLocationId === null || isStr(m.orderLocationId)),
  'import/retry': (m) =>
    isStr(m.pendingId) && (m.manualFiles === undefined || isArr(m.manualFiles)) && isOptionalLocation(m.location),
  'import/abandon': (m) => isStr(m.pendingId),
  'import/pending': (m) => isInt(m.tabId),
  'amazon/extract': () => true,
  'amazon/download': (m) => isStr(m.url),
  'import/progress': (m) => isObj(m.pending),
};

export function isMessage(x: unknown): x is Message {
  if (!isObj(x) || !isStr(x.type) || !Object.hasOwn(validators, x.type)) return false;
  return validators[x.type as MessageType](x);
}

/** Envoie un message au service worker. */
export function send<T extends MessageType>(msg: MessageOf<T>): Promise<ResponseOf<T>> {
  return browser.runtime.sendMessage(msg) as Promise<ResponseOf<T>>;
}

/** Envoie un message au script injecté d'un onglet. */
export function sendToTab<T extends MessageType>(
  tabId: number,
  msg: MessageOf<T>,
): Promise<ResponseOf<T>> {
  return browser.tabs.sendMessage(tabId, msg) as Promise<ResponseOf<T>>;
}
