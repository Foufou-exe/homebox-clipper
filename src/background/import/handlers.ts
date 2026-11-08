import { configStore } from '@/background/config/config-store';
import { lastLocation } from '@/background/location/last-location';
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
 * Imports in progress in THIS service worker. In memory, so empty after a restart: a persisted
 * `running` import missing from the set has no process behind it anymore (R8).
 */
export const activeImports = new Set<string>();

/** Makes an orphaned `running` import retryable, and persists it. */
async function recoverOrphan(p: PendingImport): Promise<PendingImport> {
  if (p.status !== 'running' || activeImports.has(p.id)) return p;
  const recovered: PendingImport = { ...p, status: p.entityId ? 'partial' : 'failed', orphaned: true };
  // Only an import whose creation POST has started is uncertain; the following ones in a batch are not.
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
      // The tab may have been reloaded since detection (US4 resume): the script is injected again.
      if (!(await injectExtractor(tabId))) return fail('DOWNLOAD_REFUSED');
      try {
        return await sendToTab(tabId, { type: 'amazon/download', url });
      } catch {
        // tab closed or reloaded: the injected script is gone
        return fail('DOWNLOAD_REFUSED');
      }
    },
    fetchPhoto,
    // Last location used, specific to this instance (R10): identifier only.
    rememberLocation: (id) => lastLocation.set(config.baseUrl, id),
    notify(pending) {
      browser.runtime.sendMessage({ type: 'import/progress', pending }).catch(() => {
        // popup closed: the state remains readable via import/pending
      });
    },
    newId() {
      // The identifier is declared active before the import can be persisted.
      const id = crypto.randomUUID();
      started.push(id);
      activeImports.add(id);
      return id;
    },
  }));
}

export function registerImportHandlers(): void {
  register('import/start', async ({ tabId, drafts, manualFiles, orderLocationId }) => {
    const started: string[] = [];
    try {
      const o = await orchestrator(started);
      return o.ok ? await o.value.startImport(tabId, drafts, manualFiles, orderLocationId ?? null) : o;
    } finally {
      for (const id of started) activeImports.delete(id);
    }
  });

  register('import/retry', async ({ pendingId, manualFiles, location }) => {
    // Resume already in progress (double click, two popups): no second run, and this second call does not
    // remove the first call's identifier.
    if (activeImports.has(pendingId)) {
      const current = await pendingStore.get(pendingId);
      return current ? ok(current) : fail('BAD_MESSAGE');
    }
    activeImports.add(pendingId);
    try {
      const o = await orchestrator();
      return o.ok ? await o.value.retryImport(pendingId, manualFiles, location) : o;
    } finally {
      activeImports.delete(pendingId);
    }
  });

  register('import/abandon', async ({ pendingId }) => {
    // Abandoning does not contact HomeBox: possible even while the extension is locked.
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
