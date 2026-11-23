import { reactive, ref } from 'vue';
import type { EntityTypeListView, EntityTypeOption } from '@/shared/types';

/**
 * Entity type of each product in the summary (spec 023, contracts/ui.md). In memory only: the view read from the
 * service worker and the explicit choices by product; nothing is persisted or logged here.
 */

const isOption = (x: unknown): x is EntityTypeOption =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as EntityTypeOption).id === 'string' &&
  typeof (x as EntityTypeOption).name === 'string';

/**
 * Answer of `entity-type/list` as the screen uses it. `null` (selector hidden, no banner) for an error, a missing or
 * malformed answer, or fewer than two types: with nothing to choose the screen is exactly the one of before. A default
 * or last type that is not in the list is ignored.
 */
export function parseEntityTypeView(res: unknown): EntityTypeListView | null {
  if (typeof res !== 'object' || res === null || (res as { ok?: unknown }).ok !== true) return null;
  const value = (res as { value?: unknown }).value;
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as { types?: unknown }).types)
  )
    return null;
  const raw = value as { types: unknown[]; defaultId?: unknown; lastUsedId?: unknown };
  const types = raw.types.filter(isOption).map(({ id, name }) => ({ id, name }));
  if (types.length < 2) return null;
  const known = (id: unknown): string | null =>
    typeof id === 'string' && types.some((t) => t.id === id) ? id : null;
  return { types, defaultId: known(raw.defaultId), lastUsedId: known(raw.lastUsedId) };
}

/** Preselected type: the last one used on the instance, else the server default, else none (« server default » option). */
export function initialEntityTypeId(view: EntityTypeListView | null): string | null {
  return view ? (view.lastUsedId ?? view.defaultId) : null;
}

/** `entityTypeId` of the draft: only a chosen type other than the server default (spec 023, FR-005). */
export function entityTypeDraft(
  selected: string | null,
  defaultId: string | null,
): { entityTypeId?: string } {
  return selected !== null && selected !== defaultId ? { entityTypeId: selected } : {};
}

/** Labels of the types: two of the same name are told apart by a number (the identifier is what counts). */
export function entityTypeLabels(
  types: readonly EntityTypeOption[],
): { id: string; label: string }[] {
  const seen = new Map<string, number>();
  return types.map(({ id, name }) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return { id, label: n === 1 ? name : `${name} (${n})` };
  });
}

/** State of the selector for the lines of the summary. */
export function useEntityTypes() {
  const view = ref<EntityTypeListView | null>(null);
  /** Explicit choices by line key; absent means « follows the initial value ». */
  const choices = reactive(new Map<string, string | null>());

  /**
   * Reads the types of the target (one request) through `request`; `isCurrent` says whether the target is still the
   * one asked for (an answer for a former target is ignored). Any failure hides the selector.
   */
  async function load(request: () => Promise<unknown>, isCurrent: () => boolean): Promise<void> {
    try {
      const res = await request();
      if (isCurrent()) view.value = parseEntityTypeView(res);
    } catch {
      if (isCurrent()) view.value = null;
    }
  }

  function reset(): void {
    view.value = null;
    choices.clear();
  }

  function selectedFor(key: string): string | null {
    return choices.has(key) ? (choices.get(key) ?? null) : initialEntityTypeId(view.value);
  }

  function choose(key: string, id: string | null): void {
    choices.set(key, id);
  }

  function draftFor(key: string): { entityTypeId?: string } {
    return view.value ? entityTypeDraft(selectedFor(key), view.value.defaultId) : {};
  }

  return { view, load, reset, selectedFor, choose, draftFor };
}
