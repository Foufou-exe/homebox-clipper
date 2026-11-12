import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { dispatch, register, startRouter } from '@/background/router';

const BASE = 'chrome-extension://abcdefghijklmnop/';

describe('router — message origin', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((path: string) => BASE + path.replace(/^\//, ''));
    register('config/get', async () => ({ configured: false }));
  });

  const id = () => fakeBrowser.runtime.id;

  it('accepts the popup (no tab)', async () => {
    expect(await dispatch({ type: 'config/get' }, { id: id(), url: `${BASE}popup.html` })).toEqual({
      configured: false,
    });
  });

  it("accepts the options page opened in a tab", async () => {
    const sender = { id: id(), url: `${BASE}options.html`, tab: { id: 12 } };
    expect(await dispatch({ type: 'config/get' }, sender)).toEqual({ configured: false });
  });

  it('rejects a config/* message coming from the script injected on amazon.fr', async () => {
    const sender = { id: id(), url: 'https://www.amazon.fr/your-orders/order-details', tab: { id: 12 } };
    expect(await dispatch({ type: 'config/get' }, sender)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
  });

  it('rejects a sender without a URL', async () => {
    expect(await dispatch({ type: 'config/get' }, { id: id() })).toEqual({ ok: false, error: 'BAD_MESSAGE' });
  });

  it('rejects another extension', async () => {
    expect(await dispatch({ type: 'config/get' }, { id: 'autre', url: `${BASE}popup.html` })).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
  });

  it('rejects a malformed message', async () => {
    expect(await dispatch({ type: 'config/save', baseUrl: 1 }, { id: id(), url: `${BASE}options.html` })).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
  });

  describe('import/start: shape of drafts[].photo (T043)', () => {
    const sender = () => ({ id: id(), url: `${BASE}popup.html` });
    const start = (photo: unknown) => ({
      type: 'import/start',
      tabId: 1,
      manualFiles: [],
      drafts: [{ name: 'x', photo }],
    });

    beforeEach(() => register('import/start', async () => ({ ok: true, value: [] })));

    it.each([
      ['null', null],
      ['absente', undefined],
      ['well-formed', { url: 'https://m.media-amazon.com/images/I/x.jpg', merchantId: 'amazon.fr', include: true }],
    ])('accepts a photo: %s', async (_label, photo) => {
      expect(await dispatch(start(photo), sender())).toEqual({ ok: true, value: [] });
    });

    it.each([
      ['missing url', { merchantId: 'amazon.fr', include: true }],
      ['non-string url', { url: 3, merchantId: 'amazon.fr', include: true }],
      ['merchantId absent', { url: 'https://x', include: true }],
      ['non-boolean include', { url: 'https://x', merchantId: 'amazon.fr', include: 'oui' }],
      ['string instead of an object', 'https://x'],
    ])('rejects a malformed photo: %s', async (_label, photo) => {
      expect(await dispatch(start(photo), sender())).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    });

    it('rejects a draft that is not an object', async () => {
      expect(await dispatch({ type: 'import/start', tabId: 1, manualFiles: [], drafts: [42] }, sender())).toEqual({
        ok: false,
        error: 'BAD_MESSAGE',
      });
    });
  });
  describe('emplacements (US2)', () => {
    const sender = () => ({ id: id(), url: `${BASE}popup.html` });
    const web = () => ({ id: id(), url: 'https://www.amazon.fr/your-orders/order-details', tab: { id: 12 } });
    const good = { id: 'l1', path: ['Maison', 'Garage'] };

    beforeEach(() => {
      register('location/list', async () => ({ ok: true, value: { locations: [], lastUsedId: null } }));
      register('import/start', async () => ({ ok: true, value: [] }));
      register('import/retry', async () => ({ ok: true, value: {} as never }));
    });

    it('location/list from the popup: accepted', async () => {
      expect(await dispatch({ type: 'location/list' }, sender())).toEqual({
        ok: true,
        value: { locations: [], lastUsedId: null },
      });
    });

    it('location/list from an injected script: BAD_MESSAGE (scenario 25, principle I)', async () => {
      expect(await dispatch({ type: 'location/list' }, web())).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    });

    const start = (extra: Record<string, unknown>) => ({ type: 'import/start', tabId: 1, manualFiles: [], drafts: [], ...extra });

    it.each([undefined, null, 'loc-1'])('import/start accepts orderLocationId = %s', async (orderLocationId) => {
      expect(await dispatch(start({ orderLocationId }), sender())).toEqual({ ok: true, value: [] });
    });

    it.each([3, {}, ['x'], true])('import/start rejects orderLocationId = %j', async (orderLocationId) => {
      expect(await dispatch(start({ orderLocationId }), sender())).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    });

    it('import/start rejects a malformed drafts[].location and accepts a well-formed choice or null', async () => {
      const withLoc = (location: unknown) => start({ drafts: [{ name: 'x', location }] });
      expect(await dispatch(withLoc(good), sender())).toEqual({ ok: true, value: [] });
      expect(await dispatch(withLoc(null), sender())).toEqual({ ok: true, value: [] });
      for (const bad of ['l1', { id: 3, path: [] }, { id: 'l1' }, { id: 'l1', path: 'Maison' }, { id: 'l1', path: [1] }]) {
        expect(await dispatch(withLoc(bad), sender()), JSON.stringify(bad)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
      }
    });

    const retry = (extra: Record<string, unknown>) => ({ type: 'import/retry', pendingId: 'p1', ...extra });

    it.each([undefined, null, good])('import/retry accepts location = %j', async (location) => {
      expect(await dispatch(retry({ location }), sender())).toMatchObject({ ok: true });
    });

    it.each(['l1', 3, {}, { id: 3, path: [] }, { id: 'l1', path: 'Maison' }])(
      'import/retry rejects location = %j',
      async (location) => {
        expect(await dispatch(retry({ location }), sender())).toEqual({ ok: false, error: 'BAD_MESSAGE' });
      },
    );
  });
});

describe('router — runtime.onMessage listener (contracts/runtime-messages.md)', () => {
  type Listener = (raw: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined;
  let listener: Listener;
  const handler = vi.fn(async () => ({ configured: false }));

  beforeEach(() => {
    fakeBrowser.reset();
    handler.mockClear();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((path: string) => BASE + path.replace(/^\//, ''));
    const add = vi.spyOn(fakeBrowser.runtime.onMessage, 'addListener');
    register('config/get', handler);
    startRouter();
    listener = add.mock.calls[0]![0] as unknown as Listener;
  });

  const call = async (raw: unknown, sender: unknown) => {
    const sendResponse = vi.fn();
    const keepOpen = listener(raw, sender, sendResponse);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    return { keepOpen, response: sendResponse.mock.calls[0]![0] };
  };

  it('a malformed message gets BAD_MESSAGE, without running a handler', async () => {
    const ok = { id: fakeBrowser.runtime.id, url: `${BASE}popup.html` };
    for (const raw of [{ type: 'config/save', baseUrl: 1 }, { nimporte: 'quoi' }, 'texte', null]) {
      const r = await call(raw, ok);
      expect(r.keepOpen).toBe(false);
      expect(r.response).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('a well-formed message coming from the injected script is still rejected', async () => {
    const r = await call({ type: 'config/get' }, { id: fakeBrowser.runtime.id, url: 'https://www.amazon.fr/x', tab: { id: 1 } });
    expect(r.response).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('a valid message from the extension page reaches the handler', async () => {
    const r = await call({ type: 'config/get' }, { id: fakeBrowser.runtime.id, url: `${BASE}popup.html` });
    expect(r.response).toEqual({ configured: false });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('router — history/* reserved to extension pages (012, T013)', () => {
  const MESSAGES = [
    { type: 'history/list' },
    { type: 'history/delete', id: 'a' },
    { type: 'history/clear' },
    { type: 'history/set-enabled', enabled: false },
  ] as const;
  const handler = vi.fn(async () => ({ ok: true, value: undefined }));
  const id = () => fakeBrowser.runtime.id;

  beforeEach(() => {
    fakeBrowser.reset();
    handler.mockClear();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((path: string) => BASE + path.replace(/^\//, ''));
    for (const m of MESSAGES) register(m.type, handler as never);
  });

  it.each(MESSAGES)('$type forged by the script injected on amazon.fr: BAD_MESSAGE, handler not called', async (msg) => {
    const sender = { id: id(), url: 'https://www.amazon.fr/your-orders/order-details', tab: { id: 12 } };
    expect(await dispatch(msg, sender)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(MESSAGES)('$type accepted from the popup and from the options page', async (msg) => {
    expect(await dispatch(msg, { id: id(), url: `${BASE}popup.html` })).toEqual({ ok: true, value: undefined });
    expect(await dispatch(msg, { id: id(), url: `${BASE}options.html`, tab: { id: 3 } })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("source: 'history/' is in UI_ONLY_PREFIXES", () => {
    const source = readFileSync(resolve(__dirname, '../../src/background/router.ts'), 'utf8');
    const line = source.split('\n').find((l) => l.includes('UI_ONLY_PREFIXES ='));
    expect(line).toContain("'history/'");
  });

  it.each([
    [{ type: 'history/delete' }],
    [{ type: 'history/delete', id: 3 }],
    [{ type: 'history/set-enabled' }],
    [{ type: 'history/set-enabled', enabled: 'false' }],
  ])('validators: %j is refused', async (msg) => {
    expect(await dispatch(msg, { id: id(), url: `${BASE}popup.html` })).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(handler).not.toHaveBeenCalled();
  });
});
