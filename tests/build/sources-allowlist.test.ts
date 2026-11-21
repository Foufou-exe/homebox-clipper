import config from '../../wxt.config';

/**
 * Firefox (AMO) source archive — constitution v3.4.0: allowlist only, reproducible, no secret, no
 * HomeBox or personal data. WXT does not read .gitignore: without this list, `wxt zip -b firefox`
 * would ship the root homebox/ folder, *.pepper, coverage/ and specs/. This test reads the
 * configuration only; it never opens any of those files.
 */
type ZipOptions = { includeSources?: string[]; excludeSources?: string[]; dotSources?: boolean };
const zip = (config as { zip?: ZipOptions }).zip ?? {};

describe('[sources] Firefox source archive allowlist', () => {
  it('includeSources is exactly the allowlist', () => {
    expect(zip.includeSources).toEqual([
      'src/**',
      'public/**',
      'package.json',
      'bun.lock',
      'tsconfig.json',
      'wxt.config.ts',
      'LICENSE',
      'README.md',
      'docs/store/amo-build.md',
    ]);
  });

  it('excludeSources drops raw/, *.pepper and .env* even inside allowed folders', () => {
    expect(zip.excludeSources).toEqual(
      expect.arrayContaining(['**/raw/**', '**/*.pepper', '**/.env*']),
    );
  });

  it('excludeSources drops private key and certificate files (*.pem, *.key, *.p12, *.pfx)', () => {
    expect(zip.excludeSources).toEqual(expect.arrayContaining(['**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx']));
  });

  it('dot files are not added to the source archive', () => {
    expect(zip.dotSources ?? false).toBe(false);
  });

  it('Manifest V3 only, for every browser', () => {
    expect((config as { manifestVersion?: number }).manifestVersion).toBe(3);
  });
});
