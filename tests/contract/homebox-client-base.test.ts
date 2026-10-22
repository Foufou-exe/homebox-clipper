import { createHomeBoxClient } from '@/background/homebox/client';
import { json, mockFetch, networkError, timeout } from './fetch-mock';

const BASE = 'https://homebox.example.com';
const KEY = 'hb_test_key_1234';

describe('client HomeBox — socle', () => {
  it("envoie l'en-tête Authorization à l'instance configurée", async () => {
    const m = mockFetch(json(200, {}));
    await createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: m.fetch }).checkAuth();
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/users/self`);
    expect(m.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
  });

  it("n'envoie pas Authorization sur l'endpoint public /status", async () => {
    const m = mockFetch(json(200, { health: true }));
    await createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: m.fetch }).getStatus();
    expect(m.calls[0]?.headers.has('Authorization')).toBe(false);
  });

  it('erreur réseau → HOMEBOX_UNREACHABLE', async () => {
    const m = mockFetch(networkError());
    const r = await createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: m.fetch }).checkAuth();
    expect(r).toEqual({ ok: false, error: 'HOMEBOX_UNREACHABLE' });
  });

  it('timeout → HOMEBOX_UNREACHABLE', async () => {
    const m = mockFetch(timeout());
    const r = await createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: m.fetch }).checkAuth();
    expect(r).toEqual({ ok: false, error: 'HOMEBOX_UNREACHABLE' });
  });

  it.each([401, 403])('%i → UNAUTHORIZED', async (status) => {
    const m = mockFetch(json(status, { error: 'unauthorized' }));
    const r = await createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: m.fetch }).checkAuth();
    expect(r).toEqual({ ok: false, error: 'UNAUTHORIZED', httpStatus: status });
  });

  it('ne journalise jamais la clé API', async () => {
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    const m = mockFetch(json(401, {}), networkError());
    const client = createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: m.fetch });
    await client.checkAuth();
    await client.checkAuth();
    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output).not.toContain(KEY);
  });
});
