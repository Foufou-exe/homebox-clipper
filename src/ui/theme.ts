import { ref } from 'vue';
import { browser } from '@/platform';
import { t } from '@/ui/i18n';

/** Chosen appearance: the system one (auto), light or dark. */
export type ThemePreference = 'auto' | 'light' | 'dark';

const KEY = 'uiTheme';
const VALUES: readonly ThemePreference[] = ['auto', 'light', 'dark'];

/** Offered values, in the cycle order of the header button. */
export const THEME_VALUES = VALUES;

/** Displayed label of an appearance (keys `theme.auto|light|dark`). */
export function themeLabel(pref: ThemePreference): string {
  return t(`theme.${pref}`);
}

/** Current preference, shared by all components of the page (header button, options). */
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

/** Applies the saved theme, then follows its changes (popup and options stay in sync). */
export async function initTheme(): Promise<void> {
  applyTheme(await loadTheme());
  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[KEY];
    if (area === 'local' && change) applyTheme(isPreference(change.newValue) ? change.newValue : 'auto');
  });
}
