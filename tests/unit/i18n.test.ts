import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getMessage, getUILanguage } from '@/platform/i18n';
import { ERROR_CODES } from '@/shared/errors';
import { errorMessage, formatDate, t, uiLanguage } from '@/ui/i18n';

vi.mock('@/platform/i18n');

describe('src/ui/i18n.ts', () => {
  it('t() délègue à getMessage avec la clé pointée telle quelle', () => {
    vi.mocked(getMessage).mockReturnValue('Texte');
    expect(t('extName')).toBe('Texte');
    expect(getMessage).toHaveBeenCalledWith('extName', undefined);
    t('extName', ['a']);
    expect(getMessage).toHaveBeenLastCalledWith('extName', ['a']);
  });

  it('errorMessage(code) appelle t("error.<CODE>")', () => {
    vi.mocked(getMessage).mockReturnValue('Clé API invalide ou expirée.');
    expect(errorMessage('UNAUTHORIZED')).toBe('Clé API invalide ou expirée.');
    expect(getMessage).toHaveBeenCalledWith('error.UNAUTHORIZED', undefined);
    for (const code of ERROR_CODES) errorMessage(code);
    expect(getMessage).toHaveBeenCalledTimes(1 + ERROR_CODES.length);
  });

  it('formatDate et uiLanguage suivent getUILanguage() : français', () => {
    for (const lang of ['fr', 'fr-FR', 'fr-CA']) {
      vi.mocked(getUILanguage).mockReturnValue(lang);
      expect(uiLanguage(), lang).toBe('fr');
      expect(formatDate('2026-10-22'), lang).toBe('22/10/2026');
    }
  });

  it('formatDate et uiLanguage suivent getUILanguage() : anglais pour toute autre langue, mois en lettres', () => {
    for (const lang of ['en', 'en-US', 'de', 'ja', '']) {
      vi.mocked(getUILanguage).mockReturnValue(lang);
      expect(uiLanguage(), lang).toBe('en');
      expect(formatDate('2026-10-22'), lang).toBe('22 October 2026');
      expect(formatDate('2026-03-04'), lang).toBe('4 March 2026');
    }
  });

  it('formatDate : une date invalide est rendue telle quelle, sans exception', () => {
    vi.mocked(getUILanguage).mockReturnValue('fr');
    expect(formatDate('22 octobre')).toBe('22 octobre');
    expect(formatDate('2026-13-45')).toBe('2026-13-45');
  });
});

describe('src/platform/i18n.ts (wrapper de browser.i18n)', () => {
  it('getMessage convertit la clé pointée en nom de message', async () => {
    const { getMessage: real } =
      await vi.importActual<typeof import('@/platform/i18n')>('@/platform/i18n');
    const spy = vi.fn(() => 'Ajouter');
    (fakeBrowser as unknown as { i18n: unknown }).i18n = {
      getMessage: spy,
      getUILanguage: () => 'fr',
    };
    expect(real('popup.summary.addButton', ['x'])).toBe('Ajouter');
    expect(spy).toHaveBeenCalledWith('popup_summary_addButton', ['x']);
  });
});
