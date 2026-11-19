import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { registerConfigHandlers } from '@/background/config/handlers';
import { deriveVaultKey, openApiKeyWith } from '@/background/config/vault-crypto';
import { dispatch } from '@/background/router';
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
