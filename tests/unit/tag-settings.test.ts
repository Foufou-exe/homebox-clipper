import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULT_TAG_SETTINGS } from '@/shared/tags';
import { loadTagSettings, parseTagSettings, saveTagSettings } from '@/ui/tag-settings';

/** Tag setting (spec 014, Q-U2): `storage.local['tagSettings']`, invalid input → defaults. */
const DEFAULTS = { v: 1, merchantTag: true, rules: [] };
const ssd = { id: 'r1', contains: 'SSD', tag: 'Informatique' };
const ecran = { id: 'r2', contains: 'ecran', tag: 'Bureau' };

describe('parseTagSettings: invalid input → defaults (Q-U2 a)', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
    ['number', 42],
    ['empty object', {}],
    ['v 2', { v: 2, merchantTag: true, rules: [] }],
    ['merchantTag as text', { v: 1, merchantTag: 'yes', rules: [] }],
    ['rules as text', { v: 1, merchantTag: true, rules: 'x' }],
  ])('%s → defaults', (_label, raw) => {
    expect(parseTagSettings(raw)).toEqual(DEFAULTS);
  });

  it('DEFAULT_TAG_SETTINGS is the fixed default', () => {
    expect(DEFAULT_TAG_SETTINGS).toEqual(DEFAULTS);
  });

  it('a valid value is read as is', () => {
    expect(parseTagSettings({ v: 1, merchantTag: false, rules: [ssd, ecran] })).toEqual({
      v: 1,
      merchantTag: false,
      rules: [ssd, ecran],
    });
  });
});

describe('parseTagSettings: an invalid rule is dropped alone (Q-U2 b, c, d)', () => {
  it.each([
    ['id not a string', { id: 3, contains: 'x', tag: 'X' }],
    ['contains not a string', { id: 'x', contains: 3, tag: 'X' }],
    ['tag not a string', { id: 'x', contains: 'x', tag: null }],
    ['rule not an object', 'x'],
    ['contains empty after normalisation', { id: 'x', contains: '   ', tag: 'X' }],
    ['tag empty after normalisation', { id: 'x', contains: 'x', tag: ' \t ' }],
    ['contains of 101 characters', { id: 'x', contains: 'c'.repeat(101), tag: 'X' }],
    ['tag of 256 bytes', { id: 'x', contains: 'x', tag: 'é'.repeat(128) }],
    ['empty id', { id: '', contains: 'x', tag: 'X' }],
  ])('%s: dropped, the other rules kept', (_label, bad) => {
    expect(parseTagSettings({ v: 1, merchantTag: true, rules: [ssd, bad, ecran] }).rules).toEqual([
      ssd,
      ecran,
    ]);
  });

  it('two rules with the same id: the second is dropped', () => {
    const twin = { id: 'r1', contains: 'usb', tag: 'Stockage' };
    expect(parseTagSettings({ v: 1, merchantTag: true, rules: [ssd, twin, ecran] }).rules).toEqual([
      ssd,
      ecran,
    ]);
  });

  it('unknown fields are ignored and never copied', () => {
    const parsed = parseTagSettings({
      v: 1,
      merchantTag: true,
      extra: 'x',
      rules: [{ ...ssd, extra: 'y' }],
    });
    expect(parsed).toEqual({ v: 1, merchantTag: true, rules: [ssd] });
    expect(Object.keys(parsed).sort()).toEqual(['merchantTag', 'rules', 'v']);
    expect(Object.keys(parsed.rules[0]!).sort()).toEqual(['contains', 'id', 'tag']);
  });

  it('texts are normalised (spaces collapsed, trimmed)', () => {
    expect(
      parseTagSettings({
        v: 1,
        merchantTag: true,
        rules: [{ id: 'r', contains: '  disque   dur ', tag: ' Stockage  ' }],
      }).rules,
    ).toEqual([{ id: 'r', contains: 'disque dur', tag: 'Stockage' }]);
  });
});

describe('loadTagSettings / saveTagSettings (Q-U2 e, f)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('nothing stored: defaults', async () => {
    expect(await loadTagSettings()).toEqual(DEFAULTS);
  });

  it('only v, merchantTag and rules[].{id, contains, tag} are written under "tagSettings"', async () => {
    const ok = await saveTagSettings({
      v: 1,
      merchantTag: false,
      extra: 'x',
      rules: [{ ...ssd, extra: 'y' }],
    } as never);
    expect(ok).toBe(true);
    expect(Object.keys(await fakeBrowser.storage.local.get(null))).toEqual(['tagSettings']);
    expect((await fakeBrowser.storage.local.get('tagSettings')).tagSettings).toEqual({
      v: 1,
      merchantTag: false,
      rules: [ssd],
    });
    expect(await loadTagSettings()).toEqual({ v: 1, merchantTag: false, rules: [ssd] });
  });

  it('a write error returns false without throwing', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('quota'));
    await expect(saveTagSettings({ v: 1, merchantTag: true, rules: [] })).resolves.toBe(false);
  });

  it('an unreadable storage gives the defaults, without exception', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('boom'));
    await expect(loadTagSettings()).resolves.toEqual(DEFAULTS);
  });

  it('never writes to storage.sync', async () => {
    const sync = vi.spyOn(fakeBrowser.storage.sync, 'set');
    await saveTagSettings({ v: 1, merchantTag: true, rules: [ssd] });
    expect(sync).not.toHaveBeenCalled();
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});
  });
});
