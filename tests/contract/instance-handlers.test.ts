import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { registerConfigHandlers } from '@/background/config/handlers';
import { deriveVaultKey, openApiKeyWith } from '@/background/config/vault-crypto';
import { dispatch } from '@/background/router';
import { activeTargets } from '@/background/import/active-imports';
import { pendingStore } from '@/background/import/pending-store';
import { historyStore } from '@/background/history/history-store';
import * as logger from '@/shared/logger';
import type { ConfigView, InstancesStore } from '@/shared/types';
import { A, B, PASSPHRASE, buildStore, seedStore } from '../unit/instances-fixture';
import { json, mockFetch, networkError } from './fetch-mock';

/**
 * Spec 016, delivery B, Q-C1: instance management messages (contracts/runtime-messages.md, permissions.md).
 * Fictitious values only. Part "add" (US2, T057).
 */

const EXT = 'chrome-extension://abcdefghijklmnop/';
const page = { url: `${EXT}options.html` };
const call = (msg: unknown) => dispatch(msg, { id: fakeBrowser.runtime.id, ...page });
const homeboxOk = () =>
  mockFetch(json(200, { health: true, build: { version: 'v0.27.0' } }), json(200, {}));
const stored = async () =>
  (await fakeBrowser.storage.local.get('homeboxInstances')).homeboxInstances as
    InstancesStore | undefined;
const snapshot = async () => JSON.stringify(await fakeBrowser.storage.local.get(null));
const add = (over: Record<string, unknown> = {}) => ({
  type: 'instance/add',
  baseUrl: B.baseUrl,
  apiKey: B.apiKey,
  name: '',
  passphrase: PASSPHRASE,
  newPassphrase: false,
  ...over,
});
type Ok = { ok: true; value: ConfigView };

describe('instance/add (016, US2, Q-C1, T057)', () => {
  let contains: ReturnType<typeof vi.spyOn>;
  let remove: ReturnType<typeof vi.spyOn>;
  let request: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
      (p: string) => EXT + p.replace(/^\//, ''),
    );
    // The fake-browser type declares `void`; the real API returns a boolean.
    contains = vi
      .spyOn(fakeBrowser.permissions, 'contains')
      .mockImplementation((async () => true) as never);
    remove = vi
      .spyOn(fakeBrowser.permissions, 'remove')
      .mockImplementation((async () => true) as never);
    request = vi
      .spyOn(fakeBrowser.permissions, 'request')
      .mockImplementation((async () => true) as never);
    registerConfigHandlers();
  });
  afterEach(() => vi.unstubAllGlobals());

  const seedA = async (historyKey = true) =>
    seedStore(
      await buildStore({
        instances: [A],
        ...(historyKey ? { historyKey: crypto.getRandomValues(new Uint8Array(32)) } : {}),
      }),
    );

  it('(a) with A configured: B sealed with its own address, a single set, added last, full unlock, lastCheck', async () => {
    await seedA();
    const m = homeboxOk();
    vi.stubGlobal('fetch', m.fetch);
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    const res = (await call(add())) as Ok;
    expect(res.ok).toBe(true);
    expect(set.mock.calls.filter(([items]) => 'homeboxInstances' in items)).toHaveLength(1);
    const store = (await stored())!;
    expect(store.instances.map((i) => i.baseUrl)).toEqual([A.baseUrl, B.baseUrl]);
    const added = store.instances[1]!;
    expect(added.lastCheck).toMatchObject({ status: 'ok', version: expect.any(String) });
    const key = await deriveVaultKey(PASSPHRASE, store.vault!);
    expect(await openApiKeyWith(key, added.key!, B.baseUrl)).toBe(B.apiKey);
    expect(await openApiKeyWith(key, added.key!, A.baseUrl)).toBeNull();
    // Only B was contacted by the connection test.
    expect(m.calls).toHaveLength(2);
    expect(m.calls.every((c) => c.url.startsWith(`${B.baseUrl}/`))).toBe(true);
    // A and B are both usable: one unlock for all.
    expect(res.value.instances!.map((i) => i.keyState)).toEqual(['ready', 'ready']);
    expect(await configStore.getCredentials(A.id)).toMatchObject({
      ok: true,
      value: { apiKey: A.apiKey },
    });
    expect(await configStore.getCredentials(added.id)).toMatchObject({
      ok: true,
      value: { apiKey: B.apiKey },
    });
    expect(JSON.stringify(res)).not.toContain(B.apiKey);
  });

  it('(b) unlocked: the passphrase is still required; empty → WEAK_PASSPHRASE, wrong → WRONG_PASSPHRASE, nothing written', async () => {
    await seedA();
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    const before = await snapshot();
    vi.stubGlobal('fetch', mockFetch().fetch);
    expect(await call(add({ passphrase: '' }))).toEqual({ ok: false, error: 'WEAK_PASSPHRASE' });
    expect(await call(add({ passphrase: 'mauvaise phrase de test' }))).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
    expect(await snapshot()).toBe(before);
  });

  it('(b) after an add, storage.session only holds homeboxUnlocked { v, keys, historyKey } and the activity', async () => {
    await seedA();
    await configStore.unlock(PASSPHRASE);
    vi.stubGlobal('fetch', homeboxOk().fetch);
    expect(await call(add())).toMatchObject({ ok: true });
    const session = await fakeBrowser.storage.session.get(null);
    expect(Object.keys(session).sort()).toEqual(['homeboxActivity', 'homeboxUnlocked']);
    expect(Object.keys(session.homeboxUnlocked as object).sort()).toEqual([
      'historyKey',
      'keys',
      'v',
    ]);
    for (const value of Object.values(
      (session.homeboxUnlocked as { keys: Record<string, unknown> }).keys,
    )) {
      expect(typeof value).toBe('string');
    }
  });

  it('(c) locked + wrong passphrase: WRONG_PASSPHRASE, nothing saved, no network', async () => {
    await seedA();
    const before = await snapshot();
    const m = mockFetch();
    vi.stubGlobal('fetch', m.fetch);
    expect(await call(add({ passphrase: 'mauvaise phrase de test' }))).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
    expect(await snapshot()).toBe(before);
    expect(m.calls).toHaveLength(0);
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
  });

  it('(d) name: empty → host; collision → "(2)"; > 50 → INSTANCE_NAME_INVALID; taken (case ignored) → INSTANCE_NAME_TAKEN', async () => {
    await seedStore(await buildStore({ instances: [{ ...A, name: 'inventaire.example.org' }] }));
    vi.stubGlobal('fetch', homeboxOk().fetch);
    expect(await call(add({ name: 'x'.repeat(51) }))).toEqual({
      ok: false,
      error: 'INSTANCE_NAME_INVALID',
    });
    expect(await call(add({ name: '  INVENTAIRE.example.ORG ' }))).toEqual({
      ok: false,
      error: 'INSTANCE_NAME_TAKEN',
    });
    expect(await call(add({ name: '   ' }))).toMatchObject({ ok: true });
    expect((await stored())!.instances.map((i) => i.name)).toEqual([
      'inventaire.example.org',
      'inventaire.example.org (2)',
    ]);
  });

  it('(d) name: empty without collision → host; typed name trimmed', async () => {
    await seedA();
    vi.stubGlobal('fetch', homeboxOk().fetch);
    expect(await call(add())).toMatchObject({ ok: true });
    vi.stubGlobal('fetch', homeboxOk().fetch);
    expect(
      await call(
        add({ baseUrl: 'https://autre.example.net', apiKey: 'hb_cccccccc', name: '  Bureau  ' }),
      ),
    ).toMatchObject({ ok: true });
    expect((await stored())!.instances.map((i) => i.name)).toEqual([
      'Maison',
      'inventaire.example.org',
      'Bureau',
    ]);
  });

  it('(e) INSTANCE_EXISTS for the same address after normalisation', async () => {
    await seedA();
    const m = mockFetch();
    vi.stubGlobal('fetch', m.fetch);
    for (const baseUrl of [
      'https://HOMEBOX.example.com/',
      'https://homebox.example.com:443',
      'https://homebox.example.com/api',
    ]) {
      expect(await call(add({ baseUrl }))).toEqual({ ok: false, error: 'INSTANCE_EXISTS' });
    }
    expect(m.calls).toHaveLength(0);
    expect((await stored())!.instances).toHaveLength(1);
  });

  it('(f) INSTANCE_LIMIT with 10 instances', async () => {
    const seeds = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`,
      name: `n${i}`,
      baseUrl: `https://h${i}.example.com`,
      apiKey: `hb_key_${i}_xxxxxx`,
    }));
    await seedStore(await buildStore({ instances: seeds }));
    vi.stubGlobal('fetch', mockFetch().fetch);
    expect(await call(add())).toEqual({ ok: false, error: 'INSTANCE_LIMIT' });
    expect((await stored())!.instances).toHaveLength(10);
  });

  it('(g) http:// towards a public host → INSECURE_URL; http://localhost:3101 accepted', async () => {
    await seedA();
    vi.stubGlobal('fetch', mockFetch().fetch);
    expect(await call(add({ baseUrl: 'http://inventaire.example.org' }))).toEqual({
      ok: false,
      error: 'INSECURE_URL',
    });
    const m = homeboxOk();
    vi.stubGlobal('fetch', m.fetch);
    expect(await call(add({ baseUrl: 'http://localhost:3101' }))).toMatchObject({ ok: true });
    expect(m.calls.every((c) => c.url.startsWith('http://localhost:3101/'))).toBe(true);
    expect((await stored())!.instances[1]).toMatchObject({
      baseUrl: 'http://localhost:3101',
      name: 'localhost:3101',
    });
  });

  it('(h) origin not granted → PERMISSION_DENIED, nothing saved, no network', async () => {
    await seedA();
    contains.mockImplementation((async () => false) as never);
    const before = await snapshot();
    const m = mockFetch();
    vi.stubGlobal('fetch', m.fetch);
    expect(await call(add())).toEqual({ ok: false, error: 'PERMISSION_DENIED' });
    expect(await snapshot()).toBe(before);
    expect(m.calls).toHaveLength(0);
  });

  it.each([
    ['500', () => mockFetch(json(500, {}))],
    [
      '401 on the auth check',
      () => mockFetch(json(200, { health: true, build: { version: 'v0.27.0' } }), json(401, {})),
    ],
    ['network down', () => mockFetch(networkError())],
  ])(
    '(i) connection test failed (%s): the instance is saved anyway with an error lastCheck, the answer fails',
    async (_n, make) => {
      await seedA();
      vi.stubGlobal('fetch', make().fetch);
      const res = (await call(add())) as { ok: false; error: string };
      expect(res.ok).toBe(false);
      const store = (await stored())!;
      expect(store.instances).toHaveLength(2);
      expect(store.instances[1]!.lastCheck).toMatchObject({ status: 'error', code: res.error });
      // The key is stored (encrypted) and usable: the user can retest later.
      expect(await configStore.getCredentials(store.instances[1]!.id)).toMatchObject({
        ok: true,
        value: { apiKey: B.apiKey },
      });
    },
  );

  it('(j) a refusal after the permission was granted releases the origin only if no instance uses it', async () => {
    await seedA();
    vi.stubGlobal('fetch', mockFetch().fetch);
    // New origin, wrong passphrase: released.
    expect(await call(add({ passphrase: 'mauvaise phrase de test' }))).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
    expect(remove).toHaveBeenCalledWith({ origins: ['https://inventaire.example.org/*'] });
    remove.mockClear();
    // Same origin as A (other path), refused: A still uses the origin, kept.
    expect(
      await call(
        add({
          baseUrl: 'https://homebox.example.com/second',
          passphrase: 'mauvaise phrase de test',
        }),
      ),
    ).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
    expect(await call(add({ baseUrl: 'https://homebox.example.com/' }))).toEqual({
      ok: false,
      error: 'INSTANCE_EXISTS',
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('(j) INSTANCE_LIMIT after the permission was granted: the new origin is released', async () => {
    const seeds = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`,
      name: `n${i}`,
      baseUrl: `https://h${i}.example.com`,
      apiKey: `hb_key_${i}_xxxxxx`,
    }));
    await seedStore(await buildStore({ instances: seeds }));
    expect(await call(add())).toEqual({ ok: false, error: 'INSTANCE_LIMIT' });
    expect(remove).toHaveBeenCalledWith({ origins: ['https://inventaire.example.org/*'] });
  });

  it('(k) first installation (newPassphrase: true): vault created, passphrase ≥ 10 characters', async () => {
    vi.stubGlobal('fetch', mockFetch().fetch);
    expect(
      await call(
        add({ baseUrl: A.baseUrl, apiKey: A.apiKey, newPassphrase: true, passphrase: 'court' }),
      ),
    ).toEqual({
      ok: false,
      error: 'WEAK_PASSPHRASE',
    });
    vi.stubGlobal('fetch', homeboxOk().fetch);
    const res = (await call(
      add({ baseUrl: A.baseUrl, apiKey: A.apiKey, newPassphrase: true, name: 'Maison' }),
    )) as Ok;
    expect(res).toMatchObject({
      ok: true,
      value: { configured: true, locked: false, needsPassphrase: false },
    });
    expect(res.value.instances).toEqual([
      expect.objectContaining({ name: 'Maison', baseUrl: A.baseUrl, keyState: 'ready' }),
    ]);
    await configStore.lock();
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    expect(await configStore.getHistoryKey()).toHaveLength(32);
  }, 30_000);

  it('(k) newPassphrase: true with an existing vault → WRONG_PASSPHRASE, nothing written', async () => {
    await seedA();
    const before = await snapshot();
    vi.stubGlobal('fetch', mockFetch().fetch);
    expect(await call(add({ newPassphrase: true }))).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
    expect(await snapshot()).toBe(before);
  });

  it('(l) legacy key (vault null, key in session): newPassphrase creates the vault and seals both keys in the same set', async () => {
    await fakeBrowser.storage.local.set({
      homeboxInstances: {
        v: 1,
        vault: null,
        instances: [
          {
            id: 'migrated',
            name: 'homebox.example.com',
            baseUrl: A.baseUrl,
            key: null,
            maskedKey: 'hb_••••xxxx',
            lastCheck: null,
          },
        ],
      },
    });
    await fakeBrowser.storage.session.set({
      homeboxUnlocked: { v: 2, keys: { migrated: A.apiKey } },
    });
    vi.stubGlobal('fetch', homeboxOk().fetch);
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    expect(await call(add({ newPassphrase: true }))).toMatchObject({ ok: true });
    expect(set.mock.calls.filter(([items]) => 'homeboxInstances' in items)).toHaveLength(1);
    const store = (await stored())!;
    expect(store.vault).not.toBeNull();
    const key = await deriveVaultKey(PASSPHRASE, store.vault!);
    expect(await openApiKeyWith(key, store.instances[0]!.key!, A.baseUrl)).toBe(A.apiKey);
    expect(await openApiKeyWith(key, store.instances[1]!.key!, B.baseUrl)).toBe(B.apiKey);
    await configStore.lock();
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    expect(await configStore.getCredentials('migrated')).toMatchObject({
      ok: true,
      value: { apiKey: A.apiKey },
    });
  }, 30_000);

  it('(l) legacy key lost from the session → NOT_CONFIGURED, nothing written', async () => {
    await fakeBrowser.storage.local.set({
      homeboxInstances: {
        v: 1,
        vault: null,
        instances: [
          {
            id: 'migrated',
            name: 'homebox.example.com',
            baseUrl: A.baseUrl,
            key: null,
            maskedKey: 'hb_••••xxxx',
            lastCheck: null,
          },
        ],
      },
    });
    const before = await snapshot();
    vi.stubGlobal('fetch', mockFetch().fetch);
    expect(await call(add({ newPassphrase: true }))).toEqual({
      ok: false,
      error: 'NOT_CONFIGURED',
    });
    expect(await snapshot()).toBe(before);
  });

  it('(m) the existing history entries are attached to their instance (the passphrase opens the history key)', async () => {
    await seedA();
    const attach = vi.spyOn(
      (await import('@/background/history/history-store')).historyStore,
      'attach',
    );
    vi.stubGlobal('fetch', homeboxOk().fetch);
    expect(await call(add())).toMatchObject({ ok: true });
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach.mock.calls[0]![1].map((i) => i.baseUrl)).toEqual([A.baseUrl, B.baseUrl]);
  });

  it('(n) the service worker never calls permissions.request', async () => {
    await seedA();
    vi.stubGlobal('fetch', homeboxOk().fetch);
    await call(add());
    await call(
      add({ baseUrl: 'https://autre.example.net', passphrase: 'mauvaise phrase de test' }),
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('(o) instance/add from the script injected in a merchant page → BAD_MESSAGE, nothing written', async () => {
    await seedA();
    const before = await snapshot();
    const web = {
      id: fakeBrowser.runtime.id,
      url: 'https://www.amazon.fr/your-orders/order-details',
      tab: { id: 3 },
    };
    expect(await dispatch(add(), web)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(await snapshot()).toBe(before);
  });

  it('logs: no address, name, instance id, key or passphrase, on success and on each refusal (FR-030)', async () => {
    const log = vi.spyOn(logger, 'log');
    const logError = vi.spyOn(logger, 'logError');
    await seedA();
    vi.stubGlobal('fetch', homeboxOk().fetch);
    await call(add({ name: 'Atelier' }));
    vi.stubGlobal('fetch', mockFetch(networkError()).fetch);
    await call(add({ baseUrl: 'https://autre.example.net', apiKey: 'hb_cccccccc' }));
    await call(add({ passphrase: 'mauvaise phrase de test' }));
    await call(add({ baseUrl: 'http://public.example.net' }));
    const text = JSON.stringify([...log.mock.calls, ...logError.mock.calls]);
    for (const secret of [
      'homebox.example.com',
      'inventaire.example.org',
      'autre.example.net',
      'Atelier',
      'Maison',
      'inst-a',
      'hb_',
      PASSPHRASE,
      'mauvaise phrase',
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});

/** Part "management" (US4, T078) and "passphrase" (US5, T088): two or three instances of a real vault. */
describe('instance management: rename, test, update, delete (016, US4, Q-C1, T078)', { timeout: 30_000 }, () => {
  const C = { id: 'inst-c', name: 'Bureau', baseUrl: 'https://homebox.example.com/second', apiKey: 'hb_cccccccc' };
  let contains: ReturnType<typeof vi.spyOn>;
  let remove: ReturnType<typeof vi.spyOn>;
  /** Origins whose permission is granted; every other one is refused by `permissions.contains`. */
  let granted: Set<string>;
  const removedOrigins = () => remove.mock.calls.flatMap((args: unknown[]) => (args[0] as { origins: string[] }).origins);

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    granted = new Set(['https://homebox.example.com/*', 'https://inventaire.example.org/*', 'https://autre.example.net/*']);
    contains = vi
      .spyOn(fakeBrowser.permissions, 'contains')
      .mockImplementation((async (p: { origins: string[] }) => p.origins.every((o) => granted.has(o))) as never);
    remove = vi.spyOn(fakeBrowser.permissions, 'remove').mockImplementation((async () => true) as never);
    vi.spyOn(fakeBrowser.permissions, 'request').mockImplementation((async () => true) as never);
    activeTargets.clear();
    registerConfigHandlers();
  });
  afterEach(() => vi.unstubAllGlobals());

  const seed = async (instances = [A, B]) =>
    seedStore(await buildStore({ instances, historyKey: crypto.getRandomValues(new Uint8Array(32)) }));
  const byId = async (id: string) => (await stored())!.instances.find((i) => i.id === id);

  describe('(a) instance/rename', () => {
    it.each([
      ['unlocked', true],
      ['locked', false],
    ])('%s: no passphrase, no network; only the name changes (US4-1)', async (_n, unlock) => {
      await seed();
      if (unlock) await configStore.unlock(PASSPHRASE);
      const m = mockFetch();
      vi.stubGlobal('fetch', m.fetch);
      const before = await byId(B.id);
      const res = (await call({ type: 'instance/rename', instanceId: B.id, name: '  Garage  ' })) as Ok;
      expect(res.ok).toBe(true);
      expect(res.value.instances!.map((i) => i.name)).toEqual(['Maison', 'Garage']);
      expect(await byId(B.id)).toEqual({ ...before, name: 'Garage' });
      expect(m.calls).toEqual([]);
    });

    it('refusals (US4-2): empty or > 50 → INSTANCE_NAME_INVALID; another instance’s name (case ignored) → INSTANCE_NAME_TAKEN; unknown id', async () => {
      await seed();
      const before = await snapshot();
      expect(await call({ type: 'instance/rename', instanceId: B.id, name: '   ' })).toEqual({ ok: false, error: 'INSTANCE_NAME_INVALID' });
      expect(await call({ type: 'instance/rename', instanceId: B.id, name: 'x'.repeat(51) })).toEqual({ ok: false, error: 'INSTANCE_NAME_INVALID' });
      expect(await call({ type: 'instance/rename', instanceId: B.id, name: 'MAISON' })).toEqual({ ok: false, error: 'INSTANCE_NAME_TAKEN' });
      expect(await call({ type: 'instance/rename', instanceId: 'inconnue', name: 'Garage' })).toEqual({ ok: false, error: 'INSTANCE_NOT_FOUND' });
      expect(await snapshot()).toBe(before);
      // Its own name with another case is not a collision.
      expect(await call({ type: 'instance/rename', instanceId: B.id, name: 'ATELIER' })).toMatchObject({ ok: true });
    });
  });

  describe('(b) instance/test', () => {
    it('contacts only this instance; the lastCheck of the other one is unchanged (US4-3)', async () => {
      await seed();
      await configStore.unlock(PASSPHRASE);
      const m = homeboxOk();
      vi.stubGlobal('fetch', m.fetch);
      const res = (await call({ type: 'instance/test', instanceId: B.id })) as Ok;
      expect(res.ok).toBe(true);
      expect(m.calls).toHaveLength(2);
      expect(m.calls.every((c) => c.url.startsWith(`${B.baseUrl}/`))).toBe(true);
      expect(m.calls[1]!.headers.get('Authorization')).toBe(`Bearer ${B.apiKey}`);
      expect((await byId(B.id))!.lastCheck).toMatchObject({ status: 'ok' });
      expect((await byId(A.id))!.lastCheck).toBeNull();
    });

    it('LOCKED while locked, no network', async () => {
      await seed();
      const m = mockFetch();
      vi.stubGlobal('fetch', m.fetch);
      expect(await call({ type: 'instance/test', instanceId: B.id })).toEqual({ ok: false, error: 'LOCKED' });
      expect(m.calls).toEqual([]);
    });

    it('PERMISSION_DENIED for this instance only when its permission was withdrawn; the other one still tests', async () => {
      await seed();
      await configStore.unlock(PASSPHRASE);
      granted.delete('https://inventaire.example.org/*');
      vi.stubGlobal('fetch', mockFetch().fetch);
      expect(await call({ type: 'instance/test', instanceId: B.id })).toEqual({ ok: false, error: 'PERMISSION_DENIED' });
      vi.stubGlobal('fetch', homeboxOk().fetch);
      expect(await call({ type: 'instance/test', instanceId: A.id })).toMatchObject({ ok: true });
    });

    it('KEY_UNREADABLE when the key of this instance must be entered again', async () => {
      const store = await buildStore({ instances: [A, B] });
      store.instances[1] = { ...store.instances[1]!, key: { ...store.instances[1]!.key!, ct: store.instances[0]!.key!.ct } };
      await seedStore(store);
      expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
      vi.stubGlobal('fetch', mockFetch().fetch);
      expect(await call({ type: 'instance/test', instanceId: B.id })).toEqual({ ok: false, error: 'KEY_UNREADABLE' });
    });
  });

  describe('(c) instance/update', () => {
    const update = (over: Record<string, unknown> = {}) => ({
      type: 'instance/update',
      instanceId: B.id,
      baseUrl: B.baseUrl,
      apiKey: '',
      passphrase: PASSPHRASE,
      newPassphrase: false,
      ...over,
    });

    it('new address, key kept: reopened with the passphrase, resealed with the new address; old origin released (US4-4, US4-5)', async () => {
      await seed();
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { [B.id]: 'loc-b' } });
      const m = homeboxOk();
      vi.stubGlobal('fetch', m.fetch);
      const res = (await call(update({ baseUrl: 'https://autre.example.net/' }))) as Ok;
      expect(res.ok).toBe(true);
      const b = (await byId(B.id))!;
      expect(b.baseUrl).toBe('https://autre.example.net');
      const key = await deriveVaultKey(PASSPHRASE, (await stored())!.vault!);
      expect(await openApiKeyWith(key, b.key!, 'https://autre.example.net')).toBe(B.apiKey);
      expect(await openApiKeyWith(key, b.key!, B.baseUrl)).toBeNull();
      expect(m.calls.every((c) => c.url.startsWith('https://autre.example.net/'))).toBe(true);
      expect(m.calls[1]!.headers.get('Authorization')).toBe(`Bearer ${B.apiKey}`);
      expect(removedOrigins()).toEqual(['https://inventaire.example.org/*']);
      // Spec edge case "address of an instance changed": its last location stays attached to it (same id).
      expect((await fakeBrowser.storage.local.get('lastLocationByInstance')).lastLocationByInstance).toEqual({ [B.id]: 'loc-b' });
      expect(res.value.instances!.find((i) => i.id === B.id)!.keyState).toBe('ready');
    });

    it('the history entries are attached BEFORE the address changes', async () => {
      await seed();
      const attach = vi.spyOn(historyStore, 'attach');
      vi.stubGlobal('fetch', homeboxOk().fetch);
      expect(await call(update({ baseUrl: 'https://autre.example.net' }))).toMatchObject({ ok: true });
      expect(attach).toHaveBeenCalled();
      expect(attach.mock.calls[0]![1].map((i) => i.baseUrl)).toEqual([A.baseUrl, B.baseUrl]);
    });

    it('same address, new key: tested, the old origin is not released', async () => {
      await seed();
      vi.stubGlobal('fetch', homeboxOk().fetch);
      expect(await call(update({ apiKey: 'hb_dddddddd' }))).toMatchObject({ ok: true });
      const key = await deriveVaultKey(PASSPHRASE, (await stored())!.vault!);
      expect(await openApiKeyWith(key, (await byId(B.id))!.key!, B.baseUrl)).toBe('hb_dddddddd');
      expect((await byId(B.id))!.maskedKey).toBe('hb_••••dddd');
      expect(remove).not.toHaveBeenCalled();
    });

    it('refusals leave the storage as is: wrong passphrase, weak passphrase, address of another instance, unknown id', async () => {
      await seed();
      const before = await snapshot();
      const m = mockFetch();
      vi.stubGlobal('fetch', m.fetch);
      expect(await call(update({ passphrase: 'mauvaise phrase de test' }))).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
      expect(await call(update({ passphrase: 'court' }))).toEqual({ ok: false, error: 'WEAK_PASSPHRASE' });
      expect(await call(update({ baseUrl: 'https://HOMEBOX.example.com/' }))).toEqual({ ok: false, error: 'INSTANCE_EXISTS' });
      expect(await call(update({ instanceId: 'inconnue' }))).toEqual({ ok: false, error: 'INSTANCE_NOT_FOUND' });
      expect(await call(update({ baseUrl: 'http://public.example.net' }))).toEqual({ ok: false, error: 'INSECURE_URL' });
      expect(await snapshot()).toBe(before);
      expect(m.calls).toEqual([]);
    });

    it('new origin without permission → PERMISSION_DENIED, nothing written, no network', async () => {
      await seed();
      granted.delete('https://autre.example.net/*');
      const before = await snapshot();
      const m = mockFetch();
      vi.stubGlobal('fetch', m.fetch);
      expect(await call(update({ baseUrl: 'https://autre.example.net' }))).toEqual({ ok: false, error: 'PERMISSION_DENIED' });
      expect(await snapshot()).toBe(before);
      expect(m.calls).toEqual([]);
    });

    it('empty key and unreadable current key → KEY_UNREADABLE', async () => {
      const store = await buildStore({ instances: [A, B] });
      store.instances[1] = { ...store.instances[1]!, key: { ...store.instances[1]!.key!, ct: store.instances[0]!.key!.ct } };
      await seedStore(store);
      vi.stubGlobal('fetch', mockFetch().fetch);
      expect(await call(update({ baseUrl: 'https://autre.example.net' }))).toEqual({ ok: false, error: 'KEY_UNREADABLE' });
    });

    it('newPassphrase: true with two instances → WRONG_PASSPHRASE (only allowed for the single instance)', async () => {
      await seed();
      const before = await snapshot();
      vi.stubGlobal('fetch', mockFetch().fetch);
      expect(await call(update({ apiKey: 'hb_dddddddd', newPassphrase: true }))).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
      expect(await snapshot()).toBe(before);
    });

    it('the connection test fails: the change is saved anyway, the answer is the test error (as config/save)', async () => {
      await seed();
      vi.stubGlobal('fetch', mockFetch(networkError()).fetch);
      expect(await call(update({ apiKey: 'hb_dddddddd' }))).toMatchObject({ ok: false });
      expect((await byId(B.id))!.maskedKey).toBe('hb_••••dddd');
      expect((await byId(B.id))!.lastCheck).toMatchObject({ status: 'error' });
    });
  });

  describe('(d) instance/delete', () => {
    it('unknown id → INSTANCE_NOT_FOUND', async () => {
      await seed();
      expect(await call({ type: 'instance/delete', instanceId: 'inconnue' })).toEqual({ ok: false, error: 'INSTANCE_NOT_FOUND' });
    });

    it('INSTANCE_BUSY while an import to this instance runs; another instance can be deleted (US4-8)', async () => {
      await seed([A, B, C]);
      activeTargets.set(B.id, 1);
      const before = await snapshot();
      expect(await call({ type: 'instance/delete', instanceId: B.id })).toEqual({ ok: false, error: 'INSTANCE_BUSY' });
      expect(await snapshot()).toBe(before);
      expect(await call({ type: 'instance/delete', instanceId: C.id })).toMatchObject({ ok: true });
      activeTargets.delete(B.id);
      expect(await call({ type: 'instance/delete', instanceId: B.id })).toMatchObject({ ok: true });
    });

    it('the last instance → global deletion (US4-7)', async () => {
      await seed([A]);
      expect(await call({ type: 'instance/delete', instanceId: A.id })).toEqual({ ok: true, value: { configured: false } });
      expect(await stored()).toBeUndefined();
      expect(removedOrigins()).toEqual(['https://homebox.example.com/*']);
    });

    async function plantAll() {
      await fakeBrowser.storage.local.set({
        lastLocationByInstance: { [A.id]: 'loc-a', [B.id]: 'loc-b' },
        lastInstanceId: B.id,
        'importHistory:h1': { v: 1, iv: 'AAAA', ct: 'AAAA', inst: B.id },
        'importHistory:h2': { v: 1, iv: 'AAAA', ct: 'AAAA', inst: A.id },
        'importHistory:h3': { v: 1, iv: 'AAAA', ct: 'AAAA' },
      });
      const p = { tabId: 4, pageUrl: null, entityId: 'e1', status: 'partial', error: 'ATTACHMENT_FAILED' } as const;
      await fakeBrowser.storage.session.set({
        'pendingImport:4:p1': { ...p, id: 'p1', instanceId: B.id },
        'pendingImport:4:p2': { ...p, id: 'p2', instanceId: A.id },
      });
    }

    it.each([
      ['unlocked', true],
      ['locked, without the history key', false],
    ])('%s: nothing of the instance is left (invariant 6, SC-008, US4-6); A is intact', async (_n, unlock) => {
      await seed();
      if (unlock) await configStore.unlock(PASSPHRASE);
      await plantAll();
      const a = await byId(A.id);
      const res = (await call({ type: 'instance/delete', instanceId: B.id })) as Ok;
      expect(res.ok).toBe(true);
      expect(res.value.instances!.map((i) => i.id)).toEqual([A.id]);
      const local = await fakeBrowser.storage.local.get(null);
      expect((local.homeboxInstances as InstancesStore).instances).toEqual([a]);
      expect(local.lastLocationByInstance).toEqual({ [A.id]: 'loc-a' });
      expect(local.lastInstanceId).toBeUndefined();
      expect(Object.keys(local).filter((k) => k.startsWith('importHistory:')).sort()).toEqual(['importHistory:h2', 'importHistory:h3']);
      const session = await fakeBrowser.storage.session.get(null);
      expect(Object.keys(session).filter((k) => k.startsWith('pendingImport:'))).toEqual(['pendingImport:4:p2']);
      const keys = (session.homeboxUnlocked as { keys?: Record<string, string> } | undefined)?.keys ?? {};
      expect(Object.keys(keys)).toEqual(unlock ? [A.id] : []);
      expect(removedOrigins()).toEqual(['https://inventaire.example.org/*']);
      if (unlock) expect(await configStore.getCredentials(A.id)).toMatchObject({ ok: true });
    });

    it('(e) permissions: A and A’ on the same origin + B: deleting A keeps the origin, deleting A’ removes it', async () => {
      await seed([A, C, B]);
      expect(await call({ type: 'instance/delete', instanceId: A.id })).toMatchObject({ ok: true });
      expect(removedOrigins()).toEqual([]);
      expect(await call({ type: 'instance/delete', instanceId: C.id })).toMatchObject({ ok: true });
      expect(removedOrigins()).toEqual(['https://homebox.example.com/*']);
    });

    it('(e) changing B to https://autre.example.net releases https://inventaire.example.org/*; never a permission request', async () => {
      await seed();
      vi.stubGlobal('fetch', homeboxOk().fetch);
      await call({ type: 'instance/update', instanceId: B.id, baseUrl: 'https://autre.example.net', apiKey: '', passphrase: PASSPHRASE, newPassphrase: false });
      expect(removedOrigins()).toEqual(['https://inventaire.example.org/*']);
      expect(fakeBrowser.permissions.request).not.toHaveBeenCalled();
      expect(contains).toHaveBeenCalled();
    });

    it('(g) an error after the instance left: BAD_MESSAGE, and the history maintenance removes its orphaned entries', async () => {
      await seed();
      vi.spyOn(historyStore, 'removeInstance').mockRejectedValueOnce(new Error('storage'));
      expect(await call({ type: 'instance/delete', instanceId: B.id })).toEqual({ ok: false, error: 'BAD_MESSAGE' });
      expect((await stored())!.instances.map((i) => i.id)).toEqual([A.id]);
      expect(await call({ type: 'instance/delete', instanceId: B.id })).toEqual({ ok: false, error: 'INSTANCE_NOT_FOUND' });
    });
  });

  it('(f) config/delete: global deletion; the lock, history, tag, theme, update notice and warranty settings are kept (US4-9, FR-025)', async () => {
    await seed([A, C, B]);
    await configStore.unlock(PASSPHRASE);
    const kept = {
      importHistorySettings: { v: 1, enabled: true },
      lockSettings: { v: 1, policy: 'idle-15m' },
      tagSettings: { v: 1, merchantTag: true },
      uiTheme: 'dark',
      updateNotice: { v: 1 },
      warrantySettings: { v: 1 },
    };
    await fakeBrowser.storage.local.set({ ...kept, lastLocationByInstance: { [A.id]: 'l' }, lastInstanceId: A.id, 'importHistory:h1': { v: 1, iv: 'A', ct: 'A' } });
    await fakeBrowser.storage.session.set({ 'pendingImport:4:p1': { id: 'p1', instanceId: B.id } });
    expect(await call({ type: 'config/delete' })).toEqual({ ok: true, value: undefined });
    expect(await fakeBrowser.storage.local.get(null)).toEqual(kept);
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
    expect(removedOrigins().sort()).toEqual(['https://homebox.example.com/*', 'https://inventaire.example.org/*']);
  });

  it('(h) config/save and config/test are withdrawn → BAD_MESSAGE', async () => {
    await seed();
    expect(await call({ type: 'config/save', baseUrl: A.baseUrl, apiKey: A.apiKey, passphrase: PASSPHRASE })).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(await call({ type: 'config/test' })).toEqual({ ok: false, error: 'BAD_MESSAGE' });
  });

  it('instance/* from the script injected in a merchant page → BAD_MESSAGE, nothing changed', async () => {
    await seed();
    const before = await snapshot();
    const web = { id: fakeBrowser.runtime.id, url: 'https://www.amazon.fr/your-orders/order-details', tab: { id: 3 } };
    for (const msg of [
      { type: 'instance/rename', instanceId: B.id, name: 'X' },
      { type: 'instance/test', instanceId: B.id },
      { type: 'instance/delete', instanceId: B.id },
      { type: 'instance/update', instanceId: B.id, baseUrl: B.baseUrl, apiKey: '', passphrase: PASSPHRASE, newPassphrase: false },
      { type: 'session/change-passphrase', current: PASSPHRASE, next: 'nouvelle phrase 456' },
    ]) {
      expect(await dispatch(msg, web)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    }
    expect(await snapshot()).toBe(before);
  });

  it('(i) logs: no address, name, instance id, key or passphrase in any management message (FR-030)', async () => {
    const log = vi.spyOn(logger, 'log');
    const logError = vi.spyOn(logger, 'logError');
    await seed([A, C, B]);
    await configStore.unlock(PASSPHRASE);
    vi.stubGlobal('fetch', homeboxOk().fetch);
    await call({ type: 'instance/test', instanceId: B.id });
    await call({ type: 'instance/rename', instanceId: B.id, name: 'Garage' });
    await call({ type: 'instance/rename', instanceId: B.id, name: 'Maison' });
    vi.stubGlobal('fetch', mockFetch(networkError()).fetch);
    await call({ type: 'instance/update', instanceId: B.id, baseUrl: 'https://autre.example.net', apiKey: '', passphrase: PASSPHRASE, newPassphrase: false });
    await call({ type: 'instance/update', instanceId: B.id, baseUrl: B.baseUrl, apiKey: '', passphrase: 'mauvaise phrase de test', newPassphrase: false });
    activeTargets.set(C.id, 1);
    await call({ type: 'instance/delete', instanceId: C.id });
    activeTargets.clear();
    await call({ type: 'instance/delete', instanceId: B.id });
    await call({ type: 'session/change-passphrase', current: PASSPHRASE, next: 'nouvelle phrase 456' });
    await call({ type: 'session/change-passphrase', current: 'mauvaise phrase de test', next: 'nouvelle phrase 789' });
    const text = JSON.stringify([...log.mock.calls, ...logError.mock.calls]);
    for (const secret of ['example.com', 'example.org', 'example.net', 'Atelier', 'Maison', 'Bureau', 'Garage', 'inst-', 'hb_', PASSPHRASE, 'mauvaise phrase', 'nouvelle phrase']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('session/change-passphrase (016, US5, Q-C1, T088)', { timeout: 30_000 }, () => {
  const NEXT = 'nouvelle phrase 456';
  const C = { id: 'inst-c', name: 'Bureau', baseUrl: 'https://autre.example.net', apiKey: 'hb_cccccccc' };
  const change = (current: string, next: string) => call({ type: 'session/change-passphrase', current, next });

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation((async () => true) as never);
    registerConfigHandlers();
    await seedStore(await buildStore({ instances: [A, B, C], historyKey: crypto.getRandomValues(new Uint8Array(32)) }));
  });

  it('{ view, reenter: [] }; then the old passphrase is refused and the new one opens the three keys (US5-3)', async () => {
    await configStore.unlock(PASSPHRASE);
    const sessionBefore = await fakeBrowser.storage.session.get('homeboxUnlocked');
    const res = (await change(PASSPHRASE, NEXT)) as { ok: true; value: { view: ConfigView; reenter: string[] } };
    expect(res.ok).toBe(true);
    expect(res.value.reenter).toEqual([]);
    expect(res.value.view.instances!.map((i) => i.keyState)).toEqual(['ready', 'ready', 'ready']);
    // The session is unchanged (keys and history key).
    expect(await fakeBrowser.storage.session.get('homeboxUnlocked')).toEqual(sessionBefore);
    await configStore.lock();
    expect(await call({ type: 'session/unlock', passphrase: PASSPHRASE })).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
    expect(await call({ type: 'session/unlock', passphrase: NEXT })).toMatchObject({ ok: true });
    for (const i of [A, B, C]) expect(await configStore.getCredentials(i.id)).toMatchObject({ ok: true, value: { apiKey: i.apiKey } });
  });

  it('works while locked (the current passphrase is checked on the disk), the state stays locked', async () => {
    const res = (await change(PASSPHRASE, NEXT)) as { ok: true; value: { view: ConfigView } };
    expect(res).toMatchObject({ ok: true, value: { view: { locked: true } } });
  });

  it('WRONG_PASSPHRASE and WEAK_PASSPHRASE: nothing written', async () => {
    const before = await snapshot();
    expect(await change('mauvaise phrase de test', NEXT)).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
    expect(await change(PASSPHRASE, 'court')).toEqual({ ok: false, error: 'WEAK_PASSPHRASE' });
    expect(await snapshot()).toBe(before);
  });

  it('a key already unreadable: key null, keyState missing, listed in reenter by id', async () => {
    const store = (await stored())!;
    store.instances[1] = { ...store.instances[1]!, key: { ...store.instances[1]!.key!, ct: store.instances[0]!.key!.ct } };
    await seedStore(store);
    await configStore.unlock(PASSPHRASE);
    const res = (await change(PASSPHRASE, NEXT)) as { ok: true; value: { view: ConfigView; reenter: string[] } };
    expect(res.value.reenter).toEqual([B.id]);
    expect((await stored())!.instances[1]!.key).toBeNull();
    expect(res.value.view.instances!.find((i) => i.id === B.id)!.keyState).toBe('missing');
  });

  it('no passphrase in the logs', async () => {
    const log = vi.spyOn(logger, 'log');
    const logError = vi.spyOn(logger, 'logError');
    await change(PASSPHRASE, NEXT);
    await change('mauvaise phrase de test', 'autre phrase 789');
    const text = JSON.stringify([...log.mock.calls, ...logError.mock.calls]);
    for (const secret of [PASSPHRASE, NEXT, 'mauvaise phrase', 'autre phrase']) expect(text).not.toContain(secret);
  });
});
