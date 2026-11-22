import { createHomeBoxClient } from '@/background/homebox/client';
import { html, json, mockFetch, networkError, timeout } from './fetch-mock';

/** HomeBox client, custom field names (spec 019, Q-C1, contracts/homebox-fields.md §1, §5). Fictitious values only. */
const BASE = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx';
const client = (f: typeof fetch) =>
  createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: f });

/** Every argument passed to console.debug / console.warn (the only outputs of the logger), serialised. */
function spyLogs() {
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  return {
    text: () => JSON.stringify([...debug.mock.calls, ...warn.mock.calls]),
    metas: () =>
      [...debug.mock.calls, ...warn.mock.calls].map((c) => c[1] as Record<string, unknown>),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('client HomeBox — listFieldNames (GET /api/v1/entities/fields)', () => {
  it('200 array → the names (strings only); exact request to the instance, with the key, without cookies; no name logged', async () => {
    const m = mockFetch(
      json(200, ['Order number', 'N° commande', 3, null, { name: 'x' }, 'Couleur']),
    );
    const logs = spyLogs();
    expect(await client(m.fetch).listFieldNames()).toEqual({
      ok: true,
      value: ['Order number', 'N° commande', 'Couleur'],
    });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]?.method).toBe('GET');
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/entities/fields`);
    expect(m.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    const init = vi.mocked(m.fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('omit');
    expect(logs.metas()).toEqual([
      { endpoint: 'GET /entities/fields', status: 200, ms: expect.any(Number) },
    ]);
    expect(logs.text()).not.toMatch(/Order number|N° commande|Couleur|hb_/);
  });

  it('200 null → ok([])', async () => {
    expect(await client(mockFetch(json(200, null)).fetch).listFieldNames()).toEqual({
      ok: true,
      value: [],
    });
  });

  it('200 object → FIELD_NAMES_UNAVAILABLE with the status', async () => {
    expect(await client(mockFetch(json(200, { names: [] })).fetch).listFieldNames()).toEqual({
      ok: false,
      error: 'FIELD_NAMES_UNAVAILABLE',
      httpStatus: 200,
    });
  });

  it('unreadable JSON → FIELD_NAMES_UNAVAILABLE', async () => {
    const res = await client(mockFetch(html(200)).fetch).listFieldNames();
    expect(res.ok === false && res.error).toBe('FIELD_NAMES_UNAVAILABLE');
  });

  it.each([401, 403])('%i → UNAUTHORIZED', async (status) => {
    expect(await client(mockFetch(json(status, {})).fetch).listFieldNames()).toEqual({
      ok: false,
      error: 'UNAUTHORIZED',
      httpStatus: status,
    });
  });

  it.each([404, 500, 502])('%i → FIELD_NAMES_UNAVAILABLE', async (status) => {
    expect(await client(mockFetch(json(status, {})).fetch).listFieldNames()).toEqual({
      ok: false,
      error: 'FIELD_NAMES_UNAVAILABLE',
      httpStatus: status,
    });
  });

  it('network error and timeout → HOMEBOX_UNREACHABLE; only the endpoint template is logged', async () => {
    const logs = spyLogs();
    expect(await client(mockFetch(networkError()).fetch).listFieldNames()).toEqual({
      ok: false,
      error: 'HOMEBOX_UNREACHABLE',
    });
    expect(await client(mockFetch(timeout()).fetch).listFieldNames()).toEqual({
      ok: false,
      error: 'HOMEBOX_UNREACHABLE',
    });
    expect(logs.metas()).toEqual([
      { endpoint: 'GET /entities/fields', code: 'HOMEBOX_UNREACHABLE' },
      { endpoint: 'GET /entities/fields', code: 'HOMEBOX_UNREACHABLE' },
    ]);
  });

  it('the client exposes no method reading the field values', async () => {
    const methods = Object.keys(client(mockFetch().fetch));
    expect(methods).toContain('listFieldNames');
    expect(methods.filter((k) => /value/i.test(k))).toEqual([]);
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(__dirname, '../../src/background/homebox/client.ts'),
      'utf8',
    );
    expect(source).not.toContain('/entities/fields/values');
  });
});
