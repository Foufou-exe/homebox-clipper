import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyTheme, loadTheme, nextTheme, saveTheme } from '@/ui/theme';

describe('light / dark theme', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    delete document.documentElement.dataset.theme;
  });

  it('auto by default: no attribute, the system decides', async () => {
    expect(await loadTheme()).toBe('auto');
    applyTheme('auto');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('saves and applies the choice', async () => {
    await saveTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(await loadTheme()).toBe('dark');
    await saveTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('ignores an invalid stored value', async () => {
    await fakeBrowser.storage.local.set({ uiTheme: 'fluo' });
    expect(await loadTheme()).toBe('auto');
  });

  it('cycle auto → clair → sombre → auto', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });
});
