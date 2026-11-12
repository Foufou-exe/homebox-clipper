import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { importHistoryKey } from '@/background/history/history-crypto';
import { registerHistoryHandlers } from '@/background/history/handlers';
import { historyStore } from '@/background/history/history-store';
import { pendingStore } from '@/background/import/pending-store';
import { activeImports, registerImportHandlers } from '@/background/import/handlers';
import { dispatch } from '@/background/router';
import { bytesToBase64 } from '@/shared/pdf';
import type { HistoryListView, PendingImport } from '@/shared/types';
import { draft } from './orchestrator-harness';

const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = (msg: unknown) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const URL = 'https://homebox.example.com';
const PASS = 'une phrase de passe solide';
const NAME = 'Clavier sans fil Exemple Pro';
const ORDER = '999-0000000-0000001';

const pending = (id: string, over: Partial<PendingImport> = {}): PendingImport => ({
  id,
  tabId: 5,
  pageUrl: 'https://www.amazon.fr/your-orders/order-details',
  draft: draft(),
  entityId: null,
  steps: {
    create: 'pending',
    update: 'pending',
    attachments: { 'detected-0': 'pending' },
    photo: 'unavailable',
  },
  status: 'running',
  error: null,
  photoError: null,
  photoAttempted: false,
  ...over,
});

const historyKeys = async () =>
  Object.keys(await fakeBrowser.storage.local.get(null)).filter((k) =>
    k.startsWith('importHistory:'),
  );

async function configured() {
  await configStore.save({ baseUrl: URL, apiKey: 'hb_xxxxxxxx', passphrase: PASS }, 1_000);
  const key = await importHistoryKey((await configStore.getHistoryKey())!);
  return key;
}

async function list() {
  const res = (await call({ type: 'history/list' })) as { ok: true; value: HistoryListView };
  expect(res.ok).toBe(true);
  return res.value;
}

describe('history/* handlers (contracts/runtime-messages.md)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
      (p: string) => EXT + p.replace(/^\//, ''),
    );
    registerHistoryHandlers();
  });
  afterEach(() => vi.restoreAllMocks());

  it("history/list: 'ready' with readable entries after save + a write", async () => {
    const key = await configured();
    await historyStore.start(key, pending('a'), URL);
    const view = await list();
    expect(view).toMatchObject({ state: 'ready', enabled: true });
    expect(view.entries.map((e) => e.name)).toEqual([NAME]);
  });

  it("history/list locked: 'locked', no entry, no name or order number in the response; after unlock: ready", async () => {
    const key = await configured();
    await historyStore.start(key, pending('a'), URL);
    await configStore.lock();
    const res = await call({ type: 'history/list' });
    expect(res).toEqual({ ok: true, value: { state: 'locked', enabled: true, entries: [] } });
    expect(JSON.stringify(res)).not.toContain(NAME);
    expect(JSON.stringify(res)).not.toContain(ORDER);
    await configStore.unlock(PASS);
    expect((await list()).entries.map((e) => e.id)).toEqual(['a']);
  });

  it("history/list 'unavailable' without configuration and with a key migrated without passphrase", async () => {
    expect(await list()).toEqual({ state: 'unavailable', enabled: true, entries: [] });
    await fakeBrowser.storage.local.set({
      homeboxConfig: { baseUrl: URL, apiKey: 'hb_xxxxxxxx', lastCheck: null },
    });
    await configStore.migrateLegacy();
    expect(await list()).toEqual({ state: 'unavailable', enabled: true, entries: [] });
  });

  it('history/delete of an absent id: ok', async () => {
    expect(await call({ type: 'history/delete', id: 'nothing' })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('history/clear and history/set-enabled false work while locked, without the key', async () => {
    const key = await configured();
    await historyStore.start(key, pending('a'), URL);
    await historyStore.start(key, pending('b'), URL);
    await configStore.lock();
    expect(await call({ type: 'history/clear' })).toEqual({ ok: true, value: undefined });
    expect(await historyKeys()).toEqual([]);
    await configStore.unlock(PASS);
    await historyStore.start(key, pending('c'), URL);
    await configStore.lock();
    expect(await call({ type: 'history/set-enabled', enabled: false })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await historyKeys()).toEqual([]);
    expect((await list()).enabled).toBe(false);
  });

  it.each([
    ['history/list', {}],
    ['history/delete', { id: 'a' }],
    ['history/clear', {}],
    ['history/set-enabled', { enabled: false }],
  ])('a storage error in %s gives BAD_MESSAGE', async (type, extra) => {
    await configured();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('storage down'));
    vi.spyOn(fakeBrowser.storage.local, 'remove').mockRejectedValue(new Error('storage down'));
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('storage down'));
    expect(await call({ type, ...extra })).toEqual({ ok: false, error: 'BAD_MESSAGE' });
  });

  it('pendingStore.ids() returns the identifiers of the pendingImport:* of the session', async () => {
    await pendingStore.save(pending('a'));
    await pendingStore.save({ ...pending('b'), tabId: 12 });
    await fakeBrowser.storage.session.set({ other: 1 });
    expect(await pendingStore.ids()).toEqual(new Set(['a', 'b']));
  });

  it('no response carries the history key', async () => {
    const key = await configured();
    const b64 = bytesToBase64((await configStore.getHistoryKey())!);
    await historyStore.start(key, pending('a'), URL);
    const responses = [
      await call({ type: 'history/list' }),
      await call({ type: 'history/delete', id: 'a' }),
      await call({ type: 'history/clear' }),
      await call({ type: 'history/set-enabled', enabled: true }),
    ];
    expect(JSON.stringify(responses)).not.toContain(b64);
  });
});

describe('history/list: interrupted and resumable entries (012, US2)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    activeImports.clear();
    registerHistoryHandlers();
    registerImportHandlers();
  });
  afterEach(() => vi.restoreAllMocks());

  it('a running entry that is not active becomes partial/failed + interrupted', async () => {
    const key = await configured();
    await historyStore.start(key, pending('a', { entityId: 'e1' }), URL);
    await historyStore.start(key, pending('b'), URL);
    const byId = Object.fromEntries((await list()).entries.map((e) => [e.id, e]));
    expect(byId.a).toMatchObject({ status: 'partial', interrupted: true });
    expect(byId.b).toMatchObject({ status: 'failed', interrupted: true });
  });

  it('resumable: true while the pending exists and the status is partial or failed; false after abandon and for complete', async () => {
    const key = await configured();
    const partial = pending('a', {
      entityId: 'e1',
      status: 'partial',
      error: 'ATTACHMENT_FAILED',
      steps: { create: 'done', update: 'done', attachments: { 'detected-0': 'failed' }, photo: 'unavailable' },
    });
    await historyStore.start(key, partial, URL);
    await historyStore.update(key, partial);
    await pendingStore.save(partial);
    const failed = pending('b', { status: 'failed', error: 'CREATE_FAILED' });
    await historyStore.start(key, failed, URL);
    await historyStore.update(key, failed);
    const complete = pending('c', { entityId: 'e3', status: 'success', steps: { create: 'done', update: 'done', attachments: { 'detected-0': 'done' }, photo: 'unavailable' } });
    await historyStore.start(key, complete, URL);
    await historyStore.update(key, complete);
    await pendingStore.save(complete);

    let byId = Object.fromEntries((await list()).entries.map((e) => [e.id, e]));
    expect(byId.a?.resumable).toBe(true);
    expect(byId.b?.resumable).toBe(false); // no pending in the session
    expect(byId.c?.resumable).toBe(false); // complete

    await call({ type: 'import/abandon', pendingId: 'a' });
    byId = Object.fromEntries((await list()).entries.map((e) => [e.id, e]));
    expect(byId.a).toMatchObject({ status: 'partial', resumable: false });
  });
});

describe('history/*: controlling the data (012, US3, Q-U12, SC-004)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    registerHistoryHandlers();
  });
  afterEach(() => vi.restoreAllMocks());

  it('set-enabled false while locked erases everything; start/update write nothing; re-enabling restores nothing', async () => {
    const key = await configured();
    await historyStore.start(key, pending('a'), URL);
    await configStore.lock();
    expect(await call({ type: 'history/set-enabled', enabled: false })).toEqual({ ok: true, value: undefined });
    expect(await historyKeys()).toEqual([]);
    await historyStore.start(key, pending('b'), URL);
    await historyStore.update(key, pending('a', { status: 'success', entityId: 'e' }));
    expect(await historyKeys()).toEqual([]);
    await call({ type: 'history/set-enabled', enabled: true });
    await configStore.unlock(PASS);
    expect(await list()).toEqual({ state: 'ready', enabled: true, entries: [] });
  });

  it('entries left while disabled (interrupted disabling): history/list finishes the erasing, locked or not', async () => {
    const key = await configured();
    await historyStore.start(key, pending('a'), URL);
    await fakeBrowser.storage.local.set({ importHistorySettings: { v: 1, enabled: false } });
    await configStore.lock();
    expect(await list()).toEqual({ state: 'locked', enabled: false, entries: [] });
    expect(await historyKeys()).toEqual([]);

    await configStore.unlock(PASS);
    await fakeBrowser.storage.local.set({ importHistorySettings: { v: 1, enabled: true } });
    await historyStore.start(key, pending('b'), URL);
    await fakeBrowser.storage.local.set({ importHistorySettings: { v: 1, enabled: false } });
    expect(await list()).toEqual({ state: 'ready', enabled: false, entries: [] });
    expect(await historyKeys()).toEqual([]);
  });

  it('history/clear while locked: 0 importHistory:* key', async () => {
    const key = await configured();
    for (const id of ['a', 'b', 'c']) await historyStore.start(key, pending(id), URL);
    await configStore.lock();
    await call({ type: 'history/clear' });
    expect(await historyKeys()).toEqual([]);
  });

  it('a deleted entry does not come back after a resume', async () => {
    const key = await configured();
    await historyStore.start(key, pending('a'), URL);
    await call({ type: 'history/delete', id: 'a' });
    await historyStore.update(key, pending('a', { status: 'success', entityId: 'e' }));
    expect(await historyKeys()).toEqual([]);
  });
});
