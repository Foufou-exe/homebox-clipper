import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { activeImports, registerImportHandlers } from '@/background/import/handlers';
import { pendingStore } from '@/background/import/pending-store';
import { dispatch } from '@/background/router';
import { ok } from '@/shared/errors';
import type { PendingImport } from '@/shared/types';
import { draft } from './orchestrator-harness';

const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = (msg: unknown) => dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Mocked fetch whose POST /entities waits for `release()`; counts the POSTs. */
function blockedHomebox() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const posts: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    if (method === 'POST' && url.endsWith('/entities')) {
      posts.push(url);
      await gate;
      return reply(201, { id: 'e1', name: 'x' });
    }
    return reply(200, { id: 'e1', name: 'x' });
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

describe('import/start and import/retry handlers: active imports and concurrent resume', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(
      ok({ baseUrl: 'https://homebox.example.com', apiKey: 'hb_test_key_0000' }),
    );
    activeImports.clear();
    registerImportHandlers();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('import/start holds activeImports during the import, for each product of the batch, and releases it at the end', async () => {
    const hb = blockedHomebox();
    vi.stubGlobal('fetch', hb.fetchMock);
    const started = call({
      type: 'import/start',
      tabId: 5,
      manualFiles: [],
      drafts: [draft({ name: 'A', documents: [] }), draft({ name: 'B', documents: [] })],
    });
    await vi.waitFor(() => expect(hb.posts).toHaveLength(1));
    // Both imports of the batch are already active, and already persisted (the second has no POST yet).
    expect(activeImports.size).toBe(2);
    expect((await pendingStore.listByTab(5)).map((p) => p.status)).toEqual(['running', 'running']);
    hb.release();
    await started;
    expect(activeImports.size).toBe(0);
  });

  it('import/retry holds activeImports during the resume and releases it at the end', async () => {
    await pendingStore.save(failedPending());
    const hb = blockedHomebox();
    vi.stubGlobal('fetch', hb.fetchMock);
    const retry = call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] });
    await vi.waitFor(() => expect(hb.posts).toHaveLength(1));
    expect(activeImports.has('r1')).toBe(true);
    hb.release();
    await retry;
    expect(activeImports.has('r1')).toBe(false);
  });

  it("two simultaneous import/retry → a single POST /entities; the second returns the current state without removing the first's identifier", async () => {
    await pendingStore.save(failedPending());
    const hb = blockedHomebox();
    vi.stubGlobal('fetch', hb.fetchMock);
    const first = call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] });
    await vi.waitFor(() => expect(hb.posts).toHaveLength(1));
    const second = (await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] })) as {
      ok: boolean;
      value: PendingImport;
    };
    expect(second.ok).toBe(true);
    expect(second.value).toMatchObject({ id: 'r1', status: 'running' });
    expect(hb.posts).toHaveLength(1);
    // The second call did not remove the identifier: the import stays active and is not mistaken for an orphan.
    expect(activeImports.has('r1')).toBe(true);
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'r1', status: 'running' });
    expect(list[0]?.orphaned).toBeUndefined();
    hb.release();
    await first;
    expect(hb.posts).toHaveLength(1);
    expect(activeImports.has('r1')).toBe(false);
  });
  describe('emplacement (T083, R10)', () => {
    const ORIGIN = 'https://homebox.example.com';
    const GARAGE = { id: 'loc-g', path: ['Maison', 'Garage'] };
    const bodies: Record<string, unknown>[] = [];
    function homebox(createStatus = 201) {
      bodies.length = 0;
      return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        if ((init.method ?? 'GET') === 'POST' && url.endsWith('/entities')) {
          bodies.push(JSON.parse(String(init.body)));
          return createStatus === 201 ? reply(201, { id: 'e1', name: 'x' }) : reply(createStatus, {});
        }
        return reply(200, { id: 'e1', name: 'x' });
      });
    }
    const memory = async () => (await fakeBrowser.storage.local.get('lastLocationByInstance')).lastLocationByInstance;

    it('import/start: the choice is sent as parentId and orderLocationId is remembered for this instance', async () => {
      vi.stubGlobal('fetch', homebox());
      await call({
        type: 'import/start',
        tabId: 5,
        manualFiles: [],
        orderLocationId: 'loc-g',
        drafts: [draft({ documents: [], location: GARAGE })],
      });
      expect(bodies[0]).toMatchObject({ parentId: 'loc-g' });
      expect(await memory()).toEqual({ [ORIGIN]: 'loc-g' });
    });

    it('import/start without location: body without parentId, memory unchanged', async () => {
      vi.stubGlobal('fetch', homebox());
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { [ORIGIN]: 'ancien' } });
      await call({ type: 'import/start', tabId: 5, manualFiles: [], drafts: [draft({ documents: [] })] });
      expect(bodies[0]).not.toHaveProperty('parentId');
      expect(await memory()).toEqual({ [ORIGIN]: 'ancien' });
    });

    it('import/start whose creation fails: memory unchanged', async () => {
      vi.stubGlobal('fetch', homebox(500));
      await call({
        type: 'import/start',
        tabId: 5,
        manualFiles: [],
        orderLocationId: 'loc-g',
        drafts: [draft({ documents: [], location: GARAGE })],
      });
      expect(await memory()).toBeUndefined();
    });

    it('import/retry passes the new choice to the orchestrator', async () => {
      await pendingStore.save(failedPending());
      vi.stubGlobal('fetch', homebox());
      await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [], location: GARAGE });
      expect(bodies[0]).toMatchObject({ parentId: 'loc-g' });
    });

    it('import/retry with location while the object exists: BAD_MESSAGE, no request', async () => {
      await pendingStore.save({ ...failedPending(), entityId: 'e9', status: 'partial' });
      const fetchMock = homebox();
      vi.stubGlobal('fetch', fetchMock);
      expect(await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [], location: GARAGE })).toEqual({
        ok: false,
        error: 'BAD_MESSAGE',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
