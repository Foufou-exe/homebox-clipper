import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore, maskKey } from '@/background/config/config-store';

const URL = 'https://homebox.example.com';
const KEY = 'hb_secret_api_key_a1b2';
const PASS = 'une phrase de passe solide';
const save = (over: Partial<{ baseUrl: string; apiKey: string; passphrase: string }> = {}) =>
  configStore.save({ baseUrl: URL, apiKey: KEY, passphrase: PASS, ...over }, 1_000);

const local = async () => JSON.stringify(await fakeBrowser.storage.local.get(null));

describe('config-store (clé chiffrée)', () => {
  beforeEach(() => fakeBrowser.reset());

  it("la clé n'est jamais écrite en clair dans storage.local", async () => {
    await save();
    const stored = await local();
    expect(stored).toContain(URL);
    expect(stored).not.toContain(KEY);
    expect(stored).toContain('"ct"');
  });

  it('après enregistrement, la session est déverrouillée', async () => {
    await save();
    expect(await configStore.getCredentials()).toEqual({ ok: true, value: { baseUrl: URL, apiKey: KEY } });
    expect(await configStore.getView()).toMatchObject({ configured: true, locked: false, needsPassphrase: false });
  });

  it('verrouiller retire la clé de la session ; déverrouiller la restaure', async () => {
    await save();
    await configStore.lock();
    expect(await configStore.getCredentials()).toEqual({ ok: false, error: 'LOCKED' });
    expect((await configStore.getView()).locked).toBe(true);

    expect(await configStore.unlock('mauvaise phrase')).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
    expect(await configStore.unlock(PASS)).toEqual({ ok: true, value: undefined });
    expect(await configStore.getCredentials()).toMatchObject({ ok: true, value: { apiKey: KEY } });
  });

  it('fermeture du navigateur (session vidée) → verrouillé', async () => {
    await save();
    await fakeBrowser.storage.session.clear();
    expect(await configStore.getCredentials()).toEqual({ ok: false, error: 'LOCKED' });
  });

  it("une URL modifiée directement dans le stockage empêche le déverrouillage", async () => {
    await save();
    await configStore.lock();
    const stored = (await fakeBrowser.storage.local.get('homeboxConfig')).homeboxConfig as Record<string, unknown>;
    await fakeBrowser.storage.local.set({ homeboxConfig: { ...stored, baseUrl: 'https://attaquant.example.com' } });
    expect(await configStore.unlock(PASS)).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
  });

  it('currentKey : déchiffre avec la phrase de passe', async () => {
    await save();
    await configStore.lock();
    expect(await configStore.currentKey(PASS)).toEqual({ ok: true, value: KEY });
    expect(await configStore.currentKey('mauvaise phrase')).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });
  });

  it('la vue exposée à l’UI ne contient jamais la clé', async () => {
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

  it('masque la clé : 3 premiers caractères + •••• + 4 derniers', () => {
    expect(maskKey('hb_0123456789abcd')).toBe('hb_••••abcd');
    expect(maskKey('court')).toBe('••••');
  });

  it('refuse une clé vide ou contenant des espaces', async () => {
    await expect(save({ apiKey: '  ' })).rejects.toThrow();
    await expect(save({ apiKey: 'hb a' })).rejects.toThrow();
  });

  describe('migration depuis l’ancien format en clair', () => {
    beforeEach(async () => {
      await fakeBrowser.storage.local.set({ homeboxConfig: { baseUrl: URL, apiKey: KEY, lastCheck: null } });
      await configStore.migrateLegacy();
    });

    it('retire la clé du disque et la garde en mémoire de session', async () => {
      expect(await local()).not.toContain(KEY);
      expect(await configStore.getCredentials()).toMatchObject({ ok: true, value: { apiKey: KEY } });
      expect(await configStore.getView()).toMatchObject({ needsPassphrase: true, locked: false, maskedKey: 'hb_••••a1b2' });
    });

    it('currentKey renvoie la clé migrée pour la chiffrer avec une nouvelle phrase de passe', async () => {
      expect(await configStore.currentKey('peu importe')).toEqual({ ok: true, value: KEY });
      await save();
      expect(await configStore.getView()).toMatchObject({ needsPassphrase: false });
    });

    it('si la session est perdue avant la phrase de passe, il faut ressaisir la clé', async () => {
      await fakeBrowser.storage.session.clear();
      expect(await configStore.getCredentials()).toEqual({ ok: false, error: 'NOT_CONFIGURED' });
      expect(await configStore.currentKey('x')).toEqual({ ok: false, error: 'NOT_CONFIGURED' });
    });
  });

  it("la suppression efface tout : config, clé de session, imports, permission d'origine", async () => {
    await save({ baseUrl: 'https://homebox.example.com/sub' });
    const remove = vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    await fakeBrowser.storage.session.set({ 'pendingImport:1': { id: 'x' }, other: 1 });

    await configStore.delete();

    expect(remove).toHaveBeenCalledWith({ origins: ['https://homebox.example.com/*'] });
    expect(await fakeBrowser.storage.session.get(null)).toEqual({ other: 1 });
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
  });
});
