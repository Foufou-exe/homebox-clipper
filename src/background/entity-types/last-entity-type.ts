import { ENTITY_TYPE_KEY } from '@/background/config/config-store';
import { enqueueConfigWrite } from '@/background/config/instance-store';
import { browser } from '@/platform';

type ByInstance = Record<string, string>;

const isTypeId = (x: unknown): x is string =>
  typeof x === 'string' && x.length >= 1 && x.length <= 64;

/** Reads the table, ignoring any value that is not `{ instanceId: typeId }` (corrupted storage). */
async function read(): Promise<ByInstance> {
  const stored = (await browser.storage.local.get(ENTITY_TYPE_KEY))[ENTITY_TYPE_KEY];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([, v]) => isTypeId(v))) as ByInstance;
}

/**
 * Last entity type used per HomeBox instance (spec 023, FR-009): a type identifier only, never a name. Local to the
 * browser (`storage.local`), written in the configuration write queue (ordered with `instanceStore.remove`, so no
 * orphan entry), erased with the instance and with the configuration. Never logged.
 */
export const lastEntityType = {
  async get(instanceId: string): Promise<string | null> {
    return (await read())[instanceId] ?? null;
  },

  /** A type remembers it; `null` removes the entry (the server default was used), writing nothing if there is none. */
  set(instanceId: string, entityTypeId: string | null): Promise<void> {
    return enqueueConfigWrite(async () => {
      const table = await read();
      if (entityTypeId === null) {
        if (!(instanceId in table)) return;
        const kept = Object.entries(table).filter(([k]) => k !== instanceId);
        await browser.storage.local.set({ [ENTITY_TYPE_KEY]: Object.fromEntries(kept) });
        return;
      }
      await browser.storage.local.set({
        [ENTITY_TYPE_KEY]: { ...table, [instanceId]: entityTypeId },
      });
    });
  },

  /** The remembered identifier if it is still offered; otherwise `null`, and the stale entry is removed. */
  async resolve(instanceId: string, knownIds: ReadonlySet<string>): Promise<string | null> {
    const id = await this.get(instanceId);
    if (id === null) return null;
    if (knownIds.has(id)) return id;
    await this.set(instanceId, null);
    return null;
  },
};
