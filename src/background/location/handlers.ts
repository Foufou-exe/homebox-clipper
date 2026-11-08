import { configStore } from '@/background/config/config-store';
import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import { ok } from '@/shared/errors';
import { flattenTree } from '@/shared/locations';
import { lastLocation } from './last-location';

/**
 * `location/list`: read-only (FR-022). Unlocking required; no HomeBox write, no location name
 * logged. The last location used is ignored (and removed) if it has disappeared.
 */
export function registerLocationHandlers(): void {
  register('location/list', async () => {
    const creds = await configStore.getCredentials();
    if (!creds.ok) return creds;
    const tree = await createHomeBoxClient(creds.value).listLocations();
    if (!tree.ok) return tree;
    const locations = flattenTree(tree.value);
    const lastUsedId = await lastLocation.resolve(creds.value.baseUrl, new Set(locations.map((l) => l.id)));
    return ok({ locations, lastUsedId });
  });
}
