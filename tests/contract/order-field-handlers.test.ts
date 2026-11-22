import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { instanceStore } from '@/background/config/instance-store';
import { registerOrderFieldHandlers } from '@/background/order-fields/handlers';
import { dispatch } from '@/background/router';
import { fail, ok } from '@/shared/errors';

/** `order-fields/*` handlers (spec 019, Q-C2, contracts/runtime-messages.md §2, §5). Fictitious values only. */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const A = { id: 'inst-a', baseUrl: 'https://homebox.example.com', apiKey: 'hb_xxxxxxxx' };
const B = { id: 'inst-b', baseUrl: 'https://inventaire.example.org', apiKey: 'hb_bbbbbbbb' };
const KEY = 'orderFieldsByInstance';
const NAMES = { orderNumber: 'Order number', merchant: 'Merchant', orderUrl: 'Order URL' };
const DEFAULT = { enabled: false, names: NAMES };
const CUSTOM = {
  enabled: true,
  names: { orderNumber: 'N° commande', merchant: 'Boutique', orderUrl: 'Lien' },
};

const call = (msg: Record<string, unknown>) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}options.html` });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const stored = async () => (await fakeBrowser.storage.local.get(KEY))[KEY];

type Req = { method: string; url: string; auth: string | null };
function stubFetch(respond: (url: string) => Response | Promise<Response>) {
  const requests: Req[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      requests.push({
        method: init.method ?? 'GET',
        url,
        auth: new Headers(init.headers).get('Authorization'),
      });
      return respond(url);
    }),
  );
  return requests;
}

const expectNoSecret = (res: unknown) => {
  const text = JSON.stringify(res);
  for (const s of [A.baseUrl, B.baseUrl, A.apiKey, B.apiKey, 'baseUrl', 'apiKey'])
    expect(text).not.toContain(s);
};

const orderFieldHandlerSetup = () => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
    (p: string) => EXT + p.replace(/^\//, ''),
  );
  vi.spyOn(configStore, 'getCredentials').mockImplementation(async (id?: string) => {
    if (id === A.id) return ok(A);
    if (id === B.id) return ok(B);
    return fail('INSTANCE_NOT_FOUND');
  });
  vi.spyOn(instanceStore, 'byId').mockImplementation(async (id: string) =>
    id === A.id || id === B.id ? ({ id } as never) : null,
  );
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  registerOrderFieldHandlers();
};

describe('order-fields/get and order-fields/set handlers (019, T012)', () => {
  beforeEach(orderFieldHandlerSetup);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('get: nothing stored → the default; locked accepted, no network, no key (FR-007)', async () => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail('LOCKED'));
    const requests = stubFetch(() => reply(200, []));
    const res = await call({ type: 'order-fields/get', instanceId: 'inst-a' });
    expect(res).toEqual({ ok: true, value: { settings: DEFAULT } });
    expect(requests).toEqual([]);
    expect(configStore.getCredentials).not.toHaveBeenCalled();
    expectNoSecret(res);
  });

  it('get: stored setting of this instance', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { [A.id]: CUSTOM } });
    expect(await call({ type: 'order-fields/get', instanceId: 'inst-a' })).toEqual({
      ok: true,
      value: { settings: CUSTOM },
    });
    expect(await call({ type: 'order-fields/get', instanceId: 'inst-b' })).toEqual({
      ok: true,
      value: { settings: DEFAULT },
    });
  });

  it('get: invalid entry → the default', async () => {
    await fakeBrowser.storage.local.set({
      [KEY]: { [A.id]: { enabled: true, names: { ...NAMES, merchant: 'a=b' } } },
    });
    expect(await call({ type: 'order-fields/get', instanceId: 'inst-a' })).toEqual({
      ok: true,
      value: { settings: DEFAULT },
    });
  });

  it('get: unknown instance → INSTANCE_NOT_FOUND', async () => {
    expect(await call({ type: 'order-fields/get', instanceId: 'inst-x' })).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
  });

  it('set: locked accepted without network, returns what is stored; the other instance unchanged', async () => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail('LOCKED'));
    const requests = stubFetch(() => reply(200, []));
    await fakeBrowser.storage.local.set({ [KEY]: { [B.id]: { enabled: true, names: NAMES } } });
    const res = await call({ type: 'order-fields/set', instanceId: 'inst-a', settings: CUSTOM });
    expect(res).toEqual({ ok: true, value: { settings: CUSTOM } });
    expect(await stored()).toEqual({ [A.id]: CUSTOM, [B.id]: { enabled: true, names: NAMES } });
    expect(requests).toEqual([]);
    expect(configStore.getCredentials).not.toHaveBeenCalled();
    expectNoSecret(res);
  });

  it.each([
    ['name with =', { enabled: true, names: { ...NAMES, merchant: 'a=b' } }],
    ['duplicate names', { enabled: true, names: { ...NAMES, merchant: 'Order number' } }],
    ['name not trimmed', { enabled: true, names: { ...NAMES, merchant: ' Merchant' } }],
    ['missing', undefined],
  ])('set: invalid settings (%s) → BAD_MESSAGE without any write', async (_label, settings) => {
    expect(await call({ type: 'order-fields/set', instanceId: 'inst-a', settings })).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
    expect(await stored()).toBeUndefined();
  });

  it('set: unknown instance → INSTANCE_NOT_FOUND, nothing written', async () => {
    expect(
      await call({ type: 'order-fields/set', instanceId: 'inst-x', settings: CUSTOM }),
    ).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
    expect(await stored()).toBeUndefined();
  });
});

describe('order-fields/names handler (019, T052)', () => {
  beforeEach(orderFieldHandlerSetup);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('locked → LOCKED without any request', async () => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail('LOCKED'));
    const requests = stubFetch(() => reply(200, ['Order number']));
    expect(await call({ type: 'order-fields/names', instanceId: 'inst-a' })).toEqual({
      ok: false,
      error: 'LOCKED',
    });
    expect(requests).toEqual([]);
  });

  it('unknown instance → INSTANCE_NOT_FOUND, no request', async () => {
    const requests = stubFetch(() => reply(200, []));
    expect(await call({ type: 'order-fields/names', instanceId: 'inst-x' })).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
    expect(requests).toEqual([]);
  });

  it('two instances: each request goes to the instance of the message, with its own key; never to the other (SC-007)', async () => {
    const requests = stubFetch(() => reply(200, ['Order number']));
    const a = await call({ type: 'order-fields/names', instanceId: 'inst-a' });
    const b = await call({ type: 'order-fields/names', instanceId: 'inst-b' });
    expect(requests).toEqual([
      { method: 'GET', url: `${A.baseUrl}/api/v1/entities/fields`, auth: `Bearer ${A.apiKey}` },
      { method: 'GET', url: `${B.baseUrl}/api/v1/entities/fields`, auth: `Bearer ${B.apiKey}` },
    ]);
    expectNoSecret(a);
    expectNoSecret(b);
  });

  it('normalisation: 1 to 255 bytes, no control character, exact dedup, sorted (base sensitivity then exact)', async () => {
    stubFetch(() =>
      reply(200, [
        'Merchant',
        'boutique',
        '',
        'é'.repeat(128),
        'é'.repeat(127),
        'a\u0001b',
        'Boutique',
        'Merchant',
        'Couleur',
        'N° commande',
        3,
      ]),
    );
    const res = await call({ type: 'order-fields/names', instanceId: 'inst-a' });
    expect(res).toEqual({
      ok: true,
      value: {
        names: ['Boutique', 'boutique', 'Couleur', 'é'.repeat(127), 'Merchant', 'N° commande'],
      },
    });
    expectNoSecret(res);
  });

  it('bounded to 2 000 names', async () => {
    const many = Array.from({ length: 2100 }, (_, i) => `Champ ${String(i).padStart(4, '0')}`);
    stubFetch(() => reply(200, many));
    const res = (await call({ type: 'order-fields/names', instanceId: 'inst-a' })) as {
      ok: true;
      value: { names: string[] };
    };
    expect(res.value.names).toHaveLength(2000);
    expect(res.value.names[0]).toBe('Champ 0000');
    expect(res.value.names.at(-1)).toBe('Champ 1999');
  });

  it.each<[string, () => Response]>([
    ['UNAUTHORIZED', () => reply(401, {})],
    ['FIELD_NAMES_UNAVAILABLE', () => reply(404, {})],
    ['FIELD_NAMES_UNAVAILABLE', () => reply(500, {})],
    [
      'HOMEBOX_UNREACHABLE',
      () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('client error propagated → %s', async (code, respond) => {
    stubFetch(respond);
    expect(await call({ type: 'order-fields/names', instanceId: 'inst-a' })).toEqual({
      ok: false,
      error: code,
    });
  });
});
