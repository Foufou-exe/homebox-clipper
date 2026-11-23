import { instanceStore } from '@/background/config/instance-store';
import { register } from '@/background/router';
import { fail, ok } from '@/shared/errors';
import { orderLinkSettings } from './settings';

/**
 * Order-page link setting (spec 025, contracts/runtime-messages.md §1): reserved to extension pages (`order-link/` in
 * UI_ONLY_PREFIXES). The setting holds no secret: `get` and `set` use neither the key nor the network and work while
 * locked. The answers never carry the address or the key; nothing is logged.
 */
export function registerOrderLinkHandlers(): void {
  // An unknown instance is refused (no orphan entry is read or written).
  register('order-link/get', async ({ instanceId }) => {
    if (!(await instanceStore.byId(instanceId))) return fail('INSTANCE_NOT_FOUND');
    return ok({ settings: await orderLinkSettings.get(instanceId) });
  });

  // `settings` already validated by the router (`isOrderLinkSettings`).
  register('order-link/set', async ({ instanceId, settings }) => {
    if (!(await instanceStore.byId(instanceId))) return fail('INSTANCE_NOT_FOUND');
    await orderLinkSettings.set(instanceId, settings);
    return ok({ settings: await orderLinkSettings.get(instanceId) });
  });
}
