import { browser, removeOrigin } from '@/platform';
import { logError } from '@/shared/logger';
import type { InstancesStore, LastCheck, StoredInstance } from '@/shared/types';
import type { EncryptedKey, SealedHistoryKey } from './key-vault';
import { normalizeBaseUrl, originOf } from './url-policy';

/**
 * HomeBox instances storage (spec 016, contracts/storage-migration.md): the vault and the ordered list of
 * instances, in a single `storage.local` key. Service worker only. Never logs an address, a name, an id or a key:
 * only constant endpoint templates (`config/invalid`, `config/migrate`).
 */

export const INSTANCES_KEY = 'homeboxInstances';
export const LEGACY_KEY = 'homeboxConfig';
export const LAST_INSTANCE_KEY = 'lastInstanceId';
/** Last location per instance (storage.local): identifiers only, cleared along with the configuration (FR-021). */
export const LAST_LOCATION_KEY = 'lastLocationByInstance';
export const MAX_INSTANCES = 10;
export const MAX_NAME_LENGTH = 50;
export const MIGRATED_ID = 'migrated';
const MAX_ID_LENGTH = 64;

/** Former single configuration (≤ 0.6.0), as written by `configStore` before spec 016. */
export interface LegacyConfig {
  baseUrl: string;
  /** null: key migrated from the plaintext format, awaiting a passphrase. */
  encryptedKey: EncryptedKey | null;
  maskedKey: string;
  lastCheck?: LastCheck | null;
  historyKey?: SealedHistoryKey | null;
  /** Plaintext key (v0.1.0): handled before by `configStore.migrateLegacy`. */
  apiKey?: string;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

/** Instance identifier: non-empty string of 1 to 64 characters. */
export function isInstanceId(x: unknown): x is string {
  return isStr(x) && x.length >= 1 && x.length <= MAX_ID_LENGTH;
}

const nameKey = (name: string) => name.toLowerCase();

/** Truncates to `max` UTF-16 units without splitting a surrogate pair. */
function cut(value: string, max: number): string {
  if (value.length <= max) return value;
  const sliced = value.slice(0, max);
  const last = sliced.charCodeAt(sliced.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? sliced.slice(0, -1) : sliced;
}

/** Host of the address (port only if not standard), 50 characters at most; "(2)", "(3)"… if taken (case ignored). */
export function defaultName(baseUrl: string, taken: readonly string[]): string {
  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    host = baseUrl;
  }
  const used = new Set(taken.map(nameKey));
  const first = cut(host, MAX_NAME_LENGTH);
  if (!used.has(nameKey(first))) return first;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = `${cut(host, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
}

/** Result of `validateName`; the two codes join `ERROR_CODES` with the instance management messages (delivery B). */
export type NameResult =
  | { ok: true; value: string }
  | { ok: false; error: 'INSTANCE_NAME_INVALID' | 'INSTANCE_NAME_TAKEN' };

/** User input: trimmed; empty → default name of `baseUrl`; > 50 → invalid; taken (case ignored) → taken. */
export function validateName(input: string, taken: readonly string[], baseUrl: string): NameResult {
  const name = input.trim();
  if (name === '') return { ok: true, value: defaultName(baseUrl, taken) };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: 'INSTANCE_NAME_INVALID' };
  if (taken.some((t) => nameKey(t) === nameKey(name)))
    return { ok: false, error: 'INSTANCE_NAME_TAKEN' };
  return { ok: true, value: name };
}

/** Same address after `normalizeBaseUrl` (trailing slash, host case, default port, `/api` suffix). */
export function sameAddress(a: string, b: string): boolean {
  const x = normalizeBaseUrl(a);
  const y = normalizeBaseUrl(b);
  return x.ok && y.ok && x.value.baseUrl === y.value.baseUrl;
}

const isNormalized = (baseUrl: unknown): baseUrl is string => {
  if (!isStr(baseUrl)) return false;
  const url = normalizeBaseUrl(baseUrl);
  return url.ok && url.value.baseUrl === baseUrl;
};

const isSealed = (x: unknown): boolean => isObj(x) && isStr(x.iv) && isStr(x.ct);

const isLastCheck = (x: unknown): boolean =>
  x === null || (isObj(x) && (x.status === 'ok' || x.status === 'error') && isStr(x.at));

function isStoredInstance(x: unknown): x is StoredInstance {
  return (
    isObj(x) &&
    isInstanceId(x.id) &&
    isStr(x.name) &&
    x.name.length >= 1 &&
    x.name.length <= MAX_NAME_LENGTH &&
    x.name.trim() === x.name &&
    isNormalized(x.baseUrl) &&
    (x.key === null || isSealed(x.key)) &&
    isStr(x.maskedKey) &&
    isLastCheck(x.lastCheck)
  );
}

/** Validation rules of data-model.md §2. The seals' content is checked when opening, not here. */
export function isValidStore(x: unknown): x is InstancesStore {
  if (!isObj(x) || x.v !== 1) return false;
  if (x.migratedFrom !== undefined && x.migratedFrom !== 'homeboxConfig') return false;
  const { vault, instances } = x;
  if (vault !== null) {
    if (!isObj(vault) || vault.kdf !== 'PBKDF2-SHA256' || !isStr(vault.salt)) return false;
    if (!Number.isInteger(vault.iterations) || (vault.iterations as number) < 1) return false;
  }
  if (!Array.isArray(instances) || instances.length < 1 || instances.length > MAX_INSTANCES)
    return false;
  if (!instances.every(isStoredInstance)) return false;
  const list = instances as StoredInstance[];
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (
    !unique(list.map((i) => i.id)) ||
    !unique(list.map((i) => i.baseUrl)) ||
    !unique(list.map((i) => nameKey(i.name)))
  ) {
    return false;
  }
  if (vault === null && (list.length !== 1 || list[0]?.key !== null)) return false;
  return true;
}

/** Pure mapping of the former configuration (data-model §2): bytes copied as is, no cryptography. */
export function fromLegacy(legacy: LegacyConfig): InstancesStore {
  const ek = legacy.encryptedKey;
  return {
    v: 1,
    vault: ek
      ? {
          kdf: ek.kdf,
          iterations: ek.iterations,
          salt: ek.salt,
          ...(legacy.historyKey !== undefined ? { historyKey: legacy.historyKey } : {}),
        }
      : null,
    instances: [
      {
        id: MIGRATED_ID,
        name: defaultName(legacy.baseUrl, []),
        baseUrl: legacy.baseUrl,
        key: ek ? { iv: ek.iv, ct: ek.ct } : null,
        maskedKey: legacy.maskedKey,
        lastCheck: legacy.lastCheck ?? null,
      },
    ],
    migratedFrom: 'homeboxConfig',
  };
}

/** A former configuration that can be migrated: encrypted (or legacy key without passphrase), valid once mapped. */
function isLegacyConfig(x: unknown): x is LegacyConfig {
  if (!isObj(x) || !isStr(x.baseUrl) || !isStr(x.maskedKey)) return false;
  const ek = x.encryptedKey;
  if (ek !== null) {
    if (!isObj(ek) || ek.kdf !== 'PBKDF2-SHA256' || !Number.isInteger(ek.iterations)) return false;
    if (!isStr(ek.salt) || !isStr(ek.iv) || !isStr(ek.ct)) return false;
  }
  if (x.lastCheck !== undefined && !isLastCheck(x.lastCheck)) return false;
  return isValidStore(fromLegacy(x as unknown as LegacyConfig));
}

const local = () => browser.storage.local;

/**
 * Single write queue of the instances (same pattern as `history-queue.ts`): a failed write does not block the
 * next one; two concurrent writes lose nothing. The migration goes through it too.
 */
let queue: Promise<unknown> = Promise.resolve();
function enqueueConfigWrite<T>(op: () => Promise<T>): Promise<T> {
  const result = queue.then(op);
  queue = result.catch(() => undefined);
  return result;
}

/** Validated read, without waiting for the migration (used inside the queue). Fallback view from homeboxConfig. */
async function readStore(): Promise<InstancesStore | null> {
  const stored = await local().get([INSTANCES_KEY, LEGACY_KEY]);
  const raw = stored[INSTANCES_KEY];
  if (raw !== undefined) {
    if (isValidStore(raw)) return raw;
    logError('invalid configuration', { endpoint: 'config/invalid' });
    return null;
  }
  const legacy = stored[LEGACY_KEY];
  return isLegacyConfig(legacy) ? fromLegacy(legacy) : null;
}

/** Origins are compared as `URL.origin` (scheme, host, port). */
function usesOrigin(store: InstancesStore | null, origin: string, except?: string): boolean {
  return !!store?.instances.some((i) => i.id !== except && originOf(i.baseUrl) === origin);
}

/** Removes `${origin}/*` only if no instance uses this origin any more. Never throws. */
async function releaseOrigin(origin: string, except?: string): Promise<void> {
  try {
    if (usesOrigin(await readStore(), origin, except)) return;
    await removeOrigin(origin);
  } catch {
    // permission already absent, or storage unreadable: nothing is removed by mistake
  }
}

const isOriginKey = (key: string) => /^https?:\/\//.test(key);

/**
 * Idempotent migration of `homeboxConfig` (contracts/storage-migration.md), each step preceded by a re-read.
 * No passphrase, no permission request, no network, no session write. Never throws.
 */
async function runMigration(): Promise<'none' | 'migrated' | 'resumed' | 'failed'> {
  try {
    let result: 'none' | 'migrated' | 'resumed' = 'none';
    // Step 1: a single set of homeboxInstances, equal to the pure mapping (id `migrated`).
    let stored = await local().get([INSTANCES_KEY, LEGACY_KEY]);
    if (stored[INSTANCES_KEY] === undefined) {
      if (stored[LEGACY_KEY] === undefined) return 'none';
      if (!isLegacyConfig(stored[LEGACY_KEY])) {
        logError('migration failed', { endpoint: 'config/migrate' });
        return 'failed';
      }
      await local().set({ [INSTANCES_KEY]: fromLegacy(stored[LEGACY_KEY]) });
      result = 'migrated';
    }

    stored = await local().get([INSTANCES_KEY, LEGACY_KEY, LAST_LOCATION_KEY]);
    const store = stored[INSTANCES_KEY];
    if (!isValidStore(store)) {
      // An invalid store is never overwritten nor is the former configuration removed.
      if (stored[LEGACY_KEY] === undefined) return result;
      logError('migration failed', { endpoint: 'config/migrate' });
      return 'failed';
    }

    // Step 2: the last location of the migrated instance is re-indexed by id; other origin keys are dropped.
    const migrated = store.instances.find((i) => i.id === MIGRATED_ID);
    const table = stored[LAST_LOCATION_KEY];
    if (store.migratedFrom && migrated && isObj(table)) {
      const origin = originOf(migrated.baseUrl);
      if (isStr(table[origin]) && table[MIGRATED_ID] === undefined) {
        const kept = Object.entries(table).filter(([k]) => !isOriginKey(k));
        await local().set({
          [LAST_LOCATION_KEY]: { [MIGRATED_ID]: table[origin], ...Object.fromEntries(kept) },
        });
        if (result === 'none') result = 'resumed';
      }
    }

    // Step 3: the former configuration leaves; its origin permission only if no instance uses it.
    const legacy = stored[LEGACY_KEY];
    if (legacy !== undefined) {
      await local().remove(LEGACY_KEY);
      if (isObj(legacy) && isStr(legacy.baseUrl)) {
        let origin: string | null = null;
        try {
          origin = originOf(legacy.baseUrl);
        } catch {
          // malformed address: no permission to release
        }
        if (origin) await releaseOrigin(origin);
      }
      if (result === 'none') result = 'resumed';
    }
    return result;
  } catch {
    logError('migration failed', { endpoint: 'config/migrate' });
    return 'failed';
  }
}

/** Resolved once the last started migration has ended (already resolved when none was started). */
let ready: Promise<void> = Promise.resolve();

export const instanceStore = {
  get ready(): Promise<void> {
    return ready;
  },

  /**
   * Idempotent migration; every read waits for it (`ready`, set synchronously). `before` (the plaintext-key
   * migration of `configStore`) runs first, inside the same `ready`; its failure does not stop the migration.
   * Never throws.
   */
  migrate(before?: () => Promise<void>): Promise<'none' | 'migrated' | 'resumed' | 'failed'> {
    const first = before ? before().catch(() => undefined) : Promise.resolve();
    const run = first.then(() => enqueueConfigWrite(runMigration));
    ready = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  },

  /** Validated read; fallback view from homeboxConfig while the migration has not succeeded; null if not configured. */
  async read(): Promise<InstancesStore | null> {
    await ready;
    return readStore();
  },

  /**
   * Serialized write: `fn` receives the current state and returns the new one, or null (nothing written).
   * homeboxInstances absent and homeboxConfig present: the migration is retried first; if it fails again, throws.
   */
  update(
    fn: (s: InstancesStore | null) => Promise<InstancesStore | null> | InstancesStore | null,
  ): Promise<void> {
    return enqueueConfigWrite(async () => {
      let stored = await local().get([INSTANCES_KEY, LEGACY_KEY]);
      if (stored[INSTANCES_KEY] === undefined && stored[LEGACY_KEY] !== undefined) {
        await runMigration();
        stored = await local().get([INSTANCES_KEY, LEGACY_KEY]);
        if (stored[INSTANCES_KEY] === undefined) throw new Error('configuration not migrated');
      }
      const raw = stored[INSTANCES_KEY];
      const next = await fn(isValidStore(raw) ? raw : null);
      if (next) await local().set({ [INSTANCES_KEY]: next });
    });
  },

  /** Removes every instance key (global deletion), in the write queue. */
  clear(): Promise<void> {
    return enqueueConfigWrite(() =>
      local().remove([INSTANCES_KEY, LEGACY_KEY, LAST_INSTANCE_KEY, LAST_LOCATION_KEY]),
    );
  },

  async byId(id: string): Promise<StoredInstance | null> {
    return (await instanceStore.read())?.instances.find((i) => i.id === id) ?? null;
  },

  /** lastInstanceId if it designates an existing instance, otherwise the first one (FR-012); null if not configured. */
  async defaultId(): Promise<string | null> {
    const store = await instanceStore.read();
    if (!store) return null;
    const last = (await local().get(LAST_INSTANCE_KEY))[LAST_INSTANCE_KEY];
    return store.instances.find((i) => i.id === last)?.id ?? store.instances[0]?.id ?? null;
  },

  async setLastUsed(id: string): Promise<void> {
    await local().set({ [LAST_INSTANCE_KEY]: id });
  },

  async originInUse(origin: string, except?: string): Promise<boolean> {
    return usesOrigin(await instanceStore.read(), origin, except);
  },

  /** Removes the origin permission only if no instance (except `except`) uses it. Never throws. */
  async releaseOriginIfUnused(origin: string, except?: string): Promise<void> {
    try {
      await ready;
    } catch {
      // never rejects
    }
    await releaseOrigin(origin, except);
  },
};
