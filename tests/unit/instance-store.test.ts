import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  defaultName,
  fromLegacy,
  instanceStore,
  isValidStore,
  sameAddress,
  validateName,
} from '@/background/config/instance-store';
import type { InstancesStore, StoredInstance } from '@/shared/types';
import { A, B, buildStore, seedLegacy, seedStore } from './instances-fixture';

/** Spec 016, Q-U3: instance store (pure functions, validated read, serialized write). Fictitious values only. */

const inst = (over: Partial<StoredInstance> = {}): StoredInstance => ({
  id: 'inst-a',
  name: 'homebox.example.com',
  baseUrl: 'https://homebox.example.com',
  key: { iv: 'aXY=', ct: 'Y3Q=' },
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  ...over,
});
const vault = { kdf: 'PBKDF2-SHA256' as const, iterations: 1_000, salt: 'c2FsdA==' };
const storeOf = (
  instances: StoredInstance[],
  over: Partial<InstancesStore> = {},
): InstancesStore => ({
  v: 1,
  vault,
  instances,
  ...over,
});
const consoleSpies = () =>
  (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
    vi.spyOn(console, k).mockImplementation(() => undefined),
  );

describe('instance-store: defaultName (data-model §2)', () => {
  it('host only; non-standard port kept; default port and path dropped', () => {
    expect(defaultName('https://homebox.example.com', [])).toBe('homebox.example.com');
    expect(defaultName('http://homebox.lan:3100', [])).toBe('homebox.lan:3100');
    expect(defaultName('https://homebox.example.com:443/inv', [])).toBe('homebox.example.com');
  });

  it('collision (case ignored) → "(2)", then "(3)"', () => {
    expect(defaultName('https://homebox.example.com', ['HOMEBOX.example.com'])).toBe(
      'homebox.example.com (2)',
    );
    expect(
      defaultName('https://homebox.example.com', [
        'homebox.example.com',
        'homebox.example.com (2)',
      ]),
    ).toBe('homebox.example.com (3)');
  });

  it('truncated to 50 characters, suffix included', () => {
    const host = `${'a'.repeat(60)}.example.com`;
    const name = defaultName(`https://${host}`, []);
    expect(name).toBe(host.slice(0, 50));
    const second = defaultName(`https://${host}`, [name]);
    expect(second.length).toBeLessThanOrEqual(50);
    expect(second.endsWith(' (2)')).toBe(true);
  });
});

describe('instance-store: validateName', () => {
  const url = 'https://homebox.example.com';
  it('trims; empty → default name', () => {
    expect(validateName('  Maison  ', [], url)).toEqual({ ok: true, value: 'Maison' });
    expect(validateName('   ', [], url)).toEqual({ ok: true, value: 'homebox.example.com' });
    expect(validateName('', ['homebox.example.com'], url)).toEqual({
      ok: true,
      value: 'homebox.example.com (2)',
    });
  });

  it('51 characters → INSTANCE_NAME_INVALID; 50 accepted', () => {
    expect(validateName('x'.repeat(51), [], url)).toEqual({
      ok: false,
      error: 'INSTANCE_NAME_INVALID',
    });
    expect(validateName('x'.repeat(50), [], url)).toEqual({ ok: true, value: 'x'.repeat(50) });
  });

  it('taken, case ignored → INSTANCE_NAME_TAKEN', () => {
    expect(validateName('HOMEBOX.EXAMPLE.COM', ['homebox.example.com'], url)).toEqual({
      ok: false,
      error: 'INSTANCE_NAME_TAKEN',
    });
  });
});

describe('instance-store: sameAddress', () => {
  it('trailing slash, host case and default port are equivalent', () => {
    expect(sameAddress('https://homebox.example.com/', 'https://homebox.example.com')).toBe(true);
    expect(sameAddress('https://HOMEBOX.example.com', 'https://homebox.example.com')).toBe(true);
    expect(sameAddress('https://homebox.example.com:443', 'https://homebox.example.com')).toBe(
      true,
    );
    expect(sameAddress('https://homebox.example.com/api/v1', 'https://homebox.example.com')).toBe(
      true,
    );
  });

  it('different path, host, scheme or port: different', () => {
    expect(sameAddress('https://homebox.example.com/second', 'https://homebox.example.com')).toBe(
      false,
    );
    expect(sameAddress('https://inventaire.example.org', 'https://homebox.example.com')).toBe(
      false,
    );
    expect(sameAddress('http://homebox.lan', 'https://homebox.lan')).toBe(false);
    expect(sameAddress('http://homebox.lan:3100', 'http://homebox.lan:3101')).toBe(false);
    expect(sameAddress('pas une adresse', 'https://homebox.example.com')).toBe(false);
  });
});

describe('instance-store: isValidStore (data-model validation rules)', () => {
  it('a valid store with one and two instances', () => {
    expect(isValidStore(storeOf([inst()]))).toBe(true);
    expect(
      isValidStore(
        storeOf([
          inst(),
          inst({ id: 'inst-b', name: 'Atelier', baseUrl: 'https://inventaire.example.org' }),
        ]),
      ),
    ).toBe(true);
    expect(isValidStore(storeOf([inst({ key: null })], { vault: null }))).toBe(true);
  });

  const invalid: Array<[string, unknown]> = [
    ['not an object', 'x'],
    ['wrong version', { ...storeOf([inst()]), v: 2 }],
    ['0 instance', storeOf([])],
    [
      '11 instances',
      storeOf(
        Array.from({ length: 11 }, (_, i) =>
          inst({ id: `i${i}`, name: `n${i}`, baseUrl: `https://h${i}.example.com` }),
        ),
      ),
    ],
    [
      'duplicate id',
      storeOf([inst(), inst({ name: 'Atelier', baseUrl: 'https://inventaire.example.org' })]),
    ],
    ['duplicate baseUrl', storeOf([inst(), inst({ id: 'inst-b', name: 'Atelier' })])],
    [
      'duplicate name, case ignored',
      storeOf([
        inst(),
        inst({
          id: 'inst-b',
          name: 'HOMEBOX.example.com',
          baseUrl: 'https://inventaire.example.org',
        }),
      ]),
    ],
    [
      'vault null with 2 instances',
      storeOf(
        [
          inst({ key: null }),
          inst({ id: 'b', name: 'b', baseUrl: 'https://b.example.com', key: null }),
        ],
        { vault: null },
      ),
    ],
    ['vault null with a sealed key', storeOf([inst()], { vault: null })],
    [
      'baseUrl not normalized (trailing slash)',
      storeOf([inst({ baseUrl: 'https://homebox.example.com/' })]),
    ],
    ['public HTTP address', storeOf([inst({ baseUrl: 'http://homebox.example.com' })])],
    ['empty name', storeOf([inst({ name: '' })])],
    ['name of 51 characters', storeOf([inst({ name: 'x'.repeat(51) })])],
    ['id of 65 characters', storeOf([inst({ id: 'x'.repeat(65) })])],
    ['key without ct', storeOf([inst({ key: { iv: 'x' } as never })])],
    ['wrong kdf', storeOf([inst()], { vault: { ...vault, kdf: 'scrypt' as never } })],
  ];
  it.each(invalid)('invalid: %s', (_, value) => {
    expect(isValidStore(value)).toBe(false);
  });

  it('an invalid stored object → read() is null and logs the constant config/invalid only', async () => {
    fakeBrowser.reset();
    const spies = consoleSpies();
    await seedStore(storeOf([inst({ baseUrl: 'https://homebox.example.com/' })]));
    expect(await instanceStore.read()).toBeNull();
    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output).toContain('config/invalid');
    expect(output).not.toContain('homebox.example.com');
    expect(output).not.toContain('inst-a');
  });
});

describe('instance-store: fromLegacy (migration mapping, data-model §2)', () => {
  const encryptedKey = {
    v: 1 as const,
    kdf: 'PBKDF2-SHA256' as const,
    iterations: 600_000,
    salt: 'U0FMVA==',
    iv: 'SVY=',
    ct: 'Q1Q=',
  };
  const historyKey = { iv: 'SEtJVg==', ct: 'SEtDVA==' };

  it('encrypted configuration from 012 (with historyKey): bytes copied as is, id migrated, name = host', () => {
    const lastCheck = { status: 'ok' as const, version: '0.21.0', at: '2026-11-01T10:00:00.000Z' };
    const store = fromLegacy({
      baseUrl: 'https://homebox.example.com',
      encryptedKey,
      maskedKey: 'hb_••••xxxx',
      lastCheck,
      historyKey,
    });
    expect(store).toEqual({
      v: 1,
      vault: {
        kdf: 'PBKDF2-SHA256',
        iterations: 600_000,
        salt: 'U0FMVA==',
        historyKey: { iv: 'SEtJVg==', ct: 'SEtDVA==' },
      },
      instances: [
        {
          id: 'migrated',
          name: 'homebox.example.com',
          baseUrl: 'https://homebox.example.com',
          key: { iv: 'SVY=', ct: 'Q1Q=' },
          maskedKey: 'hb_••••xxxx',
          lastCheck,
        },
      ],
      migratedFrom: 'homeboxConfig',
    });
    expect(store.vault).not.toHaveProperty('check');
    expect(isValidStore(store)).toBe(true);
  });

  it('before 012 (no historyKey): no historyKey in the vault', () => {
    const store = fromLegacy({
      baseUrl: 'https://homebox.example.com',
      encryptedKey,
      maskedKey: 'hb_••••xxxx',
      lastCheck: null,
    });
    expect(store.vault).toEqual({ kdf: 'PBKDF2-SHA256', iterations: 600_000, salt: 'U0FMVA==' });
    expect(store.instances[0]!.lastCheck).toBeNull();
  });

  it('legacy key (encryptedKey null): vault null, key null', () => {
    const lastCheck = {
      status: 'error' as const,
      code: 'UNAUTHORIZED' as const,
      at: '2026-11-01T10:00:00.000Z',
    };
    const store = fromLegacy({
      baseUrl: 'http://homebox.lan:3100',
      encryptedKey: null,
      maskedKey: 'hb_••••xxxx',
      lastCheck,
    });
    expect(store.vault).toBeNull();
    expect(store.instances).toEqual([
      {
        id: 'migrated',
        name: 'homebox.lan:3100',
        baseUrl: 'http://homebox.lan:3100',
        key: null,
        maskedKey: 'hb_••••xxxx',
        lastCheck,
      },
    ]);
    expect(isValidStore(store)).toBe(true);
  });
});

describe('instance-store: storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('read(): nothing → null', async () => {
    expect(await instanceStore.read()).toBeNull();
  });

  it('read(): homeboxInstances valid → returned as is', async () => {
    const store = await buildStore({ instances: [A, B] });
    await seedStore(store);
    expect(await instanceStore.read()).toEqual(store);
  });

  it('read(): homeboxInstances absent, homeboxConfig valid → fallback view, nothing written', async () => {
    const { legacy } = await seedLegacy();
    const before = await fakeBrowser.storage.local.get(null);
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    expect(await instanceStore.read()).toEqual(fromLegacy(legacy));
    expect(set).not.toHaveBeenCalled();
    expect(await fakeBrowser.storage.local.get(null)).toEqual(before);
  });

  it('update(fn): single queue, two concurrent writes lose nothing', async () => {
    await seedStore(await buildStore({ instances: [A, B] }));
    const rename = (id: string, name: string) =>
      instanceStore.update(async (s) => {
        await new Promise((r) => setTimeout(r, 0));
        return s && { ...s, instances: s.instances.map((i) => (i.id === id ? { ...i, name } : i)) };
      });
    await Promise.all([rename('inst-a', 'Maison 2'), rename('inst-b', 'Atelier 2')]);
    expect((await instanceStore.read())!.instances.map((i) => i.name)).toEqual([
      'Maison 2',
      'Atelier 2',
    ]);
  });

  it('update(fn): a write that throws does not block the next one; null writes nothing', async () => {
    await seedStore(await buildStore({ instances: [A] }));
    await expect(instanceStore.update(() => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    await instanceStore.update(() => null);
    expect(set).not.toHaveBeenCalled();
    await instanceStore.update(
      (s) => s && { ...s, instances: [{ ...s.instances[0]!, name: 'Maison 2' }] },
    );
    expect((await instanceStore.read())!.instances[0]!.name).toBe('Maison 2');
  });

  it('update(fn): homeboxInstances absent and homeboxConfig present → migrates first, then writes (US1)', async () => {
    await seedLegacy();
    await instanceStore.update(
      (s) => s && { ...s, instances: [{ ...s.instances[0]!, name: 'Maison' }] },
    );
    const all = await fakeBrowser.storage.local.get(null);
    expect(all).not.toHaveProperty('homeboxConfig');
    expect((all.homeboxInstances as InstancesStore).instances[0]).toMatchObject({
      id: 'migrated',
      name: 'Maison',
    });
  });

  it('update(fn): migration impossible (storage error) → update throws, homeboxConfig intact', async () => {
    const { legacy } = await seedLegacy();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('storage down'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(instanceStore.update((s) => s)).rejects.toThrow();
    expect((await fakeBrowser.storage.local.get('homeboxConfig')).homeboxConfig).toEqual(legacy);
  });

  it('byId, defaultId (lastInstanceId if valid, else the first), setLastUsed', async () => {
    await seedStore(await buildStore({ instances: [A, B] }));
    expect((await instanceStore.byId('inst-b'))?.name).toBe('Atelier');
    expect(await instanceStore.byId('inconnu')).toBeNull();
    expect(await instanceStore.defaultId()).toBe('inst-a');
    await instanceStore.setLastUsed('inst-b');
    expect((await fakeBrowser.storage.local.get('lastInstanceId')).lastInstanceId).toBe('inst-b');
    expect(await instanceStore.defaultId()).toBe('inst-b');
    await fakeBrowser.storage.local.set({ lastInstanceId: 'supprimee' });
    expect(await instanceStore.defaultId()).toBe('inst-a');
    await fakeBrowser.storage.local.set({ lastInstanceId: 42 });
    expect(await instanceStore.defaultId()).toBe('inst-a');
  });

  it('defaultId: not configured → null', async () => {
    expect(await instanceStore.defaultId()).toBeNull();
  });

  it('originInUse: two instances on the same origin, different paths', async () => {
    const second = { ...B, baseUrl: 'https://homebox.example.com/second' };
    await seedStore(await buildStore({ instances: [A, second] }));
    expect(await instanceStore.originInUse('https://homebox.example.com')).toBe(true);
    expect(await instanceStore.originInUse('https://homebox.example.com', 'inst-a')).toBe(true);
    await seedStore(await buildStore({ instances: [A, B] }));
    expect(await instanceStore.originInUse('https://homebox.example.com', 'inst-a')).toBe(false);
    expect(await instanceStore.originInUse('https://autre.example.net')).toBe(false);
  });

  describe('releaseOriginIfUnused', () => {
    it('removes the origin only if no instance uses it', async () => {
      const remove = vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
      await seedStore(await buildStore({ instances: [A, B] }));
      await instanceStore.releaseOriginIfUnused('https://homebox.example.com');
      expect(remove).not.toHaveBeenCalled();
      await instanceStore.releaseOriginIfUnused('https://autre.example.net');
      expect(remove).toHaveBeenCalledWith({ origins: ['https://autre.example.net/*'] });
      remove.mockClear();
      await instanceStore.releaseOriginIfUnused('https://homebox.example.com', 'inst-a');
      expect(remove).toHaveBeenCalledWith({ origins: ['https://homebox.example.com/*'] });
    });

    it('goes through the write queue: a concurrent add on the same origin keeps its permission', async () => {
      const remove = vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
      const full = await buildStore({ instances: [A, B] });
      await seedStore({ ...full, instances: [full.instances[0]!] });
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      // A queued write (adds an instance on the origin) is still running when the release is requested.
      const adding = instanceStore.update(async (s) => {
        await gate;
        return s ? { ...s, instances: [...s.instances, full.instances[1]!] } : s;
      });
      const released = instanceStore.releaseOriginIfUnused(new URL(B.baseUrl).origin);
      await new Promise((r) => setTimeout(r, 20));
      expect(remove).not.toHaveBeenCalled();
      release();
      await adding;
      await released;
      expect(remove).not.toHaveBeenCalled();
    });

    it('never throws (permission API or storage error)', async () => {
      vi.spyOn(fakeBrowser.permissions, 'remove').mockRejectedValue(new Error('denied'));
      await expect(
        instanceStore.releaseOriginIfUnused('https://autre.example.net'),
      ).resolves.toBeUndefined();
      vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('storage down'));
      await expect(
        instanceStore.releaseOriginIfUnused('https://autre.example.net'),
      ).resolves.toBeUndefined();
    });
  });
});

describe('018: default template per instance purged with the instance (Q-U3, US4-7)', () => {
  const C = { id: 'inst-c', name: 'Bureau', baseUrl: 'https://bureau.example.net', apiKey: 'hb_cccccccc' };
  const DEFAULTS = {
    'inst-a': { id: 'tpl-1', name: 'Livre' },
    'inst-b': { id: 'tpl-2', name: 'Jeu' },
    'inst-c': { id: 'tpl-1', name: 'Livre' },
  };
  beforeEach(() => fakeBrowser.reset());

  it('remove(id): only the entry of this instance disappears; the others keep their default', async () => {
    await seedStore(await buildStore({ instances: [A, B, C] }));
    await fakeBrowser.storage.local.set({ defaultTemplateByInstance: DEFAULTS });
    expect((await instanceStore.remove('inst-b'))?.id).toBe('inst-b');
    expect((await fakeBrowser.storage.local.get('defaultTemplateByInstance')).defaultTemplateByInstance).toEqual({
      'inst-a': { id: 'tpl-1', name: 'Livre' },
      'inst-c': { id: 'tpl-1', name: 'Livre' },
    });
  });

  it('remove(id) without a default for this instance: the table is untouched', async () => {
    await seedStore(await buildStore({ instances: [A, B] }));
    await fakeBrowser.storage.local.set({ defaultTemplateByInstance: { 'inst-a': { id: 'tpl-1', name: 'Livre' } } });
    await instanceStore.remove('inst-b');
    expect((await fakeBrowser.storage.local.get('defaultTemplateByInstance')).defaultTemplateByInstance).toEqual({
      'inst-a': { id: 'tpl-1', name: 'Livre' },
    });
  });

  it('clear(): the whole defaultTemplateByInstance key is removed', async () => {
    await seedStore(await buildStore({ instances: [A, B] }));
    await fakeBrowser.storage.local.set({ defaultTemplateByInstance: DEFAULTS });
    await instanceStore.clear();
    expect(await fakeBrowser.storage.local.get('defaultTemplateByInstance')).toEqual({});
  });
});
