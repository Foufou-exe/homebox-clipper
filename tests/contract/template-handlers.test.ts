import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { dispatch } from '@/background/router';
import { registerTemplateHandlers } from '@/background/templates/handlers';
import { fail, ok } from '@/shared/errors';

/** `template/*` handlers (spec 018, Q-C2, contracts/runtime-messages.md §1, §4). Fictitious values only. */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const A = { id: 'inst-a', baseUrl: 'https://homebox.example.com', apiKey: 'hb_xxxxxxxx' };
const B = { id: 'inst-b', baseUrl: 'https://inventaire.example.org', apiKey: 'hb_bbbbbbbb' };
const KEY = 'defaultTemplateByInstance';

const call = (msg: Record<string, unknown>) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

const LIVRE = {
  id: 'tpl-1',
  name: 'Livre',
  updatedAt: '2026-11-01T10:00:00Z',
  defaultInsured: true,
  fields: [{ id: 'f1', type: 'text', name: 'Auteur', textValue: 'Jane Doe' }],
};

const templateHandlerSetup = () => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
    (p: string) => EXT + p.replace(/^\//, ''),
  );
  vi.spyOn(configStore, 'getCredentials').mockImplementation(async (id?: string) => {
    if (id === A.id) return ok(A);
    if (id === B.id) return ok(B);
    return fail('INSTANCE_NOT_FOUND');
  });
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  registerTemplateHandlers();
};

const expectNoSecret = (res: unknown) => {
  const text = JSON.stringify(res);
  for (const s of [A.baseUrl, B.baseUrl, A.apiKey, B.apiKey, 'baseUrl', 'apiKey'])
    expect(text).not.toContain(s);
};

describe('template/list, template/get, template/check handlers', () => {
  beforeEach(templateHandlerSetup);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    { type: 'template/list', instanceId: 'inst-a' },
    { type: 'template/get', instanceId: 'inst-a', templateId: 'tpl-1' },
    {
      type: 'template/check',
      instanceId: 'inst-a',
      refs: [{ id: 'tpl-1', fingerprint: 'a'.repeat(64) }],
    },
  ])('$type locked → LOCKED without any request', async (msg) => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail('LOCKED'));
    const requests = stubFetch(() => reply(200, []));
    expect(await call(msg)).toEqual({ ok: false, error: 'LOCKED' });
    expect(requests).toEqual([]);
  });

  it.each([
    { type: 'template/list', instanceId: 'inst-x' },
    { type: 'template/get', instanceId: 'inst-x', templateId: 'tpl-1' },
    {
      type: 'template/check',
      instanceId: 'inst-x',
      refs: [{ id: 'tpl-1', fingerprint: 'a'.repeat(64) }],
    },
  ])('$type on an unknown instance → INSTANCE_NOT_FOUND, no request', async (msg) => {
    const requests = stubFetch(() => reply(200, []));
    expect(await call(msg)).toEqual({ ok: false, error: 'INSTANCE_NOT_FOUND' });
    expect(requests).toEqual([]);
  });

  it('template/list: sorted options, no default; one GET to the target instance with its own key', async () => {
    const requests = stubFetch(() =>
      reply(200, [
        { id: 'tpl-2', name: 'Jeu' },
        { id: 'tpl-1', name: 'Livre', description: 'Romans' },
      ]),
    );
    const res = await call({ type: 'template/list', instanceId: 'inst-b' });
    expect(res).toEqual({
      ok: true,
      value: {
        templates: [
          { id: 'tpl-2', name: 'Jeu', description: '' },
          { id: 'tpl-1', name: 'Livre', description: 'Romans' },
        ],
        defaultTemplate: null,
        defaultState: 'none',
      },
    });
    expect(requests).toEqual([
      { method: 'GET', url: `${B.baseUrl}/api/v1/templates`, auth: `Bearer ${B.apiKey}` },
    ]);
    expectNoSecret(res);
  });

  it('template/list: remembered default present → ok; renamed → name updated in storage.local', async () => {
    await fakeBrowser.storage.local.set({
      [KEY]: { [A.id]: { id: 'tpl-1', name: 'Livre' }, [B.id]: { id: 'tpl-9', name: 'Jeu' } },
    });
    stubFetch(() => reply(200, [{ id: 'tpl-1', name: 'Livres' }]));
    expect(await call({ type: 'template/list', instanceId: 'inst-a' })).toEqual({
      ok: true,
      value: {
        templates: [{ id: 'tpl-1', name: 'Livres', description: '' }],
        defaultTemplate: { id: 'tpl-1', name: 'Livres' },
        defaultState: 'ok',
      },
    });
    expect((await fakeBrowser.storage.local.get(KEY))[KEY]).toEqual({
      [A.id]: { id: 'tpl-1', name: 'Livres' },
      [B.id]: { id: 'tpl-9', name: 'Jeu' },
    });
  });

  it('template/list: remembered default absent → missing, entry kept', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { [A.id]: { id: 'tpl-1', name: 'Livre' } } });
    stubFetch(() => reply(200, [{ id: 'tpl-2', name: 'Jeu' }]));
    expect(await call({ type: 'template/list', instanceId: 'inst-a' })).toMatchObject({
      ok: true,
      value: { defaultTemplate: { id: 'tpl-1', name: 'Livre' }, defaultState: 'missing' },
    });
    expect((await fakeBrowser.storage.local.get(KEY))[KEY]).toEqual({
      [A.id]: { id: 'tpl-1', name: 'Livre' },
    });
  });

  it.each<[string, () => Response | Promise<Response>]>([
    ['UNAUTHORIZED', () => reply(401, {})],
    ['TEMPLATES_UNSUPPORTED', () => reply(404, {})],
    ['TEMPLATES_UNAVAILABLE', () => reply(500, {})],
    ['TEMPLATES_UNAVAILABLE', () => reply(200, { items: [] })],
    [
      'HOMEBOX_UNREACHABLE',
      () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('template/list → %s', async (code, respond) => {
    stubFetch(respond);
    expect(await call({ type: 'template/list', instanceId: 'inst-a' })).toEqual({
      ok: false,
      error: code,
    });
  });

  it('template/get: normalised detail with fingerprint, on the target instance only', async () => {
    const requests = stubFetch(() => reply(200, LIVRE));
    const res = await call({ type: 'template/get', instanceId: 'inst-a', templateId: 'tpl-1' });
    expect(res).toMatchObject({
      ok: true,
      value: {
        template: {
          id: 'tpl-1',
          name: 'Livre',
          insured: true,
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
          fields: [
            {
              type: 'text',
              kind: 'text',
              name: 'Auteur',
              textValue: 'Jane Doe',
              numberValue: 0,
              booleanValue: false,
            },
          ],
        },
      },
    });
    expect(requests).toEqual([
      { method: 'GET', url: `${A.baseUrl}/api/v1/templates/tpl-1`, auth: `Bearer ${A.apiKey}` },
    ]);
    expectNoSecret(res);
  });

  it.each<[string, number]>([
    ['TEMPLATE_NOT_FOUND', 404],
    ['UNAUTHORIZED', 401],
    ['TEMPLATES_UNAVAILABLE', 500],
  ])('template/get → %s', async (code, status) => {
    stubFetch(() => reply(status, {}));
    expect(await call({ type: 'template/get', instanceId: 'inst-a', templateId: 'tpl-1' })).toEqual(
      { ok: false, error: code },
    );
  });

  it('template/check: same / changed / missing, one sequential GET per ref, target instance only', async () => {
    stubFetch(() => reply(200, LIVRE));
    const first = (await call({
      type: 'template/get',
      instanceId: 'inst-a',
      templateId: 'tpl-1',
    })) as {
      ok: true;
      value: { template: { fingerprint: string } };
    };
    const fp = first.value.template.fingerprint;
    const changed = { ...LIVRE, id: 'tpl-2', name: 'Jeu' };
    const order: string[] = [];
    const requests = stubFetch((url) => {
      order.push(url);
      if (url.endsWith('/tpl-1')) return reply(200, LIVRE);
      if (url.endsWith('/tpl-2')) return reply(200, changed);
      return reply(404, {});
    });
    const res = await call({
      type: 'template/check',
      instanceId: 'inst-a',
      refs: [
        { id: 'tpl-1', fingerprint: fp },
        { id: 'tpl-2', fingerprint: fp },
        { id: 'tpl-3', fingerprint: fp },
      ],
    });
    expect(res).toMatchObject({
      ok: true,
      value: {
        results: [
          { id: 'tpl-1', state: 'same' },
          {
            id: 'tpl-2',
            state: 'changed',
            template: {
              id: 'tpl-2',
              name: 'Jeu',
              fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
            },
          },
          { id: 'tpl-3', state: 'missing' },
        ],
      },
    });
    expect((res as { value: { results: unknown[] } }).value.results[0]).toEqual({
      id: 'tpl-1',
      state: 'same',
    });
    expect((res as { value: { results: unknown[] } }).value.results[2]).toEqual({
      id: 'tpl-3',
      state: 'missing',
    });
    expect(order).toEqual([
      `${A.baseUrl}/api/v1/templates/tpl-1`,
      `${A.baseUrl}/api/v1/templates/tpl-2`,
      `${A.baseUrl}/api/v1/templates/tpl-3`,
    ]);
    expect(
      requests.every((r) => r.url.startsWith(`${A.baseUrl}/`) && r.auth === `Bearer ${A.apiKey}`),
    ).toBe(true);
    expectNoSecret(res);
  });

  it.each<[string, () => Response]>([
    ['UNAUTHORIZED', () => reply(401, {})],
    [
      'HOMEBOX_UNREACHABLE',
      () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('template/check: an error other than 404 → %s', async (code, respond) => {
    stubFetch(respond);
    expect(
      await call({
        type: 'template/check',
        instanceId: 'inst-a',
        refs: [{ id: 'tpl-1', fingerprint: 'a'.repeat(64) }],
      }),
    ).toEqual({
      ok: false,
      error: code,
    });
  });

  it('two instances: no request ever reaches the other instance (SC-006)', async () => {
    const requests = stubFetch((url) =>
      url.endsWith('/templates') ? reply(200, [{ id: 'tpl-1', name: 'Livre' }]) : reply(200, LIVRE),
    );
    await call({ type: 'template/list', instanceId: 'inst-a' });
    await call({ type: 'template/get', instanceId: 'inst-a', templateId: 'tpl-1' });
    await call({
      type: 'template/check',
      instanceId: 'inst-a',
      refs: [{ id: 'tpl-1', fingerprint: 'a'.repeat(64) }],
    });
    expect(requests.length).toBe(3);
    expect(
      requests.some((r) => r.url.startsWith(B.baseUrl) || r.auth === `Bearer ${B.apiKey}`),
    ).toBe(false);
  });
});

describe('template/get-default and template/set-default handlers (US4, T064)', () => {
  beforeEach(async () => {
    templateHandlerSetup();
    const { instanceStore } = await import('@/background/config/instance-store');
    vi.spyOn(instanceStore, 'byId').mockImplementation(async (id: string) =>
      id === A.id || id === B.id ? ({ id } as never) : null,
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('get-default: no network, no key, works while locked (US4-6)', async () => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail('LOCKED'));
    await fakeBrowser.storage.local.set({ [KEY]: { [A.id]: { id: 'tpl-1', name: 'Livre' } } });
    const requests = stubFetch(() => reply(200, []));
    expect(await call({ type: 'template/get-default', instanceId: 'inst-a' })).toEqual({
      ok: true,
      value: { defaultTemplate: { id: 'tpl-1', name: 'Livre' } },
    });
    expect(await call({ type: 'template/get-default', instanceId: 'inst-b' })).toEqual({
      ok: true,
      value: { defaultTemplate: null },
    });
    expect(requests).toEqual([]);
    expect(configStore.getCredentials).not.toHaveBeenCalled();
  });

  it('get-default: unknown instance → INSTANCE_NOT_FOUND', async () => {
    expect(await call({ type: 'template/get-default', instanceId: 'inst-x' })).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
  });

  it('set-default locked → LOCKED without request (FR-025)', async () => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail('LOCKED'));
    const requests = stubFetch(() => reply(200, LIVRE));
    expect(
      await call({ type: 'template/set-default', instanceId: 'inst-a', templateId: 'tpl-1' }),
    ).toEqual({ ok: false, error: 'LOCKED' });
    expect(
      await call({ type: 'template/set-default', instanceId: 'inst-a', templateId: null }),
    ).toEqual({ ok: false, error: 'LOCKED' });
    expect(requests).toEqual([]);
  });

  it('set-default: GET /templates/{id} on this instance only; the name remembered is the one of HomeBox', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { [A.id]: { id: 'tpl-9', name: 'Ancien' } } });
    const requests = stubFetch(() => reply(200, { ...LIVRE, name: 'Livre (HomeBox)' }));
    const res = await call({
      type: 'template/set-default',
      instanceId: 'inst-b',
      templateId: 'tpl-1',
    });
    expect(res).toEqual({
      ok: true,
      value: { defaultTemplate: { id: 'tpl-1', name: 'Livre (HomeBox)' } },
    });
    expect(requests).toEqual([
      { method: 'GET', url: `${B.baseUrl}/api/v1/templates/tpl-1`, auth: `Bearer ${B.apiKey}` },
    ]);
    expect((await fakeBrowser.storage.local.get(KEY))[KEY]).toEqual({
      [A.id]: { id: 'tpl-9', name: 'Ancien' },
      [B.id]: { id: 'tpl-1', name: 'Livre (HomeBox)' },
    });
    expectNoSecret(res);
  });

  it('set-default null: the entry of this instance is erased, after getCredentials, without request', async () => {
    await fakeBrowser.storage.local.set({
      [KEY]: { [A.id]: { id: 'tpl-1', name: 'Livre' }, [B.id]: { id: 'tpl-2', name: 'Jeu' } },
    });
    const requests = stubFetch(() => reply(200, LIVRE));
    expect(
      await call({ type: 'template/set-default', instanceId: 'inst-a', templateId: null }),
    ).toEqual({ ok: true, value: { defaultTemplate: null } });
    expect(configStore.getCredentials).toHaveBeenCalledWith('inst-a');
    expect(requests).toEqual([]);
    expect((await fakeBrowser.storage.local.get(KEY))[KEY]).toEqual({
      [B.id]: { id: 'tpl-2', name: 'Jeu' },
    });
  });

  it.each<[string, () => Response]>([
    ['TEMPLATE_NOT_FOUND', () => reply(404, {})],
    ['UNAUTHORIZED', () => reply(401, {})],
    ['TEMPLATES_UNAVAILABLE', () => reply(500, {})],
    [
      'HOMEBOX_UNREACHABLE',
      () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('set-default → %s, nothing written', async (code, respond) => {
    stubFetch(respond);
    expect(
      await call({ type: 'template/set-default', instanceId: 'inst-a', templateId: 'tpl-1' }),
    ).toEqual({ ok: false, error: code });
    expect((await fakeBrowser.storage.local.get(KEY))[KEY]).toBeUndefined();
  });
});
