import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { activeImports, registerImportHandlers } from '@/background/import/handlers';
import { activeTargets } from '@/background/import/active-imports';
import { registerConfigHandlers } from '@/background/config/handlers';
import { importHistoryKey, open } from '@/background/history/history-crypto';
import { historyStore } from '@/background/history/history-store';
import { pendingStore } from '@/background/import/pending-store';
import { dispatch } from '@/background/router';
import { fail, ok } from '@/shared/errors';
import type { PendingImport } from '@/shared/types';
import { PDF_B64, draft } from './orchestrator-harness';
import { registerLocationHandlers } from '@/background/location/handlers';
import { registerTagHandlers } from '@/background/tags/handlers';
import { A, B, PASSPHRASE, buildStore, seedStore } from '../unit/instances-fixture';

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

// ADAPTED (016): an import persisted by the handler carries its target instance.
const failedPending = (): PendingImport => ({
  id: 'r1',
  instanceId: 'inst-a',
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
    // ADAPTED (016): the credentials carry the instance id.
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(
      ok({ id: 'inst-a', baseUrl: 'https://homebox.example.com', apiKey: 'hb_test_key_0000' }),
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
      instanceId: 'inst-a', // ADAPTED (016)
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
    // ADAPTED (016): the last location is indexed by instance id.
    const ORIGIN = 'inst-a';
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
      instanceId: 'inst-a', // ADAPTED (016)
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
      await call({ type: 'import/start', instanceId: 'inst-a', tabId: 5, manualFiles: [], drafts: [draft({ documents: [] })] }); // ADAPTED (016)
      expect(bodies[0]).not.toHaveProperty('parentId');
      expect(await memory()).toEqual({ [ORIGIN]: 'ancien' });
    });

    it('import/start whose creation fails: memory unchanged', async () => {
      vi.stubGlobal('fetch', homebox(500));
      await call({
        type: 'import/start',
      instanceId: 'inst-a', // ADAPTED (016)
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

describe('duplicate/check handler (015, Q-C2, FR-016)', () => {
  const ORIGIN = 'https://homebox.example.com';
  const KEY = 'hb_xxxxxxxx';
  // ADAPTED (016): duplicate/check names its target instance.
  const MSG = { type: 'duplicate/check', instanceId: 'inst-a', orderNumber: '999-0000000-0000001', name: 'Câble USB-C 2 m noir' };

  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(ok({ id: 'inst-a', baseUrl: ORIGIN, apiKey: KEY })); // ADAPTED (016)
    registerImportHandlers();
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['NOT_CONFIGURED', 'LOCKED'] as const)('%s: error returned without any request', async (code) => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail(code));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await call(MSG)).toEqual({ ok: false, error: code });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('success: every request goes to the instance with the key; the reply only holds id, name, url', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        calls.push({ url, auth: new Headers(init.headers).get('Authorization') });
        const q = new URL(url).searchParams.get('q');
        if (q === '"999-0000000-0000001"') return reply(200, { items: [{ id: 'd1', name: 'Câble USB-C 2 m noir' }] });
        if (q === 'noir') return reply(200, { items: [{ id: 's1', name: 'Cable usb c noir 2m' }, { id: 'x', name: 'Lampe de bureau' }] });
        return reply(200, { items: [] });
      }),
    );
    const res = await call(MSG);
    expect(res).toEqual({
      ok: true,
      value: {
        matches: [{ id: 'd1', name: 'Câble USB-C 2 m noir', url: `${ORIGIN}/item/d1` }],
        similar: [{ id: 's1', name: 'Cable usb c noir 2m', url: `${ORIGIN}/item/s1` }],
        moreSimilar: false,
        incomplete: false,
      },
    });
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c.url.startsWith(`${ORIGIN}/api/v1/entities?`)).toBe(true);
      expect(c.auth).toBe(`Bearer ${KEY}`);
    }
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain(KEY);
    expect(serialized).not.toContain('Lampe de bureau');
    expect(serialized).not.toContain('score');
    expect(serialized).not.toMatch(/"(noir|usb|cable)"/);
    expect(serialized).not.toContain(`"${ORIGIN}"`);
  });

  it('401 on every search → DUPLICATE_CHECK_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(401, {})));
    expect(await call(MSG)).toEqual({ ok: false, error: 'DUPLICATE_CHECK_FAILED' });
  });
});

describe('handlers target one instance only (016, SC-005, FR-016, FR-018, Q-C2, T014)', () => {
  const sendCalls: unknown[] = [];
  interface Seen {
    url: string;
    method: string;
    auth: string | null;
  }
  const LOC_A = 'loc-a';

  /** Mocked HomeBox: records every URL and Authorization header. `mode` simulates a failing instance. */
  function homebox(mode: 'ok' | '500' | 'network' | 'create-500' = 'ok') {
    const seen: Seen[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        const method = init.method ?? 'GET';
        seen.push({ url, method, auth: new Headers(init.headers).get('Authorization') });
        if (mode === 'network') throw new TypeError('Failed to fetch');
        if (mode === '500') return reply(500, {});
        if (url.includes('/entities/tree')) return reply(200, [{ id: LOC_A, name: 'Garage', type: 'location', children: [] }]);
        if (url.endsWith('/tags')) return reply(200, [{ id: 't1', name: 'Amazon' }]);
        if (url.includes('/entities?')) return reply(200, { items: [] });
        if (method === 'POST' && url.endsWith('/entities')) {
          return mode === 'create-500' ? reply(500, {}) : reply(201, { id: 'e1', name: 'x' });
        }
        return reply(200, { id: 'e1', name: 'x' });
      }),
    );
    return seen;
  }

  const start = (instanceId: string, extra: Record<string, unknown> = {}) =>
    call({ type: 'import/start', instanceId, tabId: 5, manualFiles: [], drafts: [draft({ documents: [] })], ...extra });

  beforeEach(async () => {
    fakeBrowser.reset();
    sendCalls.length = 0;
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation((async (m: unknown) => {
      sendCalls.push(m);
    }) as never);
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
    activeImports.clear();
    registerImportHandlers();
    registerLocationHandlers();
    registerTagHandlers();
    await seedStore(await buildStore({ instances: [A, B], historyKey: crypto.getRandomValues(new Uint8Array(32)) }));
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
  });
  afterEach(() => vi.unstubAllGlobals());

  const onlyB = (seen: Seen[]) => {
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      expect(s.url.startsWith(`${B.baseUrl}/`), s.url).toBe(true);
      expect(s.auth).toBe(`Bearer ${B.apiKey}`);
    }
    expect(JSON.stringify(seen)).not.toContain('homebox.example.com');
    expect(JSON.stringify(seen)).not.toContain(A.apiKey);
  };

  it.each(['ok', '500', 'network'] as const)('B (%s): location/list, tag/list, duplicate/check, import/start → 0 URL of A', async (mode) => {
    const seen = homebox(mode);
    await call({ type: 'location/list', instanceId: B.id });
    await call({ type: 'tag/list', instanceId: B.id });
    await call({ type: 'duplicate/check', instanceId: B.id, orderNumber: '999-0000000-0000001', name: 'Câble USB-C 2 m noir' });
    await start(B.id);
    onlyB(seen);
  });

  it('import/start to an unknown id → INSTANCE_NOT_FOUND, 0 request, nothing persisted (FR-020)', async () => {
    const seen = homebox();
    expect(await start('supprimee')).toEqual({ ok: false, error: 'INSTANCE_NOT_FOUND' });
    expect(seen).toEqual([]);
    expect(await pendingStore.listByTab(5)).toEqual([]);
  });

  it('the handler sets PendingImport.instanceId (store, notify and reply); lastInstanceId, last location and history follow', async () => {
    homebox();
    const save = vi.spyOn(pendingStore, 'save');
    const res = (await start(B.id, { orderLocationId: LOC_A, drafts: [draft({ documents: [], location: { id: LOC_A, path: ['Garage'] } })] })) as {
      ok: boolean;
      value: PendingImport[];
    };
    expect(res.ok).toBe(true);
    expect(res.value[0]).toMatchObject({ status: 'success', instanceId: B.id });
    // Every persisted state carries the target (the success itself is purged from the session at the end).
    expect(save.mock.calls.length).toBeGreaterThan(0);
    expect(save.mock.calls.every(([p]) => p.instanceId === B.id)).toBe(true);
    const progress = sendCalls.filter((m) => (m as { type: string }).type === 'import/progress') as { pending: PendingImport }[];
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((m) => m.pending.instanceId === B.id)).toBe(true);
    const local = await fakeBrowser.storage.local.get(null);
    expect(local.lastInstanceId).toBe(B.id);
    expect(local.lastLocationByInstance).toEqual({ [B.id]: LOC_A });
    const envelopes = Object.entries(local).filter(([k]) => k.startsWith('importHistory:'));
    expect(envelopes).toHaveLength(1);
    expect((envelopes[0]![1] as { inst?: string }).inst).toBe(B.id);
    expect((await configStore.getView()).defaultInstanceId).toBe(B.id);
  });

  it('lastInstanceId is not written after a failed import', async () => {
    homebox('create-500');
    const res = (await start(B.id)) as { ok: boolean; value: PendingImport[] };
    expect(res.value[0]?.status).toBe('failed');
    expect((await fakeBrowser.storage.local.get('lastInstanceId')).lastInstanceId).toBeUndefined();
  });

  it('import/retry targets pending.instanceId, never another instance (FR-018, SC-006)', async () => {
    await fakeBrowser.storage.local.set({ lastInstanceId: B.id });
    await pendingStore.save({ ...failedPending(), instanceId: A.id });
    const seen = homebox();
    const res = (await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] })) as { ok: boolean; value: PendingImport };
    expect(res).toMatchObject({ ok: true, value: { status: 'success', instanceId: A.id } });
    for (const s of seen) {
      expect(s.url.startsWith(`${A.baseUrl}/`)).toBe(true);
      expect(s.auth).toBe(`Bearer ${A.apiKey}`);
    }
    expect((await fakeBrowser.storage.local.get('lastInstanceId')).lastInstanceId).toBe(A.id);
  });

  it('import/retry of a pending import without instanceId: refused with two instances (no guess)', async () => {
    const legacy: Partial<PendingImport> = failedPending();
    delete legacy.instanceId;
    await pendingStore.save(legacy as PendingImport);
    const seen = homebox();
    expect(await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] })).toEqual({ ok: false, error: 'INSTANCE_NOT_FOUND' });
    expect(seen).toEqual([]);
  });

  it('import/retry of a pending import without instanceId: attached to the single instance', async () => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
    await seedStore(await buildStore({ instances: [B] }));
    await configStore.unlock(PASSPHRASE);
    const legacy: Partial<PendingImport> = failedPending();
    delete legacy.instanceId;
    await pendingStore.save(legacy as PendingImport);
    const seen = homebox();
    expect(await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] })).toMatchObject({ ok: true, value: { instanceId: B.id } });
    onlyB(seen);
  });

  it('the orchestrator alone (as in the harness) does not set instanceId: only the handler does', async () => {
    const { createOrchestrator } = await import('@/background/import/orchestrator');
    const { createHomeBoxClient } = await import('@/background/homebox/client');
    homebox();
    const saved: PendingImport[] = [];
    const o = createOrchestrator({
      client: createHomeBoxClient({ baseUrl: B.baseUrl, apiKey: B.apiKey }),
      store: { save: async (p) => void saved.push(p), get: async () => null, purge: async () => undefined },
      downloadDetected: async () => fail('DOWNLOAD_REFUSED'),
      fetchPhoto: async () => fail('PHOTO_UNAVAILABLE'),
      notify: () => undefined,
      newId: () => 'n1',
    });
    await o.startImport(5, [draft({ documents: [] })], []);
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.every((p) => p.instanceId === undefined)).toBe(true);
  });

  it('no log contains an address, a name, an instance id, a key or the passphrase (FR-030)', async () => {
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));
    homebox('500');
    await call({ type: 'location/list', instanceId: B.id });
    await call({ type: 'tag/list', instanceId: B.id });
    await start(B.id);
    await start('supprimee');
    homebox('network');
    await start(B.id);
    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const v of ['example.org', 'example.com', 'Atelier', 'Maison', B.id, A.id, 'hb_', PASSPHRASE]) {
      expect(output).not.toContain(v);
    }
  });
});

describe('the target chosen in the summary, with two real instances (016, US3, SC-005, FR-012, FR-015, T070)', () => {
  interface Seen {
    url: string;
    method: string;
    auth: string | null;
  }
  const NAME = 'Clavier sans fil Exemple Pro';

  /** A has an identical object (same name and order number); B has none. Every request is recorded. */
  function homebox(createStatus = 201) {
    const seen: Seen[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        const method = init.method ?? 'GET';
        seen.push({ url, method, auth: new Headers(init.headers).get('Authorization') });
        const inA = url.startsWith(`${A.baseUrl}/`);
        if (url.includes('/entities/tree')) return reply(200, [{ id: inA ? 'la' : 'lb', name: 'Garage', type: 'location', children: [] }]);
        if (url.endsWith('/tags')) return reply(200, [{ id: inA ? 'ta' : 'tb', name: 'Amazon' }]);
        if (url.includes('/entities?')) {
          return reply(200, { items: inA ? [{ id: 'dup-a', name: NAME, notes: '', description: 'Commande 999-0000000-0000001' }] : [] });
        }
        if (method === 'POST' && url.endsWith('/entities')) return reply(createStatus, { id: 'e1', name: NAME });
        if (url.includes('/attachments')) return reply(201, { id: 'att' });
        return reply(200, { id: 'e1', name: NAME, tags: [{ id: inA ? 'ta' : 'tb', name: 'Amazon' }] });
      }),
    );
    return seen;
  }

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation((async () => undefined) as never);
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
    activeImports.clear();
    registerImportHandlers();
    await seedStore(await buildStore({ instances: [A, B], historyKey: crypto.getRandomValues(new Uint8Array(32)) }));
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaultInstanceId = lastInstanceId when it names an existing instance, otherwise the first one (FR-012)', async () => {
    expect((await configStore.getView()).defaultInstanceId).toBe(A.id);
    await fakeBrowser.storage.local.set({ lastInstanceId: B.id });
    expect((await configStore.getView()).defaultInstanceId).toBe(B.id);
    await fakeBrowser.storage.local.set({ lastInstanceId: 'supprimee' });
    expect((await configStore.getView()).defaultInstanceId).toBe(A.id);
  });

  it('import/start to B: creation, attachment and tags go to B only, with B’s key (the search is the duplicate check below)', async () => {
    const seen = homebox();
    const doc = { id: 'manual-1', origin: 'manual' as const, kind: 'invoice' as const, label: 'facture.pdf', size: 20 };
    const res = (await call({
      type: 'import/start',
      instanceId: B.id,
      tabId: 5,
      manualFiles: [{ docId: 'manual-1', filename: 'facture.pdf', base64: PDF_B64 }],
      orderLocationId: 'lb',
      drafts: [draft({ documents: [doc], location: { id: 'lb', path: ['Garage'] }, tags: [{ name: 'Amazon' }] })],
    })) as { ok: boolean; value: PendingImport[] };
    expect(res.value[0]?.entityId).toBe('e1');
    expect(seen.some((s) => s.method === 'POST' && s.url.endsWith('/entities'))).toBe(true);
    expect(seen.some((s) => s.url.includes('/attachments'))).toBe(true);
    expect(seen.some((s) => s.url.endsWith('/tags'))).toBe(true);
    for (const s of seen) {
      expect(s.url.startsWith(`${B.baseUrl}/`), s.url).toBe(true);
      expect(s.auth).toBe(`Bearer ${B.apiKey}`);
    }
  });

  it('a successful import to B: lastLocationByInstance[B] written, never [A]; lastInstanceId = B', async () => {
    homebox();
    const res = (await call({
      type: 'import/start',
      instanceId: B.id,
      tabId: 5,
      manualFiles: [],
      orderLocationId: 'lb',
      drafts: [draft({ documents: [], location: { id: 'lb', path: ['Garage'] } })],
    })) as { ok: boolean; value: PendingImport[] };
    expect(res.value[0]?.status).toBe('success');
    const local = await fakeBrowser.storage.local.get(null);
    expect(local.lastLocationByInstance).toEqual({ [B.id]: 'lb' });
    expect(local.lastInstanceId).toBe(B.id);
  });

  it('duplicates: an identical object present in A is not reported when the target is B', async () => {
    const seen = homebox();
    const dupA = (await call({ type: 'duplicate/check', instanceId: A.id, orderNumber: '999-0000000-0000001', name: NAME })) as {
      ok: true;
      value: { matches: unknown[] };
    };
    const dupB = (await call({ type: 'duplicate/check', instanceId: B.id, orderNumber: '999-0000000-0000001', name: NAME })) as {
      ok: true;
      value: { matches: unknown[]; similar: unknown[] };
    };
    expect(dupA.value.matches.length).toBeGreaterThan(0);
    expect(dupB.value.matches).toEqual([]);
    expect(dupB.value.similar).toEqual([]);
    const toB = seen.filter((s) => s.auth === `Bearer ${B.apiKey}`);
    expect(toB.every((s) => s.url.startsWith(`${B.baseUrl}/`))).toBe(true);
  });

  it('lastInstanceId unchanged after a partial import to B', async () => {
    await fakeBrowser.storage.local.set({ lastInstanceId: A.id });
    homebox();
    vi.mocked(fetch).mockImplementation((async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.includes('/entities?')) return reply(200, { items: [] });
      if ((init.method ?? 'GET') === 'POST' && url.endsWith('/entities')) return reply(201, { id: 'e1', name: NAME });
      if (url.includes('/attachments')) return reply(500, {});
      return reply(200, { id: 'e1', name: NAME });
    }) as never);
    const doc = { id: 'manual-1', origin: 'manual' as const, kind: 'invoice' as const, label: 'facture.pdf', size: 20 };
    const res = (await call({
      type: 'import/start',
      instanceId: B.id,
      tabId: 5,
      manualFiles: [{ docId: 'manual-1', filename: 'facture.pdf', base64: PDF_B64 }],
      drafts: [draft({ documents: [doc] })],
    })) as { ok: boolean; value: PendingImport[] };
    expect(res.value[0]?.status).toBe('partial');
    expect((await fakeBrowser.storage.local.get('lastInstanceId')).lastInstanceId).toBe(A.id);
  });
});

describe('active imports per instance and pending removal by instance (016, US4, Q-C2, T080)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(configStore, 'getCredentials').mockImplementation(async (id: string) =>
      ok({ id, baseUrl: 'https://homebox.example.com', apiKey: 'hb_test_key_0000' }),
    );
    activeImports.clear();
    activeTargets.clear();
    registerImportHandlers();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('import/start: activeTargets[instance] is incremented during the import and released at the end; activeImports unchanged', async () => {
    const hb = blockedHomebox();
    vi.stubGlobal('fetch', hb.fetchMock);
    const started = call({ type: 'import/start', instanceId: 'inst-b', tabId: 5, manualFiles: [], drafts: [draft({ documents: [] })] });
    await vi.waitFor(() => expect(hb.posts).toHaveLength(1));
    expect(activeTargets.get('inst-b')).toBe(1);
    expect(activeTargets.get('inst-a')).toBeUndefined();
    expect(activeImports.size).toBe(1);
    hb.release();
    await started;
    expect(activeTargets.get('inst-b') ?? 0).toBe(0);
    expect(activeImports.size).toBe(0);
  });

  it('import/retry: the instance of the pending import is active during the resume, released even on a refusal', async () => {
    await pendingStore.save(failedPending());
    const hb = blockedHomebox();
    vi.stubGlobal('fetch', hb.fetchMock);
    const retry = call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] });
    await vi.waitFor(() => expect(hb.posts).toHaveLength(1));
    expect(activeTargets.get('inst-a')).toBe(1);
    hb.release();
    await retry;
    expect(activeTargets.get('inst-a') ?? 0).toBe(0);
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail('LOCKED'));
    await pendingStore.save(failedPending());
    expect(await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] })).toEqual({ ok: false, error: 'LOCKED' });
    expect(activeTargets.get('inst-a') ?? 0).toBe(0);
  });

  // ADAPTED (016, review T107/T108): imports without instanceId are erased too (unattributable once an instance is deleted).
  it('pendingStore.removeByInstance(id) removes the pendingImport:* of this instance and those without instanceId', async () => {
    await pendingStore.save({ ...failedPending(), id: 'a1', instanceId: 'inst-a' });
    await pendingStore.save({ ...failedPending(), id: 'b1', instanceId: 'inst-b' });
    await pendingStore.save({ ...failedPending(), id: 'b2', tabId: 9, instanceId: 'inst-b' });
    const legacy: Partial<PendingImport> = { ...failedPending(), id: 'n1' };
    delete legacy.instanceId;
    await pendingStore.save(legacy as PendingImport);
    await pendingStore.removeByInstance('inst-b');
    expect([...(await pendingStore.ids())].sort()).toEqual(['a1']);
  });
});

describe('a resume always targets the instance of origin (016, US6, SC-006, FR-018, Q-C2, T095)', () => {
  interface Seen {
    url: string;
    method: string;
    auth: string | null;
  }
  function homebox(mode: 'ok' | 'network' = 'ok') {
    const seen: Seen[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        const method = init.method ?? 'GET';
        seen.push({ url, method, auth: new Headers(init.headers).get('Authorization') });
        if (mode === 'network') throw new TypeError('Failed to fetch');
        if (url.includes('/entities?')) return reply(200, { items: [] });
        if (method === 'POST' && url.endsWith('/entities')) return reply(201, { id: 'e1', name: 'x' });
        return reply(200, { id: 'e1', name: 'x' });
      }),
    );
    return seen;
  }
  const onlyA = (seen: Seen[]) => {
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      expect(s.url.startsWith(`${A.baseUrl}/`), s.url).toBe(true);
      expect(s.auth).toBe(`Bearer ${A.apiKey}`);
    }
    expect(JSON.stringify(seen)).not.toContain('inventaire.example.org');
    expect(JSON.stringify(seen)).not.toContain(B.apiKey);
  };

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation((async () => undefined) as never);
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
    vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(true as never);
    activeImports.clear();
    activeTargets.clear();
    registerImportHandlers();
    registerConfigHandlers();
    await seedStore(await buildStore({ instances: [A, B], historyKey: crypto.getRandomValues(new Uint8Array(32)) }));
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    // B is the proposed instance (last successful import) when the resume of A is asked.
    await fakeBrowser.storage.local.set({ lastInstanceId: B.id });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('(a) B proposed by default: the resume of an import started to A only contacts A, with A’s key (US6-1)', async () => {
    expect((await configStore.getView()).defaultInstanceId).toBe(B.id);
    await pendingStore.save({ ...failedPending(), instanceId: A.id });
    const seen = homebox();
    expect(await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] })).toMatchObject({ ok: true, value: { instanceId: A.id } });
    onlyA(seen);
  });

  it('(b) a location chosen at the resume is used with the instance of the import', async () => {
    await pendingStore.save({ ...failedPending(), instanceId: A.id, error: 'LOCATION_NOT_FOUND' });
    const seen = homebox();
    const res = await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [], location: { id: 'loc-a2', path: ['Cave'] } });
    expect(res).toMatchObject({ ok: true, value: { instanceId: A.id } });
    const post = seen.find((s) => s.method === 'POST' && s.url.endsWith('/entities'))!;
    expect(post.url).toBe(`${A.baseUrl}/api/v1/entities`);
    onlyA(seen);
    expect((await fakeBrowser.storage.local.get('lastLocationByInstance')).lastLocationByInstance ?? {}).not.toHaveProperty(B.id);
  });

  it('(c) A deleted: its pending import is erased with it, import/retry → BAD_MESSAGE, 0 request (US6-2)', async () => {
    await pendingStore.save({ ...failedPending(), instanceId: A.id });
    const seen = homebox();
    expect(await call({ type: 'instance/delete', instanceId: A.id })).toMatchObject({ ok: true });
    expect(await pendingStore.get('r1')).toBeNull();
    expect(await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] })).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(seen).toEqual([]);
  });

  it('(d) A unreachable at the resume: the usual error, no request to B (US6-3)', async () => {
    await pendingStore.save({ ...failedPending(), instanceId: A.id });
    const seen = homebox('network');
    const res = (await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [] })) as { ok: boolean; value?: PendingImport };
    expect(res.value?.status ?? 'failed').not.toBe('success');
    onlyA(seen);
  });

  it('(e) an instanceId or a baseUrl slipped into import/retry is ignored: the target stays the one of the import', async () => {
    await pendingStore.save({ ...failedPending(), instanceId: A.id });
    const seen = homebox();
    await call({ type: 'import/retry', pendingId: 'r1', manualFiles: [], instanceId: B.id, baseUrl: B.baseUrl });
    onlyA(seen);
  });

  it('(f) import/abandon works locked and without network', async () => {
    await pendingStore.save({ ...failedPending(), instanceId: A.id });
    await configStore.lock();
    const seen = homebox('network');
    expect(await call({ type: 'import/abandon', pendingId: 'r1' })).toEqual({ ok: true, value: undefined });
    expect(await pendingStore.get('r1')).toBeNull();
    expect(seen).toEqual([]);
  });

  it('(g) recoverOrphan keeps instanceId; the reconciliation writes into the history entry of this instance', async () => {
    const key = await importHistoryKey((await configStore.getHistoryKey())!);
    const orphan: PendingImport = { ...failedPending(), id: 'o1', instanceId: A.id, status: 'running', entityId: 'e9', error: null };
    await historyStore.forKey(key, A.id).start(orphan, A.baseUrl);
    await pendingStore.save(orphan);
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list).toEqual([expect.objectContaining({ id: 'o1', status: 'partial', orphaned: true, instanceId: A.id })]);
    const env = (await fakeBrowser.storage.local.get('importHistory:o1'))['importHistory:o1'] as { inst?: string };
    expect(env.inst).toBe(A.id);
    const entry = await open(env, key, 'o1');
    expect(entry).toMatchObject({ status: 'partial', interrupted: true, instance: A.baseUrl });
  });
});
