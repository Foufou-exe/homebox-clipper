/**
 * Target HomeBox collection of an instance (spec 024, data-model.md §1): pure types and validation, shared by the
 * service worker (storage, messages) and the UI (display). No log, no network.
 */

/** A HomeBox collection (group), as HomeBox returns it: identifier and name. */
export interface CollectionRef {
  id: string;
  name: string;
}

/** Target collection last read on HomeBox, for display without a request (spec 024, P1). */
export interface SeenCollection extends CollectionRef {
  /** The key can reach several collections. */
  several: boolean;
}

/** Collection setting of one instance (`storage.local.collectionByInstance[instanceId]`). */
export interface CollectionSetting {
  /** Collection chosen in the settings; null: the default collection of the key (no `X-Tenant`, FR-002). */
  chosen: CollectionRef | null;
  /** Target collection read at the last check (connection test, panel, save); null: never checked. */
  seen: SeenCollection | null;
}

/** HomeBox name limit (`group.name`, 255 characters). */
export const MAX_COLLECTION_NAME_LENGTH = 255;

/** Canonical UUID, the form HomeBox gives to group identifiers (fixed-length pattern: no backtracking). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export function isCollectionId(x: unknown): x is string {
  return typeof x === 'string' && UUID.test(x);
}

export function isCollectionName(x: unknown): x is string {
  return typeof x === 'string' && x.trim() !== '' && x.length <= MAX_COLLECTION_NAME_LENGTH;
}

export function isCollectionRef(x: unknown): x is CollectionRef {
  return isRecord(x) && isCollectionId(x.id) && isCollectionName(x.name);
}

function isSeen(x: unknown): x is SeenCollection {
  return (
    isCollectionRef(x) && typeof (x as unknown as Record<string, unknown>).several === 'boolean'
  );
}

export function isCollectionSetting(x: unknown): x is CollectionSetting {
  return (
    isRecord(x) &&
    (x.chosen === null || isCollectionRef(x.chosen)) &&
    (x.seen === null || isSeen(x.seen))
  );
}

/** Stored entry: the setting and the address of the instance it was read on (a moved instance has none, FR-011). */
export interface StoredCollectionSetting extends CollectionSetting {
  baseUrl: string;
}

export function isStoredCollectionSetting(x: unknown): x is StoredCollectionSetting {
  return (
    isCollectionSetting(x) && typeof (x as unknown as Record<string, unknown>).baseUrl === 'string'
  );
}

/** Only the declared properties (nothing else from storage or HomeBox is kept). */
export const refOf = (c: CollectionRef): CollectionRef => ({ id: c.id, name: c.name });

export function copySetting(s: CollectionSetting): CollectionSetting {
  return {
    chosen: s.chosen ? refOf(s.chosen) : null,
    seen: s.seen ? { ...refOf(s.seen), several: s.seen.several } : null,
  };
}

/** Sorted by name, case- and accent-insensitively, then by identifier (stable for identical names). */
export function sortCollections(list: readonly CollectionRef[]): CollectionRef[] {
  return [...list].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id),
  );
}

/**
 * Name shown in the summary and the result (FR-008, FR-009): the chosen collection, or the one last read when the
 * key reaches several collections; null otherwise (default setting with one collection, or never checked).
 */
export function displayedCollection(setting: CollectionSetting | null | undefined): string | null {
  if (!setting) return null;
  if (setting.chosen) return setting.chosen.name;
  return setting.seen?.several ? setting.seen.name : null;
}

/** Answer of `instance/collections` and `instance/set-collection` (spec 024, contracts/runtime-messages.md). */
export interface CollectionList {
  /** Collections the key reaches, sorted by name (`sortCollections`). */
  collections: CollectionRef[];
  /** Default collection of the key, as HomeBox resolves it without `X-Tenant`. */
  defaultCollection: CollectionRef;
  /** Setting saved after the read (`seen` refreshed; the chosen one never replaced). */
  setting: CollectionSetting;
  /** The chosen collection is no longer reachable with this key (FR-010). */
  missing: boolean;
}
