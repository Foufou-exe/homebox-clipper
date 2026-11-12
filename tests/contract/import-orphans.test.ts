import { configStore } from '@/background/config/config-store';
import { registerHistoryHandlers } from '@/background/history/handlers';
import { importHistoryKey, open } from '@/background/history/history-crypto';
import { historyStore } from '@/background/history/history-store';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { activeImports, registerImportHandlers } from '@/background/import/handlers';
import { pendingStore } from '@/background/import/pending-store';
import { dispatch } from '@/background/router';
import type { PendingImport } from '@/shared/types';
import { draft } from './orchestrator-harness';

const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = (msg: unknown) => dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });

const running = (id: string, entityId: string | null): PendingImport => ({
  id,
  tabId: 5,
  pageUrl: null,
  draft: draft(),
  entityId,
  steps: { create: entityId ? 'done' : 'pending', update: 'pending', attachments: { 'detected-0': 'pending' }, photo: 'unavailable' },
  photoError: null,
  photoAttempted: false,
  status: 'running',
  error: null,
});

describe('orphaned imports after the service worker stops (R8)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    activeImports.clear();
    registerImportHandlers();
  });

  it('running absent from active imports and without entityId → failed, retryable', async () => {
    await pendingStore.save(running('a', null));
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'a', status: 'failed', entityId: null });
    // Persisted: a second read gives the same state.
    expect((await pendingStore.get('a'))?.status).toBe('failed');
  });

  it('running absent from active imports but with entityId → partial, retryable', async () => {
    await pendingStore.save(running('b', 'e1'));
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'b', status: 'partial', entityId: 'e1' });
    expect((await pendingStore.get('b'))?.status).toBe('partial');
  });

  it('running present in active imports → stays running', async () => {
    await pendingStore.save(running('c', 'e1'));
    activeImports.add('c');
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'c', status: 'running' });
    expect((await pendingStore.get('c'))?.status).toBe('running');
  });

  it('an already finished import is not modified', async () => {
    await pendingStore.save({ ...running('d', 'e1'), status: 'partial', error: 'ATTACHMENT_FAILED' });
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ status: 'partial', error: 'ATTACHMENT_FAILED' });
  });

  it('running whose creation POST has started (createAttempted) → failed, orphaned and createUncertain', async () => {
    await pendingStore.save({ ...running('f', null), createAttempted: true });
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'f', status: 'failed', orphaned: true, createUncertain: true });
    expect((await pendingStore.get('f'))?.createUncertain).toBe(true);
  });

  it('running whose POST has not started (batch, following import) → failed, orphaned, not uncertain', async () => {
    await pendingStore.save(running('g', null));
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'g', status: 'failed', orphaned: true });
    expect(list[0]?.createUncertain).toBeFalsy();
  });
});

describe('orphaned imports: history reconciliation (012, Q-U13, Q-U36)', () => {
  const HB = 'https://homebox.example.com';
  const PASS = 'une phrase de passe solide';

  async function withHistory(p: PendingImport) {
    await configStore.save({ baseUrl: HB, apiKey: 'hb_xxxxxxxx', passphrase: PASS }, 1_000);
    const key = await importHistoryKey((await configStore.getHistoryKey())!);
    await historyStore.start(key, p, HB);
    await pendingStore.save(p);
    return key;
  }
  const entryOf = async (key: CryptoKey, id: string) => open((await fakeBrowser.storage.local.get(null))[`importHistory:${id}`], key, id);

  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    activeImports.clear();
    registerImportHandlers();
    registerHistoryHandlers();
  });

  it('running absent from active imports: recoverOrphan reconciles the entry (partial with entityId, failed without)', async () => {
    const key = await withHistory(running('h1', 'e1'));
    await historyStore.start(key, running('h2', null), HB);
    await pendingStore.save(running('h2', null));
    await call({ type: 'import/pending', tabId: 5 });
    expect(await entryOf(key, 'h1')).toMatchObject({ status: 'partial', interrupted: true, reason: null });
    expect(await entryOf(key, 'h2')).toMatchObject({ status: 'failed', interrupted: true, reason: null, missing: [] });
  });

  it('best effort: without the history key (locked) recoverOrphan does not throw; reconciliation at history/list after unlock', async () => {
    const key = await withHistory(running('h1', 'e1'));
    await configStore.lock();
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ status: 'partial' });
    expect(await entryOf(key, 'h1')).toMatchObject({ status: 'running' });
    await configStore.unlock(PASS);
    const res = (await call({ type: 'history/list' })) as { value: { entries: { status: string; interrupted?: boolean }[] } };
    expect(res.value.entries[0]).toMatchObject({ status: 'partial', interrupted: true });
  });

  it('Q-U36: service worker stopped (writer dropped, activeImports emptied): reconciled at the next list', async () => {
    const key = await withHistory(running('h1', null));
    activeImports.add('h1');
    activeImports.clear();
    const res = (await call({ type: 'history/list' })) as { value: { entries: { status: string; interrupted?: boolean }[] } };
    expect(res.value.entries[0]).toMatchObject({ status: 'failed', interrupted: true });
    expect(await entryOf(key, 'h1')).toMatchObject({ status: 'failed', interrupted: true });
  });
});
