import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore, maskKey } from '@/background/config/config-store';
import type { InstancesStore } from '@/shared/types';
import { A, B, PASSPHRASE, buildStore, seedStore } from './instances-fixture';

const URL = 'https://homebox.example.com';
const KEY = 'hb_secret_api_key_a1b2';
const PASS = 'une phrase de passe solide';
const save = (over: Partial<{ baseUrl: string; apiKey: string; passphrase: string }> = {}) =>
  configStore.save({ baseUrl: URL, apiKey: KEY, passphrase: PASS, ...over }, 1_000);

const local = async () => JSON.stringify(await fakeBrowser.storage.local.get(null));
// ADAPTED (016): getCredentials names its instance; the id is the default instance of the view.
const credentials = async () =>
  configStore.getCredentials((await configStore.getView()).defaultInstanceId ?? '');

describe('config-store (encrypted key)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    // ADAPTED (016): getCredentials now checks the origin permission (granted here, as after configuration).
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
  });

  it('the key is never written in plaintext to storage.local', async () => {
    await save();
    const stored = await local();
    expect(stored).toContain(URL);
    expect(stored).not.toContain(KEY);
    expect(stored).toContain('"ct"');
  });

  it('after saving, the session is unlocked', async () => {
    await save();
    expect(await credentials()).toEqual({
      ok: true,
      value: { id: (await configStore.getView()).defaultInstanceId, baseUrl: URL, apiKey: KEY },
    });
    expect(await configStore.getView()).toMatchObject({
      configured: true,
      locked: false,
      needsPassphrase: false,
    });
  });

  it('locking removes the key from the session; unlocking restores it', async () => {
    await save();
    await configStore.lock();
    expect(await credentials()).toEqual({ ok: false, error: 'LOCKED' });
    expect((await configStore.getView()).locked).toBe(true);

    expect(await configStore.unlock('mauvaise phrase')).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
    expect(await configStore.unlock(PASS)).toEqual({ ok: true, value: undefined });
    expect(await credentials()).toMatchObject({ ok: true, value: { apiKey: KEY } });
  });

  it('browser closed (session cleared) → locked', async () => {
    await save();
    await fakeBrowser.storage.session.clear();
    expect(await credentials()).toEqual({ ok: false, error: 'LOCKED' });
  });

  it('a URL modified directly in storage prevents unlocking', async () => {
    await save();
    await configStore.lock();
    // ADAPTED (016): the address of the instance is falsified in the new storage format.
    const stored = (await fakeBrowser.storage.local.get('homeboxInstances'))
      .homeboxInstances as InstancesStore;
    await fakeBrowser.storage.local.set({
      homeboxInstances: {
        ...stored,
        instances: [{ ...stored.instances[0]!, baseUrl: 'https://attaquant.example.com' }],
      },
    });
    expect(await configStore.unlock(PASS)).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
  });

  it('currentKey: decrypts with the passphrase', async () => {
    await save();
    await configStore.lock();
    expect(await configStore.currentKey(PASS)).toEqual({ ok: true, value: KEY });
    expect(await configStore.currentKey('mauvaise phrase')).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
  });

  it('the view exposed to the UI never contains the key', async () => {
    await save();
    const view = await configStore.getView();
    // ADAPTED (016): the view also lists the instances (without key) and the default instance.
    const id = view.defaultInstanceId!;
    // ADAPTED (016, T100): no top-level compatibility fields (baseUrl, maskedKey, lastCheck): only per instance.
    expect(view).toEqual({
      configured: true,
      locked: false,
      needsPassphrase: false,
      instances: [
        {
          id,
          name: 'homebox.example.com',
          baseUrl: URL,
          maskedKey: 'hb_••••a1b2',
          lastCheck: null,
          keyState: 'ready',
        },
      ],
      defaultInstanceId: id,
      maxInstances: 10,
    });
    expect(JSON.stringify(view)).not.toContain('secret');
  });

  it('masks the key: first 3 characters + •••• + last 4', () => {
    expect(maskKey('hb_0123456789abcd')).toBe('hb_••••abcd');
    expect(maskKey('court')).toBe('••••');
  });

  it('rejects an empty key or one containing spaces', async () => {
    await expect(save({ apiKey: '  ' })).rejects.toThrow('invalid API key');
    await expect(save({ apiKey: 'hb a' })).rejects.toThrow('invalid API key');
  });

  describe('migration from the old plaintext format', () => {
    beforeEach(async () => {
      await fakeBrowser.storage.local.set({
        homeboxConfig: { baseUrl: URL, apiKey: KEY, lastCheck: null },
      });
      await configStore.migrateLegacy();
    });

    it('removes the key from disk and keeps it in session memory', async () => {
      expect(await local()).not.toContain(KEY);
      expect(await credentials()).toMatchObject({ ok: true, value: { apiKey: KEY } });
      // ADAPTED (016, T100): the masked key is read from the instance (no top-level compatibility field).
      expect(await configStore.getView()).toMatchObject({
        needsPassphrase: true,
        locked: false,
        instances: [{ maskedKey: 'hb_••••a1b2' }],
      });
    });

    it('currentKey returns the migrated key so it can be encrypted with a new passphrase', async () => {
      expect(await configStore.currentKey('peu importe')).toEqual({ ok: true, value: KEY });
      await save();
      expect(await configStore.getView()).toMatchObject({ needsPassphrase: false });
    });

    it('if the session is lost before the passphrase, the key must be re-entered', async () => {
      await fakeBrowser.storage.session.clear();
      expect(await credentials()).toEqual({ ok: false, error: 'NOT_CONFIGURED' });
      expect(await configStore.currentKey('x')).toEqual({ ok: false, error: 'NOT_CONFIGURED' });
    });
  });

  it('deletion erases the whole lastLocationByInstance key, all instances included (FR-021, scenario 21)', async () => {
    await save();
    vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    await fakeBrowser.storage.local.set({
      lastLocationByInstance: {
        'https://homebox.example.com': 'loc-1',
        'https://autre.example.com': 'loc-2',
      },
    });

    await configStore.delete();

    expect(await fakeBrowser.storage.local.get('lastLocationByInstance')).toEqual({});
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
  });

  it('deletion erases everything: config, session key, imports, origin permission', async () => {
    await save({ baseUrl: 'https://homebox.example.com/sub' });
    const remove = vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    await fakeBrowser.storage.session.set({ 'pendingImport:1': { id: 'x' }, other: 1 });

    await configStore.delete();

    expect(remove).toHaveBeenCalledWith({ origins: ['https://homebox.example.com/*'] });
    expect(await fakeBrowser.storage.session.get(null)).toEqual({ other: 1 });
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
  });
});

describe('configStore.delete keeps the tag rules (014, Q-U7, US2-9)', () => {
  it('storage.local.tagSettings is intact after the deletion of the configuration', async () => {
    fakeBrowser.reset();
    const value = {
      v: 1,
      merchantTag: false,
      rules: [{ id: 'r1', contains: 'SSD', tag: 'Informatique' }],
    };
    await fakeBrowser.storage.local.set({ tagSettings: value });
    await configStore.save(
      {
        baseUrl: 'https://homebox.example.com',
        apiKey: 'hb_xxxxxxxx',
        passphrase: 'une phrase de passe solide',
      },
      1_000,
    );
    await configStore.delete();
    expect((await fakeBrowser.storage.local.get('tagSettings')).tagSettings).toEqual(value);
  });
});

describe('config-store: several instances in one vault (016, Q-U4, T010)', () => {
  const C = {
    id: 'inst-c',
    name: 'Bureau',
    baseUrl: 'https://autre.example.net',
    apiKey: 'hb_cccccccc',
  };
  const contains = () => vi.spyOn(fakeBrowser.permissions, 'contains');
  const stored = async () =>
    (await fakeBrowser.storage.local.get('homeboxInstances')).homeboxInstances as InstancesStore;
  const tamper = (s: { iv: string; ct: string }) => ({ ...s, ct: `${s.ct.slice(0, -6)}AAAAAA` });

  beforeEach(() => {
    fakeBrowser.reset();
    contains().mockResolvedValue(true as never);
  });

  it('unlock opens every key with a single derivation (10 instances)', async () => {
    const seeds = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`,
      name: `n${i}`,
      baseUrl: `https://h${i}.example.com`,
      apiKey: `hb_key_${i}_xxxxxx`,
    }));
    await seedStore(
      await buildStore({
        instances: seeds,
        historyKey: crypto.getRandomValues(new Uint8Array(32)),
      }),
    );
    const spy = vi.spyOn(crypto.subtle, 'deriveKey');
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    expect(spy).toHaveBeenCalledTimes(1);
    for (const seed of seeds) {
      expect(await configStore.getCredentials(seed.id)).toEqual({
        ok: true,
        value: { id: seed.id, baseUrl: seed.baseUrl, apiKey: seed.apiKey },
      });
    }
    expect(
      (await fakeBrowser.storage.session.get('homeboxUnlocked')).homeboxUnlocked,
    ).toMatchObject({ v: 2 });
  });

  it('unlock of a migrated vault (no check) creates the check seal, written in a single set', async () => {
    await seedStore(await buildStore({ instances: [A], check: false }));
    expect((await stored()).vault).not.toHaveProperty('check');
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    const writes = set.mock.calls.filter(([items]) => 'homeboxInstances' in items);
    expect(writes).toHaveLength(1);
    expect((await stored()).vault!.check).toMatchObject({
      iv: expect.any(String),
      ct: expect.any(String),
    });
    await configStore.lock();
    expect(await configStore.unlock('mauvaise phrase de test')).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
  });

  it('a damaged key: unlock ok, that instance "unreadable" (KEY_UNREADABLE), the others ready (FR-022)', async () => {
    const store = await buildStore({ instances: [A, B, C] });
    store.instances[1] = { ...store.instances[1]!, key: tamper(store.instances[1]!.key!) };
    await seedStore(store);
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    const view = await configStore.getView();
    expect(view.instances!.map((i) => [i.id, i.keyState])).toEqual([
      ['inst-a', 'ready'],
      ['inst-b', 'unreadable'],
      ['inst-c', 'ready'],
    ]);
    expect(await configStore.getCredentials('inst-b')).toEqual({
      ok: false,
      error: 'KEY_UNREADABLE',
    });
    expect(await configStore.getCredentials('inst-c')).toEqual({
      ok: true,
      value: { id: 'inst-c', baseUrl: C.baseUrl, apiKey: C.apiKey },
    });
  });

  it('getCredentials: NOT_CONFIGURED → INSTANCE_NOT_FOUND → LOCKED → KEY_UNREADABLE → PERMISSION_DENIED → ok', async () => {
    expect(await configStore.getCredentials('inst-a')).toEqual({
      ok: false,
      error: 'NOT_CONFIGURED',
    });
    const store = await buildStore({ instances: [A, B] });
    store.instances[1] = { ...store.instances[1]!, key: tamper(store.instances[1]!.key!) };
    await seedStore(store);
    expect(await configStore.getCredentials('inconnu')).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
    expect(await configStore.getCredentials('inst-a')).toEqual({ ok: false, error: 'LOCKED' });
    expect(await configStore.getCredentials('inst-b')).toEqual({ ok: false, error: 'LOCKED' });
    await configStore.unlock(PASSPHRASE);
    expect(await configStore.getCredentials('inconnu')).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
    expect(await configStore.getCredentials('inst-b')).toEqual({
      ok: false,
      error: 'KEY_UNREADABLE',
    });
    contains().mockResolvedValue(false as never);
    expect(await configStore.getCredentials('inst-a')).toEqual({
      ok: false,
      error: 'PERMISSION_DENIED',
    });
    contains().mockResolvedValue(true as never);
    expect(await configStore.getCredentials('inst-a')).toEqual({
      ok: true,
      value: { id: 'inst-a', baseUrl: A.baseUrl, apiKey: A.apiKey },
    });
    expect(contains()).toHaveBeenLastCalledWith({ origins: ['https://homebox.example.com/*'] });
  });

  it('currentKey without id: only for a single instance; with several, INSTANCE_NOT_FOUND (no implicit fallback)', async () => {
    await seedStore(await buildStore({ instances: [A, B] }));
    expect(await configStore.currentKey(PASSPHRASE)).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
    expect(await configStore.currentKey(PASSPHRASE, 'inst-b')).toEqual({
      ok: true,
      value: B.apiKey,
    });
    await seedStore(await buildStore({ instances: [A] }));
    expect(await configStore.currentKey(PASSPHRASE)).toEqual({ ok: true, value: A.apiKey });
  });

  it('an unknown id is never resolved to the first instance (invariant 1)', async () => {
    await save();
    expect(await configStore.getCredentials('inconnu')).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
    expect(await configStore.getCredentials('')).toEqual({
      ok: false,
      error: 'INSTANCE_NOT_FOUND',
    });
  });

  it('lock(): LOCKED for every instance, no key survives (SC-007, FR-021)', async () => {
    await seedStore(await buildStore({ instances: [A, B, C] }));
    await configStore.unlock(PASSPHRASE);
    await configStore.lock();
    for (const id of ['inst-a', 'inst-b', 'inst-c']) {
      expect(await configStore.getCredentials(id)).toEqual({ ok: false, error: 'LOCKED' });
    }
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
    expect((await configStore.getView()).instances!.every((i) => i.keyState === 'locked')).toBe(
      true,
    );
  });

  describe('keyState (data-model §3)', () => {
    it('ready, locked, unreadable, missing (key null with a vault), missing (legacy key lost)', async () => {
      const store = await buildStore({ instances: [A, B, C] });
      store.instances[1] = { ...store.instances[1]!, key: tamper(store.instances[1]!.key!) };
      store.instances[2] = { ...store.instances[2]!, key: null };
      await seedStore(store);
      const states = async () => (await configStore.getView()).instances!.map((i) => i.keyState);
      expect(await states()).toEqual(['locked', 'locked', 'missing']);
      await configStore.unlock(PASSPHRASE);
      expect(await states()).toEqual(['ready', 'unreadable', 'missing']);

      fakeBrowser.reset();
      contains().mockResolvedValue(true as never);
      await seedStore({
        v: 1,
        vault: null,
        instances: [
          {
            id: 'migrated',
            name: 'homebox.example.com',
            baseUrl: URL,
            key: null,
            maskedKey: 'hb_••••a1b2',
            lastCheck: null,
          },
        ],
      });
      expect(await states()).toEqual(['missing']);
      expect(await configStore.getView()).toMatchObject({ needsPassphrase: true, locked: true });
      await fakeBrowser.storage.session.set({ homeboxUnlocked: { v: 2, keys: { migrated: KEY } } });
      expect(await states()).toEqual(['ready']);
    });
  });

  describe('session v1 { apiKey, historyKey? } (data-model §3)', () => {
    it('read as v2 with a single instance', async () => {
      await seedStore({
        v: 1,
        vault: null,
        instances: [
          {
            id: 'migrated',
            name: 'homebox.example.com',
            baseUrl: URL,
            key: null,
            maskedKey: 'hb_••••a1b2',
            lastCheck: null,
          },
        ],
      });
      await fakeBrowser.storage.session.set({ homeboxUnlocked: { apiKey: KEY } });
      expect(await configStore.getCredentials('migrated')).toEqual({
        ok: true,
        value: { id: 'migrated', baseUrl: URL, apiKey: KEY },
      });
      expect((await configStore.getView()).locked).toBe(false);
    });

    it('ignored (locked) with two instances', async () => {
      await seedStore(await buildStore({ instances: [A, B] }));
      await fakeBrowser.storage.session.set({ homeboxUnlocked: { apiKey: A.apiKey } });
      expect(await configStore.getCredentials('inst-a')).toEqual({ ok: false, error: 'LOCKED' });
      expect((await configStore.getView()).locked).toBe(true);
    });
  });

  it('save (single instance) keeps the instance id, updates instances[0] in a single set (R2)', async () => {
    await save();
    const id = (await configStore.getView()).defaultInstanceId;
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    await save({ baseUrl: 'https://homebox.example.com/sub' });
    expect(set.mock.calls.filter(([items]) => 'homeboxInstances' in items)).toHaveLength(1);
    const after = await stored();
    expect(after.instances).toHaveLength(1);
    expect(after.instances[0]).toMatchObject({ id, baseUrl: 'https://homebox.example.com/sub' });
  });

  it('save refuses to replace a vault of several instances', async () => {
    await seedStore(await buildStore({ instances: [A, B] }));
    await expect(save()).rejects.toThrow();
    expect((await stored()).instances).toHaveLength(2);
  });

  it('delete(): every instance key, lastInstanceId, lastLocationByInstance, session, pending imports, then each distinct origin', async () => {
    const remove = vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    const second = { ...C, baseUrl: 'https://homebox.example.com/second' };
    await seedStore(await buildStore({ instances: [A, B, second] }));
    await configStore.unlock(PASSPHRASE);
    await fakeBrowser.storage.local.set({
      lastInstanceId: 'inst-b',
      lastLocationByInstance: { 'inst-a': 'loc-1' },
      importHistorySettings: { v: 1, enabled: true },
      tagSettings: { v: 1, merchantTag: true, rules: [] },
    });
    await fakeBrowser.storage.session.set({
      'pendingImport:1:x': { id: 'x', instanceId: 'inst-a' },
    });
    await configStore.delete();
    expect(await fakeBrowser.storage.local.get(null)).toEqual({
      importHistorySettings: { v: 1, enabled: true },
      tagSettings: { v: 1, merchantTag: true, rules: [] },
    });
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
    expect(remove.mock.calls.map(([p]) => p)).toEqual([
      { origins: ['https://homebox.example.com/*'] },
      { origins: ['https://inventaire.example.org/*'] },
    ]);
  });
});

describe('configStore.addInstance (016, US2, Q-U2, T058)', () => {
  const stored = async () =>
    (await fakeBrowser.storage.local.get('homeboxInstances')).homeboxInstances as InstancesStore;
  const input = (over: Partial<Parameters<typeof configStore.addInstance>[0]> = {}) => ({
    baseUrl: B.baseUrl,
    apiKey: B.apiKey,
    name: '',
    passphrase: PASSPHRASE,
    newPassphrase: false,
    ...over,
  });

  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
  });

  it('one derivation, one set of homeboxInstances; the new key opens with B’s address only (FR-002)', async () => {
    await seedStore(
      await buildStore({ instances: [A], historyKey: crypto.getRandomValues(new Uint8Array(32)) }),
    );
    const derive = vi.spyOn(crypto.subtle, 'deriveKey');
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    const res = await configStore.addInstance(input());
    expect(res).toMatchObject({ ok: true, value: { id: expect.any(String) } });
    expect(derive).toHaveBeenCalledTimes(1);
    expect(set.mock.calls.filter(([items]) => 'homeboxInstances' in items)).toHaveLength(1);

    const store = await stored();
    expect(store.instances.map((i) => i.name)).toEqual(['Maison', 'inventaire.example.org']);
    const added = store.instances[1]!;
    expect(added).toMatchObject({
      baseUrl: B.baseUrl,
      maskedKey: maskKey(B.apiKey),
      lastCheck: null,
    });
    expect(JSON.stringify(store)).not.toContain(B.apiKey);

    const { deriveVaultKey, openApiKeyWith } = await import('@/background/config/vault-crypto');
    const key = await deriveVaultKey(PASSPHRASE, store.vault!);
    expect(await openApiKeyWith(key, added.key!, B.baseUrl)).toBe(B.apiKey);
    expect(await openApiKeyWith(key, added.key!, A.baseUrl)).toBeNull();
    // Full unlock: both keys in the session.
    expect(await configStore.getCredentials(A.id)).toMatchObject({
      ok: true,
      value: { apiKey: A.apiKey },
    });
    expect(await configStore.getCredentials(added.id)).toMatchObject({
      ok: true,
      value: { apiKey: B.apiKey },
    });
  });

  it('a failed set leaves storage.local identical byte for byte and the session untouched', async () => {
    await seedStore(await buildStore({ instances: [A] }));
    const before = JSON.stringify(await fakeBrowser.storage.local.get(null));
    const session = JSON.stringify(await fakeBrowser.storage.session.get(null));
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    await expect(configStore.addInstance(input())).rejects.toThrow();
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).toBe(before);
    expect(JSON.stringify(await fakeBrowser.storage.session.get(null))).toBe(session);
  });

  it('wrong passphrase: WRONG_PASSPHRASE, nothing written, the probe never runs (no network)', async () => {
    await seedStore(await buildStore({ instances: [A] }));
    const before = JSON.stringify(await fakeBrowser.storage.local.get(null));
    const probe = vi.fn();
    expect(
      await configStore.addInstance(input({ passphrase: 'mauvaise phrase 999' }), { probe }),
    ).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
    expect(probe).not.toHaveBeenCalled();
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).toBe(before);
  });

  it('the probe result is saved as the last check; a refused probe writes nothing', async () => {
    await seedStore(await buildStore({ instances: [A] }));
    const check = {
      status: 'error' as const,
      code: 'HOMEBOX_UNREACHABLE' as const,
      at: '2026-11-19T10:00:00.000Z',
    };
    expect(
      await configStore.addInstance(input(), { probe: async () => ({ ok: true, value: check }) }),
    ).toMatchObject({ ok: true });
    expect((await stored()).instances[1]!.lastCheck).toEqual(check);

    await seedStore(await buildStore({ instances: [A] }));
    const before = JSON.stringify(await fakeBrowser.storage.local.get(null));
    expect(
      await configStore.addInstance(input(), {
        probe: async () => ({ ok: false, error: 'PERMISSION_DENIED' }),
      }),
    ).toEqual({
      ok: false,
      error: 'PERMISSION_DENIED',
    });
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).toBe(before);
  });

  it('the vault key is never written: only homeboxUnlocked { v, keys, historyKey } and the activity in session', async () => {
    await seedStore(
      await buildStore({ instances: [A], historyKey: crypto.getRandomValues(new Uint8Array(32)) }),
    );
    await configStore.addInstance(input());
    const session = await fakeBrowser.storage.session.get(null);
    expect(Object.keys(session).sort()).toEqual(['homeboxActivity', 'homeboxUnlocked']);
    expect(Object.keys(session.homeboxUnlocked as object).sort()).toEqual([
      'historyKey',
      'keys',
      'v',
    ]);
  });

  it('configStore.save (single instance) is unchanged: it still replaces the only instance', async () => {
    await configStore.save({ baseUrl: A.baseUrl, apiKey: A.apiKey, passphrase: PASSPHRASE }, 1_000);
    const id = (await stored()).instances[0]!.id;
    await configStore.save(
      { baseUrl: A.baseUrl, apiKey: 'hb_cccccccc', passphrase: PASSPHRASE },
      1_000,
    );
    expect((await stored()).instances.map((i) => i.id)).toEqual([id]);
  });
});

describe('configStore.changePassphrase (016, US5, Q-U2, T087)', () => {
  const NEXT = 'nouvelle phrase 456';
  const C = {
    id: 'inst-c',
    name: 'Bureau',
    baseUrl: 'https://autre.example.net',
    apiKey: 'hb_cccccccc',
  };
  const stored = async () =>
    (await fakeBrowser.storage.local.get('homeboxInstances')).homeboxInstances as InstancesStore;

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
    await seedStore(
      await buildStore({
        instances: [A, B, C],
        historyKey: crypto.getRandomValues(new Uint8Array(32)),
      }),
    );
  });

  it('refusals: WEAK_PASSPHRASE (next < 10), WRONG_PASSPHRASE; nothing written', async () => {
    const before = JSON.stringify(await fakeBrowser.storage.local.get(null));
    expect(await configStore.changePassphrase(PASSPHRASE, 'court', 1_000)).toEqual({
      ok: false,
      error: 'WEAK_PASSPHRASE',
    });
    expect(await configStore.changePassphrase('mauvaise phrase 999', NEXT, 1_000)).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).toBe(before);
  });

  it('two derivations, one set; the old passphrase is refused, the new one opens the 3 keys and the history key; session unchanged', async () => {
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    const historyKey = await configStore.getHistoryKey();
    const session = JSON.stringify(await fakeBrowser.storage.session.get(null));
    const derive = vi.spyOn(crypto.subtle, 'deriveKey');
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    expect(await configStore.changePassphrase(PASSPHRASE, NEXT, 1_000)).toEqual({
      ok: true,
      value: { reenter: [] },
    });
    expect(derive).toHaveBeenCalledTimes(2);
    expect(set.mock.calls.filter(([items]) => 'homeboxInstances' in items)).toHaveLength(1);
    expect(JSON.stringify(await fakeBrowser.storage.session.get(null))).toBe(session);

    await configStore.lock();
    for (const i of [A, B, C])
      expect(await configStore.getCredentials(i.id)).toEqual({ ok: false, error: 'LOCKED' });
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
    expect(await configStore.unlock(NEXT)).toEqual({ ok: true, value: undefined });
    for (const i of [A, B, C])
      expect(await configStore.getCredentials(i.id)).toMatchObject({
        ok: true,
        value: { apiKey: i.apiKey },
      });
    expect(await configStore.getHistoryKey()).toEqual(historyKey);
  });

  it('a failed set: storage identical byte for byte, the old passphrase still valid (FR-023, US5-3)', async () => {
    const before = JSON.stringify(await fakeBrowser.storage.local.get(null));
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    await expect(configStore.changePassphrase(PASSPHRASE, NEXT, 1_000)).rejects.toThrow();
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).toBe(before);
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
  });

  it('a key unreadable before the change: key null, keyState missing, listed in reenter; the others unlocked (US5-4)', async () => {
    const store = await stored();
    store.instances[1] = {
      ...store.instances[1]!,
      key: { ...store.instances[1]!.key!, ct: store.instances[0]!.key!.ct },
    };
    await seedStore(store);
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    expect((await configStore.getView()).instances!.map((i) => i.keyState)).toEqual([
      'ready',
      'unreadable',
      'ready',
    ]);
    expect(await configStore.changePassphrase(PASSPHRASE, NEXT, 1_000)).toEqual({
      ok: true,
      value: { reenter: [B.id] },
    });
    expect((await stored()).instances[1]!.key).toBeNull();
    expect((await configStore.getView()).instances!.map((i) => i.keyState)).toEqual([
      'ready',
      'missing',
      'ready',
    ]);
    await configStore.lock();
    expect(await configStore.unlock(NEXT)).toEqual({ ok: true, value: undefined });
    expect(await configStore.getCredentials(B.id)).toEqual({ ok: false, error: 'KEY_UNREADABLE' });
    expect(await configStore.getCredentials(C.id)).toMatchObject({ ok: true });
  });

  it('a legacy key without passphrase (no vault): WRONG_PASSPHRASE, nothing written', async () => {
    fakeBrowser.reset();
    await seedStore({
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
    });
    const before = JSON.stringify(await fakeBrowser.storage.local.get(null));
    expect(await configStore.changePassphrase(PASSPHRASE, NEXT, 1_000)).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).toBe(before);
  });
});
