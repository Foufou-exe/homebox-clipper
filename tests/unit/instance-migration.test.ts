import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { encryptApiKey } from '@/background/config/key-vault';
import { fromLegacy, instanceStore } from '@/background/config/instance-store';
import { importHistoryKey, seal } from '@/background/history/history-crypto';
import type { ImportHistoryEntry, InstancesStore } from '@/shared/types';
import {
  A,
  FAST,
  LEGACY_URL,
  PASSPHRASE,
  buildStore,
  seedLegacy,
  seedStore,
} from './instances-fixture';

/**
 * Spec 016, US1, Q-U1: the single configuration of 0.1.0 → 0.6.0 becomes the first instance, without passphrase,
 * permission, network or session write; idempotent and resumable (contracts/storage-migration.md).
 */

const local = () => fakeBrowser.storage.local.get(null);
const session = () => fakeBrowser.storage.session.get(null);
const stored = async () => (await local()).homeboxInstances as InstancesStore;
const consoleSpies = () =>
  (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
    vi.spyOn(console, k).mockImplementation(() => undefined),
  );

const entry = (id: string, instance: string): ImportHistoryEntry => ({
  v: 1,
  id,
  importedAt: '2026-11-12T10:00:00.000Z',
  name: 'Clavier sans fil Exemple Pro',
  merchantId: 'amazon.fr',
  orderNumber: '999-0000000-0000001',
  purchaseDate: '2026-10-22',
  instance,
  entityId: 'e1',
  status: 'complete',
  missing: [],
  reason: null,
});

describe('instance migration (016, US1, Q-U1)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
  });

  it('step 1: a single set of homeboxInstances equal to fromLegacy; homeboxConfig still present right after', async () => {
    const { legacy } = await seedLegacy();
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    const remove = vi
      .spyOn(fakeBrowser.storage.local, 'remove')
      .mockRejectedValueOnce(new Error('stop after step 1'));
    consoleSpies();
    expect(await instanceStore.migrate()).toBe('failed');
    const writes = set.mock.calls.filter(([items]) => 'homeboxInstances' in items);
    expect(writes).toHaveLength(1);
    expect(writes[0]![0]).toEqual({ homeboxInstances: fromLegacy(legacy) });
    expect((await local()).homeboxConfig).toEqual(legacy);
    remove.mockRestore();
  });

  it('migrated, then step 3: homeboxConfig removed, its origin kept (still used by the instance)', async () => {
    const { legacy } = await seedLegacy();
    const removeOrigin = vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    expect(await instanceStore.migrate()).toBe('migrated');
    const all = await local();
    expect(all).not.toHaveProperty('homeboxConfig');
    expect(all.homeboxInstances).toEqual(fromLegacy(legacy));
    expect(removeOrigin).not.toHaveBeenCalled();
  });

  it('idempotent: migrate() × 3 gives the same state, then "none"', async () => {
    await seedLegacy();
    expect(await instanceStore.migrate()).toBe('migrated');
    const after = await local();
    expect(await instanceStore.migrate()).toBe('none');
    expect(await instanceStore.migrate()).toBe('none');
    expect(await local()).toEqual(after);
  });

  it('nothing configured → "none", nothing written', async () => {
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    expect(await instanceStore.migrate()).toBe('none');
    expect(set).not.toHaveBeenCalled();
  });

  it('stopped after step 1, then after step 2: the restart finishes without duplication or key loss (FR-028)', async () => {
    const { legacy } = await seedLegacy();
    await fakeBrowser.storage.local.set({ lastLocationByInstance: { [LEGACY_URL]: 'loc-1' } });
    consoleSpies();
    // Stop after step 1 (the step 2 write fails).
    const original = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local);
    const stop1 = vi.spyOn(fakeBrowser.storage.local, 'set').mockImplementation((async (
      items: Record<string, unknown>,
    ) => {
      if ('lastLocationByInstance' in items) throw new Error('stop after step 1');
      return original(items);
    }) as never);
    expect(await instanceStore.migrate()).toBe('failed');
    stop1.mockRestore();
    expect((await local()).homeboxConfig).toEqual(legacy);
    // Stop after step 2 (the removal of homeboxConfig fails).
    const stop2 = vi
      .spyOn(fakeBrowser.storage.local, 'remove')
      .mockRejectedValueOnce(new Error('stop after step 2'));
    expect(await instanceStore.migrate()).toBe('failed');
    stop2.mockRestore();
    expect((await local()).lastLocationByInstance).toEqual({ migrated: 'loc-1' });
    // Restart: finishes.
    expect(await instanceStore.migrate()).toBe('resumed');
    const all = await local();
    expect(all).not.toHaveProperty('homeboxConfig');
    expect((all.homeboxInstances as InstancesStore).instances).toHaveLength(1);
    expect(all.homeboxInstances).toEqual(fromLegacy(legacy));
    expect(all.lastLocationByInstance).toEqual({ migrated: 'loc-1' });
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    expect(await configStore.getCredentials('migrated')).toMatchObject({
      ok: true,
      value: { apiKey: 'hb_xxxxxxxx' },
    });
  });

  describe('fallback view when the migration fails (storage error)', () => {
    it('read() serves the instance migrated, homeboxConfig intact, unlock and getCredentials work', async () => {
      const { legacy } = await seedLegacy();
      consoleSpies();
      const set = vi
        .spyOn(fakeBrowser.storage.local, 'set')
        .mockRejectedValue(new Error('storage down'));
      expect(await instanceStore.migrate()).toBe('failed');
      expect((await instanceStore.read())?.instances[0]).toMatchObject({
        id: 'migrated',
        baseUrl: LEGACY_URL,
      });
      expect((await local()).homeboxConfig).toEqual(legacy);
      // The check seal cannot be written: the unlock still succeeds (nothing is lost).
      expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
      expect(await configStore.getCredentials('migrated')).toMatchObject({
        ok: true,
        value: { apiKey: 'hb_xxxxxxxx' },
      });
      // A write retries the migration first; if it fails again it throws (BAD_MESSAGE at the router), nothing lost.
      await expect(
        configStore.setLastCheck('migrated', {
          status: 'ok',
          version: '1',
          at: '2026-11-19T10:00:00.000Z',
        }),
      ).rejects.toThrow();
      expect((await local()).homeboxConfig).toEqual(legacy);
      set.mockRestore();
      // Storage back: the next write migrates first, then writes.
      await configStore.setLastCheck('migrated', {
        status: 'ok',
        version: '1',
        at: '2026-11-19T10:00:00.000Z',
      });
      const all = await local();
      expect(all).not.toHaveProperty('homeboxConfig');
      expect((all.homeboxInstances as InstancesStore).instances[0]!.lastCheck).toMatchObject({
        status: 'ok',
      });
    });
  });

  it('invalid homeboxConfig (unexpected shape): neither migrated nor removed, "failed", constant log only', async () => {
    const spies = consoleSpies();
    const weird = {
      baseUrl: 'https://homebox.example.com',
      encryptedKey: { kdf: 'autre' },
      maskedKey: 'hb_••••xxxx',
    };
    await fakeBrowser.storage.local.set({ homeboxConfig: weird });
    expect(await instanceStore.migrate()).toBe('failed');
    expect(await local()).toEqual({ homeboxConfig: weird });
    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output).toContain('config/migrate');
    expect(output).not.toContain('homebox.example.com');
  });

  describe('re-indexing of lastLocationByInstance (step 2)', () => {
    it('{ origin: loc-1, old origin: loc-9 } → { migrated: loc-1 }', async () => {
      await seedLegacy();
      await fakeBrowser.storage.local.set({
        lastLocationByInstance: {
          'https://homebox.example.com': 'loc-1',
          'https://old.example.com': 'loc-9',
        },
      });
      await instanceStore.migrate();
      expect((await local()).lastLocationByInstance).toEqual({ migrated: 'loc-1' });
    });

    it('a table already indexed by id is unchanged', async () => {
      await seedLegacy();
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { migrated: 'loc-2' } });
      await instanceStore.migrate();
      expect((await local()).lastLocationByInstance).toEqual({ migrated: 'loc-2' });
    });

    it('no table: nothing written', async () => {
      await seedLegacy();
      await instanceStore.migrate();
      expect(await local()).not.toHaveProperty('lastLocationByInstance');
    });
  });

  it('downgrade conflict: homeboxConfig and homeboxInstances both present → homeboxConfig removed, homeboxInstances intact', async () => {
    const store = await buildStore({ instances: [A] });
    await seedStore(store);
    await fakeBrowser.storage.local.set({
      homeboxConfig: {
        baseUrl: 'https://ancienne.example.net',
        encryptedKey: null,
        maskedKey: 'hb_••••xxxx',
        lastCheck: null,
      },
    });
    const removeOrigin = vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    expect(await instanceStore.migrate()).toBe('resumed');
    const all = await local();
    expect(all).not.toHaveProperty('homeboxConfig');
    expect(all.homeboxInstances).toEqual(store);
    expect(removeOrigin).toHaveBeenCalledWith({ origins: ['https://ancienne.example.net/*'] });
  });

  it('no passphrase, no permission request, no network, no session write (US1-2)', async () => {
    await seedLegacy();
    await fakeBrowser.storage.session.set({ homeboxUnlocked: { apiKey: 'hb_xxxxxxxx' }, other: 1 });
    const before = await session();
    const request = vi.spyOn(fakeBrowser.permissions, 'request');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const sessionSet = vi.spyOn(fakeBrowser.storage.session, 'set');
    const sessionRemove = vi.spyOn(fakeBrowser.storage.session, 'remove');
    const derive = vi.spyOn(crypto.subtle, 'deriveKey');
    expect(await instanceStore.migrate()).toBe('migrated');
    expect(request).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
    expect(sessionRemove).not.toHaveBeenCalled();
    expect(derive).not.toHaveBeenCalled();
    expect(await session()).toEqual(before);
    vi.unstubAllGlobals();
  });

  describe('SC-001: every former format keeps working after migration', () => {
    it('0.5/0.6 (with historyKey): unlock opens the key and the same history key', async () => {
      const { historyKey } = await seedLegacy();
      await instanceStore.migrate();
      expect(await configStore.getView()).toMatchObject({
        configured: true,
        locked: true,
        needsPassphrase: false,
      });
      expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
      expect(await configStore.getCredentials('migrated')).toEqual({
        ok: true,
        value: { id: 'migrated', baseUrl: LEGACY_URL, apiKey: 'hb_xxxxxxxx' },
      });
      expect(await configStore.getHistoryKey()).toEqual(historyKey);
      expect((await stored()).vault!.check).toBeDefined();
      expect(await configStore.unlock('mauvaise phrase de test')).toEqual({
        ok: false,
        error: 'WRONG_PASSPHRASE',
      });
    });

    it('before 012 (no historyKey): check and history key created at the first unlock', async () => {
      const encryptedKey = await encryptApiKey('hb_xxxxxxxx', PASSPHRASE, LEGACY_URL, FAST);
      await fakeBrowser.storage.local.set({
        homeboxConfig: {
          baseUrl: LEGACY_URL,
          encryptedKey,
          maskedKey: 'hb_••••xxxx',
          lastCheck: null,
        },
      });
      await instanceStore.migrate();
      expect((await stored()).vault).toEqual({
        kdf: 'PBKDF2-SHA256',
        iterations: FAST,
        salt: encryptedKey.salt,
      });
      expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
      const vault = (await stored()).vault!;
      expect(vault.check).toBeDefined();
      expect(vault.historyKey).toBeDefined();
      expect(await configStore.historyState()).toBe('ready');
    });

    it('legacy key (encryptedKey null): vault null, key null, session v1 read as v2, needsPassphrase (US1-5)', async () => {
      await fakeBrowser.storage.local.set({
        homeboxConfig: { baseUrl: LEGACY_URL, apiKey: 'hb_xxxxxxxx', lastCheck: null },
      });
      await configStore.migrateLegacy();
      expect(await instanceStore.migrate()).toBe('migrated');
      const store = await stored();
      expect(store.vault).toBeNull();
      expect(store.instances[0]).toMatchObject({
        id: 'migrated',
        key: null,
        maskedKey: 'hb_••••xxxx',
      });
      expect((await session()).homeboxUnlocked).toEqual({ apiKey: 'hb_xxxxxxxx' });
      expect(await configStore.getCredentials('migrated')).toMatchObject({
        ok: true,
        value: { apiKey: 'hb_xxxxxxxx' },
      });
      expect(await configStore.getView()).toMatchObject({ needsPassphrase: true, locked: false });
    });

    it.each([
      ['null', null],
      ['ok', { status: 'ok' as const, version: '0.21.0', at: '2026-11-01T10:00:00.000Z' }],
      [
        'error',
        { status: 'error' as const, code: 'UNAUTHORIZED' as const, at: '2026-11-01T10:00:00.000Z' },
      ],
    ])('lastCheck %s kept; view: name = host, same masked key (US1-1)', async (_, lastCheck) => {
      const { legacy } = await seedLegacy();
      await fakeBrowser.storage.local.set({ homeboxConfig: { ...legacy, lastCheck } });
      await instanceStore.migrate();
      await configStore.unlock(PASSPHRASE);
      const view = await configStore.getView();
      // ADAPTED (016, T100): no top-level compatibility fields; the instance below carries them.
      expect(view).toMatchObject({ defaultInstanceId: 'migrated' });
      expect(view).not.toHaveProperty('baseUrl');
      expect(view.instances).toEqual([
        {
          id: 'migrated',
          name: 'homebox.example.com',
          baseUrl: LEGACY_URL,
          maskedKey: 'hb_••••xxxx',
          lastCheck,
          keyState: 'ready',
        },
      ]);
    });
  });

  it('history entries: unlock attaches inst "migrated" to the entries of the migrated address only (US1-3)', async () => {
    const { historyKey } = await seedLegacy();
    const key = await importHistoryKey(historyKey);
    const envs = {
      'importHistory:a': await seal(entry('a', LEGACY_URL), key, 'a'),
      'importHistory:b': await seal(entry('b', LEGACY_URL), key, 'b'),
      'importHistory:c': await seal(entry('c', 'https://autre.example.net'), key, 'c'),
    };
    await fakeBrowser.storage.local.set(envs);
    await instanceStore.migrate();
    expect(await configStore.unlock(PASSPHRASE)).toEqual({ ok: true, value: undefined });
    const all = await local();
    expect(all['importHistory:a']).toEqual({ ...envs['importHistory:a'], inst: 'migrated' });
    expect(all['importHistory:b']).toEqual({ ...envs['importHistory:b'], inst: 'migrated' });
    expect(all['importHistory:c']).toEqual(envs['importHistory:c']);
  });

  it('ready is set immediately: a read started right after migrate(before) waits for before, then the migration', async () => {
    const { legacy } = await seedLegacy();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run = instanceStore.migrate(() => gate);
    let read: InstancesStore | null | undefined;
    const reading = instanceStore.read().then((r) => (read = r));
    await new Promise((r) => setTimeout(r, 0));
    expect(read).toBeUndefined();
    release();
    expect(await run).toBe('migrated');
    await reading;
    expect(read).toEqual(fromLegacy(legacy));
    expect(await local()).not.toHaveProperty('homeboxConfig');
  });

  it('migrate(before): a failing before step still runs the migration, never throws', async () => {
    await seedLegacy();
    expect(await instanceStore.migrate(() => Promise.reject(new Error('legacy step failed')))).toBe('migrated');
  });
});
