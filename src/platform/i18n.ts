/**
 * Couche plateforme (principe VI) : seul point d'accès à `browser.i18n`.
 * Aucune autre logique ici ; la typage des clés et le formatage vivent dans src/ui/i18n.ts.
 */
import { browser } from 'wxt/browser';

/**
 * Message du catalogue. La clé pointée (`popup.summary.addButton`) devient le nom de message
 * `popup_summary_addButton` généré par @wxt-dev/i18n dans `_locales/<langue>/messages.json`.
 */
export function getMessage(key: string, substitutions?: string | string[]): string {
  // Les types de browser.i18n n'acceptent que les messages prédéfinis (`@@ui_locale`…) :
  // les clés du catalogue sont typées en amont par `MessageKey` (src/ui/i18n.ts).
  const name = key.replaceAll('.', '_') as Parameters<typeof browser.i18n.getMessage>[0];
  return browser.i18n.getMessage(name, substitutions);
}

export function getUILanguage(): string {
  return browser.i18n.getUILanguage();
}
