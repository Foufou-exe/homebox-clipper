import { ORDER_LINK_KEY } from '@/background/config/config-store';
import { enqueueConfigWrite } from '@/background/config/instance-store';
import { browser } from '@/platform';
import {
  DEFAULT_ORDER_LINK_SETTINGS,
  isOrderLinkSettings,
  type OrderLinkSettings,
} from '@/shared/order-link';

type ByInstance = Record<string, OrderLinkSettings>;

/** Reads the table, ignoring any value or entry that is not valid settings (corrupted storage). Never throws. */
async function read(): Promise<ByInstance> {
  try {
    const stored = (await browser.storage.local.get(ORDER_LINK_KEY))[ORDER_LINK_KEY];
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored as Record<string, unknown>)
        .filter((entry): entry is [string, OrderLinkSettings] => isOrderLinkSettings(entry[1]))
        .map(([k, v]) => [k, { enabled: v.enabled }]),
    );
  } catch {
    return {};
  }
}

/**
 * Order-page link setting per HomeBox instance (spec 025, FR-001, FR-002, contracts/storage.md): the option only, in
 * `storage.local` (configuration data, no secret: readable and writable while locked). Removed with the instance
 * (`instanceStore.remove`) and with the settings (`instanceStore.clear`). Never logged.
 */
export const orderLinkSettings = {
  /** Setting of the instance; the default (option off) when absent or malformed. */
  async get(instanceId: string): Promise<OrderLinkSettings> {
    return (await read())[instanceId] ?? { ...DEFAULT_ORDER_LINK_SETTINGS };
  },

  /** Read-modify-write in the configuration write queue: ordered with `instanceStore.remove` (no orphan entry). */
  set(instanceId: string, settings: OrderLinkSettings): Promise<void> {
    return enqueueConfigWrite(async () => {
      await browser.storage.local.set({
        [ORDER_LINK_KEY]: { ...(await read()), [instanceId]: { enabled: settings.enabled } },
      });
    });
  },
};
