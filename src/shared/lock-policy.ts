/**
 * Automatic lock setting (spec 013, data-model.md). Pure types and functions: no storage, no clock.
 * The setting is a choice only: it holds no secret and says nothing about the key or the passphrase (FR-010).
 */

/** Exactly five choices; no "never" value and no duration that survives a browser restart (FR-002). */
export type LockPolicy = 'browser-close' | 'idle-15m' | 'idle-1h' | 'idle-4h' | 'every-open';

/** Stored in storage.local under `lockSettings`. */
export interface LockSettings {
  v: 1;
  policy: LockPolicy;
}

export const DEFAULT_LOCK_SETTINGS: Readonly<LockSettings> = Object.freeze({ v: 1, policy: 'browser-close' });

/** Display order (FR-001). */
export const LOCK_POLICIES: readonly LockPolicy[] = Object.freeze([
  'browser-close',
  'idle-15m',
  'idle-1h',
  'idle-4h',
  'every-open',
]);

const IDLE_LIMITS: Partial<Record<LockPolicy, number>> = {
  'idle-15m': 15 * 60_000,
  'idle-1h': 60 * 60_000,
  'idle-4h': 4 * 60 * 60_000,
};

/** Tolerated clock skew: an activity timestamp further in the future means the clock was set back. */
const FUTURE_TOLERANCE_MS = 60_000;

export function isLockPolicy(x: unknown): x is LockPolicy {
  return typeof x === 'string' && (LOCK_POLICIES as readonly string[]).includes(x);
}

/** Default (`browser-close`) if absent, unreadable, `v !== 1` or policy outside the list; copies only `{ v, policy }`. */
export function parseLockSettings(raw: unknown): LockSettings {
  if (typeof raw === 'object' && raw !== null) {
    const { v, policy } = raw as Record<string, unknown>;
    if (v === 1 && isLockPolicy(policy)) return { v: 1, policy };
  }
  return { ...DEFAULT_LOCK_SETTINGS };
}

/** Inactivity limit in ms, or `null` for the policies without a duration. */
export function idleLimitMs(policy: LockPolicy): number | null {
  return IDLE_LIMITS[policy] ?? null;
}

/**
 * True if the inactivity limit is passed. Fails closed: with a duration, a missing or invalid timestamp, or one
 * more than 60 s in the future (clock set back), counts as expired.
 */
export function isIdleExpired(policy: LockPolicy, at: unknown, now: number): boolean {
  const limit = idleLimitMs(policy);
  if (limit === null) return false;
  if (typeof at !== 'number' || !Number.isSafeInteger(at) || at < 0) return true;
  if (at > now + FUTURE_TOLERANCE_MS) return true;
  return now - at > limit;
}
