import { createHomeBoxClient } from '@/background/homebox/client';
import { log } from '@/shared/logger';
import { json, mockFetch, networkError, html } from './fetch-mock';

vi.mock('@/shared/logger', () => ({ log: vi.fn(), logError: vi.fn() }));

const BASE = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx';
const NUMBER = '999-0000000-0000001';
const make = (m: ReturnType<typeof mockFetch>) => createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: m.fetch });

describe('client HomeBox: searchEntitiesByField (spec 020)', () => {
  beforeEach(() => vi.mocked(log).mockClear());

  it('F1: GET /entities?fields=...&pageSize=20, no q, Bearer key to the instance origin', async () => {
    const items = [{ id: 'e1', name: 'Clavier' }];
    const m = mockFetch(json(200, { items }));
    const r = await make(m).searchEntitiesByField('Order number', NUMBER);
    expect(r).toEqual({ ok: true, value: items });
    const url = new URL(m.calls[0]!.url);
    expect(url.origin).toBe(BASE);
    expect(url.pathname).toBe('/api/v1/entities');
    expect(url.searchParams.get('fields')).toBe(`Order number=${NUMBER}`);
    expect(url.searchParams.get('pageSize')).toBe('20');
    expect(url.searchParams.has('q')).toBe(false);
    expect(m.calls[0]!.method).toBe('GET');
    expect(m.calls[0]!.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
  });

  it('F2: special characters round-trip exactly through the query string', async () => {
    const m = mockFetch(json(200, { items: [] }));
    await make(m).searchEntitiesByField('N° commande é', 'a,b&c+d=e');
    expect(new URL(m.calls[0]!.url).searchParams.get('fields')).toBe('N° commande é=a,b&c+d=e');
  });

  it.each([{}, { items: null }, { items: 'x' }, { items: { a: 1 } }])('F3: items %j gives an empty list', async (body) => {
    const m = mockFetch(json(200, body));
    expect(await make(m).searchEntitiesByField('Order number', NUMBER)).toEqual({ ok: true, value: [] });
  });

  it.each([
    ['401', json(401, {})],
    ['403', json(403, {})],
    ['404', json(404, {})],
    ['500', json(500, {})],
    ['network', networkError()],
    ['invalid JSON', html(200, 'not json')],
  ])('F4: %s gives the same error as searchEntities', async (_label, responder) => {
    const a = await make(mockFetch(responder)).searchEntitiesByField('Order number', NUMBER);
    const b = await make(mockFetch(responder)).searchEntities('x');
    expect(a.ok).toBe(false);
    expect(a).toEqual(b);
  });

  it('F5: logs only the endpoint template, never the field name or the number', async () => {
    const m = mockFetch(json(200, { items: [] }), networkError());
    const client = make(m);
    await client.searchEntitiesByField('Secret field name', NUMBER);
    await client.searchEntitiesByField('Secret field name', NUMBER);
    const calls = vi.mocked(log).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [, meta] of calls) expect(meta?.endpoint).toBe('GET /entities?fields');
    const output = JSON.stringify(calls);
    expect(output).not.toContain('Secret field name');
    expect(output).not.toContain(NUMBER);
  });
});
