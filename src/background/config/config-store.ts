import { browser, removeOrigin } from '@/platform';
import { fail, ok, type Result } from '@/shared/errors';
import type { ConfigView, LastCheck } from '@/shared/types';
import { DEFAULT_ITERATIONS, decryptApiKey, encryptApiKey, type EncryptedKey } from './key-vault';
import { originOf } from './url-policy';

const KEY = 'homeboxConfig';
/** Decrypted API key: storage.session only (in memory, cleared when the browser closes). */
const SESSION_KEY = 'homeboxUnlocked';
export const PENDING_PREFIX = 'pendingImport:';
/** Last location per instance (storage.local): identifiers only, cleared along with the configuration (FR-021). */
export const LAST_LOCATION_KEY = 'lastLocationByInstance';

/** Configuration persisted in storage.local: the key is only stored encrypted. */
interface StoredConfig {
  baseUrl: string;
  /** null: key migrated from the old format, awaiting a passphrase. */
  encryptedKey: EncryptedKey | null;
  maskedKey: string;
  lastCheck: LastCheck | null;
  /** Old format (v0.1.0): plaintext key. Removed by `migrateLegacy`. */
  apiKey?: string;
}

export interface Credentials {
  baseUrl: string;
  apiKey: string;
}

export function maskKey(apiKey: string): string {
  if (apiKey.length < 8) return '••••';
  return `${apiKey.slice(0, 3)}••••${apiKey.slice(-4)}`;
}

export function isValidApiKey(apiKey: string): boolean {
  return apiKey.trim() !== '' && !/\s/.test(apiKey);
}

async function readStored(): Promise<StoredConfig | null> {
  const stored = await browser.storage.local.get(KEY);
  return (stored[KEY] as StoredConfig | undefined) ?? null;
}

async function readSessionKey(): Promise<string | null> {
  const stored = await browser.storage.session.get(SESSION_KEY);
  return (stored[SESSION_KEY] as { apiKey: string } | undefined)?.apiKey ?? null;
}

/**
 * HomeBox configuration storage (R12, principle I).
 * Only the service worker uses it; the UI only receives `getView`, without the key.
 */
export const configStore = {
  /** Usable credentials: only when the extension is unlocked. */
  async getCredentials(): Promise<Result<Credentials>> {
    const config = await readStored();
    if (!config) return fail('NOT_CONFIGURED');
    const apiKey = await readSessionKey();
    if (!apiKey) return fail(config.encryptedKey ? 'LOCKED' : 'NOT_CONFIGURED');
    return ok({ baseUrl: config.baseUrl, apiKey });
  },

  async getView(): Promise<ConfigView> {
    const config = await readStored();
    if (!config) return { configured: false };
    const unlocked = (await readSessionKey()) !== null;
    return {
      configured: true,
      baseUrl: config.baseUrl,
      maskedKey: config.maskedKey,
      lastCheck: config.lastCheck,
      locked: !unlocked,
      needsPassphrase: config.encryptedKey === null,
    };
  },

  /** Encrypts and saves the key, then unlocks the session. */
  async save(
    { baseUrl, apiKey, passphrase }: { baseUrl: string; apiKey: string; passphrase: string },
    iterations = DEFAULT_ITERATIONS,
  ): Promise<void> {
    if (!isValidApiKey(apiKey)) throw new Error('invalid API key');
    const previous = await readStored();
    const config: StoredConfig = {
      baseUrl,
      encryptedKey: await encryptApiKey(apiKey, passphrase, baseUrl, iterations),
      maskedKey: maskKey(apiKey),
      lastCheck: previous?.baseUrl === baseUrl ? previous.lastCheck : null,
    };
    await browser.storage.local.set({ [KEY]: config });
    await browser.storage.session.set({ [SESSION_KEY]: { apiKey } });
  },

  /**
   * Current key, to re-save the configuration without retyping it:
   * decrypted with the passphrase, or a migrated key still in memory.
   */
  async currentKey(passphrase: string): Promise<Result<string>> {
    const config = await readStored();
    if (!config) return fail('NOT_CONFIGURED');
    if (!config.encryptedKey) {
      const apiKey = await readSessionKey();
      return apiKey ? ok(apiKey) : fail('NOT_CONFIGURED');
    }
    const apiKey = await decryptApiKey(config.encryptedKey, passphrase, config.baseUrl);
    return apiKey ? ok(apiKey) : fail('WRONG_PASSPHRASE');
  },

  async unlock(passphrase: string): Promise<Result<void>> {
    const config = await readStored();
    if (!config) return fail('NOT_CONFIGURED');
    if (!config.encryptedKey) return fail('NOT_CONFIGURED');
    const apiKey = await decryptApiKey(config.encryptedKey, passphrase, config.baseUrl);
    if (!apiKey) return fail('WRONG_PASSPHRASE');
    await browser.storage.session.set({ [SESSION_KEY]: { apiKey } });
    return ok(undefined);
  },

  async lock(): Promise<void> {
    await browser.storage.session.remove(SESSION_KEY);
  },

  /** Old plaintext format: the key leaves the disk and stays in memory until a passphrase is chosen. */
  async migrateLegacy(): Promise<void> {
    const config = await readStored();
    if (!config?.apiKey) return;
    const { apiKey, ...rest } = config;
    await browser.storage.session.set({ [SESSION_KEY]: { apiKey } });
    await browser.storage.local.set({
      [KEY]: { ...rest, encryptedKey: null, maskedKey: maskKey(apiKey), lastCheck: config.lastCheck ?? null },
    });
  },

  async setLastCheck(lastCheck: LastCheck): Promise<void> {
    const config = await readStored();
    if (!config) return;
    await browser.storage.local.set({ [KEY]: { ...config, lastCheck } });
  },

  async delete(): Promise<void> {
    const config = await readStored();
    await browser.storage.local.remove([KEY, LAST_LOCATION_KEY]);
    if (config) {
      try {
        await removeOrigin(originOf(config.baseUrl));
      } catch {
        // permission already absent
      }
    }
    const session = await browser.storage.session.get(null);
    const keys = Object.keys(session).filter((k) => k.startsWith(PENDING_PREFIX) || k === SESSION_KEY);
    if (keys.length) await browser.storage.session.remove(keys);
  },
};
