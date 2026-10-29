import { ref } from 'vue';
import { browser } from '@/platform';
import { t } from '@/ui/i18n';

/** Apparence choisie : celle du système (auto), claire ou sombre. */
export type ThemePreference = 'auto' | 'light' | 'dark';

const KEY = 'uiTheme';
const VALUES: readonly ThemePreference[] = ['auto', 'light', 'dark'];

/** Valeurs proposées, dans l'ordre du cycle du bouton d'en-tête. */
export const THEME_VALUES = VALUES;

/** Libellé affiché d'une apparence (clés `theme.auto|light|dark`). */
export function themeLabel(pref: ThemePreference): string {
  return t(`theme.${pref}`);
}

/** Préférence courante, partagée par tous les composants de la page (bouton d'en-tête, options). */
export const themePreference = ref<ThemePreference>('auto');

function isPreference(x: unknown): x is ThemePreference {
  return typeof x === 'string' && (VALUES as readonly string[]).includes(x);
}

export function applyTheme(pref: ThemePreference, root: HTMLElement = document.documentElement): void {
  themePreference.value = pref;
  if (pref === 'auto') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

export async function loadTheme(): Promise<ThemePreference> {
  try {
    const stored = await browser.storage.local.get(KEY);
    return isPreference(stored[KEY]) ? stored[KEY] : 'auto';
  } catch {
    return 'auto';
  }
}

export async function saveTheme(pref: ThemePreference): Promise<void> {
  applyTheme(pref);
  await browser.storage.local.set({ [KEY]: pref });
}

export function nextTheme(pref: ThemePreference): ThemePreference {
  return VALUES[(VALUES.indexOf(pref) + 1) % VALUES.length] ?? 'auto';
}

/** Applique le thème enregistré puis suit ses changements (popup et options restent synchronisés). */
export async function initTheme(): Promise<void> {
  applyTheme(await loadTheme());
  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[KEY];
    if (area === 'local' && change) applyTheme(isPreference(change.newValue) ? change.newValue : 'auto');
  });
}
