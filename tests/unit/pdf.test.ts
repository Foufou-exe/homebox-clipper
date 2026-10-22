import { base64Size, base64ToBytes, bytesToBase64, isPdf } from '@/shared/pdf';

const enc = (s: string) => new TextEncoder().encode(s);

describe('isPdf', () => {
  it('accepte un PDF valide', () => {
    expect(isPdf(enc('%PDF-1.7\n%âãÏÓ\n1 0 obj'))).toBe(true);
  });

  it('accepte des octets de tête avant %PDF- dans les 1024 premiers octets', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('%PDF-1.4')]);
    expect(isPdf(bytes)).toBe(true);
  });

  it('refuse une signature au-delà de 1024 octets', () => {
    expect(isPdf(enc(' '.repeat(1100) + '%PDF-1.4'))).toBe(false);
  });

  it('refuse du HTML', () => {
    expect(isPdf(enc('<!doctype html><html><body>Connexion</body></html>'))).toBe(false);
  });

  it('refuse un PNG', () => {
    expect(isPdf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
  });

  it('refuse un fichier vide', () => {
    expect(isPdf(new Uint8Array())).toBe(false);
  });
});

describe('base64', () => {
  it('aller-retour sans perte', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256);
    const b64 = bytesToBase64(bytes);
    expect(base64ToBytes(b64)).toEqual(bytes);
    expect(base64Size(b64)).toBe(bytes.length);
  });
});
