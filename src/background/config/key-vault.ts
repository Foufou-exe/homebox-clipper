import { base64ToBytes, bytesToBase64 } from '@/shared/pdf';

/**
 * Encryption of the API key at rest (constitution, principle I).
 * AES-GCM 256 with a key derived from the passphrase (PBKDF2-SHA256).
 * The instance URL is used as associated data: changing the stored URL without the passphrase
 * makes decryption impossible (the key cannot be redirected to another server).
 */
export interface EncryptedKey {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

export const MIN_PASSPHRASE_LENGTH = 10;
/** OWASP 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_ITERATIONS = 600_000;

const encoder = new TextEncoder();
const buffer = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>;

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buffer(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * @internal Encrypts the API key alone. No longer used by the extension since spec 012 (`encryptSecrets` seals the
 * API key and the history key with a single derivation); kept for the existing tests (`tests/unit/key-vault.test.ts`,
 * which must stay unchanged) and for building configurations from before 012 in tests.
 */
export async function encryptApiKey(
  apiKey: string,
  passphrase: string,
  baseUrl: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<EncryptedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, iterations);
  return sealApiKey(apiKey, key, salt, iterations, baseUrl);
}

/** Returns `null` if the passphrase is wrong or the data has been tampered with. */
export async function decryptApiKey(
  blob: EncryptedKey,
  passphrase: string,
  baseUrl: string,
): Promise<string | null> {
  try {
    const key = await deriveKey(passphrase, base64ToBytes(blob.salt), blob.iterations);
    return await openApiKey(blob, key, baseUrl);
  } catch {
    return null;
  }
}

/**
 * History key (spec 012, research.md R10.2): a random 256-bit key sealed with the SAME passphrase-derived key
 * as the API key (same salt, same iterations: a single PBKDF2 derivation), with its own random IV and a constant
 * associated data. Distinct secret: it does not decrypt the API key, and vice versa.
 */
export interface SealedHistoryKey {
  iv: string;
  ct: string;
}

export const HISTORY_KEY_AAD = 'homebox-clipper/history-key/v1';
const HISTORY_KEY_BYTES = 32;

export interface OpenedSecrets {
  apiKey: string;
  /** `'unreadable'`: the sealed history key is corrupted or malformed; the API key is still returned. */
  history: { key: Uint8Array } | 'unreadable';
  /** Set when no history key existed (configuration from before 012): new key sealed with the same derivation. */
  created?: SealedHistoryKey;
}

async function sealApiKey(
  apiKey: string,
  key: CryptoKey,
  salt: Uint8Array,
  iterations: number,
  baseUrl: string,
): Promise<EncryptedKey> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(baseUrl) },
    key,
    encoder.encode(apiKey),
  );
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
  };
}

/** Throws if the key is wrong or the data has been tampered with. */
async function openApiKey(blob: EncryptedKey, key: CryptoKey, baseUrl: string): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buffer(base64ToBytes(blob.iv)), additionalData: encoder.encode(baseUrl) },
    key,
    buffer(base64ToBytes(blob.ct)),
  );
  return new TextDecoder().decode(plain);
}

async function sealHistoryKey(historyKey: Uint8Array, key: CryptoKey): Promise<SealedHistoryKey> {
  // Fresh random IV for every sealing, never reused with this derived key.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(HISTORY_KEY_AAD) },
    key,
    buffer(historyKey),
  );
  return { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

/** `null` if the seal is malformed, does not authenticate, or does not hold a 32-byte key. Never throws. */
async function openHistoryKey(sealed: unknown, key: CryptoKey): Promise<Uint8Array | null> {
  if (typeof sealed !== 'object' || sealed === null) return null;
  const { iv, ct } = sealed as Record<string, unknown>;
  if (typeof iv !== 'string' || typeof ct !== 'string') return null;
  try {
    const ivBytes = base64ToBytes(iv);
    if (ivBytes.length !== 12) return null;
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: buffer(ivBytes), additionalData: encoder.encode(HISTORY_KEY_AAD) },
        key,
        buffer(base64ToBytes(ct)),
      ),
    );
    return plain.length === HISTORY_KEY_BYTES ? plain : null;
  } catch {
    return null;
  }
}

/** Encrypts the API key and seals the history key with a single passphrase derivation. */
export async function encryptSecrets(
  apiKey: string,
  historyKey: Uint8Array,
  passphrase: string,
  baseUrl: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<{ encryptedKey: EncryptedKey; historyKey: SealedHistoryKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, iterations);
  return {
    encryptedKey: await sealApiKey(apiKey, key, salt, iterations, baseUrl),
    historyKey: await sealHistoryKey(historyKey, key),
  };
}

/**
 * Decrypts the API key and opens the history key with a single derivation (salt and iterations of `blob`).
 * `null` only if the API key cannot be decrypted (wrong passphrase, tampered data). The API key is returned even
 * when the history key is corrupted (`'unreadable'`); an absent history key (`null`/`undefined`) is created.
 */
export async function decryptSecrets(
  blob: EncryptedKey,
  sealed: unknown,
  passphrase: string,
  baseUrl: string,
): Promise<OpenedSecrets | null> {
  let key: CryptoKey;
  let apiKey: string;
  try {
    key = await deriveKey(passphrase, base64ToBytes(blob.salt), blob.iterations);
    apiKey = await openApiKey(blob, key, baseUrl);
  } catch {
    return null;
  }
  if (sealed === null || sealed === undefined) {
    const fresh = crypto.getRandomValues(new Uint8Array(HISTORY_KEY_BYTES));
    try {
      return { apiKey, history: { key: fresh }, created: await sealHistoryKey(fresh, key) };
    } catch {
      return { apiKey, history: 'unreadable' };
    }
  }
  const opened = await openHistoryKey(sealed, key);
  return opened ? { apiKey, history: { key: opened } } : { apiKey, history: 'unreadable' };
}
