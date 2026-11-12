import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { groupByOrder } from '@/background/history/entry';
import { importHistoryKey, open } from '@/background/history/history-crypto';
import { historyStore } from '@/background/history/history-store';
import type { HomeBoxClient } from '@/background/homebox/client';
import { createOrchestrator, type OrchestratorDeps } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { ok } from '@/shared/errors';
import type { ImportHistoryEntry } from '@/shared/types';
import { PDF_B64, draft, err, fakeClient, photoOk } from './orchestrator-harness';

const URL = 'https://homebox.example.com';
const PASS = 'une phrase de passe solide';

const local = async () => fakeBrowser.storage.local.get(null);
const historyKeys = async () =>
  Object.keys(await local()).filter((k) => k.startsWith('importHistory:'));

async function setupHistory(script: Parameters<typeof fakeClient>[0] = {}, withHistory = true) {
  fakeBrowser.reset();
  await configStore.save({ baseUrl: URL, apiKey: 'hb_xxxxxxxx', passphrase: PASS }, 1_000);
  const key = await importHistoryKey((await configStore.getHistoryKey())!);
  const writer = historyStore.forKey(key);
  const order: string[] = [];
  const history: OrchestratorDeps['history'] = {
    start: vi.fn(async (p) => {
      order.push('history.start');
      await writer.start(p, URL);
    }),
    update: vi.fn(async (p) => {
      order.push(`history.update:${p.status}`);
      await writer.update(p);
    }),
  };
  const client = fakeClient(script);
  client.createEntity.mockImplementation(async () => {
    order.push('client.createEntity');
    const next = script.create?.shift();
    return next ? (typeof next === 'function' ? next() : next) : ok({ id: 'e1', name: 'x' });
  });
  const purge = vi.spyOn(pendingStore, 'purge').mockImplementation(async (p) => {
    order.push('store.purge');
    await fakeBrowser.storage.session.remove(`pendingImport:${p.tabId}:${p.id}`);
  });
  let n = 0;
  const orchestrator = createOrchestrator({
    client: client as unknown as HomeBoxClient,
    store: pendingStore,
    downloadDetected: async () => ok({ base64: PDF_B64 }),
    fetchPhoto: async () => ok(photoOk),
    notify: () => undefined,
    newId: () => `p${++n}`,
    ...(withHistory ? { history } : {}),
  });
  const read = async (id: string) =>
    open((await local())[`importHistory:${id}`], key, id) as Promise<ImportHistoryEntry>;
  return { orchestrator, client, history, order, purge, key, read };
}

describe('orchestrator with history (012, US1)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('complete import: one key, running then complete; start before the first POST, last update before purge', async () => {
    const { orchestrator, order, read } = await setupHistory();
    const r = await orchestrator.startImport(1, [draft()], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(await historyKeys()).toEqual(['importHistory:p1']);
    expect(await read('p1')).toMatchObject({
      status: 'complete',
      entityId: 'e1',
      missing: [],
      reason: null,
    });
    expect(order.indexOf('history.start')).toBeLessThan(order.indexOf('client.createEntity'));
    expect(order.at(-1)).toBe('store.purge');
    expect(order.at(-2)).toBe('history.update:success');
    expect(order.filter((o) => o === 'history.update:running').length).toBeGreaterThan(0);
  });

  it('batch of 3 products: 3 entries with the same order number, grouped (Q-U8, US1-3)', async () => {
    const { orchestrator, read } = await setupHistory();
    await orchestrator.startImport(
      1,
      [draft({ name: 'A' }), draft({ name: 'B' }), draft({ name: 'C' })],
      [],
    );
    const entries = await Promise.all(['p1', 'p2', 'p3'].map(read));
    expect(entries.map((e) => e.orderNumber)).toEqual(Array(3).fill('999-0000000-0000001'));
    expect(groupByOrder(entries)).toHaveLength(1);
  });

  it('Q-U36: locking during an import, the entry still ends complete, readable after unlock, no clear text', async () => {
    const { orchestrator, client, read } = await setupHistory();
    client.updateEntity.mockImplementation(async (id: string) => {
      await configStore.lock();
      return ok({ id, name: 'x' });
    });
    const r = await orchestrator.startImport(1, [draft()], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(await configStore.historyState()).toBe('locked');
    expect(JSON.stringify(await local())).not.toContain('Clavier');
    await configStore.unlock(PASS);
    expect(await read('p1')).toMatchObject({ status: 'complete' });
  });

  it('Q-U14: a failing history write never interrupts the import, logged by code only', async () => {
    const { orchestrator, purge } = await setupHistory();
    const original = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local);
    vi.spyOn(fakeBrowser.storage.local, 'set').mockImplementation(
      async (items: Record<string, unknown>) => {
        if (Object.keys(items).some((k) => k.startsWith('importHistory:')))
          throw new Error('quota');
        return original(items);
      },
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await orchestrator.startImport(1, [draft()], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(purge).toHaveBeenCalled();
    const calls = warn.mock.calls.filter((c) => String(c[0]).includes('history write failed'));
    expect(
      calls.some((c) => JSON.stringify(c[1]) === JSON.stringify({ endpoint: 'history/start' })),
    ).toBe(true);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Clavier');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('999-0000000');
  });

  it('Q-U14 bis: a failing update is logged with history/update', async () => {
    const { orchestrator, history } = await setupHistory();
    vi.mocked(history!.update).mockRejectedValue(new Error('quota'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await orchestrator.startImport(1, [draft()], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(
      warn.mock.calls.some(
        (c) => JSON.stringify(c[1]) === JSON.stringify({ endpoint: 'history/update' }),
      ),
    ).toBe(true);
  });

  it('Q-R4: without history, same results as before and no importHistory:* key', async () => {
    const { orchestrator } = await setupHistory({}, false);
    const r = await orchestrator.startImport(1, [draft()], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(await historyKeys()).toEqual([]);
  });

  it('history disabled: no write', async () => {
    const { orchestrator } = await setupHistory();
    await historyStore.setEnabled(false);
    await orchestrator.startImport(1, [draft()], []);
    expect(await historyKeys()).toEqual([]);
  });

  it('a failure before startImport (empty name) writes nothing', async () => {
    const { orchestrator, history } = await setupHistory();
    expect(await orchestrator.startImport(1, [draft({ name: '  ' })], [])).toEqual({
      ok: false,
      error: 'PRODUCT_NOT_FOUND',
    });
    expect(history!.start).not.toHaveBeenCalled();
    expect(await historyKeys()).toEqual([]);
  });

  it('the creation failure keeps the HomeBox call sequence (no extra call)', async () => {
    const { orchestrator, client, read } = await setupHistory({
      create: [err('CREATE_FAILED', 500)],
    });
    await orchestrator.startImport(1, [draft()], []);
    expect(client.createEntity).toHaveBeenCalledTimes(1);
    expect(client.updateEntity).not.toHaveBeenCalled();
    expect((await read('p1')).status).toBe('failed');
  });
});

describe('orchestrator with history: incomplete imports and resume (012, US2)', () => {
  afterEach(() => vi.restoreAllMocks());
  const orderDoc = { id: 'detected-1', origin: 'detected' as const, kind: 'order_document' as const, label: 'bon.pdf', url: 'https://www.amazon.fr/doc.pdf' };

  it('Q-U6: invoice refused → partial, missing invoice, error code; successful resume → same key, complete, importedAt kept', async () => {
    const { orchestrator, read } = await setupHistory({ attach: [err('ATTACHMENT_FAILED', 500)] });
    await orchestrator.startImport(1, [draft()], []);
    const partial = await read('p1');
    expect(partial).toMatchObject({ status: 'partial', missing: ['invoice'], reason: 'ATTACHMENT_FAILED', entityId: 'e1' });
    const r = await orchestrator.retryImport('p1');
    expect(r.ok && r.value.status).toBe('success');
    expect(await historyKeys()).toEqual(['importHistory:p1']);
    const done = await read('p1');
    expect(done).toMatchObject({ status: 'complete', missing: [], reason: null, entityId: 'e1' });
    expect(done.importedAt).toBe(partial.importedAt);
  });

  it('Q-U7: creation failure (HTTP 500) → failed, no entityId, CREATE_FAILED; UNAUTHORIZED → UNAUTHORIZED', async () => {
    const a = await setupHistory({ create: [err('CREATE_FAILED', 500)] });
    await a.orchestrator.startImport(1, [draft()], []);
    expect(await a.read('p1')).toMatchObject({ status: 'failed', entityId: null, missing: [], reason: 'CREATE_FAILED' });
    const b = await setupHistory({ create: [err('UNAUTHORIZED', 401)] });
    await b.orchestrator.startImport(1, [draft()], []);
    expect(await b.read('p1')).toMatchObject({ status: 'failed', reason: 'UNAUTHORIZED' });
  });

  it('failed → partial: creation succeeds on resume but a later step fails; entityId is set', async () => {
    const { orchestrator, read } = await setupHistory({ create: [err('CREATE_FAILED', 500)], attach: [err('ATTACHMENT_FAILED', 500)] });
    await orchestrator.startImport(1, [draft()], []);
    await orchestrator.retryImport('p1');
    expect(await read('p1')).toMatchObject({ status: 'partial', entityId: 'e1', missing: ['invoice'] });
  });

  it('failed → complete', async () => {
    const { orchestrator, read } = await setupHistory({ create: [err('CREATE_FAILED', 500)] });
    await orchestrator.startImport(1, [draft()], []);
    await orchestrator.retryImport('p1');
    expect(await read('p1')).toMatchObject({ status: 'complete', entityId: 'e1' });
  });

  it('partial → partial: missing shrinks, reason updated; entityId stays when a resume fails', async () => {
    const { orchestrator, read } = await setupHistory({
      attach: [err('ATTACHMENT_FAILED', 500), err('ATTACHMENT_FAILED', 500), ok(undefined), err('ATTACHMENT_FAILED', 500)],
      update: [err('UPDATE_FAILED', 500)],
    });
    await orchestrator.startImport(1, [draft({ documents: [draft().documents[0]!, orderDoc] })], []);
    expect(await read('p1')).toMatchObject({ status: 'partial', missing: ['details', 'invoice', 'documents'], reason: 'UPDATE_FAILED' });
    await orchestrator.retryImport('p1');
    expect(await read('p1')).toMatchObject({ status: 'partial', missing: ['documents'], reason: 'ATTACHMENT_FAILED', entityId: 'e1' });
  });

  it('abandon does not modify the entry', async () => {
    const { orchestrator } = await setupHistory({ attach: [err('ATTACHMENT_FAILED', 500)] });
    await orchestrator.startImport(1, [draft()], []);
    const before = (await local())['importHistory:p1'];
    await orchestrator.abandonImport('p1');
    expect((await local())['importHistory:p1']).toEqual(before);
  });

  it('an entry deleted before the resume is not resurrected', async () => {
    const { orchestrator } = await setupHistory({ attach: [err('ATTACHMENT_FAILED', 500)] });
    await orchestrator.startImport(1, [draft()], []);
    await historyStore.remove('p1');
    const r = await orchestrator.retryImport('p1');
    expect(r.ok && r.value.status).toBe('success');
    expect(await historyKeys()).toEqual([]);
  });
});
