import { configStore } from '@/background/config/config-store';
import { instanceStore } from '@/background/config/instance-store';
import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { fail, ok } from '@/shared/errors';
import { MAX_FIELD_NAME_BYTES, utf8ByteLength } from '@/shared/utf8';
import { orderFieldSettings } from './settings';

/** At most this many suggestions are returned (contracts/homebox-fields.md §1). */
const MAX_SUGGESTIONS = 2000;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\u0000-\u001F\u007F-\u009F]/;

const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : Number(a > b));

/**
 * Suggestions (contracts/homebox-fields.md §1): names of 1 to 255 UTF-8 bytes without control character, exact
 * duplicates removed, sorted case- and accent-insensitively then exactly, bounded. Names only, never values.
 */
export function normalizeFieldNames(names: readonly string[]): string[] {
  const kept = names.filter((n) => {
    const bytes = utf8ByteLength(n);
    return bytes >= 1 && bytes <= MAX_FIELD_NAME_BYTES && !CONTROL_CHAR.test(n);
  });
  return [...new Set(kept)].sort(byName).slice(0, MAX_SUGGESTIONS);
}

/**
 * Order fields as HomeBox custom fields (spec 019, contracts/runtime-messages.md §2): reserved to extension pages
 * (`order-fields/` in UI_ONLY_PREFIXES). The setting holds no secret: `get` and `set` use neither the key nor the
 * network and work while locked (FR-007). The answers never carry the address or the key; nothing is logged.
 */
export function registerOrderFieldHandlers(): void {
  // An unknown instance is refused (no orphan entry is read or written).
  register('order-fields/get', async ({ instanceId }) => {
    if (!(await instanceStore.byId(instanceId))) return fail('INSTANCE_NOT_FOUND');
    return ok({ settings: await orderFieldSettings.get(instanceId) });
  });

  // `settings` already validated by the router (`isOrderFieldSettings`): names trimmed, valid and distinct.
  register('order-fields/set', async ({ instanceId, settings }) => {
    if (!(await instanceStore.byId(instanceId))) return fail('INSTANCE_NOT_FOUND');
    await orderFieldSettings.set(instanceId, settings);
    return ok({ settings: await orderFieldSettings.get(instanceId) });
  });

  // Unlocking required: the names are read on the instance of the message only, with its own key (no fallback).
  register('order-fields/names', async ({ instanceId }) => {
    const creds = await configStore.getCredentials(instanceId);
    if (!creds.ok) return creds;
    const list = await createHomeBoxClient(creds.value).listFieldNames();
    if (!list.ok) return fail(list.error);
    return ok({ names: normalizeFieldNames(list.value) });
  });
}
