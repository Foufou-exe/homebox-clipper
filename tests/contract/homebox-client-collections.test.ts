import { createHomeBoxClient } from '@/background/homebox/client';
import { html, json, mockFetch, networkError } from './fetch-mock';

/**
 * HomeBox client and the target collection (spec 024, contracts/homebox-collections.md): `X-Tenant` on every
 * authenticated request when a collection is chosen, never otherwise; discovery reads without it; 403 with the
 * header is COLLECTION_UNAVAILABLE. Fictitious values only.
 */
const BASE = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx';
const TENANT = '22222222-2222-4222-8222-222222222222';
const ID_A = '11111111-1111-4111-8111-111111111111';
const client = (f: typeof fetch, tenant?: string) =>
  createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: f, ...(tenant ? { tenant } : {}) });

function spyLogs() {
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  return {
    text: () => JSON.stringify([...debug.mock.calls, ...warn.mock.calls]),
    metas: () =>
      [...debug.mock.calls, ...warn.mock.calls].map((c) => c[1] as Record<string, unknown>),
  };
}

afterEach(() => vi.restoreAllMocks());

const ENTITY = { id: 'e1', name: 'Clavier sans fil Exemple Pro' };

/** One call of each authenticated method, in order, with an answer that makes it succeed. */
async function everyAuthenticatedCall(c: ReturnType<typeof client>) {
  await c.checkAuth();
  await c.createEntity({ name: 'Clavier sans fil Exemple Pro', quantity: 1 });
  await c.listLocations();
  await c.listTags();
  await c.createTag('Amazon');
  await c.getEntity('e1');
  await c.updateEntity('e1', { id: 'e1', name: 'Clavier sans fil Exemple Pro' } as never);
  await c.searchEntities('000-0000000-0000000');
  await c.searchEntitiesByField('Order number', '000-0000000-0000000');
  await c.listTemplates();
  await c.listFieldNames();
  await c.getTemplate('tpl-1');
  await c.createFromTemplate('tpl-1', {
    name: 'Clavier sans fil Exemple Pro',
    quantity: 1,
    parentId: 'loc-1',
  });
  await c.addAttachment('e1', {
    bytes: new Uint8Array([37, 80, 68, 70]),
    mimeType: 'application/pdf',
    filename: 'facture.pdf',
    type: 'receipt',
  } as never);
}
const answers = () => [
  json(200, { item: { id: 'u1' } }),
  json(201, ENTITY),
  json(200, []),
  json(200, []),
  json(201, { id: 't1', name: 'Amazon' }),
  json(200, ENTITY),
  json(200, ENTITY),
  json(200, { items: [] }),
  json(200, { items: [] }),
  json(200, []),
  json(200, []),
  json(200, { id: 'tpl-1', name: 'Livre' }),
  json(201, ENTITY),
  json(201, {}),
];

describe('X-Tenant (FR-002, FR-005)', () => {
  it('no collection chosen: no X-Tenant on any request (behaviour of before)', async () => {
    const m = mockFetch(json(200, { health: true, build: { version: 'v0.27.1' } }), ...answers());
    const c = client(m.fetch);
    await c.getStatus();
    await everyAuthenticatedCall(c);
    expect(m.calls).toHaveLength(15);
    for (const call of m.calls) expect(call.headers.has('X-Tenant')).toBe(false);
  });

  it('collection chosen: X-Tenant on every authenticated request, never on the public /status', async () => {
    const m = mockFetch(json(200, { health: true, build: { version: 'v0.27.1' } }), ...answers());
    const c = client(m.fetch, TENANT);
    await c.getStatus();
    await everyAuthenticatedCall(c);
    expect(m.calls).toHaveLength(15);
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/status`);
    expect(m.calls[0]?.headers.has('X-Tenant')).toBe(false);
    for (const call of m.calls.slice(1)) {
      expect(call.url.startsWith(`${BASE}/api/v1/`)).toBe(true);
      expect(call.headers.get('X-Tenant')).toBe(TENANT);
      expect(call.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
      // Never in the URL (history, proxy logs).
      expect(call.url).not.toContain('tenant');
      expect(call.url).not.toContain(TENANT);
    }
  });

  it('403 with the header → COLLECTION_UNAVAILABLE (never retried without it); 401 stays UNAUTHORIZED', async () => {
    const m = mockFetch(
      json(403, { error: 'user does not have access to the requested tenant' }),
      json(401, {}),
    );
    const c = client(m.fetch, TENANT);
    expect(await c.listLocations()).toEqual({
      ok: false,
      error: 'COLLECTION_UNAVAILABLE',
      httpStatus: 403,
    });
    expect(await c.checkAuth()).toEqual({ ok: false, error: 'UNAUTHORIZED', httpStatus: 401 });
    expect(m.calls).toHaveLength(2);
  });

  it('403 without the header stays UNAUTHORIZED (unchanged)', async () => {
    const m = mockFetch(json(403, {}));
    expect(await client(m.fetch).createEntity({ name: 'x', quantity: 1 })).toEqual({
      ok: false,
      error: 'UNAUTHORIZED',
      httpStatus: 403,
    });
  });

  it('the logs carry the endpoint template and the status only, never the collection id', async () => {
    const logs = spyLogs();
    const m = mockFetch(json(200, []), json(403, {}));
    const c = client(m.fetch, TENANT);
    await c.listTags();
    await c.listTags();
    expect(logs.text()).not.toContain(TENANT);
    expect(logs.metas()).toEqual([
      { endpoint: 'GET /tags', status: 200, ms: expect.any(Number) },
      { endpoint: 'GET /tags', status: 403, ms: expect.any(Number) },
    ]);
  });
});

describe('listCollections (GET /api/v1/groups/all)', () => {
  it('200 array → the valid { id, name } only; without X-Tenant even when a collection is chosen; no name logged', async () => {
    const logs = spyLogs();
    const m = mockFetch(
      json(200, [
        { id: ID_A, name: 'Maison', currency: 'EUR', createdAt: '2026-01-01T00:00:00Z' },
        { id: TENANT, name: 'Atelier' },
        { id: 'pas-un-uuid', name: 'Cave' },
        { id: ID_A },
        null,
        'Grenier',
      ]),
    );
    expect(await client(m.fetch, TENANT).listCollections()).toEqual({
      ok: true,
      value: [
        { id: ID_A, name: 'Maison' },
        { id: TENANT, name: 'Atelier' },
      ],
    });
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/groups/all`);
    expect(m.calls[0]?.method).toBe('GET');
    expect(m.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    expect(m.calls[0]?.headers.has('X-Tenant')).toBe(false);
    expect(logs.text()).not.toMatch(/Maison|Atelier/);
    expect(logs.metas()).toEqual([
      { endpoint: 'GET /groups/all', status: 200, ms: expect.any(Number) },
    ]);
  });

  it.each([
    ['an object', json(200, { items: [] })],
    ['null', json(200, null)],
    ['not JSON', html(200)],
    ['404 (version without the route)', json(404, {})],
    ['500', json(500, {})],
  ])('%s → COLLECTIONS_UNAVAILABLE', async (_label, responder) => {
    const res = await client(mockFetch(responder).fetch).listCollections();
    expect(res.ok === false && res.error).toBe('COLLECTIONS_UNAVAILABLE');
  });

  it('401 → UNAUTHORIZED; network → HOMEBOX_UNREACHABLE', async () => {
    expect(await client(mockFetch(json(401, {})).fetch).listCollections()).toEqual({
      ok: false,
      error: 'UNAUTHORIZED',
      httpStatus: 401,
    });
    expect(await client(mockFetch(networkError()).fetch).listCollections()).toEqual({
      ok: false,
      error: 'HOMEBOX_UNREACHABLE',
    });
  });
});

describe('getDefaultCollection (GET /api/v1/groups)', () => {
  it('200 → { id, name } of the default collection of the key; without X-Tenant', async () => {
    const m = mockFetch(json(200, { id: ID_A, name: 'Maison', currency: 'EUR' }));
    expect(await client(m.fetch, TENANT).getDefaultCollection()).toEqual({
      ok: true,
      value: { id: ID_A, name: 'Maison' },
    });
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/groups`);
    expect(m.calls[0]?.headers.has('X-Tenant')).toBe(false);
  });

  it.each([
    ['an array', json(200, [])],
    ['no name', json(200, { id: ID_A })],
    ['not JSON', html(200)],
    ['500', json(500, {})],
  ])('%s → COLLECTIONS_UNAVAILABLE', async (_label, responder) => {
    const res = await client(mockFetch(responder).fetch).getDefaultCollection();
    expect(res.ok === false && res.error).toBe('COLLECTIONS_UNAVAILABLE');
  });
});
