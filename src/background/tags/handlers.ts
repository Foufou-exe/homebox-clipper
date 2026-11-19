import { configStore } from '@/background/config/config-store';
import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { fail, ok } from '@/shared/errors';

/**
 * `tag/list` (spec 014): read-only, reserved to extension pages (`tag/` in UI_ONLY_PREFIXES). Unlocking required;
 * the answer only carries `{ id, name }`, never the address or the key; no tag name is logged.
 */
export function registerTagHandlers(): void {
  register('tag/list', async ({ instanceId }) => {
    // Spec 016: the target instance only, never a default one.
    const creds = await configStore.getCredentials(instanceId);
    if (!creds.ok) return creds;
    const list = await createHomeBoxClient(creds.value).listTags();
    if (!list.ok) {
      return list.error === 'UNAUTHORIZED' || list.error === 'HOMEBOX_UNREACHABLE' ? fail(list.error) : fail('TAGS_UNAVAILABLE');
    }
    return ok({ tags: list.value.map(({ id, name }) => ({ id, name })) });
  });
}
