/**
 * Textes de l'interface (contracts/locales.md). Passe uniquement par src/platform/i18n.ts
 * (principe VI) ; aucun texte visible n'est écrit en dur dans src/ui/.
 */
import type { GeneratedI18nStructure } from '#i18n';
import { getMessage, getUILanguage } from '@/platform/i18n';
import type { ErrorCode } from '@/shared/errors';

/** Clés du catalogue, générées par @wxt-dev/i18n à partir de src/locales/fr.yml (`.wxt/i18n/`). */
export type MessageKey = keyof GeneratedI18nStructure;

export function t(key: MessageKey, substitutions?: string[]): string {
  return getMessage(key, substitutions);
}

export function errorMessage(code: ErrorCode): string {
  return t(`error.${code}`);
}

/** `fr` si l'interface du navigateur est en français (`fr`, `fr-CA`…), sinon `en` (langue par défaut). */
export function uiLanguage(): 'en' | 'fr' {
  return getUILanguage().toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/**
 * Date ISO (`2026-10-22`) selon la langue de l'interface : `22/10/2026` en français,
 * `22 October 2026` en anglais (mois en lettres : pas d'ambiguïté jour/mois entre les usages britannique
 * et américain, et pas d'abréviation variable d'un navigateur à l'autre). Une date invalide est
 * rendue telle quelle.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso) || Number.isNaN(date.getTime())) return iso;
  const options: Intl.DateTimeFormatOptions =
    uiLanguage() === 'fr' ? { timeZone: 'UTC' } : { timeZone: 'UTC', dateStyle: 'long' };
  return new Intl.DateTimeFormat(uiLanguage() === 'fr' ? 'fr-FR' : 'en-GB', options).format(date);
}
