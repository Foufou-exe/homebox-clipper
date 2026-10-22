import { normalizeBaseUrl } from '@/background/config/url-policy';

describe('normalizeBaseUrl', () => {
  it.each([
    ['https://homebox.example.com', 'https://homebox.example.com'],
    ['https://homebox.example.com/', 'https://homebox.example.com'],
    ['  https://homebox.example.com/api/  ', 'https://homebox.example.com'],
    ['https://homebox.example.com/api/v1', 'https://homebox.example.com'],
    ['https://example.com/homebox/', 'https://example.com/homebox'],
    ['https://HomeBox.Example.com:8443', 'https://homebox.example.com:8443'],
  ])('normalise %s', (input, expected) => {
    const r = normalizeBaseUrl(input, { dev: false });
    expect(r.ok && r.value.baseUrl).toBe(expected);
  });

  it("renvoie l'origine pour la demande de permission", () => {
    const r = normalizeBaseUrl('https://example.com/homebox', { dev: false });
    expect(r.ok && r.value.origin).toBe('https://example.com');
  });

  it.each(['', 'pas une url', 'ftp://homebox.example.com', 'https://user:pass@homebox.example.com'])(
    'refuse %s → INVALID_URL',
    (input) => {
      expect(normalizeBaseUrl(input, { dev: false })).toEqual({ ok: false, error: 'INVALID_URL' });
    },
  );

  it('refuse HTTP en production → INSECURE_URL', () => {
    expect(normalizeBaseUrl('http://homebox.lan', { dev: false })).toEqual({
      ok: false,
      error: 'INSECURE_URL',
    });
  });

  it.each(['http://localhost:3100', 'http://127.0.0.1:7745'])(
    'accepte %s avec avertissement local_http',
    (input) => {
      const r = normalizeBaseUrl(input, { dev: false });
      expect(r.ok && r.value.warning).toBe('local_http');
    },
  );

  it('accepte tout HTTP en développement', () => {
    const r = normalizeBaseUrl('http://homebox.lan', { dev: true });
    expect(r.ok && r.value.warning).toBe('local_http');
  });

  it('accepte HTTPS sans avertissement', () => {
    const r = normalizeBaseUrl('https://homebox.example.com', { dev: false });
    expect(r.ok && r.value.warning).toBeUndefined();
  });
});
