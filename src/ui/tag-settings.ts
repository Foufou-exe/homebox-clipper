import { browser } from '@/platform';
import { DEFAULT_TAG_SETTINGS, normalizeTagName, ruleTextError, tagNameError, type TagRule, type TagSettings } from '@/shared/tags';

/**
 * Automatic-tag setting (spec 014, R6): `storage.local`, key `tagSettings`, in clear (preferences, no secret).
 * Read and written by the interface, like `warrantySettings`: no message, the service worker never reads it.
 * Kept when the configuration is deleted.
 */
const KEY = 'tagSettings';

const defaults = (): TagSettings => ({ ...DEFAULT_TAG_SETTINGS, rules: [] });

/** A rule with textual, valid fields after normalisation; otherwise `null` (dropped alone). Unknown fields are not copied. */
function parseRule(raw: unknown): TagRule | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, contains, tag } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || id === '' || typeof contains !== 'string' || typeof tag !== 'string') return null;
  if (ruleTextError(contains) !== null || tagNameError(tag) !== null) return null;
  return { id, contains: normalizeTagName(contains), tag: normalizeTagName(tag) };
}

/** Any absent, unreadable or invalid value gives the defaults; an invalid rule or a duplicate `id` is dropped alone. */
export function parseTagSettings(raw: unknown): TagSettings {
  if (typeof raw !== 'object' || raw === null) return defaults();
  const { v, merchantTag, rules } = raw as Record<string, unknown>;
  if (v !== 1 || typeof merchantTag !== 'boolean' || !Array.isArray(rules)) return defaults();
  const seen = new Set<string>();
  const kept: TagRule[] = [];
  for (const r of rules) {
    const rule = parseRule(r);
    if (!rule || seen.has(rule.id)) continue;
    seen.add(rule.id);
    kept.push(rule);
  }
  return { v: 1, merchantTag, rules: kept };
}

/** Never throws: a storage error gives the defaults. */
export async function loadTagSettings(): Promise<TagSettings> {
  try {
    const stored = await browser.storage.local.get(KEY);
    return parseTagSettings(stored[KEY]);
  } catch {
    return defaults();
  }
}

/** Writes only `v`, `merchantTag`, `rules[].{id, contains, tag}`. Returns `false` (never throws) when the write failed. */
export async function saveTagSettings(settings: TagSettings): Promise<boolean> {
  const value = {
    v: 1,
    merchantTag: settings.merchantTag,
    rules: settings.rules.map(({ id, contains, tag }) => ({ id, contains, tag })),
  };
  try {
    await browser.storage.local.set({ [KEY]: value });
    return true;
  } catch {
    return false;
  }
}
