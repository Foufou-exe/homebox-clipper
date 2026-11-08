import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore, maskKey } from '@/background/config/config-store';

const URL = 'https://homebox.example.com';
const KEY = 'hb_secret_api_key_a1b2';
const PASS = 'une phrase de passe solide';
const save = (over: Partial<{ baseUrl: string; apiKey: string; passphrase: string }> = {}) =>
  configStore.save({ baseUrl: URL, apiKey: KEY, passphrase: PASS, ...over }, 1_000);

const local = async () => JSON.stringify(await fakeBrowser.storage.local.get(null));

describe('config-store (encrypted key)', () => {
  beforeEach(() => fakeBrowser.reset());

  it("the key is never written in plaintext to storage.local", async () => {
    await save();
    const stored = await local();
    expect(stored).toContain(URL);
    expect(stored).not.toContain(KEY);
    expect(stored).toContain('"ct"');
  });

  it('after saving, the session is unlocked', async () => {
    await save();
    expect(await configStore.getCredentials()).toEqual({ ok: true, value: { baseUrl: URL, apiKey: KEY } });
    expect(await configStore.getView()).toMatchObject({ configured: true, locked: false, needsPassphrase: false });
  });

  it('locking removes the key from the session; unlocking restores it', async () => {
    await save();
    await configStore.lock();
    expect(await configStore.getCredentials()).toEqual({ ok: false, error: 'LOCKED' });
    expect((await configStore.getView()).locked).toBe(true);

    expect(await configStore.unlock('mauvaise phrase')).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
    expect(await configStore.unlock(PASS)).toEqual({ ok: true, value: undefined });
    expect(await configStore.getCredentials()).toMatchObject({ ok: true, value: { apiKey: KEY } });
  });

  it('browser closed (session cleared) → locked', async () => {
    await save();
    await fakeBrowser.storage.session.clear();
    expect(await configStore.getCredentials()).toEqual({ ok: false, error: 'LOCKED' });
  });

  it("a URL modified directly in storage prevents unlocking", async () => {
    await save();
    await configStore.lock();
    const stored = (await fakeBrowser.storage.local.get('homeboxConfig')).homeboxConfig as Record<string, unknown>;
    await fakeBrowser.storage.local.set({ homeboxConfig: { ...stored, baseUrl: 'https://attaquant.example.com' } });
    expect(await configStore.unlock(PASS)).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
  });

  it('currentKey: decrypts with the passphrase', async () => {
    await save();
    await configStore.lock();
    expect(await configStore.currentKey(PASS)).toEqual({ ok: true, value: KEY });
    expect(await configStore.currentKey('mauvaise phrase')).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
  });

  it('the view exposed to the UI never contains the key', async () => {
    await save();
    const view = await configStore.getView();
    expect(view).toEqual({
      configured: true,
      baseUrl: URL,
      maskedKey: 'hb_••••a1b2',
      lastCheck: null,
      locked: false,
      needsPassphrase: false,
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
      await fakeBrowser.storage.local.set({ homeboxConfig: { baseUrl: URL, apiKey: KEY, lastCheck: null } });
      await configStore.migrateLegacy();
    });

    it('removes the key from disk and keeps it in session memory', async () => {
      expect(await local()).not.toContain(KEY);
      expect(await configStore.getCredentials()).toMatchObject({ ok: true, value: { apiKey: KEY } });
      expect(await configStore.getView()).toMatchObject({ needsPassphrase: true, locked: false, maskedKey: 'hb_••••a1b2' });
    });

    it('currentKey returns the migrated key so it can be encrypted with a new passphrase', async () => {
      expect(await configStore.currentKey('peu importe')).toEqual({ ok: true, value: KEY });
      await save();
      expect(await configStore.getView()).toMatchObject({ needsPassphrase: false });
    });

    it('if the session is lost before the passphrase, the key must be re-entered', async () => {
      await fakeBrowser.storage.session.clear();
      expect(await configStore.getCredentials()).toEqual({ ok: false, error: 'NOT_CONFIGURED' });
      expect(await configStore.currentKey('x')).toEqual({ ok: false, error: 'NOT_CONFIGURED' });
    });
  });

  it('deletion erases the whole lastLocationByInstance key, all instances included (FR-021, scenario 21)', async () => {
    await save();
    vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    await fakeBrowser.storage.local.set({
      lastLocationByInstance: { 'https://homebox.example.com': 'loc-1', 'https://autre.example.com': 'loc-2' },
    });

    await configStore.delete();

    expect(await fakeBrowser.storage.local.get('lastLocationByInstance')).toEqual({});
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
  });

  it("deletion erases everything: config, session key, imports, origin permission", async () => {
    await save({ baseUrl: 'https://homebox.example.com/sub' });
    const remove = vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    await fakeBrowser.storage.session.set({ 'pendingImport:1': { id: 'x' }, other: 1 });

    await configStore.delete();

    expect(remove).toHaveBeenCalledWith({ origins: ['https://homebox.example.com/*'] });
    expect(await fakeBrowser.storage.session.get(null)).toEqual({ other: 1 });
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
  });
});
