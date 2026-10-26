import { isPrivateHost, normalizeBaseUrl } from '@/background/config/url-policy';

describe('normalizeBaseUrl', () => {
  it.each([
    ['https://homebox.example.com', 'https://homebox.example.com'],
    ['https://homebox.example.com/', 'https://homebox.example.com'],
    ['  https://homebox.example.com/api/  ', 'https://homebox.example.com'],
    ['https://homebox.example.com/api/v1', 'https://homebox.example.com'],
    ['https://example.com/homebox/', 'https://example.com/homebox'],
    ['https://HomeBox.Example.com:8443', 'https://homebox.example.com:8443'],
  ])('normalise %s', (input, expected) => {
    const r = normalizeBaseUrl(input);
    expect(r.ok && r.value.baseUrl).toBe(expected);
  });

  it("renvoie l'origine pour la demande de permission", () => {
    const r = normalizeBaseUrl('https://example.com/homebox');
    expect(r.ok && r.value.origin).toBe('https://example.com');
  });

  it.each(['', 'pas une url', 'ftp://homebox.example.com', 'https://user:pass@homebox.example.com'])(
    'refuse %s → INVALID_URL',
    (input) => {
      expect(normalizeBaseUrl(input)).toEqual({ ok: false, error: 'INVALID_URL' });
    },
  );

  it('accepte HTTPS sans avertissement', () => {
    const r = normalizeBaseUrl('https://homebox.example.com');
    expect(r.ok && r.value.warning).toBeUndefined();
  });

  it.each([
    'http://localhost:3100',
    'http://127.0.0.1:7745',
    'http://[::1]:3100',
    'http://192.168.1.160:3100',
    'http://10.0.0.5',
    'http://172.16.0.1',
    'http://172.31.255.254:8080',
    'http://homebox.lan',
    'http://homebox.local:3100',
    'http://homebox.home.arpa',
    'http://homebox.internal',
    'http://homebox:7745',
    'http://[fd12:3456::1]:3100',
  ])('HTTP réseau privé %s → accepté avec avertissement', (input) => {
    const r = normalizeBaseUrl(input);
    expect(r.ok && r.value.warning).toBe('local_http');
  });

  it.each([
    'http://homebox.example.com',
    'http://8.8.8.8',
    'http://172.32.0.1',
    'http://172.15.255.255',
    'http://192.169.1.1',
    'http://11.0.0.1',
    'http://homebox.lan.example.com',
    'http://[2001:db8::1]',
  ])('HTTP public %s → INSECURE_URL', (input) => {
    expect(normalizeBaseUrl(input)).toEqual({ ok: false, error: 'INSECURE_URL' });
  });
});

describe('isPrivateHost', () => {
  it('ne se laisse pas tromper par un domaine public qui ressemble à une IP privée', () => {
    expect(isPrivateHost('192.168.1.1.example.com')).toBe(false);
    expect(isPrivateHost('10.0.0.1.nip.io')).toBe(false);
  });
});
