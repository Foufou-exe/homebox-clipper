import * as autoLock from '@/background/config/auto-lock';
import { configStore } from '@/background/config/config-store';
import { instanceStore } from '@/background/config/instance-store';
import { lastLocation } from '@/background/location/last-location';
import { injectExtractor } from '@/background/detect';
import { createHomeBoxClient } from '@/background/homebox/client';
import { importHistoryKey } from '@/background/history/history-crypto';
import { historyStore } from '@/background/history/history-store';
import { orderFieldSettings } from '@/background/order-fields/settings';
import { register } from '@/background/router';
import { browser } from '@/platform';
import { fail, ok, type Result } from '@/shared/errors';
import { logError } from '@/shared/logger';
import type { PendingImport } from '@/shared/types';
import { sendToTab } from '@/shared/messages';
import { orderNoteLine, planCompletion } from './completion';
import { checkDuplicates } from './duplicates';
import { createOrchestrator, type Orchestrator } from './orchestrator';
import { fetchPhoto } from './photo-fetch';
import { pendingStore } from './pending-store';
import { activeImports, beginTarget } from './active-imports';

export { activeImports };

/**
 * History entry of an orphaned import → partial/failed + interrupted (R1.3). Best effort: without the history
 * key in the session (locked), reconciliation is deferred to `history/list`; no error goes up.
 */
async function reconcileHistory(p: PendingImport): Promise<void> {
  try {
    const raw = await configStore.getHistoryKey();
    if (raw) await historyStore.reconcile(await importHistoryKey(raw), p);
  } catch {
    logError('history write failed', { endpoint: 'history/update' });
  }
}

/** Makes an orphaned `running` import retryable, and persists it. */
async function recoverOrphan(p: PendingImport): Promise<PendingImport> {
  if (p.status !== 'running' || activeImports.has(p.id)) return p;
  const recovered: PendingImport = { ...p, status: p.entityId ? 'partial' : 'failed', orphaned: true };
  // Only an import whose creation POST has started is uncertain; the following ones in a batch are not.
  if (!p.entityId && p.createAttempted) recovered.createUncertain = true;
  await pendingStore.save(recovered);
  await reconcileHistory(recovered);
  return recovered;
}

/**
 * Orchestrator bound to ONE instance (spec 016, R6): its client is built from the credentials of `instanceId`
 * only. The orchestrator itself knows nothing about instances: the wrapped `store` and `notify` set
 * `PendingImport.instanceId`, so that a resume always targets the instance of origin (FR-018).
 */
async function orchestrator(instanceId: string, started: string[] = []): Promise<Result<Orchestrator>> {
  const creds = await configStore.getCredentials(instanceId);
  if (!creds.ok) return creds;
  const config = creds.value;
  const target = config.id;
  // History key captured in the closure, like the API key (R10.5): the import keeps writing its entry even if
  // the extension is locked meanwhile. No key (migrated key without passphrase): import without history.
  const rawHistoryKey = await configStore.getHistoryKey();
  const writer = rawHistoryKey ? historyStore.forKey(await importHistoryKey(rawHistoryKey), target) : null;
  return ok(createOrchestrator({
    client: createHomeBoxClient({ baseUrl: config.baseUrl, apiKey: config.apiKey }),
    store: {
      save: (p) => pendingStore.save({ ...p, instanceId: target }),
      get: (id) => pendingStore.get(id),
      purge: (p) => pendingStore.purge(p),
    },
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
    // Last location used, specific to this instance (R10, indexed by id since spec 016): identifier only.
    rememberLocation: (id) => lastLocation.set(target, id),
    ...(writer
      ? { history: { start: (p: PendingImport) => writer.start(p, config.baseUrl), update: (p: PendingImport) => writer.update(p) } }
      : {}),
    notify(pending) {
      browser.runtime.sendMessage({ type: 'import/progress', pending: { ...pending, instanceId: target } }).catch(() => {
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

/**
 * Target of a resume (FR-018): the instance recorded in the pending import, never a value of the message. A state
 * without `instanceId` (previous version) is attached to the instance only if there is exactly one.
 */
async function retryTarget(pending: PendingImport | null): Promise<Result<string>> {
  if (typeof pending?.instanceId === 'string') return ok(pending.instanceId);
  const store = await instanceStore.read();
  if (!store) return fail('NOT_CONFIGURED');
  const only = store.instances.length === 1 ? store.instances[0] : undefined;
  return only ? ok(only.id) : fail('INSTANCE_NOT_FOUND');
}

/** `lastInstanceId` (FR-012): written only when at least one import succeeded; never fails the import. */
async function rememberInstance(instanceId: string, results: PendingImport[]): Promise<void> {
  if (!results.some((p) => p.status === 'success')) return;
  try {
    await instanceStore.setLastUsed(instanceId);
  } catch {
    // the proposed instance stays the previous one
  }
}

/** Automatic lock due during the import (013, FR-007): applied now; never alters the import result. */
async function lockAfterImport(): Promise<void> {
  try {
    await autoLock.afterImport();
  } catch {
    // already logged by expireIfDue (constant endpoint); the import result stays as is
  }
}

export function registerImportHandlers(): void {
  register('import/start', async ({ instanceId, tabId, drafts, manualFiles, orderLocationId }) => {
    // Defense in depth (spec 019): order fields are refused, before any request, if the option is off for the target.
    if (drafts.some((d) => d.orderFields !== undefined) && !(await orderFieldSettings.get(instanceId)).enabled) {
      return fail('BAD_MESSAGE');
    }
    const started: string[] = [];
    // The target instance cannot be deleted while this import runs (US4-8).
    const endTarget = beginTarget(instanceId);
    try {
      const o = await orchestrator(instanceId, started);
      if (!o.ok) return o;
      const res = await o.value.startImport(tabId, drafts, manualFiles, orderLocationId ?? null);
      if (!res.ok) return res;
      await rememberInstance(instanceId, res.value);
      return ok(res.value.map((p) => ({ ...p, instanceId })));
    } finally {
      for (const id of started) activeImports.delete(id);
      endTarget();
      await lockAfterImport();
    }
  });

  register('import/retry', async ({ pendingId, manualFiles, location }) => {
    // Resume already in progress (double click, two popups): no second run, and this second call does not
    // remove the first call's identifier.
    if (activeImports.has(pendingId)) {
      const current = await pendingStore.get(pendingId);
      return current ? ok(current) : fail('BAD_MESSAGE');
    }
    const stored = await pendingStore.get(pendingId);
    // Spec 018 (FR-005): a product with a template is never retried without location; refused before any request.
    if (location === null && stored?.draft.template) return fail('BAD_MESSAGE');
    const target = await retryTarget(stored);
    if (!target.ok) return target;
    // Credentials checked BEFORE the import is declared active (review T070): an expired session is locked here,
    // even if the router's activity hook failed; no HomeBox call is made.
    const creds = await configStore.getCredentials(target.value);
    if (!creds.ok) return creds;
    activeImports.add(pendingId);
    const endTarget = beginTarget(target.value);
    try {
      const o = await orchestrator(target.value);
      if (!o.ok) return o;
      const res = await o.value.retryImport(pendingId, manualFiles, location);
      if (!res.ok) return res;
      await rememberInstance(target.value, [res.value]);
      return ok({ ...res.value, instanceId: target.value });
    } finally {
      activeImports.delete(pendingId);
      endTarget();
      await lockAfterImport();
    }
  });

  register('import/abandon', async ({ pendingId }) => {
    // Abandoning does not contact HomeBox: possible even while the extension is locked.
    const pending = await pendingStore.get(pendingId);
    if (pending) await pendingStore.purge(pending);
    return ok(undefined);
  });

  register('duplicate/check', async ({ instanceId, orderNumber, name }) => {
    // Spec 016: duplicates are only searched on the target instance.
    const creds = await configStore.getCredentials(instanceId);
    if (!creds.ok) return creds;
    const client = createHomeBoxClient(creds.value);
    // Spec 020: the order-number custom field is also queried when the option is on for this instance only.
    const settings = await orderFieldSettings.get(instanceId);
    return checkDuplicates(
      client,
      orderNumber,
      name,
      settings.enabled ? { name: settings.names.orderNumber, client } : undefined,
    );
  });

  /**
   * Spec 021 (contracts/runtime-messages.md §1): a fresh read of the chosen item on the target instance only, and the
   * changes completing it would make. Read-only; the answer carries no other value of the item (FR-004).
   */
  register('import/complete-preview', async ({ instanceId, entityId, draft }) => {
    const creds = await configStore.getCredentials(instanceId);
    if (!creds.ok) return creds;
    const read = await createHomeBoxClient(creds.value).getEntity(entityId);
    if (!read.ok) return read.httpStatus === 404 ? fail('ITEM_NOT_FOUND', 404) : read;
    const plan = planCompletion(read.value, draft, orderNoteLine(draft));
    const itemName = typeof read.value.name === 'string' ? read.value.name : '';
    return ok({ entityId, itemName, quantity: plan.quantity, changes: plan.changes, filled: plan.filled });
  });

  register('import/pending', async ({ tabId }) =>
    Promise.all((await pendingStore.listByTab(tabId)).map(recoverOrphan)),
  );
}
