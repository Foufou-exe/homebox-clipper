import { browser } from '@/platform';
import { DEFAULT_WARRANTY_SETTINGS, type WarrantySettings } from '@/shared/warranty';

/**
 * Default-warranty setting (spec 011, R8): `storage.local`, key `warrantySettings`, in clear (a preference, no
 * personal data). Read and written by the interface, like the theme: no message to the service worker.
 */
const KEY = 'warrantySettings';

/** Any absent, unreadable or invalid value gives the defaults; `years` is `null` or an integer from 1 to 10. */
export function parseWarrantySettings(raw: unknown): WarrantySettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_WARRANTY_SETTINGS;
  const { v, enabled, years } = raw as Record<string, unknown>;
  if (v !== 1 || typeof enabled !== 'boolean') return DEFAULT_WARRANTY_SETTINGS;
  if (years === null) return { v: 1, enabled, years: null };
  if (typeof years === 'number' && Number.isInteger(years) && years >= 1 && years <= 10) {
    return { v: 1, enabled, years };
  }
  return DEFAULT_WARRANTY_SETTINGS;
}

/** Never throws: a storage error gives the defaults. */
export async function loadWarrantySettings(): Promise<WarrantySettings> {
  try {
    const stored = await browser.storage.local.get(KEY);
    return parseWarrantySettings(stored[KEY]);
  } catch {
    return DEFAULT_WARRANTY_SETTINGS;
  }
}

/** Writes only `{ v, enabled, years }`. Returns `false` (never throws) when the write failed. */
export async function saveWarrantySettings(settings: WarrantySettings): Promise<boolean> {
  const { v, enabled, years } = settings;
  try {
    await browser.storage.local.set({ [KEY]: { v, enabled, years } });
    return true;
  } catch {
    return false;
  }
}
