import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { DEFAULT_WARRANTY_SETTINGS } from '@/shared/warranty';
import { loadWarrantySettings, parseWarrantySettings, saveWarrantySettings } from '@/ui/warranty-settings';

describe('parseWarrantySettings: safe reading (011, Q-U6, FR-007)', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
    ['text', 'x'],
    ['array', []],
    ['v 2', { v: 2, enabled: true, years: null }],
    ['v as text', { v: '1', enabled: true, years: null }],
    ['years 0', { v: 1, enabled: true, years: 0 }],
    ['years 11', { v: 1, enabled: true, years: 11 }],
    ['years 1.5', { v: 1, enabled: true, years: 1.5 }],
    ['years as text', { v: 1, enabled: true, years: '3' }],
    ['years -1', { v: 1, enabled: true, years: -1 }],
    ['years NaN', { v: 1, enabled: true, years: NaN }],
    ['enabled as text', { v: 1, enabled: 'yes', years: null }],
    ['enabled undefined', { v: 1, years: null }],
    ['years absent', { v: 1, enabled: true }],
  ])('%s → defaults', (_label, raw) => {
    expect(parseWarrantySettings(raw)).toEqual(DEFAULT_WARRANTY_SETTINGS);
    expect(DEFAULT_WARRANTY_SETTINGS).toEqual({ v: 1, enabled: true, years: null });
  });

  it.each([null, 1, 3, 10])('years %j is valid (null = the legal duration of the country)', (years) => {
    expect(parseWarrantySettings({ v: 1, enabled: true, years })).toEqual({ v: 1, enabled: true, years });
  });

  it('{ enabled: false, years: 10 } is read as is', () => {
    expect(parseWarrantySettings({ v: 1, enabled: false, years: 10 })).toEqual({ v: 1, enabled: false, years: 10 });
  });

  it('extra properties are dropped', () => {
    expect(parseWarrantySettings({ v: 1, enabled: true, years: null, date: '2028-11-03' })).toEqual({
      v: 1,
      enabled: true,
      years: null,
    });
  });
});

describe('loadWarrantySettings / saveWarrantySettings (011, R8)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('nothing stored: defaults', async () => {
    expect(await loadWarrantySettings()).toEqual(DEFAULT_WARRANTY_SETTINGS);
  });

  it('round trip under the key "warrantySettings", with only { v, enabled, years }', async () => {
    await saveWarrantySettings({ v: 1, enabled: false, years: 3, extra: 'x' } as never);
    expect(Object.keys(await fakeBrowser.storage.local.get(null))).toEqual(['warrantySettings']);
    expect((await fakeBrowser.storage.local.get('warrantySettings')).warrantySettings).toEqual({
      v: 1,
      enabled: false,
      years: 3,
    });
    expect(await loadWarrantySettings()).toEqual({ v: 1, enabled: false, years: 3 });
  });

  it('an unreadable storage gives the defaults, without exception', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('boom'));
    await expect(loadWarrantySettings()).resolves.toEqual(DEFAULT_WARRANTY_SETTINGS);
  });

  it('a write error does not throw', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('quota'));
    await expect(saveWarrantySettings(DEFAULT_WARRANTY_SETTINGS)).resolves.toBe(false);
  });

  it('the setting survives the deletion of the configuration', async () => {
    await saveWarrantySettings({ v: 1, enabled: false, years: 2 });
    await configStore.save({ baseUrl: 'https://homebox.example.com', apiKey: 'hb_xxxxxxxx', passphrase: 'une phrase de passe solide' }, 1_000);
    await configStore.delete();
    expect(await loadWarrantySettings()).toEqual({ v: 1, enabled: false, years: 2 });
  });
});
