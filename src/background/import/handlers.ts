import { configStore } from '@/background/config/config-store';
import { injectExtractor } from '@/background/detect';
import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { browser } from '@/platform';
import { fail, ok, type Result } from '@/shared/errors';
import { sendToTab } from '@/shared/messages';
import { findDuplicates } from './duplicates';
import { createOrchestrator, type Orchestrator } from './orchestrator';
import { pendingStore } from './pending-store';

async function orchestrator(): Promise<Result<Orchestrator>> {
  const creds = await configStore.getCredentials();
  if (!creds.ok) return creds;
  const config = creds.value;
  return ok(createOrchestrator({
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
  }));
}

export function registerImportHandlers(): void {
  register('import/start', async ({ tabId, drafts, manualFiles }) => {
    const o = await orchestrator();
    return o.ok ? o.value.startImport(tabId, drafts, manualFiles) : o;
  });

  register('import/retry', async ({ pendingId, manualFiles }) => {
    const o = await orchestrator();
    return o.ok ? o.value.retryImport(pendingId, manualFiles) : o;
  });

  register('import/abandon', async ({ pendingId }) => {
    // Abandonner ne contacte pas HomeBox : possible même extension verrouillée.
    const pending = await pendingStore.get(pendingId);
    if (pending) await pendingStore.purge(pending);
    return ok(undefined);
  });

  register('duplicate/check', async ({ orderNumber, name }) => {
    const creds = await configStore.getCredentials();
    if (!creds.ok) return creds;
    const client = createHomeBoxClient(creds.value);
    const res = await findDuplicates(client, orderNumber, name);
    return res.ok ? { ok: true, value: { matches: res.value } } : res;
  });

  register('import/pending', ({ tabId }) => pendingStore.listByTab(tabId));
}
