import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore, maskKey } from '@/background/config/config-store';

describe('config-store', () => {
  beforeEach(() => fakeBrowser.reset());

  it('enregistre, relit et supprime la configuration dans storage.local', async () => {
    await configStore.save({ baseUrl: 'https://homebox.example.com', apiKey: 'hb_secret_a1b2' });
    const stored = await fakeBrowser.storage.local.get('homeboxConfig');
    expect(stored.homeboxConfig).toMatchObject({ baseUrl: 'https://homebox.example.com' });
    expect(await configStore.getConfig()).toMatchObject({ apiKey: 'hb_secret_a1b2' });

    await configStore.delete();
    expect(await configStore.getConfig()).toBeNull();
    expect((await configStore.getView()).configured).toBe(false);
  });

  it('la vue exposée à l’UI ne contient jamais la clé', async () => {
    await configStore.save({ baseUrl: 'https://homebox.example.com', apiKey: 'hb_secret_a1b2' });
    const view = await configStore.getView();
    expect(view).toEqual({
      configured: true,
      baseUrl: 'https://homebox.example.com',
      maskedKey: 'hb_••••a1b2',
      lastCheck: null,
    });
    expect(JSON.stringify(view)).not.toContain('secret');
  });

  it('masque la clé : 3 premiers caractères + •••• + 4 derniers', () => {
    expect(maskKey('hb_0123456789abcd')).toBe('hb_••••abcd');
    expect(maskKey('court')).toBe('••••');
  });

  it('refuse une clé vide ou contenant des espaces', async () => {
    await expect(configStore.save({ baseUrl: 'https://h.example.com', apiKey: '  ' })).rejects.toThrow();
    await expect(configStore.save({ baseUrl: 'https://h.example.com', apiKey: 'hb a' })).rejects.toThrow();
  });

  it("la suppression retire la permission d'origine et purge les imports en cours", async () => {
    await configStore.save({ baseUrl: 'https://homebox.example.com/sub', apiKey: 'hb_secret_a1b2' });
    const remove = vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
    await fakeBrowser.storage.session.set({ 'pendingImport:1': { id: 'x' }, other: 1 });

    await configStore.delete();

    expect(remove).toHaveBeenCalledWith({ origins: ['https://homebox.example.com/*'] });
    const session = await fakeBrowser.storage.session.get(null);
    expect(session).toEqual({ other: 1 });
  });
});
