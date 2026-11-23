import type { EntityTypeSummaryOut } from '@/background/homebox/types';
import type { EntityTypeOption } from '@/shared/types';

/** Non-location types for the interface, sorted by name then identifier (explicit comparator). */
export function offeredTypes(list: readonly EntityTypeSummaryOut[]): EntityTypeOption[] {
  return list
    .filter((t) => !t.isLocation)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * Type HomeBox applies when none is sent (research R1): the oldest non-location type by creation date. `null` if no
 * offered type has a usable date (the interface then adds a « server default » option). Ties keep the sorted order.
 */
export function serverDefaultId(
  list: readonly EntityTypeSummaryOut[],
  offered: readonly EntityTypeOption[],
): string | null {
  const dates = new Map<string, number>();
  for (const t of list) {
    const time = t.createdAt === undefined ? Number.NaN : Date.parse(t.createdAt);
    if (!t.isLocation && !Number.isNaN(time)) dates.set(t.id, time);
  }
  let best: { id: string; time: number } | null = null;
  for (const { id } of offered) {
    const time = dates.get(id);
    if (time !== undefined && (best === null || time < best.time)) best = { id, time };
  }
  return best?.id ?? null;
}
