import {
  COLLECTION_KEY,
  INSTANCES_KEY,
  enqueueConfigWrite,
  isValidStore,
} from '@/background/config/instance-store';
import { browser } from '@/platform';
import {
  copySetting,
  isStoredCollectionSetting,
  type CollectionSetting,
} from '@/shared/collections';

/**
 * State of the collection setting of one instance (spec 024, contracts/storage.md): `none` (no entry, or an entry read
 * on another address: FR-011), `invalid` (an entry that cannot be read: imports are refused, M3), or the setting.
 */
export type CollectionEntry =
  { kind: 'none' } | { kind: 'invalid' } | { kind: 'ok'; setting: CollectionSetting };

const NONE: CollectionEntry = { kind: 'none' };
const INVALID: CollectionEntry = { kind: 'invalid' };

/** The raw table; anything that is not an object is an empty table. Never throws. */
async function readTable(): Promise<Record<string, unknown>> {
  try {
    const stored = (await browser.storage.local.get(COLLECTION_KEY))[COLLECTION_KEY];
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
    return stored as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Entry bound to the address it was read on: another address (the instance moved) means no setting (FR-011). */
function entryOf(raw: unknown, baseUrl: string): CollectionEntry {
  if (raw === undefined) return NONE;
  if (!isStoredCollectionSetting(raw)) return INVALID;
  return raw.baseUrl === baseUrl ? { kind: 'ok', setting: copySetting(raw) } : NONE;
}

/** The instance still exists with this address (read inside the write queue: no orphan, no stale address). */
async function instanceAt(instanceId: string, baseUrl: string): Promise<boolean> {
  const store = (await browser.storage.local.get(INSTANCES_KEY))[INSTANCES_KEY];
  return (
    isValidStore(store) && store.instances.some((i) => i.id === instanceId && i.baseUrl === baseUrl)
  );
}

/**
 * Target collection per HomeBox instance (spec 024): the chosen collection and the one last read, `{ id, name }` only,
 * with the address of the instance, in `storage.local` (configuration data, no secret: readable while locked, FR-014).
 * No entry: the default collection of the key (FR-013). Removed with the instance (`instanceStore.remove`) and with the
 * settings (`instanceStore.clear`). Never logged.
 */
export const collectionSettings = {
  async entry(instanceId: string, baseUrl: string): Promise<CollectionEntry> {
    return entryOf((await readTable())[instanceId], baseUrl);
  },

  /** Entries of several instances in one read (view). */
  async entries(
    instances: readonly { id: string; baseUrl: string }[],
  ): Promise<Record<string, CollectionEntry>> {
    const table = await readTable();
    return Object.fromEntries(instances.map((i) => [i.id, entryOf(table[i.id], i.baseUrl)]));
  },

  /**
   * Compare-and-write in the configuration write queue (M1): `fn` receives the entry read inside the queue and returns
   * the setting to write, or null (nothing written). Not called, and nothing written, when the instance was removed or
   * its address changed meanwhile. Returns whether `fn` was called.
   */
  update(
    instanceId: string,
    baseUrl: string,
    fn: (entry: CollectionEntry) => CollectionSetting | null,
  ): Promise<boolean> {
    return enqueueConfigWrite(async () => {
      if (!(await instanceAt(instanceId, baseUrl))) return false;
      const table = await readTable();
      const next = fn(entryOf(table[instanceId], baseUrl));
      if (next)
        await browser.storage.local.set({
          [COLLECTION_KEY]: { ...table, [instanceId]: { ...copySetting(next), baseUrl } },
        });
      return true;
    });
  },
};
