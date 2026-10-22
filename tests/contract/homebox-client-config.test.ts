import { createHomeBoxClient } from '@/background/homebox/client';
import { html, json, mockFetch } from './fetch-mock';

const BASE = 'https://homebox.example.com';
const client = (f: typeof fetch) => createHomeBoxClient({ baseUrl: BASE, apiKey: 'hb_x', fetchImpl: f });

describe('client HomeBox — configuration', () => {
  it('getStatus 200 avec health → version', async () => {
    const m = mockFetch(json(200, { health: true, title: 'Homebox', build: { version: 'v0.27.0' } }));
    expect(await client(m.fetch).getStatus()).toEqual({
      ok: true,
      value: { version: '0.27.0', title: 'Homebox' },
    });
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/status`);
  });

  it('getStatus HTML → INVALID_URL', async () => {
    const m = mockFetch(html(200));
    expect(await client(m.fetch).getStatus()).toMatchObject({ ok: false, error: 'INVALID_URL' });
  });

  it('getStatus JSON sans health → INVALID_URL', async () => {
    const m = mockFetch(json(200, { hello: 'world' }));
    expect(await client(m.fetch).getStatus()).toMatchObject({ ok: false, error: 'INVALID_URL' });
  });

  it('getStatus 404 → INVALID_URL', async () => {
    const m = mockFetch(html(404));
    expect(await client(m.fetch).getStatus()).toMatchObject({ ok: false, error: 'INVALID_URL' });
  });

  it('checkAuth 200 → ok', async () => {
    const m = mockFetch(json(200, { item: { id: 'u1' } }));
    expect(await client(m.fetch).checkAuth()).toEqual({ ok: true, value: undefined });
  });

  it('checkAuth 401 → UNAUTHORIZED', async () => {
    const m = mockFetch(json(401, {}));
    expect(await client(m.fetch).checkAuth()).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
  });
});
