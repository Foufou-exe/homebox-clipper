import { HISTORY_PREFIX, HISTORY_SETTINGS_KEY } from '@/background/config/config-store';
import { activeImports } from '@/background/import/active-imports';
import { browser } from '@/platform';
import type { HistoryEntryView, ImportHistoryEntry, PendingImport } from '@/shared/types';
import { prune, reconcile as reconcileEntry, sortRecent, toEntry } from './entry';
import { open, seal, type HistoryKey } from './history-crypto';
import { enqueueHistoryWrite } from './history-queue';

/**
 * Encrypted storage of the import history (spec 012, contracts/history-store.md).
 * The service worker is the only writer. Every write (start, update, remove, clear, setEnabled, reconcile and the
 * pruning) goes through a single promise queue; a failed operation does not block the next one. Methods that
 * only delete do not need the key (they work while locked). No console output, no network.
 */

/** Writer bound to a captured key, given to the orchestrator (R10.5). */
export interface HistoryWriter {
  start(p: PendingImport, instance: string): Promise<void>;
  update(p: PendingImport): Promise<void>;
  reconcile(p: PendingImport): Promise<void>;
}

const keyOf = (id: string) => `${HISTORY_PREFIX}${id}`;

export function createHistoryStore(
  deps: { clock?: () => number; isActive?: (id: string) => boolean } = {},
) {
  const clock = deps.clock ?? Date.now;
  const isActive = deps.isActive ?? (() => false);
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

  async function write(entry: ImportHistoryEntry, key: HistoryKey): Promise<void> {
    await local().set({ [keyOf(entry.id)]: await seal(entry, key, entry.id) });
  }

  /** Reads the existing entry: `null` if absent, unreadable or of a later version (never modified). */
  async function readEntry(id: string, key: HistoryKey): Promise<ImportHistoryEntry | null> {
    const raw = (await local().get(keyOf(id)))[keyOf(id)];
    if (raw === undefined) return null;
    const entry = await open(raw, key, id);
    return entry === 'future' ? null : entry;
  }

  /**
   * Opens everything, deletes what does not authenticate, reconciles orphaned `running` entries (at `list` only),
   * then prunes (age, then rank). Returns the remaining readable entries. Runs inside the queue.
   */
  async function maintain(
    key: HistoryKey,
    reconcileOrphans: boolean,
  ): Promise<ImportHistoryEntry[]> {
    const { all, keys } = await historyKeys();
    const opened: Array<{ id: string; entry: ImportHistoryEntry | null }> = [];
    for (const k of keys) {
      const id = k.slice(HISTORY_PREFIX.length);
      const entry = await open(all[k], key, id);
      if (entry === 'future') continue;
      if (reconcileOrphans && entry && entry.status === 'running' && !isActive(id)) {
        const reconciled = reconcileEntry(entry);
        await write(reconciled, key);
        opened.push({ id, entry: reconciled });
      } else opened.push({ id, entry });
    }
    const removed = new Set(prune(opened, clock()));
    if (removed.size) await local().remove([...removed].map(keyOf));
    return opened.flatMap((o) => (o.entry && !removed.has(o.id) ? [o.entry] : []));
  }

  const store = {
    isEnabled,

    /** Creates the `running` entry of an import, then prunes. Without effect when disabled. */
    start(key: HistoryKey, p: PendingImport, instance: string): Promise<void> {
      return enqueue(async () => {
        if (!(await isEnabled())) return;
        await write(toEntry(p, { importedAt: new Date(clock()).toISOString(), instance }), key);
        await maintain(key, false);
      });
    },

    /** Rewrites an existing entry (fresh envelope); never creates one. */
    update(key: HistoryKey, p: PendingImport): Promise<void> {
      return enqueue(async () => {
        if (!(await isEnabled())) return;
        const existing = await readEntry(p.id, key);
        if (!existing) return;
        await write(
          toEntry(p, { importedAt: existing.importedAt, instance: existing.instance }),
          key,
        );
      });
    },

    /** For `recoverOrphan`: the `running` entry of `p` becomes partial/failed and interrupted. */
    reconcile(key: HistoryKey, p: PendingImport): Promise<void> {
      return enqueue(async () => {
        if (!(await isEnabled())) return;
        const existing = await readEntry(p.id, key);
        if (existing?.status === 'running') await write(reconcileEntry(existing), key);
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
        const entries = sortRecent(await maintain(key, true)).map((e) => ({
          ...e,
          resumable: (e.status === 'partial' || e.status === 'failed') && pendingIds.has(e.id),
        }));
        return { enabled: true, entries };
      });
    },

    remove(id: string): Promise<void> {
      return enqueue(() => local().remove(keyOf(id)));
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

    forKey(key: HistoryKey): HistoryWriter {
      return {
        start: (p, instance) => store.start(key, p, instance),
        update: (p) => store.update(key, p),
        reconcile: (p) => store.reconcile(key, p),
      };
    },
  };
  return store;
}

export type HistoryStore = ReturnType<typeof createHistoryStore>;

export const historyStore = createHistoryStore({ isActive: (id) => activeImports.has(id) });
