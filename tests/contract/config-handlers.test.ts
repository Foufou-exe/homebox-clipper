import { fakeBrowser } from 'wxt/testing/fake-browser';
import { registerConfigHandlers } from '@/background/config/handlers';
import { dispatch } from '@/background/router';
import { json, mockFetch } from './fetch-mock';

const EXT = 'chrome-extension://abcdefghijklmnop/';
const URL_A = 'https://homebox.example.com';
const KEY = 'hb_secret_api_key_a1b2';
const PASS = 'une phrase de passe solide';

const call = (msg: unknown) => dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}options.html` });
const homeboxOk = () => mockFetch(json(200, { health: true, build: { version: 'v0.27.0' } }), json(200, {}));

describe('configuration handlers (passphrase)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    // The fake-browser type declares `void`; the real API returns a boolean.
    vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation((async () => true) as never);
    registerConfigHandlers();
  });

  it('rejects a passphrase that is too short', async () => {
    expect(await call({ type: 'config/save', baseUrl: URL_A, apiKey: KEY, passphrase: 'court' })).toEqual({
      ok: false,
      error: 'WEAK_PASSPHRASE',
    });
  });

  it('saves an encrypted key, then allows locking and unlocking', async () => {
    vi.stubGlobal('fetch', homeboxOk().fetch);
    const saved = await call({ type: 'config/save', baseUrl: URL_A, apiKey: KEY, passphrase: PASS });
    expect(saved).toMatchObject({ ok: true, value: { configured: true, locked: false } });
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).not.toContain(KEY);

    expect(await call({ type: 'session/lock' })).toMatchObject({ locked: true });
    expect(await call({ type: 'config/test' })).toEqual({ ok: false, error: 'LOCKED' });
    expect(await call({ type: 'session/unlock', passphrase: 'mauvaise phrase' })).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
    expect(await call({ type: 'session/unlock', passphrase: PASS })).toMatchObject({ ok: true, value: { locked: false } });
  }, 20_000);

  it("changing the URL while keeping the key requires the right passphrase", async () => {
    vi.stubGlobal('fetch', homeboxOk().fetch);
    await call({ type: 'config/save', baseUrl: URL_A, apiKey: KEY, passphrase: PASS });

    const wrong = await call({ type: 'config/save', baseUrl: 'https://autre.example.com', apiKey: '', passphrase: 'mauvaise phrase' });
    expect(wrong).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });

    const m = homeboxOk();
    vi.stubGlobal('fetch', m.fetch);
    const moved = await call({ type: 'config/save', baseUrl: 'https://autre.example.com', apiKey: '', passphrase: PASS });
    expect(moved).toMatchObject({ ok: true, value: { baseUrl: 'https://autre.example.com' } });
    expect(m.calls[1]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
  }, 30_000);
});

describe('configuration handlers with the instances view (016, T011)', () => {
  const view = { type: 'config/get' };
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation((async () => true) as never);
    registerConfigHandlers();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('config/get, session/open, session/lock, session/unlock: one instance, its keyState and the default id', async () => {
    expect(await call(view)).toEqual({ configured: false });
    vi.stubGlobal('fetch', homeboxOk().fetch);
    await call({ type: 'config/save', baseUrl: URL_A, apiKey: KEY, passphrase: PASS });
    const got = (await call(view)) as { instances: Array<{ id: string; keyState: string }>; defaultInstanceId: string };
    expect(got.instances).toHaveLength(1);
    expect(got.instances[0]).toMatchObject({ name: 'homebox.example.com', baseUrl: URL_A, maskedKey: 'hb_••••a1b2', keyState: 'ready' });
    expect(got.defaultInstanceId).toBe(got.instances[0]!.id);
    expect(await call({ type: 'session/open' })).toMatchObject({ defaultInstanceId: got.defaultInstanceId, maxInstances: 10 });
    expect(await call({ type: 'session/lock' })).toMatchObject({ locked: true, instances: [{ keyState: 'locked' }] });
    expect(await call({ type: 'session/unlock', passphrase: PASS })).toMatchObject({
      ok: true,
      value: { locked: false, instances: [{ id: got.defaultInstanceId, keyState: 'ready' }] },
    });
    expect(JSON.stringify(await call(view))).not.toContain(KEY);
  });

  it('config/save on a single instance keeps its id (updates instances[0], never a second instance)', async () => {
    vi.stubGlobal('fetch', homeboxOk().fetch);
    await call({ type: 'config/save', baseUrl: URL_A, apiKey: KEY, passphrase: PASS });
    const first = ((await call(view)) as { defaultInstanceId: string }).defaultInstanceId;
    vi.stubGlobal('fetch', homeboxOk().fetch);
    const saved = (await call({ type: 'config/save', baseUrl: `${URL_A}/sub`, apiKey: '', passphrase: PASS })) as {
      ok: boolean;
      value: { instances: Array<{ id: string; baseUrl: string; lastCheck: unknown }> };
    };
    expect(saved.ok).toBe(true);
    expect(saved.value.instances).toEqual([expect.objectContaining({ id: first, baseUrl: `${URL_A}/sub`, lastCheck: expect.objectContaining({ status: 'ok' }) })]);
  });

  it('config/test contacts only this instance and records its lastCheck', async () => {
    vi.stubGlobal('fetch', homeboxOk().fetch);
    await call({ type: 'config/save', baseUrl: URL_A, apiKey: KEY, passphrase: PASS });
    const m = homeboxOk();
    vi.stubGlobal('fetch', m.fetch);
    const res = (await call({ type: 'config/test' })) as { ok: boolean; value: { instances: Array<{ lastCheck: unknown }> } };
    expect(res).toMatchObject({ ok: true });
    expect(m.calls.every((c) => c.url.startsWith(`${URL_A}/`))).toBe(true);
    expect(m.calls).toHaveLength(2);
    for (const c of m.calls) expect([null, `Bearer ${KEY}`]).toContain(c.headers.get('Authorization'));
    expect(res.value.instances[0]!.lastCheck).toMatchObject({ status: 'ok', version: expect.any(String) });
  });
});
