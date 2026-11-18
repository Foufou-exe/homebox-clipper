import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { activeImports } from '@/background/import/active-imports';
import { DEFAULT_LOCK_SETTINGS } from '@/shared/lock-policy';

/** Spec 013, Q-U3: automatic lock in the configuration store (A-1, A-8 to A-13). Fictitious data only. */
const URL = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx';
const PASS = 'une phrase de passe solide';
const T0 = new Date('2026-11-18T10:00:00Z').getTime();
const MIN = 60_000;

const save = () => configStore.save({ baseUrl: URL, apiKey: KEY, passphrase: PASS }, 1_000);
const session = () => fakeBrowser.storage.session.get(null);
const setPolicy = (policy: string) =>
  fakeBrowser.storage.local.set({ lockSettings: { v: 1, policy } });
const at = (ms: number) => vi.setSystemTime(T0 + ms);

describe('config-store: automatic lock (013, Q-U3)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    activeImports.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
    activeImports.clear();
  });

  it('A-1: idle-15m, 15 min + 1 ms later, getView() is locked; key and activity are gone', async () => {
    await save();
    await setPolicy('idle-15m');
    at(15 * MIN + 1);
    expect(await configStore.getView()).toMatchObject({ configured: true, locked: true });
    const s = await session();
    expect(s).not.toHaveProperty('homeboxUnlocked');
    expect(s).not.toHaveProperty('homeboxActivity');
  });

  it('A-1 (bound): exactly 15 min later, still unlocked', async () => {
    await save();
    await setPolicy('idle-15m');
    at(15 * MIN);
    expect(await configStore.getView()).toMatchObject({ locked: false });
  });

  it('A-8: key migrated without passphrase (encryptedKey null) is never locked automatically', async () => {
    await fakeBrowser.storage.local.set({
      homeboxConfig: { baseUrl: URL, apiKey: KEY, lastCheck: null },
    });
    await configStore.migrateLegacy();
    await setPolicy('idle-15m');
    at(60 * MIN);
    expect(await configStore.expireIfDue()).toBe(false);
    expect((await session()).homeboxUnlocked).toEqual({ apiKey: KEY });
    expect(await configStore.getCredentials()).toEqual({
      ok: true,
      value: { baseUrl: URL, apiKey: KEY },
    });
  });

  it('A-9: activity missing → locked (fail closed)', async () => {
    await save();
    await setPolicy('idle-4h');
    await fakeBrowser.storage.session.remove('homeboxActivity');
    expect(await configStore.getCredentials()).toEqual({ ok: false, error: 'LOCKED' });
  });

  it('A-9: activity 2 min in the future (clock set back) → locked', async () => {
    await save();
    await setPolicy('idle-4h');
    await fakeBrowser.storage.session.set({ homeboxActivity: { at: T0 + 2 * MIN } });
    expect((await configStore.getView()).locked).toBe(true);
  });

  it('A-10: browser-close (default), 10 h later → still unlocked (current behaviour)', async () => {
    await save();
    at(10 * 60 * MIN);
    expect((await configStore.getView()).locked).toBe(false);
    await setPolicy('browser-close');
    expect((await configStore.getView()).locked).toBe(false);
  });

  it('A-11: setLockSettings while unlocked asks for nothing, keeps the session and restarts the countdown', async () => {
    await save();
    const before = (await session()).homeboxUnlocked;
    at(10_000);
    expect(await configStore.setLockSettings('idle-15m')).toEqual({ v: 1, policy: 'idle-15m' });
    const s = await session();
    expect(s.homeboxUnlocked).toEqual(before);
    expect(s.homeboxActivity).toEqual({ at: T0 + 10_000 });
    expect((await fakeBrowser.storage.local.get('lockSettings')).lockSettings).toEqual({
      v: 1,
      policy: 'idle-15m',
    });
  });

  it('A-11: setLockSettings while locked writes the setting only (no activity)', async () => {
    await save();
    await configStore.lock();
    expect(await configStore.setLockSettings('every-open')).toEqual({ v: 1, policy: 'every-open' });
    expect(await session()).not.toHaveProperty('homeboxActivity');
  });

  it('A-12: delete() removes the activity, keeps lockSettings and updateNotice (E5)', async () => {
    await save();
    await setPolicy('idle-1h');
    await fakeBrowser.storage.local.set({
      updateNotice: { v: 1, version: '0.4.0', dismissed: true },
    });
    await configStore.delete();
    const s = await session();
    expect(s).not.toHaveProperty('homeboxActivity');
    expect(s).not.toHaveProperty('homeboxUnlocked');
    const local = await fakeBrowser.storage.local.get(null);
    expect(local.lockSettings).toEqual({ v: 1, policy: 'idle-1h' });
    expect(local.updateNotice).toEqual({ v: 1, version: '0.4.0', dismissed: true });
  });

  it('A-13: idle-15m, deadline passed → the encrypted history is locked too (FR-006)', async () => {
    await save();
    await setPolicy('idle-15m');
    expect(await configStore.historyState()).toBe('ready');
    at(16 * MIN);
    expect(await configStore.historyState()).toBe('locked');
    expect(await configStore.getHistoryKey()).toBeNull();
  });

  it('writeSession writes the key and the activity in a single set; lock() removes both in a single remove', async () => {
    const set = vi.spyOn(fakeBrowser.storage.session, 'set');
    await save();
    const sessionWrites = set.mock.calls.filter(([items]) => 'homeboxUnlocked' in items);
    expect(sessionWrites).toHaveLength(1);
    expect(Object.keys(sessionWrites[0]![0]).sort()).toEqual([
      'homeboxActivity',
      'homeboxUnlocked',
    ]);
    expect((sessionWrites[0]![0] as Record<string, unknown>).homeboxActivity).toEqual({ at: T0 });

    const remove = vi.spyOn(fakeBrowser.storage.session, 'remove');
    await configStore.lock();
    expect(remove).toHaveBeenCalledTimes(1);
    expect([remove.mock.calls[0]![0]].flat().sort()).toEqual([
      'homeboxActivity',
      'homeboxLockDue',
      'homeboxUnlocked',
    ]);
  });

  it('unlock() also records the activity', async () => {
    await save();
    await configStore.lock();
    at(5 * MIN);
    expect(await configStore.unlock(PASS)).toEqual({ ok: true, value: undefined });
    expect((await session()).homeboxActivity).toEqual({ at: T0 + 5 * MIN });
  });

  it('touch(): writes after more than 15 s, not before, and never while locked', async () => {
    await save();
    const set = vi.spyOn(fakeBrowser.storage.session, 'set');
    await configStore.touch(T0 + 15_000);
    expect(set).not.toHaveBeenCalled();
    await configStore.touch(T0 + 15_001);
    expect(set).toHaveBeenCalledTimes(1);
    expect((await session()).homeboxActivity).toEqual({ at: T0 + 15_001 });
    await configStore.lock();
    set.mockClear();
    await configStore.touch(T0 + 60 * MIN);
    expect(set).not.toHaveBeenCalled();
    expect(await session()).not.toHaveProperty('homeboxActivity');
  });

  it('expireIfDue(): idempotent, true only when it locks, suspended while an import runs', async () => {
    await save();
    await setPolicy('idle-15m');
    expect(await configStore.expireIfDue(T0 + MIN)).toBe(false);
    activeImports.add('import-1');
    expect(await configStore.expireIfDue(T0 + 20 * MIN)).toBe(false);
    expect((await session()).homeboxUnlocked).toBeDefined();
    activeImports.clear();
    expect(await configStore.expireIfDue(T0 + 20 * MIN)).toBe(true);
    expect(await configStore.expireIfDue(T0 + 20 * MIN)).toBe(false);
    expect(await session()).not.toHaveProperty('homeboxUnlocked');
  });

  it("lockIfEveryOpen(): 'locked', 'deferred' (import running) or 'none'", async () => {
    await save();
    expect(await configStore.lockIfEveryOpen()).toBe('none');
    await setPolicy('idle-1h');
    expect(await configStore.lockIfEveryOpen()).toBe('none');
    await setPolicy('every-open');
    activeImports.add('import-1');
    expect(await configStore.lockIfEveryOpen()).toBe('deferred');
    expect((await configStore.getView()).locked).toBe(false);
    activeImports.clear();
    expect(await configStore.lockIfEveryOpen()).toBe('locked');
    expect((await configStore.getView()).locked).toBe(true);
  });

  it("lockIfEveryOpen(): 'none' for a key migrated without passphrase", async () => {
    await fakeBrowser.storage.local.set({
      homeboxConfig: { baseUrl: URL, apiKey: KEY, lastCheck: null },
    });
    await configStore.migrateLegacy();
    await setPolicy('every-open');
    expect(await configStore.lockIfEveryOpen()).toBe('none');
    expect((await session()).homeboxUnlocked).toEqual({ apiKey: KEY });
  });

  it('getLockSettings(): read error → default, never an exception', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(new Error('broken'));
    expect(await configStore.getLockSettings()).toEqual(DEFAULT_LOCK_SETTINGS);
    await fakeBrowser.storage.local.set({ lockSettings: { v: 1, policy: 'never' } });
    expect(await configStore.getLockSettings()).toEqual({ v: 1, policy: 'browser-close' });
  });

  it('source sweep: the session key is only read in readSession, expireIfDue, lock and delete', () => {
    const source = readFileSync(
      resolve(__dirname, '../../src/background/config/config-store.ts'),
      'utf8',
    );
    expect(source.match(/'homeboxUnlocked'/g)).toHaveLength(1);
    const lines = source.split('\n');
    // sessionState: the expiry check shared by readSession and expireIfDue (review T070).
    const allowed = ['readSession', 'sessionState', 'expireIfDue', 'lock', 'delete'];
    const reads = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /storage\.session\.get\(/.test(line) && /SESSION_KEY|null/.test(line));
    expect(reads.length).toBeGreaterThan(0);
    for (const { i } of reads) {
      const owner = lines
        .slice(0, i + 1)
        .reverse()
        .map((l) => l.match(/^(?:export )?(?:async )?function (\w+)|^ {2}async (\w+)\(/))
        .find(Boolean);
      const name = owner?.[1] ?? owner?.[2];
      expect(allowed, `line ${i + 1}`).toContain(name);
    }
  });
});
