import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { registerLocationHandlers } from '@/background/location/handlers';
import { dispatch } from '@/background/router';
import { fail, ok } from '@/shared/errors';

const EXT = 'chrome-extension://abcdefghijklmnop/';
// ADAPTED (016): location/list names its target instance; the last location is indexed by instance id.
const ID = 'inst-a';
const OTHER = 'inst-b';
const call = () => dispatch({ type: 'location/list', instanceId: ID }, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const TREE = [
  { id: 'm', name: 'Maison', type: 'location', children: [{ id: 'g', name: 'Garage', type: 'location', children: [] }] },
  { id: 'a', name: 'Atelier', type: 'location', children: [] },
];
const ORIGIN = 'https://homebox.example.com';

/** Mocked fetch: records each request and always answers with `respond`. */
function stubFetch(respond: () => Response | Promise<Response>) {
  const requests: { method: string; url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      requests.push({ method: init.method ?? 'GET', url: String(input) });
      return respond();
    }),
  );
  return requests;
}

describe('location/list handler (read-only)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(ok({ id: ID, baseUrl: ORIGIN, apiKey: 'hb_test_key_0000' }));
    registerLocationHandlers();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns the flattened, sorted locations, lastUsedId = null at this stage', async () => {
    const requests = stubFetch(() => reply(200, TREE));
    expect(await call()).toEqual({
      ok: true,
      value: {
        locations: [
          { id: 'a', name: 'Atelier', path: ['Atelier'] },
          { id: 'm', name: 'Maison', path: ['Maison'] },
          { id: 'g', name: 'Garage', path: ['Maison', 'Garage'] },
        ],
        lastUsedId: null,
      },
    });
    expect(requests).toEqual([{ method: 'GET', url: `${ORIGIN}/api/v1/entities/tree` }]);
  });

  it('empty list = ok (not an error)', async () => {
    stubFetch(() => reply(200, []));
    expect(await call()).toEqual({ ok: true, value: { locations: [], lastUsedId: null } });
  });

  it.each(['LOCKED', 'NOT_CONFIGURED'] as const)('%s: error returned without any request', async (code) => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail(code));
    const requests = stubFetch(() => reply(200, TREE));
    expect(await call()).toEqual({ ok: false, error: code });
    expect(requests).toEqual([]);
  });

  it.each([401, 403])('%i → UNAUTHORIZED', async (status) => {
    stubFetch(() => reply(status, {}));
    expect(await call()).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('instance injoignable → HOMEBOX_UNREACHABLE', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await call()).toMatchObject({ ok: false, error: 'HOMEBOX_UNREACHABLE' });
  });

  it.each([
    ['status 500', () => reply(500, {})],
    ['non-array response', () => reply(200, { items: [] })],
    ['unreadable JSON', () => new Response('<html>', { status: 200 })],
  ])('%s → LOCATIONS_UNAVAILABLE', async (_label, respond) => {
    stubFetch(respond);
    expect(await call()).toMatchObject({ ok: false, error: 'LOCATIONS_UNAVAILABLE' });
  });

  it('read-only: no POST, PUT or DELETE (FR-022)', async () => {
    const requests = stubFetch(() => reply(200, TREE));
    await call();
    await fakeBrowser.storage.local.set({ lastLocationByInstance: { [ID]: 'g' } });
    await call();
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
  });

  describe('last location used (US3)', () => {
    it('lastUsedId = identifier remembered for this instance when it is in the tree', async () => {
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { [ID]: 'g' } });
      stubFetch(() => reply(200, TREE));
      expect(await call()).toMatchObject({ ok: true, value: { lastUsedId: 'g' } });
    });

    it('stale identifier → null, no error, and the entry is removed', async () => {
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { [ID]: 'disparu', [OTHER]: 'g' } });
      stubFetch(() => reply(200, TREE));
      expect(await call()).toMatchObject({ ok: true, value: { lastUsedId: null } });
      expect((await fakeBrowser.storage.local.get('lastLocationByInstance')).lastLocationByInstance).toEqual({
        [OTHER]: 'g',
      });
    });

    it('memory of another instance → null', async () => {
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { [OTHER]: 'g' } });
      stubFetch(() => reply(200, TREE));
      expect(await call()).toMatchObject({ ok: true, value: { lastUsedId: null } });
    });

    it('list unavailable: memory is left untouched', async () => {
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { [ID]: 'g' } });
      stubFetch(() => reply(500, {}));
      expect(await call()).toMatchObject({ ok: false, error: 'LOCATIONS_UNAVAILABLE' });
      expect((await fakeBrowser.storage.local.get('lastLocationByInstance')).lastLocationByInstance).toEqual({
        [ID]: 'g',
      });
    });
  });
});

describe('location/list targets one instance (016, Q-C2, T012)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(ok({ id: ID, baseUrl: ORIGIN, apiKey: 'hb_test_key_0000' }));
    registerLocationHandlers();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('the credentials of the instance of the message are used, and only its last location', async () => {
    await fakeBrowser.storage.local.set({ lastLocationByInstance: { [OTHER]: 'g' } });
    stubFetch(() => reply(200, TREE));
    expect(await call()).toMatchObject({ ok: true, value: { lastUsedId: null } });
    expect(configStore.getCredentials).toHaveBeenCalledWith(ID);
  });

  it.each([[{}], [{ instanceId: '' }], [{ instanceId: 3 }]])('%j → BAD_MESSAGE, nothing read, no request', async (extra) => {
    const requests = stubFetch(() => reply(200, TREE));
    const res = await dispatch({ type: 'location/list', ...extra }, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
    expect(res).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(configStore.getCredentials).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it('unknown instance → INSTANCE_NOT_FOUND, no request', async () => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail('INSTANCE_NOT_FOUND'));
    const requests = stubFetch(() => reply(200, TREE));
    expect(await call()).toEqual({ ok: false, error: 'INSTANCE_NOT_FOUND' });
    expect(requests).toEqual([]);
  });
});
