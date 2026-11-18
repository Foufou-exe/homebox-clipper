import { activeImports } from '@/background/import/active-imports';
import { isExtensionPage, setUiActivityHook } from '@/background/router';
import { browser } from '@/platform';
import { idleLimitMs } from '@/shared/lock-policy';
import { configStore } from './config-store';

/**
 * Automatic lock orchestration (spec 013, contracts/auto-lock.md), in memory only: no storage of its own, no
 * permission. The guarantee is the lazy expiry of `configStore.expireIfDue` at every key access; what follows only
 * makes the key disappear earlier when the service worker is alive.
 */

const PRESENCE_PORT = 'ui-presence';

/** Minimal shape of a `runtime.Port` (the presence port carries no message). */
export interface PresencePort {
  name: string;
  sender?: { id?: string; url?: string };
  disconnect(): void;
  onDisconnect?: { addListener(listener: (port: never) => void): void };
}

/** Extension pages (popup, options) currently open. */
const ports = new Set<PresencePort>();
/** "Every open" lock postponed because an import was running (FR-007). */
let lockAfterImport = false;
/** Comfort timer: not a guarantee (it dies with the service worker). */
let timer: ReturnType<typeof setTimeout> | null = null;

/** Activity hook of the router: check the deadline before postponing it (R2, invariant 2). */
export async function onUiMessage(now: number = Date.now()): Promise<void> {
  await configStore.expireIfDue(now);
  await configStore.touch(now);
  await schedule();
}

/** A single timer at the deadline + 1 s, duration policies only. */
export async function schedule(): Promise<void> {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  const limit = idleLimitMs((await configStore.getLockSettings()).policy);
  if (limit === null) return;
  timer = setTimeout(() => {
    timer = null;
    // A failure is already logged by expireIfDue (constant endpoint, no data).
    configStore.expireIfDue().catch(() => undefined);
  }, limit + 1_000);
}

/** Presence port: exact name and an extension page only; anything else is ignored or disconnected (A-7). */
export function onPortConnect(port: PresencePort): void {
  if (port.name !== PRESENCE_PORT) return;
  if (!isExtensionPage(port.sender ?? {})) {
    port.disconnect();
    return;
  }
  ports.add(port);
  try {
    port.onDisconnect?.addListener(() => {
      onPortDisconnect(port).catch(() => undefined);
    });
  } catch {
    // best effort: the lock at the next opening stays the guarantee (R3)
  }
}

/** Last extension page closed with "every open": lock now, or once the running import ends. */
export async function onPortDisconnect(port: PresencePort): Promise<void> {
  if (!ports.delete(port) || ports.size > 0) return;
  lockAfterImport = (await configStore.lockIfEveryOpen()) === 'deferred';
}

/** `session/open`: an extension page opens. Never called at service worker start-up (R3.3). */
export async function onOpen(): Promise<void> {
  lockAfterImport = (await configStore.lockIfEveryOpen()) === 'deferred';
}

/** End of an import: applies the postponed lock (no page open), then a deadline passed during the import. */
export async function afterImport(): Promise<void> {
  if (activeImports.size > 0) return;
  if (lockAfterImport && ports.size === 0) {
    lockAfterImport = false;
    await configStore.lockIfEveryOpen();
  }
  await configStore.expireIfDue();
}

export function registerAutoLock(): void {
  setUiActivityHook(() => onUiMessage());
  try {
    browser.runtime.onConnect.addListener((port) => onPortConnect(port as unknown as PresencePort));
  } catch {
    // not available (tests): the lock at opening and the lazy expiry remain
  }
}

/** Clears the in-memory state (tests). */
export function resetAutoLock(): void {
  ports.clear();
  lockAfterImport = false;
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
