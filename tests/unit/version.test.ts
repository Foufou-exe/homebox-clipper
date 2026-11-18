import { compareVersions, isVersion } from '@/shared/version';

describe('version: compareVersions (U-8)', () => {
  it.each([
    ['1.10.0', '1.9.0', 1],
    ['1.2', '1.2.0', 0],
    ['0.3.0.1', '0.3.0', 1],
    ['0.3.0', '0.4.0', -1],
    ['0.4.0', '0.4.0', 0],
    ['2', '1.99.99.99', 1],
  ] as const)('%s vs %s → %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it.each([
    ['a', '1.0.0'],
    ['1.0.0', 'a'],
    ['', '1.0.0'],
    ['1.0.0', undefined],
    [undefined, '1.0.0'],
  ])('%j vs %j → null (not a version)', (a, b) => {
    expect(compareVersions(a, b)).toBeNull();
  });
});

describe('version: isVersion', () => {
  it.each(['0.3.0', '1', '1.2.3.4', '65535.0.0', '0'])('accepts %s', (v) => {
    expect(isVersion(v)).toBe(true);
  });

  it.each(['', 'a', '1.2.3.4.5', '65536.0.0', '1.0.0/../x', 'v1.0.0', '1..0', '1.0.', ' 1.0', 42, undefined, null])(
    'refuses %j',
    (v) => {
      expect(isVersion(v)).toBe(false);
    },
  );
});
