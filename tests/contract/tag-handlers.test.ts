import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { dispatch } from '@/background/router';
import { registerTagHandlers } from '@/background/tags/handlers';
import { fail, ok } from '@/shared/errors';

/** `tag/list` handler (spec 014, Q-C3, contracts/runtime-messages.md). Fictitious values only. */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const ORIGIN = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx';
const call = () => dispatch({ type: 'tag/list' }, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

describe('tag/list handler (read-only)', () => {
  let debug: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(ok({ baseUrl: ORIGIN, apiKey: KEY }));
    debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerTagHandlers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('success → only id and name; neither address nor key; one GET to the instance', async () => {
    const requests = stubFetch(() =>
      reply(200, [
        { id: 't1', name: 'Amazon', color: 'red', icon: 'box' },
        { id: 't2', name: 'Informatique', description: 'x' },
      ]),
    );
    const res = await call();
    expect(res).toEqual({
      ok: true,
      value: {
        tags: [
          { id: 't1', name: 'Amazon' },
          { id: 't2', name: 'Informatique' },
        ],
      },
    });
    expect(requests).toEqual([{ method: 'GET', url: `${ORIGIN}/api/v1/tags` }]);
    const text = JSON.stringify(res);
    expect(text).not.toContain(ORIGIN);
    expect(text).not.toContain(KEY);
  });

  it('logs: only the client template, never a tag name', async () => {
    stubFetch(() => reply(200, [{ id: 't1', name: 'Amazon' }]));
    await call();
    const calls = [...debug.mock.calls, ...warn.mock.calls];
    expect(calls.map((c) => (c[1] as { endpoint: string }).endpoint)).toEqual(['GET /tags']);
    expect(JSON.stringify(calls)).not.toMatch(/Amazon|hb_/);
  });

  it.each(['LOCKED', 'NOT_CONFIGURED'] as const)('%s: error returned without any request', async (code) => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail(code));
    const requests = stubFetch(() => reply(200, []));
    expect(await call()).toEqual({ ok: false, error: code });
    expect(requests).toEqual([]);
  });

  it('401 → UNAUTHORIZED', async () => {
    stubFetch(() => reply(401, {}));
    expect(await call()).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('network → HOMEBOX_UNREACHABLE', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await call()).toMatchObject({ ok: false, error: 'HOMEBOX_UNREACHABLE' });
  });

  it.each([
    ['HTML', () => new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })],
    ['not an array', () => reply(200, { tags: [] })],
    ['500', () => reply(500, {})],
  ])('unreadable response (%s) → TAGS_UNAVAILABLE', async (_label, respond) => {
    stubFetch(respond);
    expect(await call()).toMatchObject({ ok: false, error: 'TAGS_UNAVAILABLE' });
  });
});
