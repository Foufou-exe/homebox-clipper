import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { activeImports, registerImportHandlers } from '@/background/import/handlers';
import { dispatch } from '@/background/router';
import { ok } from '@/shared/errors';
import { draft } from './orchestrator-harness';

/**
 * Spec 024 (FR-005, FR-010, SC-002): with a chosen collection, every request of an import, of the duplicate check and
 * of the completion preview carries X-Tenant; a 403 stops the creation with COLLECTION_UNAVAILABLE, never retried
 * without the header. Without a chosen collection, no request carries it. Fictitious values only.
 */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = (msg: unknown) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const TENANT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const ATELIER = { id: TENANT, name: 'Atelier' };
const CREDS = { id: 'inst-a', baseUrl: 'https://homebox.example.com', apiKey: 'hb_xxxxxxxx' };
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Seen = { method: string; url: string; tenant: string | null };
function stub(
  respond: (method: string, url: string) => Response = () =>
    reply(200, { id: 'e1', name: 'x', items: [] }),
) {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? 'GET';
      seen.push({ method, url, tenant: new Headers(init.headers).get('X-Tenant') });
      if (method === 'POST' && url.endsWith('/entities')) return respond(method, url);
      return reply(200, { id: 'e1', name: 'Clavier sans fil Exemple Pro', items: [] });
    }),
  );
  return seen;
}
const start = () =>
  call({
    type: 'import/start',
    instanceId: 'inst-a',
    tabId: 5,
    manualFiles: [],
    drafts: [draft({ name: 'Clavier sans fil Exemple Pro', documents: [] })],
  });

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
    (p: string) => EXT + p.replace(/^\//, ''),
  );
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  activeImports.clear();
  registerImportHandlers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('import with a chosen collection (SC-002)', () => {
  beforeEach(() => {
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(
      ok({ ...CREDS, tenant: TENANT, collection: ATELIER }),
    );
  });

  it('import/start: every request (creation, read, update) carries X-Tenant', async () => {
    const seen = stub();
    const res = (await start()) as { ok: boolean; value: Array<Record<string, unknown>> };
    expect(res.ok).toBe(true);
    // M2: the collection is kept with the import (result line, resumes).
    expect(res.value[0]?.collection).toEqual(ATELIER);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.some((s) => s.method === 'POST' && s.url.endsWith('/api/v1/entities'))).toBe(true);
    expect(seen.map((s) => s.tenant)).toEqual(seen.map(() => TENANT));
  });

  it('import/start: 403 on the creation → COLLECTION_UNAVAILABLE, no other POST, never without the header', async () => {
    const seen = stub(() =>
      reply(403, { error: 'user does not have access to the requested tenant' }),
    );
    const res = (await start()) as {
      ok: boolean;
      value: Array<{ status: string; error: string; entityId: string | null }>;
    };
    expect(res.ok).toBe(true);
    expect(res.value[0]).toMatchObject({
      status: 'failed',
      error: 'COLLECTION_UNAVAILABLE',
      entityId: null,
    });
    expect(seen.filter((s) => s.method === 'POST')).toHaveLength(1);
    expect(seen.every((s) => s.tenant === TENANT)).toBe(true);
  });

  it('duplicate/check and import/complete-preview carry X-Tenant', async () => {
    const seen = stub();
    await call({
      type: 'duplicate/check',
      instanceId: 'inst-a',
      orderNumber: '000-0000000-0000000',
      name: 'Clavier',
    });
    await call({
      type: 'import/complete-preview',
      instanceId: 'inst-a',
      entityId: 'e1',
      draft: draft({ documents: [] }),
    });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.every((s) => s.tenant === TENANT)).toBe(true);
  });
});

describe('import without a chosen collection (FR-002)', () => {
  it('no request carries X-Tenant', async () => {
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(ok(CREDS));
    const seen = stub();
    await start();
    await call({
      type: 'duplicate/check',
      instanceId: 'inst-a',
      orderNumber: '000-0000000-0000000',
      name: 'Clavier',
    });
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.every((s) => s.tenant === null)).toBe(true);
  });
});

describe('resume keeps the collection of the import (M2)', () => {
  /** A failed creation whose answer was lost: the resume first searches the name (uncertain creation). */
  const uncertain = async (collection?: { id: string; name: string }) => {
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(
      ok(collection ? { ...CREDS, tenant: collection.id, collection } : CREDS),
    );
    stub(() => {
      throw new TypeError('Failed to fetch');
    });
    const res = (await start()) as {
      value: Array<{ id: string; createUncertain?: boolean; collection?: unknown }>;
    };
    return res.value[0]!;
  };
  const retry = (pendingId: string) => call({ type: 'import/retry', pendingId, manualFiles: [] });

  it('started in Atelier, setting changed to another collection: the search and the creation go to Atelier', async () => {
    const p = await uncertain(ATELIER);
    expect(p.createUncertain).toBe(true);
    expect(p.collection).toEqual(ATELIER);
    vi.mocked(configStore.getCredentials).mockResolvedValue(
      ok({ ...CREDS, tenant: OTHER, collection: { id: OTHER, name: 'Grenier' } }),
    );
    const seen = stub();
    const res = (await retry(p.id)) as { ok: boolean; value: { collection?: unknown } };
    expect(res.ok).toBe(true);
    expect(res.value.collection).toEqual(ATELIER);
    expect(seen.some((s) => s.method === 'GET' && s.url.includes('/entities?'))).toBe(true);
    expect(seen.every((s) => s.tenant === TENANT)).toBe(true);
  });

  it('started in the default collection, setting changed since: the resume sends no X-Tenant', async () => {
    const p = await uncertain();
    expect(p).not.toHaveProperty('collection');
    vi.mocked(configStore.getCredentials).mockResolvedValue(
      ok({ ...CREDS, tenant: OTHER, collection: { id: OTHER, name: 'Grenier' } }),
    );
    const seen = stub();
    await retry(p.id);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.tenant === null)).toBe(true);
  });

  it('current setting unreadable (COLLECTION_UNAVAILABLE): the resume still runs, in the collection of the import', async () => {
    const p = await uncertain(ATELIER);
    vi.mocked(configStore.getCredentials).mockResolvedValue({
      ok: false,
      error: 'COLLECTION_UNAVAILABLE',
    });
    vi.spyOn(configStore, 'getKeyCredentials').mockResolvedValue(ok(CREDS));
    const seen = stub();
    const res = (await retry(p.id)) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect(seen.every((s) => s.tenant === TENANT)).toBe(true);
  });

  it('a new import with an unreadable setting is refused before any request (M3)', async () => {
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue({
      ok: false,
      error: 'COLLECTION_UNAVAILABLE',
    });
    const seen = stub();
    expect(await start()).toEqual({ ok: false, error: 'COLLECTION_UNAVAILABLE' });
    expect(seen).toEqual([]);
  });
});

describe('duplicates with a lost collection (I1)', () => {
  it('duplicate/check: every search refused with 403 → COLLECTION_UNAVAILABLE, not DUPLICATE_CHECK_FAILED', async () => {
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(
      ok({ ...CREDS, tenant: TENANT, collection: ATELIER }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(403, {})),
    );
    expect(
      await call({
        type: 'duplicate/check',
        instanceId: 'inst-a',
        orderNumber: '000-0000000-0000000',
        name: 'Clavier',
      }),
    ).toEqual({ ok: false, error: 'COLLECTION_UNAVAILABLE' });
  });
});
