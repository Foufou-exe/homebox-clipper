import { browser, removeOrigin } from '@/platform';
import { fail, ok, type Result } from '@/shared/errors';
import type { ConfigView, LastCheck } from '@/shared/types';
import { base64ToBytes, bytesToBase64 } from '@/shared/pdf';
import {
  DEFAULT_ITERATIONS,
  decryptApiKey,
  decryptSecrets,
  encryptSecrets,
  type EncryptedKey,
  type SealedHistoryKey,
} from './key-vault';
import { originOf } from './url-policy';
import { enqueueHistoryWrite } from '@/background/history/history-queue';
import { activeImports } from '@/background/import/active-imports';
import { logError } from '@/shared/logger';
import {
  DEFAULT_LOCK_SETTINGS,
  idleLimitMs,
  isIdleExpired,
  parseLockSettings,
  type LockPolicy,
  type LockSettings,
} from '@/shared/lock-policy';

const KEY = 'homeboxConfig';
/** Decrypted API key: storage.session only (in memory, cleared when the browser closes). */
const SESSION_KEY = 'homeboxUnlocked';
export const PENDING_PREFIX = 'pendingImport:';
/** Last location per instance (storage.local): identifiers only, cleared along with the configuration (FR-021). */
export const LAST_LOCATION_KEY = 'lastLocationByInstance';
/** Encrypted import history (spec 012): one `importHistory:<id>` key per entry, in storage.local. */
export const HISTORY_PREFIX = 'importHistory:';
/** History setting `{ v: 1, enabled }`, in clear (not purchase data); kept when the configuration is deleted. */
export const HISTORY_SETTINGS_KEY = 'importHistorySettings';
/** Automatic lock setting `{ v: 1, policy }` (013), in storage.local: a choice, no secret; kept on delete (E5). */
export const LOCK_SETTINGS_KEY = 'lockSettings';
/**
 * Last activity `{ at }` (013, R1, R2), in storage.session only: written with the key, removed with it.
 * Never exposed to the UI or the logs.
 */
export const ACTIVITY_KEY = 'homeboxActivity';
/** Activity is written at most every 15 s (writing more often brings nothing). */
const TOUCH_INTERVAL_MS = 15_000;
/**
 * Lock due (013, review T070): the inactivity deadline passed while an import was running. In storage.session: the
 * running import keeps the keys it captured, every new read of the key is refused, and the lock applies at its end.
 */
export const LOCK_DUE_KEY = 'homeboxLockDue';

/** Configuration persisted in storage.local: the key is only stored encrypted. */
interface StoredConfig {
  baseUrl: string;
  /** null: key migrated from the old format, awaiting a passphrase. */
  encryptedKey: EncryptedKey | null;
  maskedKey: string;
  lastCheck: LastCheck | null;
  /**
   * History key sealed with the passphrase-derived key of `encryptedKey` (same salt and iterations, R10.2).
   * Absent or null: no history key yet (configuration from before 012, key migrated without passphrase).
   */
  historyKey?: SealedHistoryKey | null;
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

/** Session content: the API key and, once unlocked with a passphrase, the open history key (base64 of 32 bytes). */
interface UnlockedSession {
  apiKey: string;
  historyKey?: string;
}

/** Automatic lock setting; never throws: a read error gives the default (FR-010). */
async function getLockSettings(): Promise<LockSettings> {
  try {
    const stored = await browser.storage.local.get(LOCK_SETTINGS_KEY);
    return parseLockSettings(stored[LOCK_SETTINGS_KEY]);
  } catch {
    return { ...DEFAULT_LOCK_SETTINGS };
  }
}

/** The only lock function, manual and automatic (FR-006): the key, the open history key and the activity leave. */
async function lock(): Promise<void> {
  await browser.storage.session.remove([SESSION_KEY, ACTIVITY_KEY, LOCK_DUE_KEY]);
}

/**
 * Expiry check shared by every key access (013, R1). `open`: nothing due. `locked`: the inactivity limit was passed
 * (duration policy, encrypted configuration: a key migrated without passphrase would be lost) and the session has
 * just been locked. `due`: the limit was passed while an import runs: the key stays for that import only, any new
 * read is refused, and the lock applies once the imports end (FR-007).
 * Reads the session directly (not through `readSession`, which calls it).
 */
async function sessionState(now: number): Promise<'open' | 'due' | 'locked'> {
  const session = await browser.storage.session.get([SESSION_KEY, ACTIVITY_KEY, LOCK_DUE_KEY]);
  if (!session[SESSION_KEY]) return 'open';
  if (session[LOCK_DUE_KEY] !== true) {
    const { policy } = await getLockSettings();
    if (idleLimitMs(policy) === null) return 'open';
    const config = await readStored();
    if (!config?.encryptedKey) return 'open';
    const activity = session[ACTIVITY_KEY] as { at?: unknown } | undefined;
    if (!isIdleExpired(policy, activity?.at, now)) return 'open';
  }
  if (activeImports.size > 0) {
    if (session[LOCK_DUE_KEY] !== true) await browser.storage.session.set({ [LOCK_DUE_KEY]: true });
    return 'due';
  }
  try {
    await lock();
  } catch (error) {
    // The key is not handed out: the error goes up to the handler (BAD_MESSAGE).
    logError('auto-lock failed', { endpoint: 'session/lock' });
    throw error;
  }
  return 'locked';
}

/** Locks if the inactivity limit is passed and no import runs. True only if it locked now. Idempotent. */
async function expireIfDue(now: number = Date.now()): Promise<boolean> {
  return (await sessionState(now)) === 'locked';
}

/** Writes `{ at: now }` if the session is unlocked (activity present) and, unless forced, the last write is older than 15 s. */
async function writeActivity(now: number, force: boolean): Promise<void> {
  const stored = await browser.storage.session.get([ACTIVITY_KEY, LOCK_DUE_KEY]);
  const activity = stored[ACTIVITY_KEY] as { at?: unknown } | undefined;
  // A due lock is never postponed: only a new unlock cancels it.
  if (!activity || stored[LOCK_DUE_KEY] === true) return;
  if (!force && typeof activity.at === 'number' && now - activity.at <= TOUCH_INTERVAL_MS) return;
  await browser.storage.session.set({ [ACTIVITY_KEY]: { at: now } });
}

/** Every access to the key goes through here: an expired session is locked before any read (E1). */
async function readSession(): Promise<UnlockedSession | null> {
  if ((await sessionState(Date.now())) === 'due') return null;
  const stored = await browser.storage.session.get(SESSION_KEY);
  return (stored[SESSION_KEY] as UnlockedSession | undefined) ?? null;
}

async function readSessionKey(): Promise<string | null> {
  return (await readSession())?.apiKey ?? null;
}

async function writeSession(apiKey: string, historyKey: Uint8Array | null): Promise<void> {
  const value: UnlockedSession = historyKey ? { apiKey, historyKey: bytesToBase64(historyKey) } : { apiKey };
  // Unlocking is an activity: key and timestamp are written together (invariant 1 of data-model.md).
  await browser.storage.session.set({ [SESSION_KEY]: value, [ACTIVITY_KEY]: { at: Date.now() } });
  // A new unlock cancels a lock that was due during an import.
  await browser.storage.session.remove(LOCK_DUE_KEY);
}

function sessionHistoryKey(session: UnlockedSession | null): Uint8Array | null {
  if (typeof session?.historyKey !== 'string') return null;
  try {
    const key = base64ToBytes(session.historyKey);
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

/**
 * History key to seal at `save` (R5.5): the one of the session (unlocked), otherwise the stored one reopened with
 * the passphrase provided (kept key, current passphrase). `null`: no key can be recovered.
 */
async function recoverHistoryKey(previous: StoredConfig | null, passphrase: string): Promise<Uint8Array | null> {
  const fromSession = sessionHistoryKey(await readSession());
  if (fromSession) return fromSession;
  if (!previous?.encryptedKey || !previous.historyKey) return null;
  const opened = await decryptSecrets(previous.encryptedKey, previous.historyKey, passphrase, previous.baseUrl);
  return opened && opened.history !== 'unreadable' ? opened.history.key : null;
}

/** 32 random bytes: a new history key. */
const newHistoryKey = () => crypto.getRandomValues(new Uint8Array(32));

/**
 * Removes every encrypted history entry (`importHistory:*`); the setting is kept. Goes through the history write
 * queue, so that a `list` reconciling or pruning at the same time cannot write an entry back after the erasing.
 */
function eraseHistoryEntries(): Promise<void> {
  return enqueueHistoryWrite(async () => {
    const all = await browser.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith(HISTORY_PREFIX));
    if (keys.length) await browser.storage.local.remove(keys);
  });
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
    let historyKey = await recoverHistoryKey(previous, passphrase);
    if (!historyKey) {
      // R5.5 step 3: the former history key cannot be recovered (new passphrase while locked, unreadable seal):
      // its entries can never be read again, they are erased explicitly (the UI warns before sending).
      await eraseHistoryEntries();
      historyKey = newHistoryKey();
    }
    const sealed = await encryptSecrets(apiKey, historyKey, passphrase, baseUrl, iterations);
    const config: StoredConfig = {
      baseUrl,
      encryptedKey: sealed.encryptedKey,
      maskedKey: maskKey(apiKey),
      lastCheck: previous?.baseUrl === baseUrl ? previous.lastCheck : null,
      historyKey: sealed.historyKey,
    };
    await browser.storage.local.set({ [KEY]: config });
    await writeSession(apiKey, historyKey);
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
    // A single PBKDF2 derivation for both secrets (R10.2). The API key is unlocked even if the history key
    // is absent or corrupted: the history is then created, or unavailable.
    const opened = await decryptSecrets(config.encryptedKey, config.historyKey, passphrase, config.baseUrl);
    if (!opened) return fail('WRONG_PASSPHRASE');
    if (opened.created) {
      try {
        await browser.storage.local.set({ [KEY]: { ...config, historyKey: opened.created } });
      } catch {
        // history key not saved: the API key is unlocked anyway, without history
        await writeSession(opened.apiKey, null);
        return ok(undefined);
      }
    }
    await writeSession(opened.apiKey, opened.history === 'unreadable' ? null : opened.history.key);
    return ok(undefined);
  },

  /** Open history key (32 bytes), only when unlocked. Never leaves the service worker. */
  async getHistoryKey(): Promise<Uint8Array | null> {
    return sessionHistoryKey(await readSession());
  },

  /**
   * `ready`: history key in session. `locked`: encrypted configuration, API key not in session.
   * `unavailable`: no configuration, key migrated without passphrase, or unlocked without a readable history key.
   */
  async historyState(): Promise<'ready' | 'locked' | 'unavailable'> {
    const config = await readStored();
    if (!config?.encryptedKey) return 'unavailable';
    const session = await readSession();
    if (!session?.apiKey) return 'locked';
    return sessionHistoryKey(session) ? 'ready' : 'unavailable';
  },

  lock,

  getLockSettings,

  /** Writes `{ v: 1, policy }` only; restarts the countdown if unlocked. Never locks, never asks for the passphrase (FR-008). */
  async setLockSettings(policy: LockPolicy, now: number = Date.now()): Promise<LockSettings> {
    const settings: LockSettings = { v: 1, policy };
    await browser.storage.local.set({ [LOCK_SETTINGS_KEY]: settings });
    await writeActivity(now, true);
    return settings;
  },

  expireIfDue,

  /** Records an activity (at most every 15 s), only while unlocked. */
  async touch(now: number = Date.now()): Promise<void> {
    await writeActivity(now, false);
  },

  /** "Every time the extension is opened" (R3): locks unless an import is running ('deferred'). */
  async lockIfEveryOpen(): Promise<'locked' | 'deferred' | 'none'> {
    const { policy } = await getLockSettings();
    if (policy !== 'every-open') return 'none';
    const config = await readStored();
    if (!config?.encryptedKey) return 'none';
    if (activeImports.size > 0) return 'deferred';
    await lock();
    return 'locked';
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
    // Session first (decrypted API key, open history key, imports in progress): an error further on never leaves
    // a key open in memory.
    const session = await browser.storage.session.get(null);
    const keys = Object.keys(session).filter(
      (k) => k.startsWith(PENDING_PREFIX) || k === SESSION_KEY || k === ACTIVITY_KEY || k === LOCK_DUE_KEY,
    );
    if (keys.length) await browser.storage.session.remove(keys);
    const config = await readStored();
    // The sealed history key leaves with KEY; its entries are erased too (FR-009). The history and lock settings
    // and the update notice are kept (E5).
    await browser.storage.local.remove([KEY, LAST_LOCATION_KEY]);
    await eraseHistoryEntries();
    if (config) {
      try {
        await removeOrigin(originOf(config.baseUrl));
      } catch {
        // permission already absent
      }
    }
  },
};
