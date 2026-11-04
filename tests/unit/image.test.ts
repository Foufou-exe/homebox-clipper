import { MAX_IMAGE_BYTES, isAllowedImageUrl, sniffImage } from '@/shared/image';

const HOSTS = ['m.media-amazon.com'];

describe('isAllowedImageUrl (R6)', () => {
  it.each([
    'https://m.media-amazon.com/images/I/test-1.jpg',
    'https://m.media-amazon.com/images/I/test-1._SL1000_.jpg?x=1',
    'https://M.MEDIA-AMAZON.COM/images/I/test-1.jpg',
    'https://m.media-amazon.com:443/images/I/test-1.jpg', // port par défaut, normalisé par new URL
  ])('accepte %s', (url) => {
    expect(isAllowedImageUrl(url, HOSTS)).toBe(true);
  });

  it.each([
    ['suffixe de domaine', 'https://m.media-amazon.com.evil.example/images/I/x.jpg'],
    ['sous-domaine', 'https://cdn.m.media-amazon.com/images/I/x.jpg'],
    ['autre hôte', 'https://images.example.invalid/1.jpg'],
    ['identifiants (user@)', 'https://m.media-amazon.com@evil.example/x.jpg'],
    ['utilisateur', 'https://user@m.media-amazon.com/images/I/x.jpg'],
    ['utilisateur et mot de passe', 'https://user:pw@m.media-amazon.com/images/I/x.jpg'],
    ['http:', 'http://m.media-amazon.com/images/I/x.jpg'],
    ['data:', 'data:image/png;base64,iVBORw0KGgo='],
    ['port explicite', 'https://m.media-amazon.com:8443/images/I/x.jpg'],
    ['URL invalide', 'pas une url'],
    ['vide', ''],
  ])('refuse : %s', (_label, url) => {
    expect(isAllowedImageUrl(url, HOSTS)).toBe(false);
  });

  it('liste vide : aucune photo', () => {
    expect(isAllowedImageUrl('https://m.media-amazon.com/images/I/x.jpg', [])).toBe(false);
  });

  it('pas de joker dans la liste : « *.exemple.fr » ne correspond à rien', () => {
    expect(isAllowedImageUrl('https://cdn.exemple.fr/x.jpg', ['*.exemple.fr'])).toBe(false);
  });
});

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('sniffImage (R7) : la signature fait foi', () => {
  it('JPEG', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
  });

  it('PNG', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({
      mimeType: 'image/png',
      extension: 'png',
    });
  });

  it('WebP (RIFF????WEBP)', () => {
    const webp = bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP'), 0);
    expect(sniffImage(webp)).toEqual({ mimeType: 'image/webp', extension: 'webp' });
  });

  it.each([
    ['SVG', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['SVG avec prologue XML', new TextEncoder().encode('<?xml version="1.0"?><svg></svg>')],
    ['GIF', new TextEncoder().encode('GIF89a\u0001\u0000')],
    ['HTML', new TextEncoder().encode('<!doctype html><html></html>')],
    ['vide', new Uint8Array(0)],
    ['PDF', new TextEncoder().encode('%PDF-1.7\n')],
    ['RIFF qui n’est pas du WebP (WAV)', bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE'))],
    ['PNG tronqué', bytes(0x89, 0x50, 0x4e, 0x47)],
    ['JPEG tronqué', bytes(0xff, 0xd8)],
  ])('refuse %s', (_label, data) => {
    expect(sniffImage(data)).toBeNull();
  });
});

describe('MAX_IMAGE_BYTES', () => {
  it('vaut 5 Mio', () => {
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });
});
