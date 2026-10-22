import { configStore } from '@/background/config/config-store';
import { injectExtractor } from '@/background/detect';
import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { browser } from '@/platform';
import { fail } from '@/shared/errors';
import { sendToTab } from '@/shared/messages';
import { findDuplicates } from './duplicates';
import { createOrchestrator, type Orchestrator } from './orchestrator';
import { pendingStore } from './pending-store';

async function orchestrator(): Promise<Orchestrator | null> {
  const config = await configStore.getConfig();
  if (!config) return null;
  return createOrchestrator({
    client: createHomeBoxClient({ baseUrl: config.baseUrl, apiKey: config.apiKey }),
    store: pendingStore,
    async downloadDetected(tabId, url) {
      // L'onglet a pu être rechargé depuis la détection (reprise US4) : on réinjecte le script.
      if (!(await injectExtractor(tabId))) return fail('DOWNLOAD_REFUSED');
      try {
        return await sendToTab(tabId, { type: 'amazon/download', url });
      } catch {
        // onglet fermé ou rechargé : le script injecté n'est plus là
        return fail('DOWNLOAD_REFUSED');
      }
    },
    notify(pending) {
      browser.runtime.sendMessage({ type: 'import/progress', pending }).catch(() => {
        // popup fermé : l'état reste lisible via import/pending
      });
    },
    newId: () => crypto.randomUUID(),
  });
}

export function registerImportHandlers(): void {
  register('import/start', async ({ tabId, drafts, manualFiles }) => {
    const o = await orchestrator();
    return o ? o.startImport(tabId, drafts, manualFiles) : fail('NOT_CONFIGURED');
  });

  register('import/retry', async ({ pendingId, manualFiles }) => {
    const o = await orchestrator();
    return o ? o.retryImport(pendingId, manualFiles) : fail('NOT_CONFIGURED');
  });

  register('import/abandon', async ({ pendingId }) => {
    const o = await orchestrator();
    return o ? o.abandonImport(pendingId) : fail('NOT_CONFIGURED');
  });

  register('duplicate/check', async ({ orderNumber, name }) => {
    const config = await configStore.getConfig();
    if (!config) return fail('NOT_CONFIGURED');
    const client = createHomeBoxClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });
    const res = await findDuplicates(client, orderNumber, name);
    return res.ok ? { ok: true, value: { matches: res.value } } : res;
  });

  register('import/pending', ({ tabId }) => pendingStore.listByTab(tabId));
}
