/**
 * Imports in progress in THIS service worker. In memory, so empty after a restart: a persisted
 * `running` import missing from the set has no process behind it anymore (R8).
 * Separate module so that the history store can read it without an import cycle with `handlers.ts`.
 */
export const activeImports = new Set<string>();
