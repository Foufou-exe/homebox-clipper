import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { registerHistoryHandlers } from '@/background/history/handlers';
import { activeImports, registerImportHandlers } from '@/background/import/handlers';
import { pendingStore } from '@/background/import/pending-store';
import { dispatch, setUiActivityHook } from '@/background/router';
import type { PendingImport } from '@/shared/types';
import { draft } from './orchestrator-harness';

/**
 * Spec 013, revue T070: an import in progress keeps the keys it captured, but once the inactivity deadline has
 * passed, every NEW read of the key is refused as locked; the effective lock applies when the import ends.
 * No activity hook here (absent or failing): the guarantee must come from the key access itself.
 */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const URL = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx';
const PASS = 'une phrase de passe solide';
const T0 = new Date('2026-11-18T10:00:00Z').getTime();
const MIN = 60_000;

const call = (msg: unknown) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
// ADAPTED (016): the id of the configured instance is kept to name the target of the messages.
let ID = '';
const save = async () => {
  await configStore.save({ baseUrl: URL, apiKey: KEY, passphrase: PASS }, 1_000);
  ID = (await configStore.getView()).defaultInstanceId ?? '';
};
const setPolicy = (policy: string) =>
  fakeBrowser.storage.local.set({ lockSettings: { v: 1, policy } });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Fake HomeBox whose POST /entities waits for `release()`. */
function blockedHomebox() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const posts: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if ((init.method ?? 'GET') === 'POST' && url.endsWith('/entities')) {
      posts.push(url);
      await gate;
      return reply(201, { id: 'e1', name: 'x' });
    }
    return reply(200, { id: 'e1', name: 'x', items: [] });
  });
  return { fetchMock, posts, release: () => release() };
}

const failedPending = (): PendingImport => ({
  id: 'r1',
  tabId: 5,
  pageUrl: null,
  draft: draft({ documents: [] }),
  entityId: null,
  steps: { create: 'failed', update: 'pending', attachments: {}, photo: 'unavailable' },
  photoError: null,
  photoAttempted: false,
  status: 'failed',
  error: 'CREATE_FAILED',
});

describe('automatic lock and imports (013, review T070)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    // ADAPTED (016): getCredentials now checks the origin permission (granted here, as after configuration).
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
      (p: string) => EXT + p.replace(/^\//, ''),
    );
    activeImports.clear();
    setUiActivityHook(null);
    registerImportHandlers();
    registerHistoryHandlers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setUiActivityHook(null);
    activeImports.clear();
  });

  it.each([
    ['absent', null],
    [
      'failing',
      () => {
        throw new Error('hook broken');
      },
    ],
  ])(
    'activity hook %s + deadline passed → import/retry refused as locked, no HomeBox call',
    async (_l, hook) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      setUiActivityHook(hook);
      await save();
      await setPolicy('idle-15m');
      await pendingStore.save(failedPending());
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      vi.setSystemTime(T0 + 20 * MIN);
      expect(await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] })).toEqual({
        ok: false,
        error: 'LOCKED',
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(activeImports.size).toBe(0);
      expect((await configStore.getView()).locked).toBe(true);
    },
  );

  it('import A running + deadline passed: import/start B and history/list refused as locked; A ends normally; locked after A', async () => {
    await save();
    await setPolicy('idle-15m');
    const hb = blockedHomebox();
    vi.stubGlobal('fetch', hb.fetchMock);
    const a = call({
      type: 'import/start',
      instanceId: ID, // ADAPTED (016)
      tabId: 5,
      manualFiles: [],
      drafts: [draft({ name: 'A', documents: [] })],
    });
    await vi.waitFor(() => expect(hb.posts).toHaveLength(1));
    expect(activeImports.size).toBe(1);

    vi.setSystemTime(T0 + 20 * MIN);
    const b = await call({
      type: 'import/start',
      instanceId: ID, // ADAPTED (016)
      tabId: 6,
      manualFiles: [],
      drafts: [draft({ name: 'B', documents: [] })],
    });
    expect(b).toEqual({ ok: false, error: 'LOCKED' });
    expect(hb.posts).toHaveLength(1);
    expect(await call({ type: 'history/list' })).toMatchObject({
      ok: true,
      value: { state: 'locked', entries: [] },
    });
    expect(await configStore.getCredentials(ID)).toEqual({ ok: false, error: 'LOCKED' }); // ADAPTED (016)
    expect(await configStore.getHistoryKey()).toBeNull();
    // The key is not erased yet: the running import keeps its captured keys.
    expect(await fakeBrowser.storage.session.get(null)).toHaveProperty('homeboxUnlocked');
    // An activity during the import does not postpone a due lock.
    await configStore.touch(T0 + 21 * MIN);
    expect((await configStore.getView()).locked).toBe(true);

    hb.release();
    const result = (await a) as { ok: boolean; value: PendingImport[] };
    expect(result.ok).toBe(true);
    expect(result.value[0]).toMatchObject({ entityId: 'e1', status: 'success' });
    expect(activeImports.size).toBe(0);
    const session = await fakeBrowser.storage.session.get(null);
    expect(session).not.toHaveProperty('homeboxUnlocked');
    expect(session).not.toHaveProperty('homeboxActivity');
    expect(session).not.toHaveProperty('homeboxLockDue');
  });

  it('unlocking again while a lock is due cancels it: the import end does not lock', async () => {
    await save();
    await setPolicy('idle-15m');
    activeImports.add('import-1');
    vi.setSystemTime(T0 + 20 * MIN);
    expect((await configStore.getView()).locked).toBe(true);
    expect(await configStore.unlock(PASS)).toEqual({ ok: true, value: undefined });
    expect((await configStore.getView()).locked).toBe(false);
    activeImports.clear();
    expect(await configStore.expireIfDue()).toBe(false);
    expect((await configStore.getView()).locked).toBe(false);
  });

  it('the orchestrator never reads the configuration store: a running import only uses the keys captured at its start', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/background/import/orchestrator.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/configStore|config-store|getCredentials|getHistoryKey/);
  });
});
