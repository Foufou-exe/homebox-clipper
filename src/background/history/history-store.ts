import { HISTORY_PREFIX, HISTORY_SETTINGS_KEY } from '@/background/config/config-store';
import { instanceStore } from '@/background/config/instance-store';
import { activeImports } from '@/background/import/active-imports';
import { browser } from '@/platform';
import type { HistoryEntryView, ImportHistoryEntry, PendingImport } from '@/shared/types';
import { prune, reconcile as reconcileEntry, sortRecent, toEntry } from './entry';
import { open, seal, type HistoryEnvelope, type HistoryKey } from './history-crypto';
import { enqueueHistoryWrite } from './history-queue';

/**
 * Encrypted storage of the import history (spec 012, contracts/history-store.md).
 * The service worker is the only writer. Every write (start, update, remove, clear, setEnabled, reconcile and the
 * pruning) goes through a single promise queue; a failed operation does not block the next one. Methods that
 * only delete do not need the key (they work while locked). No console output, no network.
 */

/** Writer bound to a captured key and, since spec 016, to the target instance; given to the orchestrator (R10.5). */
export interface HistoryWriter {
  start(p: PendingImport, instance: string): Promise<void>;
  update(p: PendingImport): Promise<void>;
  reconcile(p: PendingImport): Promise<void>;
}

const keyOf = (id: string) => `${HISTORY_PREFIX}${id}`;

/** Instance id of a stored envelope (`inst`), if any. */
function instOf(raw: unknown): string | undefined {
  const inst = typeof raw === 'object' && raw !== null ? (raw as { inst?: unknown }).inst : undefined;
  return typeof inst === 'string' && inst !== '' ? inst : undefined;
}

/** Ids of the configured instances; `null` when no configuration is readable (nothing is then pruned by `inst`). */
async function configuredInstanceIds(): Promise<ReadonlySet<string> | null> {
  const store = await instanceStore.read();
  return store ? new Set(store.instances.map((i) => i.id)) : null;
}

export function createHistoryStore(
  deps: {
    clock?: () => number;
    isActive?: (id: string) => boolean;
    /** Spec 016: the instance ids that exist; an envelope whose `inst` is not among them is removed (SC-008). */
    instanceIds?: () => Promise<ReadonlySet<string> | null>;
  } = {},
) {
  const clock = deps.clock ?? Date.now;
  const isActive = deps.isActive ?? (() => false);
  const instanceIds = deps.instanceIds ?? (async () => null);
  const local = () => browser.storage.local;

  // Shared queue (module `history-queue.ts`): also serializes the erasing done by `config-store.ts`.
  const enqueue = enqueueHistoryWrite;

  async function isEnabled(): Promise<boolean> {
    const stored = (await local().get(HISTORY_SETTINGS_KEY))[HISTORY_SETTINGS_KEY] as unknown;
    if (typeof stored !== 'object' || stored === null) return true;
    const { v, enabled } = stored as Record<string, unknown>;
    return v === 1 && typeof enabled === 'boolean' ? enabled : true;
  }

  async function historyKeys(): Promise<{ all: Record<string, unknown>; keys: string[] }> {
    const all = await local().get(null);
    return { all, keys: Object.keys(all).filter((k) => k.startsWith(HISTORY_PREFIX)) };
  }

  async function removeAll(): Promise<void> {
    const { keys } = await historyKeys();
    if (keys.length) await local().remove(keys);
  }

  /** Fresh envelope; `inst` written outside the ciphertext when known (spec 016). */
  async function write(entry: ImportHistoryEntry, key: HistoryKey, inst?: string): Promise<void> {
    const env: HistoryEnvelope = await seal(entry, key, entry.id);
    await local().set({ [keyOf(entry.id)]: inst ? { ...env, inst } : env });
  }

  /** Reads the existing entry: `null` if absent, unreadable or of a later version (never modified). */
  async function readEntry(id: string, key: HistoryKey): Promise<{ entry: ImportHistoryEntry; inst?: string } | null> {
    const raw = (await local().get(keyOf(id)))[keyOf(id)];
    if (raw === undefined) return null;
    const entry = await open(raw, key, id);
    if (entry === 'future' || entry === null) return null;
    const inst = instOf(raw);
    return inst ? { entry, inst } : { entry };
  }

  /**
   * Opens everything, deletes what does not authenticate, reconciles orphaned `running` entries (at `list` only),
   * then prunes (age, then rank). Returns the remaining readable entries. Runs inside the queue.
   */
  async function maintain(
    key: HistoryKey,
    reconcileOrphans: boolean,
  ): Promise<Array<{ entry: ImportHistoryEntry; inst?: string }>> {
    const { all, keys } = await historyKeys();
    // Spec 016 (SC-008): an entry of an instance that no longer exists is removed (deletion interrupted midway).
    const known = await instanceIds();
    const orphans = known
      ? keys.filter((k) => {
          const inst = instOf(all[k]);
          return inst !== undefined && !known.has(inst);
        })
      : [];
    if (orphans.length) await local().remove(orphans);
    const opened: Array<{ id: string; entry: ImportHistoryEntry | null; inst?: string }> = [];
    for (const k of keys) {
      if (orphans.includes(k)) continue;
      const id = k.slice(HISTORY_PREFIX.length);
      const entry = await open(all[k], key, id);
      if (entry === 'future') continue;
      // Every rewrite keeps the instance of the envelope (spec 016).
      const inst = instOf(all[k]);
      if (reconcileOrphans && entry && entry.status === 'running' && !isActive(id)) {
        const reconciled = reconcileEntry(entry);
        await write(reconciled, key, inst);
        opened.push({ id, entry: reconciled, inst });
      } else opened.push({ id, entry, inst });
    }
    const removed = new Set(prune(opened, clock()));
    if (removed.size) await local().remove([...removed].map(keyOf));
    return opened.flatMap((o) => (o.entry && !removed.has(o.id) ? [{ entry: o.entry, inst: o.inst }] : []));
  }

  const store = {
    isEnabled,

    /** Creates the `running` entry of an import, then prunes. Without effect when disabled. */
    start(key: HistoryKey, p: PendingImport, instance: string, instanceId?: string): Promise<void> {
      return enqueue(async () => {
        if (!(await isEnabled())) return;
        await write(toEntry(p, { importedAt: new Date(clock()).toISOString(), instance }), key, instanceId);
        await maintain(key, false);
      });
    },

    /** Rewrites an existing entry (fresh envelope, instance kept); never creates one. */
    update(key: HistoryKey, p: PendingImport, instanceId?: string): Promise<void> {
      return enqueue(async () => {
        if (!(await isEnabled())) return;
        const existing = await readEntry(p.id, key);
        if (!existing) return;
        await write(
          toEntry(p, { importedAt: existing.entry.importedAt, instance: existing.entry.instance }),
          key,
          instanceId ?? existing.inst,
        );
      });
    },

    /** For `recoverOrphan`: the `running` entry of `p` becomes partial/failed and interrupted. */
    reconcile(key: HistoryKey, p: PendingImport): Promise<void> {
      return enqueue(async () => {
        if (!(await isEnabled())) return;
        const existing = await readEntry(p.id, key);
        if (existing?.entry.status === 'running') await write(reconcileEntry(existing.entry), key, existing.inst);
      });
    },

    /**
     * Spec 016 (R5): sets `inst` on every envelope without one whose recorded address equals the address of an
     * instance; others stay without `inst`. Idempotent. Only `inst` changes: the ciphertext is kept as is.
     */
    attach(key: HistoryKey, instances: ReadonlyArray<{ id: string; baseUrl: string }>): Promise<void> {
      return enqueue(async () => {
        const { all, keys } = await historyKeys();
        const updates: Record<string, unknown> = {};
        for (const k of keys) {
          const raw = all[k];
          if (instOf(raw) !== undefined) continue;
          const entry = await open(raw, key, k.slice(HISTORY_PREFIX.length));
          if (entry === null || entry === 'future') continue;
          const target = instances.find((i) => i.baseUrl === entry.instance);
          if (target) updates[k] = { ...(raw as HistoryEnvelope), inst: target.id };
        }
        if (Object.keys(updates).length) await local().set(updates);
      });
    },

    /** Readable entries, most recent first, with `resumable`. Pruning and repairs go through the queue. */
    list(
      key: HistoryKey,
      pendingIds: ReadonlySet<string> = new Set(),
    ): Promise<{ enabled: boolean; entries: HistoryEntryView[] }> {
      return enqueue(async () => {
        if (!(await isEnabled())) {
          // Interrupted disabling: "disabled ⇒ empty" is repaired here (R5.3).
          await removeAll();
          return { enabled: false, entries: [] };
        }
        const kept = await maintain(key, true);
        const instOfEntry = new Map(kept.map((k) => [k.entry.id, k.inst ?? null]));
        const entries = sortRecent(kept.map((k) => k.entry)).map((e) => ({
          ...e,
          resumable: (e.status === 'partial' || e.status === 'failed') && pendingIds.has(e.id),
          instanceId: instOfEntry.get(e.id) ?? null,
        }));
        return { enabled: true, entries };
      });
    },

    remove(id: string): Promise<void> {
      return enqueue(() => local().remove(keyOf(id)));
    },

    /**
     * Spec 016 (US4-6): removes every envelope of this instance (`inst === instanceId`). Without the key: works while
     * locked. In the queue, so that an import of this instance finishing meanwhile cannot write its entry back.
     */
    removeInstance(instanceId: string): Promise<void> {
      return enqueue(async () => {
        const { all, keys } = await historyKeys();
        const removed = keys.filter((k) => instOf(all[k]) === instanceId);
        if (removed.length) await local().remove(removed);
      });
    },

    /** Removes every `importHistory:*` key (unreadable and later versions included); keeps the setting. */
    clear(): Promise<void> {
      return enqueue(removeAll);
    },

    /** `false`: setting first, then erasing, in a single queued operation (R5.3). */
    setEnabled(enabled: boolean): Promise<void> {
      return enqueue(async () => {
        await local().set({ [HISTORY_SETTINGS_KEY]: { v: 1, enabled } });
        if (!enabled) await removeAll();
      });
    },

    /** `instanceId` (spec 016): written as `inst` at `start` and `update`. */
    forKey(key: HistoryKey, instanceId?: string): HistoryWriter {
      return {
        start: (p, instance) => store.start(key, p, instance, instanceId),
        update: (p) => store.update(key, p, instanceId),
        reconcile: (p) => store.reconcile(key, p),
      };
    },
  };
  return store;
}

export type HistoryStore = ReturnType<typeof createHistoryStore>;

export const historyStore = createHistoryStore({
  isActive: (id) => activeImports.has(id),
  instanceIds: configuredInstanceIds,
});
