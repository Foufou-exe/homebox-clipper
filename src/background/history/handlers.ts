import { configStore } from '@/background/config/config-store';
import { pendingStore } from '@/background/import/pending-store';
import { register } from '@/background/router';
import { ok } from '@/shared/errors';
import { importHistoryKey } from './history-crypto';
import { historyStore } from './history-store';

/**
 * `history/*` messages (contracts/runtime-messages.md), reserved to extension pages (`UI_ONLY_PREFIXES`).
 * No response carries the history key. Locked: `list` returns no entry; delete, clear and set-enabled work
 * without the key. A storage error is turned into `BAD_MESSAGE` by the router.
 */
export function registerHistoryHandlers(): void {
  register('history/list', async () => {
    const state = await configStore.historyState();
    const raw = state === 'ready' ? await configStore.getHistoryKey() : null;
    if (!raw) {
      const enabled = await historyStore.isEnabled();
      // Interrupted disabling: erasing does not need the key (R5.3).
      if (!enabled) await historyStore.clear();
      return ok({ state: state === 'ready' ? 'unavailable' : state, enabled, entries: [] as [] });
    }
    const { enabled, entries } = await historyStore.list(await importHistoryKey(raw), await pendingStore.ids());
    return ok({ state: 'ready' as const, enabled, entries });
  });

  register('history/delete', async ({ id }) => {
    await historyStore.remove(id);
    return ok(undefined);
  });

  register('history/clear', async () => {
    await historyStore.clear();
    return ok(undefined);
  });

  register('history/set-enabled', async ({ enabled }) => {
    await historyStore.setEnabled(enabled);
    return ok(undefined);
  });
}
