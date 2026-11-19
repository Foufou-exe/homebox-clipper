import { base64ToBytes, bytesToBase64 } from '@/shared/pdf';
import type { InstancesStore, Sealed, StoredInstance, Vault } from '@/shared/types';
import { DEFAULT_ITERATIONS, deriveKey, openHistoryKey, sealHistoryKey } from './key-vault';

/**
 * One passphrase, N API keys (spec 016, contracts/vault-crypto.md, research.md R2).
 * Same primitives and parameters as `key-vault.ts`: PBKDF2-SHA256 (600 000 iterations by default) → AES-GCM 256,
 * fresh random 12-byte IV for every sealing. Each API key is sealed separately with the address of ITS instance as
 * associated data. The vault key is never stored, never put in the session, never exportable: it lives for the
 * duration of one operation. Pure module: no storage, no session, no log; crypto failures are `null`/`false`.
 */

export const VAULT_CHECK_AAD = 'homebox-clipper/vault-check/v1';
/** Public constant, no secret: only proves that the derived key is the right one. */
export const VAULT_CHECK_PLAIN = 'homebox-clipper vault v1';

const encoder = new TextEncoder();
const buffer = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>;

/** A single PBKDF2 derivation (salt and iterations of the vault). */
export function deriveVaultKey(
  passphrase: string,
  vault: Pick<Vault, 'salt' | 'iterations'>,
): Promise<CryptoKey> {
  return deriveKey(passphrase, base64ToBytes(vault.salt), vault.iterations);
}

export function newVault(iterations: number = DEFAULT_ITERATIONS): {
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
} {
  return {
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),
  };
}

async function seal(key: CryptoKey, plain: Uint8Array, aad: string): Promise<Sealed> {
  // Fresh random IV at every call: never derived from a counter, never reused with this key.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
    key,
    buffer(plain),
  );
  return { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

/** `null` if malformed or not authentic. Never throws. */
async function open(key: CryptoKey, sealed: unknown, aad: string): Promise<Uint8Array | null> {
  if (typeof sealed !== 'object' || sealed === null) return null;
  const { iv, ct } = sealed as Record<string, unknown>;
  if (typeof iv !== 'string' || typeof ct !== 'string') return null;
  try {
    const ivBytes = base64ToBytes(iv);
    if (ivBytes.length !== 12) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buffer(ivBytes), additionalData: encoder.encode(aad) },
      key,
      buffer(base64ToBytes(ct)),
    );
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

/** Same `{ iv, ct }` as the former `EncryptedKey` (associated data = the instance address). */
export function sealApiKeyWith(key: CryptoKey, apiKey: string, baseUrl: string): Promise<Sealed> {
  return seal(key, encoder.encode(apiKey), baseUrl);
}

/** `null` if the key is wrong, the address differs or the data was tampered with. Never throws. */
export async function openApiKeyWith(
  key: CryptoKey,
  sealed: Sealed,
  baseUrl: string,
): Promise<string | null> {
  const plain = await open(key, sealed, baseUrl);
  return plain ? new TextDecoder().decode(plain) : null;
}

export function sealCheck(key: CryptoKey): Promise<Sealed> {
  return seal(key, encoder.encode(VAULT_CHECK_PLAIN), VAULT_CHECK_AAD);
}

export async function openCheck(key: CryptoKey, sealed: unknown): Promise<boolean> {
  const plain = await open(key, sealed, VAULT_CHECK_AAD);
  return plain !== null && new TextDecoder().decode(plain) === VAULT_CHECK_PLAIN;
}

export interface OpenedVault {
  /** Never stored, never sent: lives for the duration of the operation. */
  key: CryptoKey;
  /** id → API key. */
  keys: Record<string, string>;
  /** Ids whose key does not open although the passphrase is right. */
  unreadable: string[];
  history: { key: Uint8Array } | 'unreadable' | null;
  /** Seals created while opening (absent check, absent history key), to be written by the caller. */
  created?: { check?: Sealed; historyKey?: Sealed };
}

/**
 * Opens every key with a single derivation. `null`: wrong passphrase (or nothing to open: legacy key).
 * Rules (contracts/vault-crypto.md): (1) no vault → null; (2) one derivation; (3) check present and wrong → null;
 * (4) each sealed key opened with its address, failures → `unreadable`; (5) no check: at least one key must open,
 * then a check is created; (6) history key as `decryptSecrets` (absent → created, unreadable → 'unreadable').
 */
export async function openVault(
  store: InstancesStore,
  passphrase: string,
): Promise<OpenedVault | null> {
  const vault = store.vault;
  if (!vault) return null;
  let key: CryptoKey;
  try {
    key = await deriveVaultKey(passphrase, vault);
  } catch {
    return null;
  }
  const hasCheck = vault.check !== undefined && vault.check !== null;
  if (hasCheck && !(await openCheck(key, vault.check))) return null;

  const keys: Record<string, string> = {};
  const unreadable: string[] = [];
  for (const instance of store.instances) {
    if (instance.key === null) continue;
    const apiKey = await openApiKeyWith(key, instance.key, instance.baseUrl);
    if (apiKey === null) unreadable.push(instance.id);
    else keys[instance.id] = apiKey;
  }

  const created: NonNullable<OpenedVault['created']> = {};
  if (!hasCheck) {
    // Without a check seal, only an opened key proves the passphrase (vault migrated from 0.6.0 or earlier).
    if (Object.keys(keys).length === 0) return null;
    created.check = await sealCheck(key);
  }

  let history: OpenedVault['history'];
  if (vault.historyKey === undefined || vault.historyKey === null) {
    const fresh = crypto.getRandomValues(new Uint8Array(32));
    try {
      created.historyKey = await sealHistoryKey(fresh, key);
      history = { key: fresh };
    } catch {
      history = 'unreadable';
    }
  } else {
    const opened = await openHistoryKey(vault.historyKey, key);
    history = opened ? { key: opened } : 'unreadable';
  }

  return {
    key,
    keys,
    unreadable,
    history,
    ...(created.check || created.historyKey ? { created } : {}),
  };
}

/**
 * New salt, a single new derivation, everything resealed with fresh IVs (keys, history key, check). Pure: returns
 * the new store without writing it. A key that could not be opened becomes `key: null` and is listed in `reenter`.
 */
export async function rekeyVault(
  store: InstancesStore,
  opened: OpenedVault,
  next: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<{ store: InstancesStore; reenter: string[] }> {
  const vault = newVault(iterations);
  const key = await deriveVaultKey(next, vault);
  const reenter: string[] = [];
  const instances: StoredInstance[] = [];
  for (const instance of store.instances) {
    const apiKey = opened.keys[instance.id];
    if (apiKey === undefined) {
      reenter.push(instance.id);
      instances.push({ ...instance, key: null });
    } else
      instances.push({ ...instance, key: await sealApiKeyWith(key, apiKey, instance.baseUrl) });
  }
  const history = opened.history && opened.history !== 'unreadable' ? opened.history.key : null;
  return {
    store: {
      ...store,
      vault: {
        ...vault,
        check: await sealCheck(key),
        historyKey: history ? await sealHistoryKey(history, key) : null,
      },
      instances,
    },
    reenter,
  };
}
