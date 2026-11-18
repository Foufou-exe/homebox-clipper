import {
  DEFAULT_LOCK_SETTINGS,
  LOCK_POLICIES,
  idleLimitMs,
  isIdleExpired,
  isLockPolicy,
  parseLockSettings,
  type LockPolicy,
} from '@/shared/lock-policy';

describe('lock-policy: parseLockSettings (Q-U1, FR-010)', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['empty object', {}],
    ['unknown version', { v: 2, policy: 'idle-1h' }],
    ['never', { v: 1, policy: 'never' }],
    ['unknown duration', { v: 1, policy: 'idle-30m' }],
    ['policy missing', { v: 1 }],
  ])('%s gives the default browser-close', (_label, raw) => {
    expect(parseLockSettings(raw)).toEqual({ v: 1, policy: 'browser-close' });
  });

  it.each(['browser-close', 'idle-15m', 'idle-1h', 'idle-4h', 'every-open'] as const)('keeps %s', (policy) => {
    expect(parseLockSettings({ v: 1, policy })).toEqual({ v: 1, policy });
  });

  it('does not copy an unknown field', () => {
    expect(parseLockSettings({ v: 1, policy: 'idle-1h', extra: 'x' })).toEqual({ v: 1, policy: 'idle-1h' });
  });

  it('returns a fresh default object (the constant is never shared)', () => {
    const a = parseLockSettings(undefined);
    a.policy = 'idle-1h';
    expect(DEFAULT_LOCK_SETTINGS).toEqual({ v: 1, policy: 'browser-close' });
  });
});

describe('lock-policy: LOCK_POLICIES and isLockPolicy (Q-U1, FR-001, FR-002)', () => {
  it('exactly five choices, in display order, without "never"', () => {
    expect([...LOCK_POLICIES]).toEqual(['browser-close', 'idle-15m', 'idle-1h', 'idle-4h', 'every-open']);
    expect(LOCK_POLICIES.join(' ')).not.toMatch(/never|jamais/);
  });

  it.each(LOCK_POLICIES)('isLockPolicy accepts %s', (p) => {
    expect(isLockPolicy(p)).toBe(true);
  });

  it.each(['never', '', 42, undefined, null, 'idle-30m'])('isLockPolicy refuses %j', (p) => {
    expect(isLockPolicy(p)).toBe(false);
  });

  it('DEFAULT_LOCK_SETTINGS', () => {
    expect(DEFAULT_LOCK_SETTINGS).toEqual({ v: 1, policy: 'browser-close' });
  });
});

describe('lock-policy: idleLimitMs', () => {
  it.each([
    ['idle-15m', 900_000],
    ['idle-1h', 3_600_000],
    ['idle-4h', 14_400_000],
    ['browser-close', null],
    ['every-open', null],
  ] as const)('%s → %s', (policy, ms) => {
    expect(idleLimitMs(policy)).toBe(ms);
  });
});

describe('lock-policy: isIdleExpired (Q-U2, fail closed)', () => {
  const now = 1_800_000_000_000;

  it.each(['browser-close', 'every-open'] as const)('%s never expires, even with an invalid timestamp', (policy) => {
    for (const at of [undefined, NaN, -1, 'x', now - 10 * 3_600_000, now + 3_600_000]) {
      expect(isIdleExpired(policy, at, now)).toBe(false);
    }
  });

  const durations: [LockPolicy, number][] = [
    ['idle-15m', 900_000],
    ['idle-1h', 3_600_000],
    ['idle-4h', 14_400_000],
  ];

  it.each(durations)('%s: exactly the limit → false, limit + 1 ms → true', (policy, limit) => {
    expect(isIdleExpired(policy, now - limit, now)).toBe(false);
    expect(isIdleExpired(policy, now - limit - 1, now)).toBe(true);
    expect(isIdleExpired(policy, now, now)).toBe(false);
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['NaN', NaN],
    ['negative', -5],
    ['decimal', 1_799_999_999_999.5],
    ['string', '1800000000000'],
    ['infinite', Infinity],
  ])('timestamp %s → true (fail closed)', (_label, at) => {
    expect(isIdleExpired('idle-4h', at, now)).toBe(true);
  });

  it('clock set back: 60 s in the future tolerated, 60 s + 1 ms → true', () => {
    expect(isIdleExpired('idle-15m', now + 60_000, now)).toBe(false);
    expect(isIdleExpired('idle-15m', now + 60_001, now)).toBe(true);
  });
});
