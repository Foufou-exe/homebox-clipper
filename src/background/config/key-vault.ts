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

export async function encryptApiKey(
  apiKey: string,
  passphrase: string,
  baseUrl: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<EncryptedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
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

/** Returns `null` if the passphrase is wrong or the data has been tampered with. */
export async function decryptApiKey(
  blob: EncryptedKey,
  passphrase: string,
  baseUrl: string,
): Promise<string | null> {
  try {
    const key = await deriveKey(passphrase, base64ToBytes(blob.salt), blob.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buffer(base64ToBytes(blob.iv)), additionalData: encoder.encode(baseUrl) },
      key,
      buffer(base64ToBytes(blob.ct)),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
