import { createHomeBoxClient } from '@/background/homebox/client';
import { html, json, mockFetch, networkError } from './fetch-mock';

/** HomeBox client, entity types (spec 023, contracts/homebox-entity-types.md). Fictitious values only. */
const BASE = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx';
const client = (f: typeof fetch) =>
  createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: f });

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

describe('client HomeBox — listEntityTypes (GET /api/v1/entity-types)', () => {
  it('200 → entries reduced to id, name, isLocation, createdAt; instance only, key, no cookies; endpoint logged only', async () => {
    const m = mockFetch(
      json(200, [
        {
          id: 'et-1',
          name: 'Item',
          isLocation: false,
          createdAt: '2026-01-01T00:00:00Z',
          icon: 'x',
          description: 'd',
        },
        { id: 'et-2', name: 'Room', isLocation: true, createdAt: '2026-01-02T00:00:00Z' },
      ]),
    );
    const logs = spyLogs();
    expect(await client(m.fetch).listEntityTypes()).toEqual({
      ok: true,
      value: [
        { id: 'et-1', name: 'Item', isLocation: false, createdAt: '2026-01-01T00:00:00Z' },
        { id: 'et-2', name: 'Room', isLocation: true, createdAt: '2026-01-02T00:00:00Z' },
      ],
    });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]?.method).toBe('GET');
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/entity-types`);
    expect(m.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    expect((vi.mocked(m.fetch).mock.calls[0]?.[1] as RequestInit).credentials).toBe('omit');
    expect(logs.metas()).toEqual([
      { endpoint: 'GET /entity-types', status: 200, ms: expect.any(Number) },
    ]);
    expect(logs.text()).not.toMatch(/Item|Room|et-|hb_|example/);
  });

  it('entries without textual id and name are ignored; a non-boolean isLocation is false; createdAt kept only if textual', async () => {
    const m = mockFetch(
      json(200, [
        { id: 'et-1', name: 'Item', isLocation: 'yes', createdAt: 12 },
        { id: 2, name: 'X' },
        { id: 'et-3' },
        { id: 'et-4', name: '' },
        null,
      ]),
    );
    expect(await client(m.fetch).listEntityTypes()).toEqual({
      ok: true,
      value: [{ id: 'et-1', name: 'Item', isLocation: false }],
    });
  });

  it('keeps at most 200 valid entries', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: `et-${i}`,
      name: `T${i}`,
      isLocation: false,
    }));
    const res = await client(mockFetch(json(200, many)).fetch).listEntityTypes();
    expect(res.ok && res.value).toHaveLength(200);
  });

  it('404 → ENTITY_TYPES_UNSUPPORTED', async () => {
    expect(await client(mockFetch(json(404, {})).fetch).listEntityTypes()).toEqual({
      ok: false,
      error: 'ENTITY_TYPES_UNSUPPORTED',
      httpStatus: 404,
    });
  });

  it('401 and 403 → UNAUTHORIZED; 500 → ENTITY_TYPES_UNAVAILABLE; network → HOMEBOX_UNREACHABLE', async () => {
    expect(await client(mockFetch(json(401, {})).fetch).listEntityTypes()).toMatchObject({
      error: 'UNAUTHORIZED',
    });
    expect(await client(mockFetch(json(403, {})).fetch).listEntityTypes()).toMatchObject({
      error: 'UNAUTHORIZED',
    });
    expect(await client(mockFetch(json(500, {})).fetch).listEntityTypes()).toMatchObject({
      error: 'ENTITY_TYPES_UNAVAILABLE',
    });
    expect(await client(mockFetch(networkError()).fetch).listEntityTypes()).toEqual({
      ok: false,
      error: 'HOMEBOX_UNREACHABLE',
    });
  });

  it('a non-array body or an unreadable answer → ENTITY_TYPES_UNAVAILABLE', async () => {
    expect(await client(mockFetch(json(200, { items: [] })).fetch).listEntityTypes()).toMatchObject(
      {
        ok: false,
        error: 'ENTITY_TYPES_UNAVAILABLE',
      },
    );
    expect(await client(mockFetch(html(200)).fetch).listEntityTypes()).toMatchObject({
      ok: false,
      error: 'ENTITY_TYPES_UNAVAILABLE',
    });
  });
});

describe('client HomeBox — entityTypeId on creation', () => {
  const created = json(201, { id: 'new-1', name: 'Perceuse' });

  it('createEntity: entityTypeId in the body only when given; the body is unchanged otherwise', async () => {
    const withType = mockFetch(created);
    await client(withType.fetch).createEntity({
      name: 'Perceuse',
      quantity: 1,
      entityTypeId: 'et-2',
    });
    expect(JSON.parse(String(withType.calls[0]?.body))).toEqual({
      name: 'Perceuse',
      quantity: 1,
      entityTypeId: 'et-2',
    });

    const without = mockFetch(created);
    await client(without.fetch).createEntity({ name: 'Perceuse', quantity: 1 });
    expect(String(without.calls[0]?.body)).toBe(JSON.stringify({ name: 'Perceuse', quantity: 1 }));
  });

  it('createFromTemplate: entityTypeId in the body only when given', async () => {
    const withType = mockFetch(created);
    await client(withType.fetch).createFromTemplate('tpl-1', {
      name: 'Perceuse',
      quantity: 1,
      parentId: 'loc-1',
      entityTypeId: 'et-2',
    });
    expect(JSON.parse(String(withType.calls[0]?.body))).toEqual({
      name: 'Perceuse',
      quantity: 1,
      parentId: 'loc-1',
      entityTypeId: 'et-2',
    });

    const without = mockFetch(created);
    await client(without.fetch).createFromTemplate('tpl-1', {
      name: 'Perceuse',
      quantity: 1,
      parentId: 'loc-1',
    });
    expect(String(without.calls[0]?.body)).toBe(
      JSON.stringify({ name: 'Perceuse', quantity: 1, parentId: 'loc-1' }),
    );
  });
});
