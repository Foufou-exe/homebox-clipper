import type { ConfigView, InstanceView } from '@/shared/types';

/**
 * Helpers of the interface for several HomeBox instances (spec 016). Pure: no message, no storage.
 */

/** The default instance of the view (`defaultInstanceId`, else the first one); null when nothing is configured. */
export function defaultInstance(view: ConfigView): InstanceView | null {
  const list = view.instances ?? [];
  return list.find((i) => i.id === view.defaultInstanceId) ?? list[0] ?? null;
}

/** Host of an address (port only if not standard), shown next to the instance name; the address itself if invalid. */
export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * Instance of an import or a history entry: the one of its id; without id (state written by an older version), the
 * only instance when there is exactly one. Never another instance as a fallback.
 */
export function instanceById(instances: readonly InstanceView[], id: string | null | undefined): InstanceView | null {
  if (id) return instances.find((i) => i.id === id) ?? null;
  return instances.length === 1 ? (instances[0] ?? null) : null;
}
