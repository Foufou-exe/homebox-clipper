import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { encryptApiKey } from '@/background/config/key-vault';
import { generateHistoryKey, importHistoryKey, seal } from '@/background/history/history-crypto';
import { createHistoryStore } from '@/background/history/history-store';
import { bytesToBase64 } from '@/shared/pdf';
import type { ImportHistoryEntry } from '@/shared/types';

const URL = 'https://homebox.example.com';
const KEY = 'hb_secret_api_key_a1b2';
const KEY2 = 'hb_other_api_key_c3d4';
const PASS = 'une phrase de passe solide';
const PASS2 = 'une autre phrase de passe';
const save = (over: Partial<{ baseUrl: string; apiKey: string; passphrase: string }> = {}) =>
  configStore.save({ baseUrl: URL, apiKey: KEY, passphrase: PASS, ...over }, 1_000);

const local = async () => fakeBrowser.storage.local.get(null);
const session = async () => fakeBrowser.storage.session.get(null);
const stored = async () => (await local()).homeboxConfig as Record<string, unknown>;
const hekB64 = async () => {
  const k = await configStore.getHistoryKey();
  return k ? bytesToBase64(k) : null;
};

const entry = (id: string): ImportHistoryEntry => ({
  v: 1,
  id,
  importedAt: '2026-11-12T10:00:00.000Z',
  name: 'Clavier sans fil Exemple Pro',
  merchantId: 'amazon.fr',
  orderNumber: '999-0000000-0000001',
  purchaseDate: '2026-10-22',
  instance: URL,
  entityId: 'e1',
  status: 'complete',
  missing: [],
  reason: null,
});

/** Writes an encrypted entry with the history key of the session. */
async function writeEntry(id: string) {
  const raw = await configStore.getHistoryKey();
  const env = await seal(entry(id), await importHistoryKey(raw!), id);
  await fakeBrowser.storage.local.set({ [`importHistory:${id}`]: env });
  return env;
}

describe('config-store: history key (R10.2, Q-U31 to Q-U35)', () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());

  describe('sealed in the configuration, open in the session only (Q-U31)', () => {
    it('after save: historyKey sealed { iv, ct }, open key in session next to apiKey, never in storage.local', async () => {
      await save();
      const sealed = (await stored()).historyKey as Record<string, unknown>;
      expect(Object.keys(sealed).sort()).toEqual(['ct', 'iv']);
      const s = (await session()).homeboxUnlocked as Record<string, unknown>;
      expect(Object.keys(s).sort()).toEqual(['apiKey', 'historyKey']);
      expect(s.apiKey).toBe(KEY);
      const b64 = await hekB64();
      expect(b64).toBe(s.historyKey);
      expect((await configStore.getHistoryKey())?.length).toBe(32);
      const raw = JSON.stringify(await local());
      expect(raw).not.toContain(b64!);
      expect(raw).not.toContain(KEY);
      expect(JSON.stringify(sealed)).not.toContain(KEY);
      expect(await configStore.historyState()).toBe('ready');
    });

    it('lock() removes both; session cleared → locked', async () => {
      await save();
      await configStore.lock();
      expect(await session()).toEqual({});
      expect(await configStore.historyState()).toBe('locked');
      expect(await configStore.getHistoryKey()).toBeNull();
      await configStore.unlock(PASS);
      await fakeBrowser.storage.session.clear();
      expect(await configStore.historyState()).toBe('locked');
      expect(await configStore.getHistoryKey()).toBeNull();
    });

    it('wrong passphrase at unlock: nothing in session; the passphrase is stored nowhere', async () => {
      await save();
      await configStore.lock();
      expect(await configStore.unlock('mauvaise phrase')).toEqual({
        ok: false,
        error: 'WRONG_PASSPHRASE',
      });
      expect(await session()).toEqual({});
      expect(await configStore.unlock(PASS)).toEqual({ ok: true, value: undefined });
      const all = JSON.stringify([await local(), await session()]);
      expect(all).not.toContain(PASS);
      expect(await configStore.historyState()).toBe('ready');
    });

    it('unlock gives back the same history key', async () => {
      await save();
      const before = await hekB64();
      await configStore.lock();
      await configStore.unlock(PASS);
      expect(await hekB64()).toBe(before);
    });
  });

  describe('reconfiguration (R5.5)', () => {
    it('unlocked, new API key and new passphrase: same history key, entries not rewritten (Q-U32)', async () => {
      await save();
      const before = await hekB64();
      const env = await writeEntry('a');
      await save({ apiKey: KEY2, passphrase: PASS2 });
      expect(await hekB64()).toBe(before);
      expect((await local())['importHistory:a']).toEqual(env);
      await configStore.lock();
      expect(await configStore.unlock(PASS)).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
      expect(await configStore.unlock(PASS2)).toEqual({ ok: true, value: undefined });
      expect(await hekB64()).toBe(before);
      expect((await local())['importHistory:a']).toEqual(env);
    });

    it('locked, kept key and current passphrase (address change only): key reopened, entries kept', async () => {
      await save();
      const before = await hekB64();
      const env = await writeEntry('a');
      await configStore.lock();
      await save({ baseUrl: 'https://homebox.example.com/sub' });
      expect(await hekB64()).toBe(before);
      expect((await local())['importHistory:a']).toEqual(env);
    });
  });

  describe('configuration from before 012 (Q-U35)', () => {
    it('the first successful unlock creates and seals the history key with a single derivation', async () => {
      const encryptedKey = await encryptApiKey(KEY, PASS, URL, 1_000);
      await fakeBrowser.storage.local.set({
        homeboxConfig: { baseUrl: URL, encryptedKey, maskedKey: 'hb_••••a1b2', lastCheck: null },
      });
      expect(await configStore.historyState()).toBe('locked');
      const spy = vi.spyOn(crypto.subtle, 'deriveKey');
      expect(await configStore.unlock(PASS)).toEqual({ ok: true, value: undefined });
      expect(spy).toHaveBeenCalledTimes(1);
      const cfg = await stored();
      expect(Object.keys(cfg.historyKey as object).sort()).toEqual(['ct', 'iv']);
      expect(cfg.encryptedKey).toEqual(encryptedKey);
      expect(await configStore.historyState()).toBe('ready');
      expect(await configStore.getCredentials()).toEqual({
        ok: true,
        value: { baseUrl: URL, apiKey: KEY },
      });
      const created = await hekB64();
      await configStore.lock();
      await configStore.unlock(PASS);
      expect(await hekB64()).toBe(created);
    });

    it("key migrated without a passphrase: 'unavailable', no history key", async () => {
      await fakeBrowser.storage.local.set({
        homeboxConfig: { baseUrl: URL, apiKey: KEY, lastCheck: null },
      });
      await configStore.migrateLegacy();
      expect(await configStore.historyState()).toBe('unavailable');
      expect(await configStore.getHistoryKey()).toBeNull();
    });

    it("no configuration: 'unavailable'", async () => {
      expect(await configStore.historyState()).toBe('unavailable');
      expect(await configStore.getHistoryKey()).toBeNull();
    });
  });

  describe('unlocking the API key succeeds even if the history key is absent or corrupted', () => {
    const corrupt = async (value: unknown) => {
      await save();
      await configStore.lock();
      const cfg = await stored();
      const next = { ...cfg };
      if (value === 'DELETE') delete next.historyKey;
      else if (value === 'TAMPER') {
        const s = cfg.historyKey as { iv: string; ct: string };
        next.historyKey = { ...s, ct: `${s.ct.slice(0, -6)}AAAAAA` };
      } else next.historyKey = value;
      await fakeBrowser.storage.local.set({ homeboxConfig: next });
    };

    it.each([['DELETE'], [null]])('absent (%s): unlock ok, key created (ready)', async (value) => {
      await corrupt(value);
      expect(await configStore.unlock(PASS)).toEqual({ ok: true, value: undefined });
      expect(await configStore.getCredentials()).toEqual({
        ok: true,
        value: { baseUrl: URL, apiKey: KEY },
      });
      expect(await configStore.historyState()).toBe('ready');
      expect((await stored()).historyKey).toBeTruthy();
    });

    it.each([['TAMPER'], [{}], ['chaine'], [42]])(
      "corrupted or malformed (%s): unlock ok, no history key, 'unavailable' (never 'locked')",
      async (value) => {
        await corrupt(value);
        expect(await configStore.unlock(PASS)).toEqual({ ok: true, value: undefined });
        expect(await configStore.getCredentials()).toEqual({
          ok: true,
          value: { baseUrl: URL, apiKey: KEY },
        });
        expect(await configStore.getHistoryKey()).toBeNull();
        expect(Object.keys((await session()).homeboxUnlocked as object)).toEqual(['apiKey']);
        expect(await configStore.historyState()).toBe('unavailable');
        expect((await configStore.getView()).locked).toBe(false);
      },
    );
  });

  it('getView never contains the history key', async () => {
    await save();
    const b64 = await hekB64();
    const view = JSON.stringify(await configStore.getView());
    expect(view).not.toContain(b64!);
    expect(view).not.toContain('historyKey');
  });

  it('a random key generated by the module is not the stored one (sanity)', async () => {
    await save();
    expect(await hekB64()).not.toBe(bytesToBase64(generateHistoryKey()));
  });
});

describe('config-store: erasing the history (012, US3, Q-U33, Q-U34, FR-009)', () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());
  const historyKeys = async () => Object.keys(await local()).filter((k) => k.startsWith('importHistory:'));

  it('Q-U33: locked, save with a new passphrase: every entry erased, new history key, recording works again', async () => {
    await save();
    const before = await hekB64();
    await writeEntry('a');
    await writeEntry('b');
    await fakeBrowser.storage.local.set({ 'importHistory:future': { v: 2 } });
    await configStore.lock();
    await save({ apiKey: KEY2, passphrase: PASS2 });
    expect(await historyKeys()).toEqual([]);
    const after = await hekB64();
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    await writeEntry('c');
    expect(await historyKeys()).toEqual(['importHistory:c']);
  });

  it('locked, sealed key unreadable: save erases and creates a new key', async () => {
    await save();
    await writeEntry('a');
    await configStore.lock();
    await fakeBrowser.storage.local.set({ homeboxConfig: { ...(await stored()), historyKey: { iv: 'x', ct: 'y' } } });
    await save();
    expect(await historyKeys()).toEqual([]);
    expect(await configStore.historyState()).toBe('ready');
  });

  it('kept key + current passphrase while locked: history kept; unlocked: never erased', async () => {
    await save();
    const env = await writeEntry('a');
    await configStore.lock();
    await save();
    expect((await local())['importHistory:a']).toEqual(env);
    await save({ apiKey: KEY2, passphrase: PASS2 });
    expect((await local())['importHistory:a']).toEqual(env);
  });

  it('address change without deleting the configuration keeps the entries', async () => {
    await save();
    const env = await writeEntry('a');
    await save({ baseUrl: 'https://autre.example.com' });
    expect((await local())['importHistory:a']).toEqual(env);
  });

  it('Q-U34 / Q-U15: delete() removes the entries, the sealed key and the session key; keeps the setting and foreign keys', async () => {
    vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    await save();
    await writeEntry('a');
    await fakeBrowser.storage.local.set({
      'importHistory:garbage': 'x',
      importHistorySettings: { v: 1, enabled: false },
      foreign: 1,
    });
    await configStore.delete();
    expect(await local()).toEqual({ importHistorySettings: { v: 1, enabled: false }, foreign: 1 });
    expect(await session()).toEqual({});
    expect(await configStore.getHistoryKey()).toBeNull();
    expect(await configStore.historyState()).toBe('unavailable');
  });
});

describe('config-store: erasing is serialized with the history queue (012, T074 review)', () => {
  beforeEach(() => fakeBrowser.reset());
  afterEach(() => vi.restoreAllMocks());

  const runningEntry = (id: string): ImportHistoryEntry => ({ ...entry(id), status: 'running', entityId: 'e', missing: [] });
  async function plantRunning(n: number) {
    const k = await importHistoryKey(generateHistoryKey());
    for (let i = 0; i < n; i++) {
      const id = `id${i}`;
      await fakeBrowser.storage.local.set({ [`importHistory:${id}`]: await seal(runningEntry(id), k, id) });
    }
    return k;
  }
  const historyKeys = async () => Object.keys(await local()).filter((k) => k.startsWith('importHistory:'));

  it('delete() racing a list() that reconciles orphaned entries: no entry is written back after the erasing', async () => {
    vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    await save();
    const k = await plantRunning(30);
    const store = createHistoryStore();
    const listing = store.list(k);
    await new Promise((r) => setTimeout(r, 0));
    await configStore.delete();
    await listing;
    expect(await historyKeys()).toEqual([]);
  });

  it('locked reconfiguration racing a list(): no entry is written back after the erasing', async () => {
    await save();
    await configStore.lock();
    const k = await plantRunning(30);
    const store = createHistoryStore();
    const listing = store.list(k);
    await new Promise((r) => setTimeout(r, 0));
    await save({ apiKey: KEY2, passphrase: PASS2 });
    await listing;
    expect(await historyKeys()).toEqual([]);
  });

  it('delete() clears the session first: a storage error afterwards never leaves the history key open', async () => {
    await save();
    vi.spyOn(fakeBrowser.storage.local, 'remove').mockRejectedValue(new Error('storage down'));
    await expect(configStore.delete()).rejects.toThrow('storage down');
    expect(await configStore.getHistoryKey()).toBeNull();
    expect((await session()).homeboxUnlocked).toBeUndefined();
  });
});
