import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getMessage, getUILanguage } from '@/platform/i18n';
import { ERROR_CODES } from '@/shared/errors';
import { errorMessage, formatDate, t, uiLanguage } from '@/ui/i18n';
import { formatDateTime } from '@/ui/i18n';

vi.mock('@/platform/i18n');

describe('src/ui/i18n.ts', () => {
  it('t() delegates to getMessage with the dotted key as is', () => {
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

  it('formatDate and uiLanguage follow getUILanguage(): French', () => {
    for (const lang of ['fr', 'fr-FR', 'fr-CA']) {
      vi.mocked(getUILanguage).mockReturnValue(lang);
      expect(uiLanguage(), lang).toBe('fr');
      expect(formatDate('2026-10-22'), lang).toBe('22/10/2026');
    }
  });

  it('formatDate and uiLanguage follow getUILanguage(): English for any other language, month spelled out', () => {
    for (const lang of ['en', 'en-US', 'de', 'ja', '']) {
      vi.mocked(getUILanguage).mockReturnValue(lang);
      expect(uiLanguage(), lang).toBe('en');
      expect(formatDate('2026-10-22'), lang).toBe('22 October 2026');
      expect(formatDate('2026-03-04'), lang).toBe('4 March 2026');
    }
  });

  it('formatDate: an invalid date is rendered as is, without an exception', () => {
    vi.mocked(getUILanguage).mockReturnValue('fr');
    expect(formatDate('22 octobre')).toBe('22 octobre');
    expect(formatDate('2026-13-45')).toBe('2026-13-45');
  });
});

describe('src/platform/i18n.ts (browser.i18n wrapper)', () => {
  it('getMessage converts the dotted key into a message name', async () => {
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

describe('formatDateTime (012, Q-U25, FR-011)', () => {
  it('French: medium date and short time, time zone injected', () => {
    vi.mocked(getUILanguage).mockReturnValue('fr');
    expect(formatDateTime('2026-11-12T10:05:00.000Z', 'UTC')).toBe('12 nov. 2026, 10:05');
    expect(formatDateTime('2026-11-12T10:05:00.000Z', 'Europe/Paris')).toBe('12 nov. 2026, 11:05');
  });

  it('English (en-GB) for any other language', () => {
    for (const lang of ['en', 'en-US', 'de']) {
      vi.mocked(getUILanguage).mockReturnValue(lang);
      expect(formatDateTime('2026-11-12T10:05:00.000Z', 'UTC'), lang).toBe('12 Nov 2026, 10:05');
    }
  });

  it('an invalid ISO string is rendered as is, without an exception', () => {
    vi.mocked(getUILanguage).mockReturnValue('fr');
    expect(formatDateTime('pas une date')).toBe('pas une date');
    expect(formatDateTime('')).toBe('');
  });

  it('formatDate (purchase date, UTC) is unchanged', () => {
    vi.mocked(getUILanguage).mockReturnValue('fr');
    expect(formatDate('2026-10-22')).toBe('22/10/2026');
  });
});
