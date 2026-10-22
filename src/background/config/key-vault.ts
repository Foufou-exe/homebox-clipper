import { base64ToBytes, bytesToBase64 } from '@/shared/pdf';

/**
 * Chiffrement de la clé API au repos (constitution, principe I).
 * AES-GCM 256 avec une clé dérivée de la phrase de passe (PBKDF2-SHA256).
 * L'URL de l'instance sert de données associées : modifier l'URL stockée sans la phrase de passe
 * rend le déchiffrement impossible (pas de détournement de la clé vers un autre serveur).
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
/** Recommandation OWASP 2023 pour PBKDF2-HMAC-SHA256. */
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

/** Renvoie `null` si la phrase de passe est fausse ou si les données ont été altérées. */
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
