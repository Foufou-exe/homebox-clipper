import { configStore, type Credentials } from '@/background/config/config-store';
import { createHomeBoxClient } from '@/background/homebox/client';
import { register } from '@/background/router';
import {
  sortCollections,
  type CollectionList,
  type CollectionRef,
  type CollectionSetting,
} from '@/shared/collections';
import { fail, ok, type Result } from '@/shared/errors';
import { collectionSettings, type CollectionEntry } from './settings';

interface Discovery {
  collections: CollectionRef[];
  defaultCollection: CollectionRef;
}

/**
 * The two discovery reads (research D1): the collections the key reaches and its default collection, on the
 * instance of the credentials, WITHOUT `X-Tenant` (a lost collection must not prevent choosing another one).
 */
async function discover(creds: Credentials): Promise<Result<Discovery>> {
  const client = createHomeBoxClient({ baseUrl: creds.baseUrl, apiKey: creds.apiKey });
  const list = await client.listCollections();
  if (!list.ok) return fail(list.error);
  const def = await client.getDefaultCollection();
  if (!def.ok) return fail(def.error);
  // The default collection is always reachable; listed even if an old server left it out.
  const all = list.value.some((c) => c.id === def.value.id)
    ? list.value
    : [...list.value, def.value];
  return ok({ collections: sortCollections(all), defaultCollection: def.value });
}

/** The list answer and the setting refreshed from it: the chosen one is never replaced by another one (FR-010). */
function resolve(found: Discovery, stored: CollectionSetting | null): CollectionList {
  const several = found.collections.length > 1;
  const wanted = stored?.chosen ?? null;
  const chosen = wanted ? (found.collections.find((c) => c.id === wanted.id) ?? null) : null;
  const missing = wanted !== null && chosen === null;
  const target = chosen ?? found.defaultCollection;
  const setting: CollectionSetting = missing
    ? { chosen: wanted, seen: stored?.seen ?? null }
    : { chosen, seen: { ...target, several } };
  return {
    collections: found.collections,
    defaultCollection: found.defaultCollection,
    setting,
    missing,
  };
}

/** An unreadable entry (M3): the list is shown with the chosen collection reported missing; nothing is written. */
function unreadable(found: Discovery): CollectionList {
  return { ...found, setting: { chosen: null, seen: null }, missing: true };
}

/**
 * Writes the setting computed by `compute` from the entry read INSIDE the write queue (M1: no stale read). Fails with
 * INSTANCE_NOT_FOUND when the instance was removed or moved meanwhile (nothing written).
 */
async function saveList(
  creds: Credentials,
  compute: (entry: CollectionEntry) => CollectionList,
): Promise<Result<CollectionList>> {
  const out: { list?: CollectionList } = {};
  await collectionSettings.update(creds.id, creds.baseUrl, (entry) => {
    out.list = compute(entry);
    return out.list.missing && entry.kind === 'invalid' ? null : out.list.setting;
  });
  return out.list ? ok(out.list) : fail('INSTANCE_NOT_FOUND');
}

/**
 * Target collection of an instance (spec 024, contracts/runtime-messages.md): reserved to extension pages (`instance/`
 * prefix). Unlocking required; every request goes to the instance of the message only, with its own key. The answers
 * never carry the address or the key; no collection name or id is logged.
 */
export function registerCollectionHandlers(): void {
  // FR-003: read when the user opens the panel or after a successful connection test; `seen` refreshed (P1).
  register('instance/collections', async ({ instanceId }) => {
    const creds = await configStore.getKeyCredentials(instanceId);
    if (!creds.ok) return creds;
    const found = await discover(creds.value);
    if (!found.ok) return found;
    return saveList(creds.value, (entry) => {
      if (entry.kind === 'invalid') return unreadable(found.value);
      return resolve(found.value, entry.kind === 'ok' ? entry.setting : null);
    });
  });

  // FR-006: the id is checked against a fresh read; the name kept is the one HomeBox returned, never the message's.
  register('instance/set-collection', async ({ instanceId, collectionId }) => {
    const creds = await configStore.getKeyCredentials(instanceId);
    if (!creds.ok) return creds;
    const found = await discover(creds.value);
    if (!found.ok) return found;
    let chosen: CollectionRef | null = null;
    if (collectionId !== null) {
      chosen = found.value.collections.find((c) => c.id === collectionId) ?? null;
      if (!chosen) return fail('COLLECTION_UNAVAILABLE');
    }
    const picked = chosen;
    return saveList(creds.value, () => resolve(found.value, { chosen: picked, seen: null }));
  });
}
