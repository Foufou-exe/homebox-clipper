import { ORDER_FIELDS_KEY } from '@/background/config/config-store';
import { enqueueConfigWrite } from '@/background/config/instance-store';
import { browser } from '@/platform';
import {
  DEFAULT_ORDER_FIELD_SETTINGS,
  isOrderFieldSettings,
  type OrderFieldSettings,
} from '@/shared/order-fields';

type ByInstance = Record<string, OrderFieldSettings>;

const copyOf = (s: OrderFieldSettings): OrderFieldSettings => ({
  enabled: s.enabled,
  names: { ...s.names },
});

/** Reads the table, ignoring any value or entry that is not valid settings (corrupted storage). Never throws. */
async function read(): Promise<ByInstance> {
  try {
    const stored = (await browser.storage.local.get(ORDER_FIELDS_KEY))[ORDER_FIELDS_KEY];
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored as Record<string, unknown>)
        .filter((entry): entry is [string, OrderFieldSettings] => isOrderFieldSettings(entry[1]))
        .map(([k, v]) => [k, copyOf(v)]),
    );
  } catch {
    return {};
  }
}

/**
 * Order-fields setting per HomeBox instance (spec 019, FR-001 to FR-008, contracts/storage.md §2): the option and the
 * three field names only, in `storage.local` (configuration data, no secret: readable and writable while locked).
 * Removed with the instance (`instanceStore.remove`) and with the settings (`instanceStore.clear`). Never logged.
 */
export const orderFieldSettings = {
  /** Setting of the instance; the default (option off, default names) when absent or malformed. */
  async get(instanceId: string): Promise<OrderFieldSettings> {
    return (await read())[instanceId] ?? copyOf(DEFAULT_ORDER_FIELD_SETTINGS);
  },

  /** Writes the entry, already validated (`isOrderFieldSettings`): names trimmed, valid and distinct. */
  /** Read-modify-write in the configuration write queue: ordered with `instanceStore.remove` (no orphan entry). */
  set(instanceId: string, settings: OrderFieldSettings): Promise<void> {
    return enqueueConfigWrite(async () => {
      await browser.storage.local.set({
        [ORDER_FIELDS_KEY]: { ...(await read()), [instanceId]: copyOf(settings) },
      });
    });
  },

  remove(instanceId: string): Promise<void> {
    return enqueueConfigWrite(async () => {
      const kept = Object.entries(await read()).filter(([k]) => k !== instanceId);
      await browser.storage.local.set({ [ORDER_FIELDS_KEY]: Object.fromEntries(kept) });
    });
  },
};
