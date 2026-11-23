import { configStore } from '@/background/config/config-store';
import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { fail, ok } from '@/shared/errors';
import { lastEntityType } from './last-entity-type';
import { offeredTypes, serverDefaultId } from './normalize';

/**
 * `entity-type/list` (spec 023): read-only, reserved to extension pages (`entity-type/` in UI_ONLY_PREFIXES). Unlocking
 * required; the target instance only, never a fallback; the answer carries `{ id, name }` pairs, the server default and
 * the last type used, never the address or the key. No type name or identifier is logged. A remembered type that has
 * disappeared is ignored and erased.
 */
export function registerEntityTypeHandlers(): void {
  register('entity-type/list', async ({ instanceId }) => {
    const creds = await configStore.getCredentials(instanceId);
    if (!creds.ok) return creds;
    const list = await createHomeBoxClient(creds.value).listEntityTypes();
    if (!list.ok) return fail(list.error);
    const types = offeredTypes(list.value);
    const lastUsedId = await lastEntityType.resolve(
      creds.value.id,
      new Set(types.map((t) => t.id)),
    );
    return ok({ types, defaultId: serverDefaultId(list.value, types), lastUsedId });
  });
}
