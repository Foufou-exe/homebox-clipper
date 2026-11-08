import { base64Size, base64ToBytes, bytesToBase64, isPdf } from '@/shared/pdf';

const enc = (s: string) => new TextEncoder().encode(s);

describe('isPdf', () => {
  it('accepts a valid PDF', () => {
    expect(isPdf(enc('%PDF-1.7\n%âãÏÓ\n1 0 obj'))).toBe(true);
  });

  it('accepts leading bytes before %PDF- within the first 1024 bytes', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('%PDF-1.4')]);
    expect(isPdf(bytes)).toBe(true);
  });

  it('rejects a signature beyond 1024 bytes', () => {
    expect(isPdf(enc(' '.repeat(1100) + '%PDF-1.4'))).toBe(false);
  });

  it('rejects HTML', () => {
    expect(isPdf(enc('<!doctype html><html><body>Connexion</body></html>'))).toBe(false);
  });

  it('rejects a PNG', () => {
    expect(isPdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
  });

  it('rejects an empty file', () => {
    expect(isPdf(new Uint8Array())).toBe(false);
  });
});

describe('base64', () => {
  it('lossless round trip', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256);
    const b64 = bytesToBase64(bytes);
    expect(base64ToBytes(b64)).toEqual(bytes);
    expect(base64Size(b64)).toBe(bytes.length);
  });
});
