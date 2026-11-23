import { browser } from '@/platform';
import { isOrderLinkSettings } from '@/shared/order-link';

/**
 * Order-page link option of an instance, read by the summary (spec 025, contracts/ui.md §2): a local read of
 * `storage.local.orderLinkByInstance` (configuration, no secret), like `tagSettings` and `warrantySettings`: no message,
 * no HomeBox request. The service worker re-checks the option at `import/start` (defense in depth). Never throws: an
 * absent, unreadable or malformed entry means the option is off.
 */
const KEY = 'orderLinkByInstance';

export async function loadOrderLinkEnabled(instanceId: string): Promise<boolean> {
  try {
    const table: unknown = (await browser.storage.local.get(KEY))[KEY];
    if (typeof table !== 'object' || table === null || Array.isArray(table)) return false;
    const entry = (table as Record<string, unknown>)[instanceId];
    return isOrderLinkSettings(entry) && entry.enabled;
  } catch {
    return false;
  }
}
