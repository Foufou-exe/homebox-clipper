import { fakeBrowser } from 'wxt/testing/fake-browser';
import { collectionSettings } from '@/background/collections/settings';
import { registerCollectionHandlers } from '@/background/collections/handlers';
import { configStore } from '@/background/config/config-store';
import { registerConfigHandlers } from '@/background/config/handlers';
import { registerLocationHandlers } from '@/background/location/handlers';
import { registerTagHandlers } from '@/background/tags/handlers';
import { dispatch } from '@/background/router';
import type { CollectionSetting } from '@/shared/collections';
import { A, B, PASSPHRASE, buildStore, seedStore } from '../unit/instances-fixture';
import { json, mockFetch, networkError, type Call } from './fetch-mock';

/**
 * Spec 024 (contracts/runtime-messages.md): `instance/collections`, `instance/set-collection`, the connection test and
 * the reads of the summary with a chosen collection; reset when the address changes. Fictitious values only.
 */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = (msg: unknown) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}options.html` });
const ID_M = '11111111-1111-4111-8111-111111111111';
const ID_W = '22222222-2222-4222-8222-222222222222';
const ID_X = '33333333-3333-4333-8333-333333333333';
const MAISON = { id: ID_M, name: 'Maison', currency: 'EUR' };
const ATELIER = { id: ID_W, name: 'Atelier', currency: 'EUR' };
const KEY = 'collectionByInstance';
const raw = async () => (await fakeBrowser.storage.local.get(KEY))[KEY];
const tenantOf = (c: Call) => c.headers.get('X-Tenant');
/** Writes the setting of inst-a through the queue, bound to its address. */
const setA = (setting: CollectionSetting) =>
  collectionSettings.update('inst-a', A.baseUrl, () => setting);
const settingA = async () => {
  const e = await collectionSettings.entry('inst-a', A.baseUrl);
  return e.kind === 'ok' ? e.setting : e.kind;
};

/** GET /groups/all then GET /groups (default collection of the key). */
const discovery = (all: unknown[] = [MAISON, ATELIER], def: unknown = MAISON) => [
  json(200, all),
  json(200, def),
];

beforeEach(async () => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
    (p: string) => EXT + p.replace(/^\//, ''),
  );
  vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation((async () => true) as never);
  vi.spyOn(fakeBrowser.permissions, 'remove').mockImplementation((async () => true) as never);
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  registerConfigHandlers();
  registerCollectionHandlers();
  registerLocationHandlers();
  registerTagHandlers();
  await seedStore(await buildStore({ instances: [A, B] }));
  await configStore.unlock(PASSPHRASE);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('instance/collections (FR-003, FR-004)', () => {
  it('default setting: two reads on THIS instance without X-Tenant; sorted list, default, seen recorded', async () => {
    const m = mockFetch(...discovery());
    vi.stubGlobal('fetch', m.fetch);
    const res = await call({ type: 'instance/collections', instanceId: 'inst-a' });
    expect(res).toEqual({
      ok: true,
      value: {
        collections: [
          { id: ID_W, name: 'Atelier' },
          { id: ID_M, name: 'Maison' },
        ],
        defaultCollection: { id: ID_M, name: 'Maison' },
        setting: { chosen: null, seen: { id: ID_M, name: 'Maison', several: true } },
        missing: false,
      },
    });
    expect(m.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${A.baseUrl}/api/v1/groups/all`,
      `GET ${A.baseUrl}/api/v1/groups`,
    ]);
    for (const c of m.calls) {
      expect(c.headers.get('Authorization')).toBe(`Bearer ${A.apiKey}`);
      expect(tenantOf(c)).toBeNull();
    }
    expect(await raw()).toEqual({
      'inst-a': {
        chosen: null,
        seen: { id: ID_M, name: 'Maison', several: true },
        baseUrl: A.baseUrl,
      },
    });
  });

  it('one collection: several = false', async () => {
    vi.stubGlobal('fetch', mockFetch(...discovery([MAISON])).fetch);
    const res = (await call({ type: 'instance/collections', instanceId: 'inst-a' })) as {
      value: { setting: { seen: { several: boolean } } };
    };
    expect(res.value.setting.seen.several).toBe(false);
  });

  it('chosen collection still reachable: discovery still without X-Tenant; its name refreshed from HomeBox', async () => {
    await setA({ chosen: { id: ID_W, name: 'Ancien nom' }, seen: null });
    const m = mockFetch(...discovery());
    vi.stubGlobal('fetch', m.fetch);
    const res = (await call({ type: 'instance/collections', instanceId: 'inst-a' })) as {
      value: Record<string, unknown>;
    };
    expect(res.value.setting).toEqual({
      chosen: { id: ID_W, name: 'Atelier' },
      seen: { id: ID_W, name: 'Atelier', several: true },
    });
    expect(res.value.missing).toBe(false);
    for (const c of m.calls) expect(tenantOf(c)).toBeNull();
  });

  it('chosen collection no longer reachable: missing, the setting is NEVER changed to another one (FR-010)', async () => {
    const before = {
      chosen: { id: ID_X, name: 'Grenier' },
      seen: { id: ID_X, name: 'Grenier', several: true },
    };
    await setA(before);
    vi.stubGlobal('fetch', mockFetch(...discovery()).fetch);
    const res = (await call({ type: 'instance/collections', instanceId: 'inst-a' })) as {
      value: Record<string, unknown>;
    };
    expect(res.value.missing).toBe(true);
    expect(res.value.setting).toEqual(before);
    expect(await settingA()).toEqual(before);
    expect(
      (await configStore.getCredentials('inst-a')).ok &&
        (await configStore.getCredentials('inst-a')),
    ).toMatchObject({
      value: { tenant: ID_X },
    });
  });

  it.each([
    ['the list unreadable', [json(200, { items: [] })], 'COLLECTIONS_UNAVAILABLE'],
    ['the default unreadable', [json(200, [MAISON]), json(500, {})], 'COLLECTIONS_UNAVAILABLE'],
    ['the key refused', [json(401, {})], 'UNAUTHORIZED'],
    ['the instance unreachable', [networkError()], 'HOMEBOX_UNREACHABLE'],
  ])('%s → %s, nothing written', async (_label, responders, code) => {
    vi.stubGlobal('fetch', mockFetch(...responders).fetch);
    const res = await call({ type: 'instance/collections', instanceId: 'inst-a' });
    expect(res).toEqual({ ok: false, error: code });
    expect(await raw()).toBeUndefined();
  });

  it('locked → LOCKED without any request; unknown instance → INSTANCE_NOT_FOUND', async () => {
    const m = mockFetch();
    vi.stubGlobal('fetch', m.fetch);
    expect(await call({ type: 'instance/collections', instanceId: 'inconnue' })).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
    await configStore.lock();
    expect(await call({ type: 'instance/collections', instanceId: 'inst-a' })).toEqual({
      ok: false,
      error: 'LOCKED',
    });
    expect(m.calls).toEqual([]);
  });

  it('the answer carries neither the address nor the key', async () => {
    vi.stubGlobal('fetch', mockFetch(...discovery()).fetch);
    const text = JSON.stringify(await call({ type: 'instance/collections', instanceId: 'inst-a' }));
    for (const s of [A.baseUrl, A.apiKey, 'baseUrl', 'apiKey']) expect(text).not.toContain(s);
  });

  it('refused from a web page (instance/ prefix reserved to extension pages)', async () => {
    const res = await dispatch(
      { type: 'instance/collections', instanceId: 'inst-a' },
      { id: fakeBrowser.runtime.id, url: 'https://www.amazon.fr/' },
    );
    expect(res).toEqual({ ok: false, error: 'BAD_MESSAGE' });
  });
});

describe('instance/set-collection (FR-006)', () => {
  it('a collection of the list: re-read on the instance, name from HomeBox, then every request carries X-Tenant', async () => {
    vi.stubGlobal('fetch', mockFetch(...discovery()).fetch);
    const res = (await call({
      type: 'instance/set-collection',
      instanceId: 'inst-a',
      collectionId: ID_W,
    })) as {
      ok: boolean;
      value: Record<string, unknown>;
    };
    expect(res.ok).toBe(true);
    expect(res.value.setting).toEqual({
      chosen: { id: ID_W, name: 'Atelier' },
      seen: { id: ID_W, name: 'Atelier', several: true },
    });
    expect(await raw()).toEqual({
      'inst-a': { ...(res.value.setting as object), baseUrl: A.baseUrl },
    });

    const m = mockFetch(json(200, []), json(200, []));
    vi.stubGlobal('fetch', m.fetch);
    await call({ type: 'location/list', instanceId: 'inst-a' });
    await call({ type: 'tag/list', instanceId: 'inst-a' });
    expect(m.calls.map(tenantOf)).toEqual([ID_W, ID_W]);
  });

  it('the other instance is not affected (FR-004 of US4)', async () => {
    await setA({ chosen: { id: ID_W, name: 'Atelier' }, seen: null });
    const m = mockFetch(json(200, []));
    vi.stubGlobal('fetch', m.fetch);
    await call({ type: 'location/list', instanceId: 'inst-b' });
    expect(m.calls[0]?.url.startsWith(B.baseUrl)).toBe(true);
    expect(tenantOf(m.calls[0]!)).toBeNull();
  });

  it('null: back to the default collection of the key, no X-Tenant any more', async () => {
    await setA({ chosen: { id: ID_W, name: 'Atelier' }, seen: null });
    vi.stubGlobal('fetch', mockFetch(...discovery()).fetch);
    const res = (await call({
      type: 'instance/set-collection',
      instanceId: 'inst-a',
      collectionId: null,
    })) as {
      value: Record<string, unknown>;
    };
    expect(res.value.setting).toEqual({
      chosen: null,
      seen: { id: ID_M, name: 'Maison', several: true },
    });
    const m = mockFetch(json(200, []));
    vi.stubGlobal('fetch', m.fetch);
    await call({ type: 'location/list', instanceId: 'inst-a' });
    expect(tenantOf(m.calls[0]!)).toBeNull();
  });

  it('an id that is not in the list → COLLECTION_UNAVAILABLE, nothing written', async () => {
    vi.stubGlobal('fetch', mockFetch(...discovery()).fetch);
    expect(
      await call({ type: 'instance/set-collection', instanceId: 'inst-a', collectionId: ID_X }),
    ).toEqual({
      ok: false,
      error: 'COLLECTION_UNAVAILABLE',
    });
    expect(await raw()).toBeUndefined();
  });

  it.each([['pas-un-uuid'], [42], [undefined]])(
    'malformed collectionId %s → BAD_MESSAGE without request',
    async (id) => {
      const m = mockFetch();
      vi.stubGlobal('fetch', m.fetch);
      expect(
        await call({ type: 'instance/set-collection', instanceId: 'inst-a', collectionId: id }),
      ).toEqual({
        ok: false,
        error: 'BAD_MESSAGE',
      });
      expect(m.calls).toEqual([]);
    },
  );
});

describe('connection test and reads with a chosen collection (FR-005, FR-007, FR-010)', () => {
  beforeEach(() => setA({ chosen: { id: ID_W, name: 'Atelier' }, seen: null }));

  it('instance/test: still two requests; /users/self carries X-Tenant, /status does not', async () => {
    const m = mockFetch(json(200, { health: true, build: { version: 'v0.27.1' } }), json(200, {}));
    vi.stubGlobal('fetch', m.fetch);
    const res = (await call({ type: 'instance/test', instanceId: 'inst-a' })) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect(m.calls).toHaveLength(2);
    expect(m.calls.map(tenantOf)).toEqual([null, ID_W]);
  });

  it('instance/test: 403 on the collection → COLLECTION_UNAVAILABLE, recorded as the last check', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(json(200, { health: true, build: { version: 'v0.27.1' } }), json(403, {})).fetch,
    );
    expect(await call({ type: 'instance/test', instanceId: 'inst-a' })).toEqual({
      ok: false,
      error: 'COLLECTION_UNAVAILABLE',
      httpStatus: 403,
    });
    const view = await configStore.getView();
    expect(view.instances?.[0]?.lastCheck).toMatchObject({
      status: 'error',
      code: 'COLLECTION_UNAVAILABLE',
    });
  });

  it('location/list and tag/list: 403 → COLLECTION_UNAVAILABLE (never another collection, never a retry)', async () => {
    const m = mockFetch(json(403, {}), json(403, {}));
    vi.stubGlobal('fetch', m.fetch);
    expect(await call({ type: 'location/list', instanceId: 'inst-a' })).toMatchObject({
      ok: false,
      error: 'COLLECTION_UNAVAILABLE',
    });
    expect(await call({ type: 'tag/list', instanceId: 'inst-a' })).toEqual({
      ok: false,
      error: 'COLLECTION_UNAVAILABLE',
    });
    expect(m.calls).toHaveLength(2);
    expect(m.calls.map(tenantOf)).toEqual([ID_W, ID_W]);
  });
});

describe('instance/update (FR-011)', () => {
  const update = (over: Record<string, unknown>) => ({
    type: 'instance/update',
    instanceId: 'inst-a',
    baseUrl: A.baseUrl,
    apiKey: '',
    passphrase: PASSPHRASE,
    newPassphrase: false,
    ...over,
  });
  const statusOk = () =>
    mockFetch(json(200, { health: true, build: { version: 'v0.27.1' } }), json(200, {}));

  beforeEach(() => setA({ chosen: { id: ID_W, name: 'Atelier' }, seen: null }));

  it('new key only: the setting is kept and the test carries X-Tenant', async () => {
    const m = statusOk();
    vi.stubGlobal('fetch', m.fetch);
    const res = (await call(update({ apiKey: 'hb_cccccccc' }))) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect(m.calls.map(tenantOf)).toEqual([null, ID_W]);
    expect(await settingA()).toMatchObject({ chosen: { id: ID_W } });
  });

  it('new address: the setting goes back to the default collection; the test is sent without X-Tenant', async () => {
    const m = statusOk();
    vi.stubGlobal('fetch', m.fetch);
    const res = (await call(
      update({ baseUrl: 'https://autre.example.net', apiKey: 'hb_cccccccc' }),
    )) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect(m.calls.map(tenantOf)).toEqual([null, null]);
    // Bound to the former address: no setting any more for the new one, in a single write (M1).
    expect(await collectionSettings.entry('inst-a', 'https://autre.example.net')).toEqual({
      kind: 'none',
    });
    const creds = await configStore.getCredentials('inst-a');
    expect(creds.ok && creds.value).not.toHaveProperty('tenant');
    expect((await configStore.getView()).instances?.[0]).not.toHaveProperty('collection');
  });
});

describe('unreadable stored entry (M3) and concurrent writes (M1)', () => {
  const broken = { chosen: { id: 'pas-un-uuid', name: 'Atelier' }, seen: null, baseUrl: A.baseUrl };

  it('reads of the instance are refused with COLLECTION_UNAVAILABLE, without any request', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { 'inst-a': broken } });
    const m = mockFetch();
    vi.stubGlobal('fetch', m.fetch);
    expect(await call({ type: 'location/list', instanceId: 'inst-a' })).toEqual({
      ok: false,
      error: 'COLLECTION_UNAVAILABLE',
    });
    expect(await call({ type: 'instance/test', instanceId: 'inst-a' })).toEqual({
      ok: false,
      error: 'COLLECTION_UNAVAILABLE',
    });
    expect(m.calls).toEqual([]);
  });

  it('instance/collections still works: chosen reported missing, nothing written; set-collection repairs it', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { 'inst-a': broken } });
    vi.stubGlobal('fetch', mockFetch(...discovery(), ...discovery()).fetch);
    const res = (await call({ type: 'instance/collections', instanceId: 'inst-a' })) as {
      value: Record<string, unknown>;
    };
    expect(res.value.missing).toBe(true);
    expect(await raw()).toEqual({ 'inst-a': broken });
    await call({ type: 'instance/set-collection', instanceId: 'inst-a', collectionId: null });
    expect(await settingA()).toEqual({
      chosen: null,
      seen: { id: ID_M, name: 'Maison', several: true },
    });
  });

  it('a read finishing after a choice does not overwrite it (compare-and-write inside the queue)', async () => {
    const byUrl = (url: string) =>
      new Response(JSON.stringify(url.endsWith('/groups/all') ? [MAISON, ATELIER] : MAISON), {
        status: 200,
      });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => byUrl(String(input))),
    );
    // Both reads run; the writes are ordered in the queue and each one starts from the entry read there.
    await Promise.all([
      call({ type: 'instance/set-collection', instanceId: 'inst-a', collectionId: ID_W }),
      call({ type: 'instance/collections', instanceId: 'inst-a' }),
    ]);
    expect(await settingA()).toEqual({
      chosen: { id: ID_W, name: 'Atelier' },
      seen: { id: ID_W, name: 'Atelier', several: true },
    });
  });
});
