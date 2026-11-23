import { browser, hasOrigin, removeOrigin } from '@/platform';
import { fail, ok, type Result } from '@/shared/errors';
import type { ConfigView, InstancesStore, InstanceView, LastCheck, StoredInstance } from '@/shared/types';
import { base64ToBytes, bytesToBase64 } from '@/shared/pdf';
import { DEFAULT_ITERATIONS, MIN_PASSPHRASE_LENGTH, sealHistoryKey } from './key-vault';
import {
  LEGACY_KEY,
  MAX_INSTANCES,
  defaultName,
  instanceStore,
  sameAddress,
  validateName,
  type LegacyConfig,
} from './instance-store';
import { deriveVaultKey, newVault, openVault, rekeyVault, sealApiKeyWith, sealCheck } from './vault-crypto';
import { originOf } from './url-policy';
import { enqueueHistoryWrite } from '@/background/history/history-queue';
import { importHistoryKey } from '@/background/history/history-crypto';
import { historyStore } from '@/background/history/history-store';
import { activeImports, activeTargets } from '@/background/import/active-imports';
import { pendingStore } from '@/background/import/pending-store';
import { logError } from '@/shared/logger';
import {
  DEFAULT_LOCK_SETTINGS,
  idleLimitMs,
  isIdleExpired,
  parseLockSettings,
  type LockPolicy,
  type LockSettings,
} from '@/shared/lock-policy';

/** Former single configuration (≤ 0.6.0): only read by `migrateLegacy`; the instances live in `instance-store.ts`. */
const KEY = LEGACY_KEY;
/** Decrypted API keys: storage.session only (in memory, cleared when the browser closes). */
const SESSION_KEY = 'homeboxUnlocked';
export const PENDING_PREFIX = 'pendingImport:';
export { LAST_LOCATION_KEY, DEFAULT_TEMPLATE_KEY, ORDER_FIELDS_KEY, ENTITY_TYPE_KEY } from './instance-store';
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

/** Credentials of ONE instance (spec 016): the client of a handler is built from them, never from another one. */
export interface Credentials {
  id: string;
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

/** Former configuration, for `migrateLegacy` only (plaintext key of v0.1.0). */
async function readStored(): Promise<LegacyConfig | null> {
  const stored = await browser.storage.local.get(KEY);
  return (stored[KEY] as LegacyConfig | undefined) ?? null;
}

/**
 * Session content v2 (spec 016, data-model §3): the API keys by instance id and, once unlocked with a passphrase,
 * the open history key (base64 of 32 bytes). An instance whose key must be re-entered is not in `keys`.
 */
interface UnlockedSession {
  v: 2;
  keys: Record<string, string>;
  historyKey?: string;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Tolerant read of the stored session: v2 as is; v1 `{ apiKey, historyKey? }` (written by `migrateLegacy` or a
 * previous version) is read as v2 when there is exactly one instance, otherwise ignored (locked).
 */
function toSessionV2(raw: unknown, store: InstancesStore | null): UnlockedSession | null {
  if (!isRecord(raw)) return null;
  const historyKey = typeof raw.historyKey === 'string' ? { historyKey: raw.historyKey } : {};
  if (raw.v === 2 && isRecord(raw.keys)) {
    const keys = Object.fromEntries(Object.entries(raw.keys).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
    return { v: 2, keys, ...historyKey };
  }
  const only = store?.instances.length === 1 ? store.instances[0] : undefined;
  if (typeof raw.apiKey === 'string' && only) {
    return { v: 2, keys: { [only.id]: raw.apiKey }, ...historyKey };
  }
  return null;
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
    // "Encrypted configuration" = a vault exists (a legacy key without passphrase would be lost).
    const store = await instanceStore.read();
    if (!store?.vault) return 'open';
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

/**
 * Every access to the keys goes through here: an expired session is locked before any read (E1). `evenIfDue`: the
 * session is returned even while a lock is due (only to REMOVE a key from it, spec 016 instance deletion).
 */
async function readSession(evenIfDue = false): Promise<UnlockedSession | null> {
  if ((await sessionState(Date.now())) === 'due' && !evenIfDue) return null;
  const stored = await browser.storage.session.get(SESSION_KEY);
  const raw = stored[SESSION_KEY];
  if (raw === undefined) return null;
  return toSessionV2(raw, await instanceStore.read());
}

async function writeSession(keys: Record<string, string>, historyKey: Uint8Array | null): Promise<void> {
  const value: UnlockedSession = historyKey ? { v: 2, keys, historyKey: bytesToBase64(historyKey) } : { v: 2, keys };
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
async function recoverHistoryKey(previous: InstancesStore | null, passphrase: string): Promise<Uint8Array | null> {
  const fromSession = sessionHistoryKey(await readSession());
  if (fromSession) return fromSession;
  if (!previous?.vault?.historyKey) return null;
  const opened = await openVault(previous, passphrase);
  return opened?.history && opened.history !== 'unreadable' && !opened.created?.historyKey ? opened.history.key : null;
}

/** keyState of data-model §3 (computed, never stored). */
function keyStateOf(
  instance: StoredInstance,
  store: InstancesStore,
  session: UnlockedSession | null,
): InstanceView['keyState'] {
  if (session && typeof session.keys[instance.id] === 'string') return 'ready';
  if (store.vault === null || instance.key === null) return 'missing';
  return session ? 'unreadable' : 'locked';
}

/**
 * Attaches the existing history entries to their instance (R5): best effort, never fails the caller; no data
 * logged (constant endpoint).
 */
async function attachHistory(historyKey: Uint8Array | null, store: InstancesStore): Promise<void> {
  if (!historyKey) return;
  try {
    await historyStore.attach(await importHistoryKey(historyKey), store.instances);
  } catch {
    logError('history write failed', { endpoint: 'history/attach' });
  }
}

/** Input of `addInstance` (`instance/add`, spec 016): the address is already normalized by the handler. */
export interface NewInstance {
  baseUrl: string;
  apiKey: string;
  /** Typed name; empty: default name (host). */
  name: string;
  passphrase: string;
  /** True only for a first installation or a legacy key without passphrase: the passphrase is chosen now. */
  newPassphrase: boolean;
}

/**
 * Run once the passphrase is verified and before anything is written (`instance/add`): checks the origin
 * permission and tests the connection. A failed result refuses the add (nothing written); a check with
 * `status: 'error'` is saved as the last check of the new instance (US2-5).
 */
export type AddProbe = (baseUrl: string, apiKey: string) => Promise<Result<LastCheck | null>>;

/**
 * Run once the passphrase is verified and before anything is written (`instance/update`): checks the permission of a
 * new origin and tests the connection, with the previous address of the instance to compare origins.
 */
export type UpdateProbe = (baseUrl: string, apiKey: string, previousBaseUrl: string) => Promise<Result<LastCheck | null>>;

/** Input of `updateInstance` (`instance/update`): the address is already normalized by the handler. */
export interface InstanceChange {
  baseUrl: string;
  /** Empty: keep the current key, reopened with the passphrase. */
  apiKey: string;
  passphrase: string;
  /** True only to replace the vault of the single instance (former single-instance save with a new key). */
  newPassphrase: boolean;
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
  /**
   * Usable credentials of ONE instance (spec 016, contracts/runtime-messages.md), in this order: NOT_CONFIGURED →
   * INSTANCE_NOT_FOUND → LOCKED → KEY_UNREADABLE → PERMISSION_DENIED → ok. Never another instance as a fallback.
   * A legacy key lost with the session stays NOT_CONFIGURED (current behaviour: a passphrase must be chosen).
   */
  async getCredentials(instanceId: string): Promise<Result<Credentials>> {
    const store = await instanceStore.read();
    if (!store) return fail('NOT_CONFIGURED');
    const instance = store.instances.find((i) => i.id === instanceId);
    if (!instance) return fail('INSTANCE_NOT_FOUND');
    const session = await readSession();
    const apiKey = session?.keys[instance.id];
    if (typeof apiKey !== 'string') {
      if (store.vault === null) return fail('NOT_CONFIGURED');
      return fail(session ? 'KEY_UNREADABLE' : 'LOCKED');
    }
    // The permission may have been withdrawn from the browser settings; no network request.
    if (!(await hasOrigin(originOf(instance.baseUrl)))) return fail('PERMISSION_DENIED');
    return ok({ id: instance.id, baseUrl: instance.baseUrl, apiKey });
  },

  async getView(): Promise<ConfigView> {
    const store = await instanceStore.read();
    if (!store) return { configured: false };
    const session = await readSession();
    const instances: InstanceView[] = store.instances.map((i) => ({
      id: i.id,
      name: i.name,
      baseUrl: i.baseUrl,
      maskedKey: i.maskedKey,
      lastCheck: i.lastCheck,
      keyState: keyStateOf(i, store, session),
    }));
    const [first] = instances as [InstanceView, ...InstanceView[]];
    const defaultInstanceId = (await instanceStore.defaultId()) ?? first.id;
    // The address, masked key and last check are only given per instance (no top-level copy since spec 016).
    return {
      configured: true,
      locked: session === null,
      needsPassphrase: store.vault === null,
      instances,
      defaultInstanceId,
      maxInstances: MAX_INSTANCES,
    };
  },

  /**
   * Single-instance configuration (first installation, or replacement of the only instance): encrypts and saves
   * the key in a new vault (new salt), then unlocks the session. Same rules as before spec 016 (R5.5).
   */
  async save(
    { baseUrl, apiKey, passphrase }: { baseUrl: string; apiKey: string; passphrase: string },
    iterations = DEFAULT_ITERATIONS,
    /** Spec 016 (`instance/update`): the connection test result to save with it; absent: kept if same address. */
    checked?: LastCheck | null,
  ): Promise<void> {
    if (!isValidApiKey(apiKey)) throw new Error('invalid API key');
    const previous = await instanceStore.read();
    if (previous && previous.instances.length > 1) throw new Error('several instances configured');
    let historyKey = await recoverHistoryKey(previous, passphrase);
    if (!historyKey) {
      // R5.5 step 3: the former history key cannot be recovered (new passphrase while locked, unreadable seal):
      // its entries can never be read again, they are erased explicitly (the UI warns before sending).
      await eraseHistoryEntries();
      historyKey = newHistoryKey();
    }
    const vault = newVault(iterations);
    const key = await deriveVaultKey(passphrase, vault);
    const before = previous?.instances[0];
    const instance: StoredInstance = {
      id: before?.id ?? crypto.randomUUID(),
      // A name chosen by the user is kept; a default name follows the address.
      name: before && before.name !== defaultName(before.baseUrl, []) ? before.name : defaultName(baseUrl, []),
      baseUrl,
      key: await sealApiKeyWith(key, apiKey, baseUrl),
      maskedKey: maskKey(apiKey),
      lastCheck: checked !== undefined ? checked : before?.baseUrl === baseUrl ? before.lastCheck : null,
    };
    const store: InstancesStore = {
      v: 1,
      vault: { ...vault, historyKey: await sealHistoryKey(historyKey, key) },
      instances: [instance],
    };
    // A single set of the whole vault (atomic).
    await instanceStore.update(() => store);
    await writeSession({ [instance.id]: apiKey }, historyKey);
  },

  /**
   * Adds an instance (spec 016, US2, contracts/vault-crypto.md). The passphrase is ALWAYS required, even unlocked
   * (user decision: the vault key is never kept in the session). One derivation: the vault key derived to check the
   * passphrase seals the new key, with the address of the new instance as associated data. A single set of
   * `homeboxInstances`, then the session holds every key (full unlock). The vault key is a local variable of this
   * operation, never stored, never put in the session. Throws only on a storage error (nothing written then).
   */
  async addInstance(
    input: NewInstance,
    { probe, iterations = DEFAULT_ITERATIONS }: { probe?: AddProbe; iterations?: number } = {},
  ): Promise<Result<{ id: string }>> {
    const { baseUrl, passphrase, newPassphrase } = input;
    const apiKey = input.apiKey.trim();
    if (!isValidApiKey(apiKey)) return fail('UNAUTHORIZED');
    const store = await instanceStore.read();
    const instances = store?.instances ?? [];
    if (instances.length >= MAX_INSTANCES) return fail('INSTANCE_LIMIT');
    if (instances.some((i) => sameAddress(i.baseUrl, baseUrl))) return fail('INSTANCE_EXISTS');
    const name = validateName(input.name, instances.map((i) => i.name), baseUrl);
    if (!name.ok) return fail(name.error);
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) return fail('WEAK_PASSPHRASE');

    let key: CryptoKey;
    let vault: NonNullable<InstancesStore['vault']>;
    let keys: Record<string, string>;
    let historyKey: Uint8Array | null;
    let existing: StoredInstance[];
    let eraseHistory = false;
    if (!newPassphrase) {
      // The current passphrase, checked by opening the vault (one derivation).
      if (!store) return fail('NOT_CONFIGURED');
      if (!store.vault) return fail('WRONG_PASSPHRASE');
      const opened = await openVault(store, passphrase);
      if (!opened) return fail('WRONG_PASSPHRASE');
      key = opened.key;
      vault = { ...store.vault, ...opened.created };
      keys = opened.keys;
      historyKey = opened.history && opened.history !== 'unreadable' ? opened.history.key : null;
      existing = store.instances;
    } else {
      // A new passphrase only when there is none yet: first installation, or legacy key without passphrase.
      if (store?.vault) return fail('WRONG_PASSPHRASE');
      const session = await readSession();
      keys = {};
      existing = [];
      if (store) {
        // Legacy key (spec 005): still in memory, sealed now in the same write as the new key.
        for (const instance of store.instances) {
          const legacy = session?.keys[instance.id];
          if (typeof legacy !== 'string') return fail('NOT_CONFIGURED');
          keys[instance.id] = legacy;
        }
      }
      const fresh = newVault(iterations);
      key = await deriveVaultKey(passphrase, fresh);
      const recovered = sessionHistoryKey(session);
      eraseHistory = recovered === null;
      historyKey = recovered ?? newHistoryKey();
      vault = { ...fresh, check: await sealCheck(key), historyKey: await sealHistoryKey(historyKey, key) };
      for (const instance of store?.instances ?? []) {
        const legacy = keys[instance.id] ?? '';
        existing.push({ ...instance, key: await sealApiKeyWith(key, legacy, instance.baseUrl) });
      }
    }

    // Permission and connection test: only once the passphrase is known to be right.
    let lastCheck: LastCheck | null = null;
    if (probe) {
      const probed = await probe(baseUrl, apiKey);
      if (!probed.ok) return probed;
      lastCheck = probed.value;
    }

    const instance: StoredInstance = {
      id: crypto.randomUUID(),
      name: name.value,
      baseUrl,
      key: await sealApiKeyWith(key, apiKey, baseUrl),
      maskedKey: maskKey(apiKey),
      lastCheck,
    };
    const next: InstancesStore = { v: 1, vault, instances: [...existing, instance] };
    // New history key that no former entry can match (R5.5, as `save`): those entries could never be read again.
    if (eraseHistory) await eraseHistoryEntries();
    const expectedSalt = store?.vault?.salt ?? null;
    // A single set of the whole vault (atomic); refused if the vault changed meanwhile (concurrent reconfiguration).
    await instanceStore.update((current) => {
      if ((current?.vault?.salt ?? null) !== expectedSalt || (current?.instances.length ?? 0) !== instances.length) {
        throw new Error('configuration changed');
      }
      return next;
    });
    await writeSession({ ...keys, [instance.id]: apiKey }, historyKey);
    await attachHistory(historyKey, next);
    return ok({ id: instance.id });
  },

  /**
   * Current key of an instance, to re-save the configuration without retyping it. Without an id, only when there
   * is exactly one instance (no implicit fallback, review T039):
   * decrypted with the passphrase, or a migrated key still in memory.
   */
  async currentKey(passphrase: string, instanceId?: string): Promise<Result<string>> {
    const store = await instanceStore.read();
    if (!store) return fail('NOT_CONFIGURED');
    const only = store.instances.length === 1 ? store.instances[0] : undefined;
    const instance = instanceId === undefined ? only : store.instances.find((i) => i.id === instanceId);
    if (!instance) return fail('INSTANCE_NOT_FOUND');
    if (!store.vault) {
      const apiKey = (await readSession())?.keys[instance.id];
      return typeof apiKey === 'string' ? ok(apiKey) : fail('NOT_CONFIGURED');
    }
    const opened = await openVault(store, passphrase);
    if (!opened) return fail('WRONG_PASSPHRASE');
    const apiKey = opened.keys[instance.id];
    return typeof apiKey === 'string' ? ok(apiKey) : fail('KEY_UNREADABLE');
  },

  /**
   * Renames an instance (spec 016, US4-1): no passphrase, no network, works locked. Trimmed; empty or > 50 characters
   * → INSTANCE_NAME_INVALID (US4-2); the name of another instance (case ignored) → INSTANCE_NAME_TAKEN.
   */
  async renameInstance(instanceId: string, input: string): Promise<Result<void>> {
    if (input.trim() === '') return fail('INSTANCE_NAME_INVALID');
    let result = fail('INSTANCE_NOT_FOUND') as Result<void>;
    await instanceStore.update((store) => {
      const target = store?.instances.find((i) => i.id === instanceId);
      if (!store || !target) return null;
      const others = store.instances.filter((i) => i.id !== instanceId).map((i) => i.name);
      const name = validateName(input, others, target.baseUrl);
      if (!name.ok) {
        result = fail(name.error);
        return null;
      }
      result = ok(undefined);
      if (name.value === target.name) return null;
      return { ...store, instances: store.instances.map((i) => (i.id === instanceId ? { ...i, name: name.value } : i)) };
    });
    return result;
  },

  /**
   * Changes the address and/or the key of one instance (spec 016, US4-4, contracts/vault-crypto.md), with the rules of
   * the former single-instance save. Current passphrase: one derivation opens the vault; an empty key keeps the current one
   * (KEY_UNREADABLE if it cannot be read), resealed with the new address as associated data; a single set. New
   * passphrase (`newPassphrase`): only with a single instance and a key (typed, or a legacy key still in memory); the
   * vault is recreated as `save` does. The history entries are attached BEFORE the address changes (R5); the instance
   * keeps its id, so its last location, history entries and interrupted imports stay attached to it (spec, edge case
   * "address of an instance changed"). Throws only on a storage error.
   */
  async updateInstance(
    instanceId: string,
    input: InstanceChange,
    { probe, iterations = DEFAULT_ITERATIONS }: { probe?: UpdateProbe; iterations?: number } = {},
  ): Promise<Result<{ previousBaseUrl: string }>> {
    const { baseUrl, passphrase, newPassphrase } = input;
    const typed = input.apiKey.trim();
    const store = await instanceStore.read();
    if (!store) return fail('NOT_CONFIGURED');
    const current = store.instances.find((i) => i.id === instanceId);
    if (!current) return fail('INSTANCE_NOT_FOUND');
    if (store.instances.some((i) => i.id !== instanceId && sameAddress(i.baseUrl, baseUrl))) return fail('INSTANCE_EXISTS');
    if (typed !== '' && !isValidApiKey(typed)) return fail('UNAUTHORIZED');
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) return fail('WEAK_PASSPHRASE');
    const previousBaseUrl = current.baseUrl;

    if (newPassphrase) {
      // Replacing the vault is only possible with a single instance (the other keys would be lost otherwise).
      if (store.instances.length !== 1) return fail('WRONG_PASSPHRASE');
      let apiKey = typed;
      if (apiKey === '') {
        // Kept key: only a legacy key (spec 005) still in memory can be resealed with a new passphrase.
        if (store.vault) return fail('WRONG_PASSPHRASE');
        const legacy = (await readSession())?.keys[current.id];
        if (typeof legacy !== 'string') return fail('UNAUTHORIZED');
        apiKey = legacy;
      }
      await attachHistory(sessionHistoryKey(await readSession()), store);
      let checked: LastCheck | null | undefined;
      if (probe) {
        const probed = await probe(baseUrl, apiKey, previousBaseUrl);
        if (!probed.ok) return probed;
        checked = probed.value;
      }
      await configStore.save({ baseUrl, apiKey, passphrase }, iterations, checked);
      return ok({ previousBaseUrl });
    }

    if (!store.vault) return fail('WRONG_PASSPHRASE');
    const opened = await openVault(store, passphrase);
    if (!opened) return fail('WRONG_PASSPHRASE');
    const apiKey = typed !== '' ? typed : opened.keys[instanceId];
    if (typeof apiKey !== 'string') return fail('KEY_UNREADABLE');
    const historyKey = opened.history && opened.history !== 'unreadable' ? opened.history.key : null;
    // Attached with the former address, before it changes (R5).
    await attachHistory(historyKey, store);

    let lastCheck = current.lastCheck;
    if (probe) {
      const probed = await probe(baseUrl, apiKey, previousBaseUrl);
      if (!probed.ok) return probed;
      if (probed.value) lastCheck = probed.value;
    }
    const sealed = await sealApiKeyWith(opened.key, apiKey, baseUrl);
    const salt = store.vault.salt;
    const created = opened.created ?? {};
    // A single set of the whole vault (atomic); refused if the vault changed meanwhile.
    await instanceStore.update((now) => {
      if (!now?.vault || now.vault.salt !== salt) throw new Error('configuration changed');
      const target = now.instances.find((i) => i.id === instanceId);
      if (!target) throw new Error('configuration changed');
      if (now.instances.some((i) => i.id !== instanceId && sameAddress(i.baseUrl, baseUrl))) {
        throw new Error('configuration changed');
      }
      const others = now.instances.filter((i) => i.id !== instanceId).map((i) => i.name);
      // A name chosen by the user is kept; a default name follows the address (as `save`).
      const name = target.name === defaultName(target.baseUrl, others) ? defaultName(baseUrl, others) : target.name;
      const changed: StoredInstance = { ...target, name, baseUrl, key: sealed, maskedKey: maskKey(apiKey), lastCheck };
      return {
        ...now,
        vault: { ...now.vault, ...created },
        instances: now.instances.map((i) => (i.id === instanceId ? changed : i)),
      };
    });
    await writeSession({ ...opened.keys, [instanceId]: apiKey }, historyKey);
    return ok({ previousBaseUrl });
  },

  /**
   * Deletes one instance (spec 016, US4-6, contracts/storage-migration.md "Deletion of an instance"): refused while
   * an import to it runs; the last one → global deletion. Otherwise: its key leaves the session, its interrupted
   * imports are removed, then the instance (one set), its last location and `lastInstanceId`, then its history
   * entries (without the key: works locked), then its origin permission if no instance uses it any more.
   */
  async removeInstance(instanceId: string): Promise<Result<void>> {
    const store = await instanceStore.read();
    if (!store) return fail('NOT_CONFIGURED');
    const instance = store.instances.find((i) => i.id === instanceId);
    if (!instance) return fail('INSTANCE_NOT_FOUND');
    if ((activeTargets.get(instanceId) ?? 0) > 0) return fail('INSTANCE_BUSY');
    if (store.instances.length === 1) {
      await configStore.delete();
      return ok(undefined);
    }
    // Step 3: the session first (a later error never leaves its key in memory), then its interrupted imports.
    const session = await readSession(true);
    if (session && typeof session.keys[instanceId] === 'string') {
      // Re-read just before writing: a lock in between (button, expiry) must not bring the other keys back.
      const current = await readSession(true);
      if (current && typeof current.keys[instanceId] === 'string') {
        const keys = Object.fromEntries(Object.entries(current.keys).filter(([id]) => id !== instanceId));
        await browser.storage.session.set({ [SESSION_KEY]: { ...current, keys } });
      }
    }
    await pendingStore.removeByInstance(instanceId);
    // Step 4: a single set of the vault without it; its last location and lastInstanceId.
    const removed = await instanceStore.remove(instanceId);
    if (!removed) return fail('INSTANCE_NOT_FOUND');
    // Step 5: its history entries (an interruption here is repaired by the history maintenance, SC-008).
    await historyStore.removeInstance(instanceId);
    // Step 6: the origin permission, only if no other instance uses it.
    await instanceStore.releaseOriginIfUnused(originOf(removed.baseUrl));
    return ok(undefined);
  },

  /**
   * Changes the passphrase (spec 016, US5-3, FR-023): the current one opens the vault from the disk (one derivation),
   * everything is resealed under a new salt (one derivation) and written in a single set; the session is unchanged.
   * A key that could not be read becomes "to re-enter" and its id is returned in `reenter`. A failed write leaves the
   * storage as it was (the old passphrase stays valid). Throws only on a storage error.
   */
  async changePassphrase(
    current: string,
    next: string,
    iterations = DEFAULT_ITERATIONS,
  ): Promise<Result<{ reenter: string[] }>> {
    if (next.length < MIN_PASSPHRASE_LENGTH) return fail('WEAK_PASSPHRASE');
    const store = await instanceStore.read();
    if (!store) return fail('NOT_CONFIGURED');
    if (!store.vault) return fail('WRONG_PASSPHRASE');
    const opened = await openVault(store, current);
    if (!opened) return fail('WRONG_PASSPHRASE');
    // A history key unreadable on the disk but still open in the session is kept (its entries stay readable).
    const inSession = opened.history === 'unreadable' ? sessionHistoryKey(await readSession()) : null;
    const { store: rekeyed, reenter } = await rekeyVault(
      store,
      inSession ? { ...opened, history: { key: inSession } } : opened,
      next,
      iterations,
    );
    const salt = store.vault.salt;
    const sealedById = new Map(rekeyed.instances.map((i) => [i.id, i.key]));
    await instanceStore.update((now) => {
      // Written only onto the vault that was opened, with the same instances (a concurrent change wins).
      if (!now?.vault || now.vault.salt !== salt) throw new Error('configuration changed');
      if (now.instances.length !== sealedById.size || now.instances.some((i) => !sealedById.has(i.id))) {
        throw new Error('configuration changed');
      }
      const base = store.instances;
      if (now.instances.some((i) => i.baseUrl !== base.find((b) => b.id === i.id)?.baseUrl)) {
        throw new Error('configuration changed');
      }
      return {
        ...now,
        vault: rekeyed.vault,
        instances: now.instances.map((i) => ({ ...i, key: sealedById.get(i.id) ?? null })),
      };
    });
    return ok({ reenter });
  },

  /**
   * One derivation opens every key (spec 016). A key that does not open while the passphrase is right is left out
   * of the session ("key to re-enter", FR-022). Seals created while opening are written in a single set.
   */
  async unlock(passphrase: string): Promise<Result<void>> {
    const store = await instanceStore.read();
    if (!store) return fail('NOT_CONFIGURED');
    const vault = store.vault;
    if (!vault) return fail('NOT_CONFIGURED');
    const opened = await openVault(store, passphrase);
    if (!opened) return fail('WRONG_PASSPHRASE');
    let historyKey = opened.history && opened.history !== 'unreadable' ? opened.history.key : null;
    const created = opened.created;
    if (created) {
      let saved = false;
      try {
        await instanceStore.update((current) => {
          // Written only onto the vault that was opened (a concurrent reconfiguration wins).
          if (!current?.vault || current.vault.salt !== vault.salt) return null;
          saved = true;
          return { ...current, vault: { ...current.vault, ...created } };
        });
      } catch {
        saved = false;
      }
      // History key not saved: the API keys are unlocked anyway, without history.
      if (!saved && created.historyKey) historyKey = null;
    }
    await writeSession(opened.keys, historyKey);
    await attachHistory(historyKey, store);
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
    const store = await instanceStore.read();
    if (!store?.vault) return 'unavailable';
    const session = await readSession();
    if (!session) return 'locked';
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
    const store = await instanceStore.read();
    if (!store?.vault) return 'none';
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

  async setLastCheck(instanceId: string, lastCheck: LastCheck): Promise<void> {
    await instanceStore.update((store) => {
      if (!store?.instances.some((i) => i.id === instanceId)) return null;
      return { ...store, instances: store.instances.map((i) => (i.id === instanceId ? { ...i, lastCheck } : i)) };
    });
  },

  async delete(): Promise<void> {
    // Session first (decrypted API key, open history key, imports in progress): an error further on never leaves
    // a key open in memory.
    const session = await browser.storage.session.get(null);
    const keys = Object.keys(session).filter(
      (k) => k.startsWith(PENDING_PREFIX) || k === SESSION_KEY || k === ACTIVITY_KEY || k === LOCK_DUE_KEY,
    );
    if (keys.length) await browser.storage.session.remove(keys);
    const store = await instanceStore.read();
    // The sealed history key leaves with the vault; its entries are erased too (FR-009). The history, lock and tag
    // settings and the update notice are kept (E5, FR-025).
    await instanceStore.clear();
    await eraseHistoryEntries();
    for (const origin of new Set((store?.instances ?? []).map((i) => originOf(i.baseUrl)))) {
      try {
        await removeOrigin(origin);
      } catch {
        // permission already absent
      }
    }
  },
};
