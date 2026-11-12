import { ERROR_CODES } from '@/shared/errors';
import { base64ToBytes, bytesToBase64 } from '@/shared/pdf';
import type { HistoryMissing, HistoryStatus, ImportHistoryEntry } from '@/shared/types';

/**
 * Encryption of the import history at rest (spec 012, FR-014, research.md R10).
 * AES-GCM 256 under the history key (random, sealed by the passphrase in `key-vault.ts`). Every write uses a
 * fresh random 12-byte IV, and the storage key `importHistory:<id>` is the associated data. Nothing about the
 * entry is stored in clear. Service worker only; no console, no network.
 */

/** Non-extractable AES-GCM key, never put in the session nor in a message. */
export type HistoryKey = CryptoKey;

/** What is actually written in storage.local: nothing else is in clear. */
export interface HistoryEnvelope {
  v: 1;
  iv: string;
  ct: string;
}

const encoder = new TextEncoder();
const buffer = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>;
const aad = (id: string) => encoder.encode(`importHistory:${id}`);

export function generateHistoryKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function importHistoryKey(raw: Uint8Array): Promise<HistoryKey> {
  return crypto.subtle.importKey('raw', buffer(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(
  content: ImportHistoryEntry,
  key: HistoryKey,
  id: string,
): Promise<HistoryEnvelope> {
  // A fresh random IV at every call: never derived from a counter, never reused with the same key.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(id) },
    key,
    encoder.encode(JSON.stringify(content)),
  );
  return { v: 1, iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

const STATUSES: readonly HistoryStatus[] = ['running', 'complete', 'partial', 'failed'];
const MISSING: readonly HistoryMissing[] = ['details', 'invoice', 'documents', 'photo'];
const KEYS = new Set([
  'v',
  'id',
  'importedAt',
  'name',
  'merchantId',
  'orderNumber',
  'purchaseDate',
  'instance',
  'entityId',
  'status',
  'missing',
  'reason',
  'interrupted',
]);
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const strOrNull = (x: unknown) => x === null || isStr(x);

/** Content `v = 1`: every field present with the right type, and no other field (whitelist). */
export function isValidEntry(x: unknown, id: string): x is ImportHistoryEntry {
  if (!isObj(x) || x.v !== 1 || x.id !== id) return false;
  if (Object.keys(x).some((k) => !KEYS.has(k))) return false;
  const {
    importedAt,
    name,
    merchantId,
    orderNumber,
    purchaseDate,
    instance,
    entityId,
    status,
    missing,
    reason,
  } = x;
  return (
    isStr(importedAt) &&
    !Number.isNaN(Date.parse(importedAt)) &&
    isStr(name) &&
    name.length >= 1 &&
    name.length <= 255 &&
    strOrNull(merchantId) &&
    (orderNumber === null ||
      (isStr(orderNumber) && orderNumber.length >= 1 && orderNumber.length <= 64)) &&
    (purchaseDate === null || (isStr(purchaseDate) && /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate))) &&
    isStr(instance) &&
    strOrNull(entityId) &&
    STATUSES.includes(status as HistoryStatus) &&
    Array.isArray(missing) &&
    missing.every((m) => MISSING.includes(m as HistoryMissing)) &&
    new Set(missing).size === missing.length &&
    (reason === null || (ERROR_CODES as readonly unknown[]).includes(reason)) &&
    (x.interrupted === undefined || x.interrupted === true)
  );
}

/**
 * Opens an envelope. `'future'`: envelope or content of a later version (kept, ignored). `null`: malformed
 * envelope, wrong key, tampered ciphertext, wrong id, invalid JSON or invalid content. Never throws.
 */
export async function open(
  env: unknown,
  key: HistoryKey,
  id: string,
): Promise<ImportHistoryEntry | 'future' | null> {
  if (!isObj(env) || typeof env.v !== 'number') return null;
  if (env.v > 1) return 'future';
  if (env.v !== 1 || !isStr(env.iv) || !isStr(env.ct)) return null;
  let content: unknown;
  try {
    const iv = base64ToBytes(env.iv);
    if (iv.length !== 12) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buffer(iv), additionalData: aad(id) },
      key,
      buffer(base64ToBytes(env.ct)),
    );
    content = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
  if (isObj(content) && typeof content.v === 'number' && content.v > 1) return 'future';
  return isValidEntry(content, id) ? content : null;
}
