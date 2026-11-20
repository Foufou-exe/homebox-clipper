import { fakeBrowser } from 'wxt/testing/fake-browser';
import * as autoLock from '@/background/config/auto-lock';
import { configStore } from '@/background/config/config-store';
import { registerConfigHandlers } from '@/background/config/handlers';
import { activeImports } from '@/background/import/active-imports';
import { dispatch, setUiActivityHook } from '@/background/router';
import { A, B, PASSPHRASE, buildStore, seedStore } from '../unit/instances-fixture';

/**
 * Spec 013, Q-U3, Q-U4: automatic lock seen from the messages (A-2 to A-7, A-14, M-4, M-5).
 * `fakeBrowser` does not implement `runtime.onConnect`: fake ports are passed to onPortConnect / onPortDisconnect.
 */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const URL = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx';
const PASS = 'une phrase de passe solide';
const T0 = new Date('2026-11-18T10:00:00Z').getTime();
const MIN = 60_000;

const call = (msg: unknown) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
// ADAPTED (016): the id of the configured instance is kept to name the target of the messages.
let ID = '';
const save = async () => {
  await configStore.save({ baseUrl: URL, apiKey: KEY, passphrase: PASS }, 1_000);
  ID = (await configStore.getView()).defaultInstanceId ?? '';
};
const setPolicy = (policy: string) =>
  fakeBrowser.storage.local.set({ lockSettings: { v: 1, policy } });
const isLocked = async () => (await configStore.getView()).locked === true;
const at = (ms: number) => vi.setSystemTime(T0 + ms);

function fakePort(name = 'ui-presence', url = `${EXT}popup.html`) {
  return {
    name,
    sender: { id: fakeBrowser.runtime.id, url },
    disconnect: vi.fn(),
    onDisconnect: { addListener: vi.fn() },
  };
}

describe('automatic lock: handlers, presence port and imports (013)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    // ADAPTED (016): getCredentials now checks the origin permission (granted here, as after configuration).
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(T0);
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
      (p: string) => EXT + p.replace(/^\//, ''),
    );
    activeImports.clear();
    autoLock.resetAutoLock();
    registerConfigHandlers();
    autoLock.registerAutoLock();
  });

  afterEach(() => {
    autoLock.resetAutoLock();
    setUiActivityHook(null);
    activeImports.clear();
    vi.useRealTimers();
  });

  it('A-2: idle-15m, a message from a page every 10 min for 30 min → still unlocked (US1-3)', async () => {
    await save();
    await setPolicy('idle-15m');
    for (const minutes of [10, 20, 30]) {
      at(minutes * MIN);
      expect(await call({ type: 'config/get' })).toMatchObject({ locked: false });
    }
  });

  it('A-3: idle-1h, 61 min then config/get from the popup → locked (check before postponing)', async () => {
    await save();
    await setPolicy('idle-1h');
    at(61 * MIN);
    expect(await call({ type: 'config/get' })).toMatchObject({ locked: true });
    expect(await fakeBrowser.storage.session.get(null)).not.toHaveProperty('homeboxActivity');
  });

  it('A-4 (review T070): idle-15m, import running, +20 min: new reads refused, key kept for the import; locked by afterImport()', async () => {
    await save();
    await setPolicy('idle-15m');
    activeImports.add('import-1');
    at(20 * MIN);
    // The running import keeps the keys it captured; any new read is refused as locked.
    expect(await configStore.getCredentials(ID)).toEqual({ ok: false, error: 'LOCKED' }); // ADAPTED (016)
    await autoLock.afterImport();
    expect(await fakeBrowser.storage.session.get(null)).toHaveProperty('homeboxUnlocked');
    activeImports.clear();
    await autoLock.afterImport();
    expect(await isLocked()).toBe(true);
  });

  it('A-5: every-open, session/open → locked', async () => {
    await save();
    await setPolicy('every-open');
    expect(await call({ type: 'session/open' })).toMatchObject({ configured: true, locked: true });
  });

  it('A-5 / E2: every-open with an import running → unlocked, then locked by afterImport() if no port is open', async () => {
    await save();
    await setPolicy('every-open');
    activeImports.add('import-1');
    expect(await call({ type: 'session/open' })).toMatchObject({ locked: false });
    activeImports.clear();
    await autoLock.afterImport();
    expect(await isLocked()).toBe(true);
  });

  it('A-5: deferred lock with a page still open waits for the page to close', async () => {
    await save();
    await setPolicy('every-open');
    activeImports.add('import-1');
    await call({ type: 'session/open' });
    const port = fakePort();
    autoLock.onPortConnect(port);
    activeImports.clear();
    await autoLock.afterImport();
    expect(await isLocked()).toBe(false);
    await autoLock.onPortDisconnect(port);
    expect(await isLocked()).toBe(true);
  });

  it('A-6: every-open, presence port opened then closed → locked; two ports, one closed → unlocked', async () => {
    await save();
    await setPolicy('every-open');
    const a = fakePort();
    const b = fakePort('ui-presence', `${EXT}options.html`);
    autoLock.onPortConnect(a);
    autoLock.onPortConnect(b);
    await autoLock.onPortDisconnect(a);
    expect(await isLocked()).toBe(false);
    await autoLock.onPortDisconnect(b);
    expect(await isLocked()).toBe(true);
  });

  it('A-6: a port with another name is ignored', async () => {
    await save();
    await setPolicy('every-open');
    const other = fakePort('something-else');
    autoLock.onPortConnect(other);
    expect(other.disconnect).not.toHaveBeenCalled();
    await autoLock.onPortDisconnect(other);
    expect(await isLocked()).toBe(false);
  });

  it('A-6: closing the last page with another policy does not lock', async () => {
    await save();
    await setPolicy('idle-1h');
    const port = fakePort();
    autoLock.onPortConnect(port);
    await autoLock.onPortDisconnect(port);
    expect(await isLocked()).toBe(false);
  });

  it('A-7: presence port from a web page → disconnected, not counted', async () => {
    await save();
    await setPolicy('every-open');
    const forged = fakePort('ui-presence', 'https://www.amazon.fr/your-orders/order-details');
    autoLock.onPortConnect(forged);
    expect(forged.disconnect).toHaveBeenCalledTimes(1);
    const page = fakePort();
    autoLock.onPortConnect(page);
    await autoLock.onPortDisconnect(forged);
    expect(await isLocked()).toBe(false);
    await autoLock.onPortDisconnect(page);
    expect(await isLocked()).toBe(true);
  });

  it('registerAutoLock() listens to runtime.onConnect when available', () => {
    const add = vi.fn();
    vi.spyOn(fakeBrowser.runtime, 'onConnect', 'get').mockReturnValue({
      addListener: add,
    } as never);
    autoLock.registerAutoLock();
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('A-14: service worker restarted after the deadline → expireIfDue at start-up locks', async () => {
    await save();
    await setPolicy('idle-15m');
    at(16 * MIN);
    expect(await fakeBrowser.storage.session.get(null)).toHaveProperty('homeboxUnlocked');
    vi.resetModules();
    const background = (await import('@/entrypoints/background')).default as unknown as {
      main: () => void;
    };
    background.main();
    await vi.waitFor(async () => {
      expect(await fakeBrowser.storage.session.get(null)).not.toHaveProperty('homeboxUnlocked');
    });
  });

  it('M-4: no response of session/* or config/get contains the key, the history key or the activity timestamp', async () => {
    await save();
    await setPolicy('idle-1h');
    const responses = [
      await call({ type: 'session/open' }),
      await call({ type: 'session/get-policy' }),
      await call({ type: 'session/set-policy', policy: 'idle-15m' }),
      await call({ type: 'config/get' }),
    ];
    const historyKey = (
      (await fakeBrowser.storage.session.get('homeboxUnlocked')).homeboxUnlocked as {
        historyKey: string;
      }
    ).historyKey;
    for (const r of responses) {
      const json = JSON.stringify(r);
      expect(json).not.toContain(KEY);
      expect(json).not.toContain(historyKey);
      expect(json).not.toMatch(/"(apiKey|historyKey|passphrase)"/);
      expect(json).not.toContain(String(T0));
      expect(r).not.toHaveProperty('at');
    }
    expect(JSON.stringify(responses.slice(1, 3))).not.toContain(URL);
  });

  it('M-5: a config/get from a page calls expireIfDue before touch', async () => {
    await save();
    const order: string[] = [];
    vi.spyOn(configStore, 'expireIfDue').mockImplementation(async () => {
      order.push('expire');
      return false;
    });
    vi.spyOn(configStore, 'touch').mockImplementation(async () => {
      order.push('touch');
    });
    await call({ type: 'config/get' });
    expect(order.slice(0, 2)).toEqual(['expire', 'touch']);
  });

  it('session/set-policy without passphrase and without locking; session/get-policy gives the default', async () => {
    expect(await call({ type: 'session/get-policy' })).toEqual({ v: 1, policy: 'browser-close' });
    await save();
    expect(await call({ type: 'session/set-policy', policy: 'idle-15m' })).toEqual({
      ok: true,
      value: { v: 1, policy: 'idle-15m' },
    });
    expect(await isLocked()).toBe(false);
    expect(await call({ type: 'session/get-policy' })).toEqual({ v: 1, policy: 'idle-15m' });
  });

  it('session/set-policy: storage write failure → failed result', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    expect(await call({ type: 'session/set-policy', policy: 'idle-1h' })).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
  });

  it('two instances (016, US5-2, SC-007): after session/lock or an automatic lock, no key is left for any instance', async () => {
    await seedStore(await buildStore({ instances: [A, B] }));
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    expect(await call({ type: 'session/lock' })).toMatchObject({ locked: true, instances: [{ keyState: 'locked' }, { keyState: 'locked' }] });
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
    for (const id of [A.id, B.id]) expect(await configStore.getCredentials(id)).toEqual({ ok: false, error: 'LOCKED' });
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    await setPolicy('idle-15m');
    at(20 * MIN);
    expect(await call({ type: 'config/get' })).toMatchObject({ locked: true });
    expect(await fakeBrowser.storage.session.get(null)).not.toHaveProperty('homeboxUnlocked');
    for (const id of [A.id, B.id]) expect(await configStore.getCredentials(id)).toEqual({ ok: false, error: 'LOCKED' });
  });

  it('invariant 9: session/lock locks immediately, whatever the policy and even during an import', async () => {
    await save();
    activeImports.add('import-1');
    expect(await call({ type: 'session/lock' })).toMatchObject({ locked: true });
  });

  it('comfort timer: a single setTimeout at deadline + 1 s with a duration, none otherwise', async () => {
    await save();
    await setPolicy('idle-15m');
    await call({ type: 'config/get' });
    await call({ type: 'config/get' });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(15 * MIN + 1_000);
    await vi.waitFor(async () =>
      expect(await fakeBrowser.storage.session.get(null)).not.toHaveProperty('homeboxUnlocked'),
    );
  });

  it.each(['browser-close', 'every-open'])('comfort timer: none with %s', async (policy) => {
    await save();
    await setPolicy(policy);
    await call({ type: 'config/get' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('failure of storage.session.remove in expireIfDue: logged by code, the key is not returned', async () => {
    await save();
    await setPolicy('idle-15m');
    at(20 * MIN);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(fakeBrowser.storage.session, 'remove').mockRejectedValue(new Error('broken'));
    const response = await call({ type: 'config/get' });
    expect(response).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(warn).toHaveBeenCalledWith('[homebox-clipper] auto-lock failed', {
      endpoint: 'session/lock',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });
});
