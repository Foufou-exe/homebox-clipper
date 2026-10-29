/**
 * Textes de l'interface (contracts/locales.md). Passe uniquement par src/platform/i18n.ts
 * (principe VI) ; aucun texte visible n'est écrit en dur dans src/ui/.
 */
import type { GeneratedI18nStructure } from '#i18n';
import { getMessage } from '@/platform/i18n';
import type { ErrorCode } from '@/shared/errors';

/** Clés du catalogue, générées par @wxt-dev/i18n à partir de src/locales/fr.yml (`.wxt/i18n/`). */
export type MessageKey = keyof GeneratedI18nStructure;

export function t(key: MessageKey, substitutions?: string[]): string {
  return getMessage(key, substitutions);
}

export function errorMessage(code: ErrorCode): string {
  return t(`error.${code}`);
}

/** Étape A : l'interface est en français ; `'en'` deviendra possible à l'étape B. */
export function uiLanguage(): 'en' | 'fr' {
  return 'fr';
}

/** Date ISO (`2026-10-22`) au format français : `22/10/2026`. Une date invalide est rendue telle quelle. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso) || Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(date);
}
