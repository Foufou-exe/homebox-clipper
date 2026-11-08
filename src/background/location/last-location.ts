import { LAST_LOCATION_KEY } from '@/background/config/config-store';
import { originOf } from '@/background/config/url-policy';
import { browser } from '@/platform';

type ByInstance = Record<string, string>;

/** Reads the table, ignoring any value that is not `{ origin: identifier }` (corrupted storage). */
async function read(): Promise<ByInstance> {
  const stored = (await browser.storage.local.get(LAST_LOCATION_KEY))[LAST_LOCATION_KEY];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([, v]) => typeof v === 'string')) as ByInstance;
}

/**
 * Last location used, per HomeBox instance (R10, FR-020, FR-021).
 * Technical identifiers only: never a location name or purchase data. Local to the browser
 * (`storage.local`); erased entirely by `configStore.delete()`.
 */
export const lastLocation = {
  async get(baseUrl: string): Promise<string | null> {
    return (await read())[originOf(baseUrl)] ?? null;
  },

  async set(baseUrl: string, locationId: string): Promise<void> {
    await browser.storage.local.set({ [LAST_LOCATION_KEY]: { ...(await read()), [originOf(baseUrl)]: locationId } });
  },

  async remove(baseUrl: string): Promise<void> {
    const origin = originOf(baseUrl);
    const kept = Object.entries(await read()).filter(([k]) => k !== origin);
    await browser.storage.local.set({ [LAST_LOCATION_KEY]: Object.fromEntries(kept) });
  },

  /** Remembered identifier if it is still in the tree; otherwise `null`, and the stale entry is removed. */
  async resolve(baseUrl: string, knownIds: ReadonlySet<string>): Promise<string | null> {
    const id = await this.get(baseUrl);
    if (id === null) return null;
    if (knownIds.has(id)) return id;
    await this.remove(baseUrl);
    return null;
  },
};
