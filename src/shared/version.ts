/**
 * Extension version numbers (spec 013): 1 to 4 dot-separated integers, each at most 65535 (Chrome format).
 * Pure functions: no browser API, no network.
 */
const VERSION = /^\d+(\.\d+){0,3}$/;
const MAX_PART = 65_535;

export function isVersion(x: unknown): x is string {
  return typeof x === 'string' && VERSION.test(x) && x.split('.').every((p) => Number(p) <= MAX_PART);
}

/** Numeric comparison part by part, missing parts = 0 (`1.2` = `1.2.0`); `null` if either is not a version. */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
  if (!isVersion(a) || !isVersion(b)) return null;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
