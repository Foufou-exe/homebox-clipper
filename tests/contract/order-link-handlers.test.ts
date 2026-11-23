import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ORDER_LINK_KEY, instanceStore } from '@/background/config/instance-store';
import { registerOrderLinkHandlers } from '@/background/order-link/handlers';
import { dispatch } from '@/background/router';
import { A, B, buildStore, seedStore } from '../unit/instances-fixture';

/** `order-link/*` handlers (spec 025, contracts/runtime-messages.md §1, contracts/storage.md). Fictitious values only. */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const KEY = 'orderLinkByInstance';
const call = (msg: Record<string, unknown>) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}options.html` });
const stored = async () => (await fakeBrowser.storage.local.get(KEY))[KEY];

beforeEach(async () => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
    (p: string) => EXT + p.replace(/^\//, ''),
  );
  await seedStore(await buildStore({ instances: [A, B] }));
  registerOrderLinkHandlers();
});
afterEach(() => vi.restoreAllMocks());

describe('order-link/get and order-link/set (spec 025)', () => {
  it('L1: get returns the default (off) when nothing is stored', async () => {
    expect(await call({ type: 'order-link/get', instanceId: 'inst-a' })).toEqual({
      ok: true,
      value: { settings: { enabled: false } },
    });
  });

  it('L2: set then get, per instance', async () => {
    const res = await call({
      type: 'order-link/set',
      instanceId: 'inst-a',
      settings: { enabled: true },
    });
    expect(res).toEqual({ ok: true, value: { settings: { enabled: true } } });
    expect(await stored()).toEqual({ 'inst-a': { enabled: true } });
    expect(await call({ type: 'order-link/get', instanceId: 'inst-b' })).toEqual({
      ok: true,
      value: { settings: { enabled: false } },
    });
  });

  it('L3: an unknown instance is refused and nothing is written', async () => {
    expect(await call({ type: 'order-link/get', instanceId: 'inst-x' })).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
    expect(
      await call({ type: 'order-link/set', instanceId: 'inst-x', settings: { enabled: true } }),
    ).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
    expect(await stored()).toBeUndefined();
  });

  it('L4: a corrupted entry gives the default', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { 'inst-a': { enabled: 'yes' }, 'inst-b': 42 } });
    expect(await call({ type: 'order-link/get', instanceId: 'inst-a' })).toEqual({
      ok: true,
      value: { settings: { enabled: false } },
    });
  });

  it('L5: invalid payloads are refused by validation', async () => {
    for (const msg of [
      { type: 'order-link/get' },
      { type: 'order-link/set', instanceId: 'inst-a', settings: { enabled: 'yes' } },
      { type: 'order-link/set', instanceId: 'inst-a', settings: { enabled: true, extra: 1 } },
    ])
      expect(await call(msg)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
  });

  it('L6: reserved to extension pages (a content script is refused)', async () => {
    const res = await dispatch(
      { type: 'order-link/set', instanceId: 'inst-a', settings: { enabled: true } },
      { id: fakeBrowser.runtime.id, url: 'https://www.amazon.example/' },
    );
    expect(res).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(await stored()).toBeUndefined();
  });
});

describe('storage lifecycle (spec 025, FR-002)', () => {
  it('L7: the key is orderLinkByInstance', () => {
    expect(ORDER_LINK_KEY).toBe(KEY);
  });

  it('L8: instanceStore.remove purges only the removed instance entry', async () => {
    await fakeBrowser.storage.local.set({
      [KEY]: { 'inst-a': { enabled: true }, 'inst-b': { enabled: true } },
    });
    expect((await instanceStore.remove('inst-b'))?.id).toBe('inst-b');
    expect(await stored()).toEqual({ 'inst-a': { enabled: true } });
  });

  it('L9: instanceStore.clear removes the key', async () => {
    await fakeBrowser.storage.local.set({ [KEY]: { 'inst-a': { enabled: true } } });
    await instanceStore.clear();
    expect(await stored()).toBeUndefined();
  });
});
