import { configStore } from '@/background/config/config-store';
import { injectExtractor } from '@/background/detect';
import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { browser } from '@/platform';
import { fail, ok, type Result } from '@/shared/errors';
import type { PendingImport } from '@/shared/types';
import { sendToTab } from '@/shared/messages';
import { findDuplicates } from './duplicates';
import { createOrchestrator, type Orchestrator } from './orchestrator';
import { fetchPhoto } from './photo-fetch';
import { pendingStore } from './pending-store';

/**
 * Imports en cours dans CE service worker. En mémoire, donc vide après un redémarrage : un `running`
 * persisté mais absent de l'ensemble n'a plus de processus derrière lui (R8).
 */
export const activeImports = new Set<string>();

/** Rend réessayable un import `running` orphelin, et le persiste. */
async function recoverOrphan(p: PendingImport): Promise<PendingImport> {
  if (p.status !== 'running' || activeImports.has(p.id)) return p;
  const recovered: PendingImport = { ...p, status: p.entityId ? 'partial' : 'failed', orphaned: true };
  // Seul un import dont le POST de création a démarré est incertain ; les suivants d'un lot ne le sont pas.
  if (!p.entityId && p.createAttempted) recovered.createUncertain = true;
  await pendingStore.save(recovered);
  return recovered;
}

async function orchestrator(started: string[] = []): Promise<Result<Orchestrator>> {
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
    fetchPhoto,
    notify(pending) {
      browser.runtime.sendMessage({ type: 'import/progress', pending }).catch(() => {
        // popup fermé : l'état reste lisible via import/pending
      });
    },
    newId() {
      // L'identifiant est déclaré actif avant que l'import puisse être persisté.
      const id = crypto.randomUUID();
      started.push(id);
      activeImports.add(id);
      return id;
    },
  }));
}

export function registerImportHandlers(): void {
  register('import/start', async ({ tabId, drafts, manualFiles }) => {
    const started: string[] = [];
    try {
      const o = await orchestrator(started);
      return o.ok ? await o.value.startImport(tabId, drafts, manualFiles) : o;
    } finally {
      for (const id of started) activeImports.delete(id);
    }
  });

  register('import/retry', async ({ pendingId, manualFiles }) => {
    // Reprise déjà en cours (double clic, deux popups) : pas de deuxième exécution, et ce second appel ne
    // retire pas l'identifiant du premier.
    if (activeImports.has(pendingId)) {
      const current = await pendingStore.get(pendingId);
      return current ? ok(current) : fail('BAD_MESSAGE');
    }
    activeImports.add(pendingId);
    try {
      const o = await orchestrator();
      return o.ok ? await o.value.retryImport(pendingId, manualFiles) : o;
    } finally {
      activeImports.delete(pendingId);
    }
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

  register('import/pending', async ({ tabId }) =>
    Promise.all((await pendingStore.listByTab(tabId)).map(recoverOrphan)),
  );
}
