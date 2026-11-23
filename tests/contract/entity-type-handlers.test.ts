import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { registerEntityTypeHandlers } from '@/background/entity-types/handlers';
import { dispatch } from '@/background/router';
import { fail, ok } from '@/shared/errors';

/** `entity-type/list` handler (spec 023, contracts/runtime-messages.md §1). Fictitious values only. */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const A = { id: 'inst-a', baseUrl: 'https://homebox.example.com', apiKey: 'hb_xxxxxxxx' };
const KEY = 'lastEntityTypeByInstance';

const call = (msg: Record<string, unknown>, url = `${EXT}popup.html`) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url });
type ListValue = {
  types: { id: string; name: string }[];
  defaultId: string | null;
  lastUsedId: string | null;
};
const valueOf = (res: unknown): ListValue => (res as { value: ListValue }).value;
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(respond: (url: string) => Response | Promise<Response>) {
  const requests: { method: string; url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      requests.push({ method: init.method ?? 'GET', url: String(input) });
      return respond(String(input));
    }),
  );
  return requests;
}

const TYPES = [
  { id: 'et-tool', name: 'Outil', isLocation: false, createdAt: '2026-03-01T00:00:00Z' },
  { id: 'et-room', name: 'Pièce', isLocation: true, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'et-item', name: 'Item', isLocation: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'et-book', name: 'Livre', isLocation: false, createdAt: '2026-02-01T00:00:00Z' },
];

let debugSpy: { mock: { calls: unknown[][] } };
beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
    (p: string) => EXT + p.replace(/^\//, ''),
  );
  vi.spyOn(configStore, 'getCredentials').mockImplementation(async (id?: string) =>
    id === A.id ? ok(A) : fail('INSTANCE_NOT_FOUND'),
  );
  debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  registerEntityTypeHandlers();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('entity-type/list', () => {
  it('returns the non-location types sorted by name, the server default (oldest) and no last used type', async () => {
    const req = stubFetch(() => reply(200, TYPES));
    const res = await call({ type: 'entity-type/list', instanceId: 'inst-a' });
    expect(res).toEqual({
      ok: true,
      value: {
        types: [
          { id: 'et-item', name: 'Item' },
          { id: 'et-book', name: 'Livre' },
          { id: 'et-tool', name: 'Outil' },
        ],
        defaultId: 'et-item',
        lastUsedId: null,
      },
    });
    expect(req).toEqual([
      { method: 'GET', url: 'https://homebox.example.com/api/v1/entity-types' },
    ]);
  });

  it('a location type is never the default, even when it is the oldest', async () => {
    stubFetch(() => reply(200, TYPES));
    const res = await call({ type: 'entity-type/list', instanceId: 'inst-a' });
    expect(valueOf(res).defaultId).not.toBe('et-room');
  });

  it('defaultId is null when no type has a usable createdAt', async () => {
    stubFetch(() =>
      reply(200, [
        { id: 'a', name: 'A', isLocation: false },
        { id: 'b', name: 'B', isLocation: false, createdAt: 'nope' },
      ]),
    );
    const res = await call({ type: 'entity-type/list', instanceId: 'inst-a' });
    expect(valueOf(res).defaultId).toBeNull();
  });

  it('lastUsedId is the remembered type when it is still listed', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { 'inst-a': 'et-book' } });
    stubFetch(() => reply(200, TYPES));
    const res = await call({ type: 'entity-type/list', instanceId: 'inst-a' });
    expect(valueOf(res).lastUsedId).toBe('et-book');
  });

  it('a stale or location memory is ignored and erased', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { 'inst-a': 'et-gone', 'inst-b': 'et-book' } });
    stubFetch(() => reply(200, TYPES));
    const res = await call({ type: 'entity-type/list', instanceId: 'inst-a' });
    expect(valueOf(res).lastUsedId).toBeNull();
    expect((await fakeBrowser.storage.local.get(KEY))[KEY]).toEqual({ 'inst-b': 'et-book' });
  });

  it('an unknown instance gets the credentials error and no request is made', async () => {
    const req = stubFetch(() => reply(200, TYPES));
    expect(await call({ type: 'entity-type/list', instanceId: 'nope' })).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
    expect(req).toHaveLength(0);
  });

  it('404 and 500 are forwarded as their own codes', async () => {
    stubFetch(() => reply(404, {}));
    expect(await call({ type: 'entity-type/list', instanceId: 'inst-a' })).toMatchObject({
      ok: false,
      error: 'ENTITY_TYPES_UNSUPPORTED',
    });
    stubFetch(() => reply(500, {}));
    expect(await call({ type: 'entity-type/list', instanceId: 'inst-a' })).toMatchObject({
      ok: false,
      error: 'ENTITY_TYPES_UNAVAILABLE',
    });
  });

  it('is refused from a page that is not an extension page', async () => {
    const req = stubFetch(() => reply(200, TYPES));
    const res = await call(
      { type: 'entity-type/list', instanceId: 'inst-a' },
      'https://www.amazon.fr/x',
    );
    expect(res).toMatchObject({ ok: false });
    expect(req).toHaveLength(0);
  });

  it('the answer and the logs carry neither the address, the key nor a type name', async () => {
    stubFetch(() => reply(200, TYPES));
    const res = await call({ type: 'entity-type/list', instanceId: 'inst-a' });
    expect(JSON.stringify(res)).not.toMatch(/hb_|example\.com/);
    expect(JSON.stringify(debugSpy.mock.calls)).not.toMatch(/Outil|Livre|Item|et-|hb_/);
  });
});
