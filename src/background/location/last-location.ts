import { LAST_LOCATION_KEY } from '@/background/config/config-store';
import { browser } from '@/platform';

type ByInstance = Record<string, string>;

/** Reads the table, ignoring any value that is not `{ instanceId: identifier }` (corrupted storage). */
async function read(): Promise<ByInstance> {
  const stored = (await browser.storage.local.get(LAST_LOCATION_KEY))[LAST_LOCATION_KEY];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([, v]) => typeof v === 'string')) as ByInstance;
}

/**
 * Last location used, per HomeBox instance (R10, FR-020, FR-021), indexed by instance id since spec 016 (two
 * instances on the same origin no longer share it, FR-019). Technical identifiers only: never a location name or
 * purchase data. Local to the browser (`storage.local`); erased entirely by `configStore.delete()`.
 */
export const lastLocation = {
  async get(instanceId: string): Promise<string | null> {
    return (await read())[instanceId] ?? null;
  },

  async set(instanceId: string, locationId: string): Promise<void> {
    await browser.storage.local.set({ [LAST_LOCATION_KEY]: { ...(await read()), [instanceId]: locationId } });
  },

  async remove(instanceId: string): Promise<void> {
    const kept = Object.entries(await read()).filter(([k]) => k !== instanceId);
    await browser.storage.local.set({ [LAST_LOCATION_KEY]: Object.fromEntries(kept) });
  },

  /** Remembered identifier if it is still in the tree; otherwise `null`, and the stale entry is removed. */
  async resolve(instanceId: string, knownIds: ReadonlySet<string>): Promise<string | null> {
    const id = await this.get(instanceId);
    if (id === null) return null;
    if (knownIds.has(id)) return id;
    await this.remove(instanceId);
    return null;
  },
};
