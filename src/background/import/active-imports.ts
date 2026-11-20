/**
 * Imports in progress in THIS service worker. In memory, so empty after a restart: a persisted
 * `running` import missing from the set has no process behind it anymore (R8).
 * Separate module so that the history store can read it without an import cycle with `handlers.ts`.
 */
export const activeImports = new Set<string>();

/**
 * Spec 016 (US4-8): number of imports (start or resume) running to each instance, by instance id. An instance with
 * a running import cannot be deleted (`INSTANCE_BUSY`). In memory, like `activeImports`, which stays global.
 */
export const activeTargets = new Map<string, number>();

/** One more import to `instanceId`; returns the function that ends it (call it once, in a `finally`). */
export function beginTarget(instanceId: string): () => void {
  activeTargets.set(instanceId, (activeTargets.get(instanceId) ?? 0) + 1);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const left = (activeTargets.get(instanceId) ?? 1) - 1;
    if (left > 0) activeTargets.set(instanceId, left);
    else activeTargets.delete(instanceId);
  };
}
