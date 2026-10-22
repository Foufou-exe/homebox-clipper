import { browser } from '@/platform';
import type { ErrorCode, Result } from './errors';
import type {
  ConfigView,
  DetectedPurchase,
  DuplicateMatch,
  ImportDraft,
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
  | { type: 'import/start'; tabId: number; drafts: ImportDraft[]; manualFiles: ManualFile[] }
  | { type: 'import/retry'; pendingId: string; manualFiles?: ManualFile[] }
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

const validators: { [K in MessageType]: (m: Record<string, unknown>) => boolean } = {
  'config/get': () => true,
  'config/save': (m) => isStr(m.baseUrl) && isStr(m.apiKey) && isStr(m.passphrase),
  'config/test': () => true,
  'config/delete': () => true,
  'session/unlock': (m) => isStr(m.passphrase),
  'session/lock': () => true,
  'detect/run': (m) => isInt(m.tabId),
  'duplicate/check': (m) => isStr(m.orderNumber) && isStr(m.name),
  'import/start': (m) => isInt(m.tabId) && isArr(m.drafts) && isArr(m.manualFiles),
  'import/retry': (m) => isStr(m.pendingId) && (m.manualFiles === undefined || isArr(m.manualFiles)),
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
