import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyTheme, loadTheme, nextTheme, saveTheme } from '@/ui/theme';

describe('thème clair / sombre', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    delete document.documentElement.dataset.theme;
  });

  it('auto par défaut : aucun attribut, le système décide', async () => {
    expect(await loadTheme()).toBe('auto');
    applyTheme('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('enregistre et applique le choix', async () => {
    await saveTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(await loadTheme()).toBe('dark');
    await saveTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('ignore une valeur stockée invalide', async () => {
    await fakeBrowser.storage.local.set({ uiTheme: 'fluo' });
    expect(await loadTheme()).toBe('auto');
  });

  it('cycle auto → clair → sombre → auto', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });
});
