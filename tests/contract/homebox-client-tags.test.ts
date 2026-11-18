import { createHomeBoxClient } from '@/background/homebox/client';
import { html, json, mockFetch, networkError } from './fetch-mock';

/** HomeBox client, tags (spec 014, Q-C1, contracts/homebox-tags.md). Fictitious values only. */
const BASE = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx';
const client = (f: typeof fetch) => createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: f });

/** Every argument passed to console.debug / console.warn (the only outputs of the logger), serialised. */
function spyLogs() {
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  return {
    text: () => JSON.stringify([...debug.mock.calls, ...warn.mock.calls]),
    metas: () => [...debug.mock.calls, ...warn.mock.calls].map((c) => c[1] as Record<string, unknown>),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('client HomeBox — listTags (GET /api/v1/tags)', () => {
  it('200 → list of { id, name }; the request goes to the instance only, with the key and without cookies', async () => {
    const m = mockFetch(json(200, [
      { id: 't1', name: 'Amazon', color: '#fff', description: 'x' },
      { id: 't2', name: 'Informatique' },
    ]));
    const logs = spyLogs();
    expect(await client(m.fetch).listTags()).toEqual({
      ok: true,
      value: [
        { id: 't1', name: 'Amazon' },
        { id: 't2', name: 'Informatique' },
      ],
    });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]?.method).toBe('GET');
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/tags`);
    expect(m.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    const init = vi.mocked(m.fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('omit');
    expect(logs.metas()).toEqual([{ endpoint: 'GET /tags', status: 200, ms: expect.any(Number) }]);
    expect(logs.text()).not.toMatch(/Amazon|Informatique|hb_/);
  });

  it('entries without textual id and name are ignored', async () => {
    const m = mockFetch(json(200, [
      { id: 't1', name: 'Amazon' },
      { id: 3, name: 'Bureau' },
      { id: 't3' },
      { name: 'Cuisine' },
      null,
      'Écran',
      { id: 't4', name: 4 },
    ]));
    expect(await client(m.fetch).listTags()).toEqual({ ok: true, value: [{ id: 't1', name: 'Amazon' }] });
  });

  it('empty list → ok([])', async () => {
    const m = mockFetch(json(200, []));
    expect(await client(m.fetch).listTags()).toEqual({ ok: true, value: [] });
  });

  it.each([401, 403])('%i → UNAUTHORIZED', async (status) => {
    const m = mockFetch(json(status, {}));
    expect(await client(m.fetch).listTags()).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('fetch rejected → HOMEBOX_UNREACHABLE', async () => {
    const m = mockFetch(networkError());
    expect(await client(m.fetch).listTags()).toMatchObject({ ok: false, error: 'HOMEBOX_UNREACHABLE' });
  });

  it('HTML instead of JSON → TAGS_UNAVAILABLE', async () => {
    const m = mockFetch(html(200));
    expect(await client(m.fetch).listTags()).toMatchObject({ ok: false, error: 'TAGS_UNAVAILABLE' });
  });

  it('object instead of array → TAGS_UNAVAILABLE', async () => {
    const m = mockFetch(json(200, { items: [{ id: 't1', name: 'Amazon' }] }));
    expect(await client(m.fetch).listTags()).toMatchObject({ ok: false, error: 'TAGS_UNAVAILABLE' });
  });

  it('500 → TAGS_UNAVAILABLE', async () => {
    const m = mockFetch(json(500, { error: 'boom' }));
    expect(await client(m.fetch).listTags()).toMatchObject({ ok: false, error: 'TAGS_UNAVAILABLE', httpStatus: 500 });
  });

  it('the key is only sent to the configured instance', async () => {
    const m = mockFetch(json(200, []));
    await client(m.fetch).listTags();
    for (const call of m.calls) {
      expect(call.url.startsWith(`${BASE}/`)).toBe(true);
      if (call.headers.has('Authorization')) expect(call.url).toBe(`${BASE}/api/v1/tags`);
    }
  });
});

describe('client HomeBox — createTag (POST /api/v1/tags)', () => {
  it('201 → { id, name }; body exactly {"name":"Informatique"} in JSON, key only to the instance', async () => {
    const m = mockFetch(json(201, { id: 'tNew', name: 'Informatique', color: '', description: '' }));
    const logs = spyLogs();
    expect(await client(m.fetch).createTag('Informatique')).toEqual({ ok: true, value: { id: 'tNew', name: 'Informatique' } });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]?.method).toBe('POST');
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/tags`);
    expect(m.calls[0]?.body).toBe('{"name":"Informatique"}');
    expect(m.calls[0]?.headers.get('Content-Type')).toBe('application/json');
    expect(m.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    const init = vi.mocked(m.fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('omit');
    expect(logs.metas()).toEqual([{ endpoint: 'POST /tags', status: 201, ms: expect.any(Number) }]);
    expect(logs.text()).not.toMatch(/Informatique|hb_/);
  });

  it('422 → TAG_FAILED', async () => {
    const m = mockFetch(json(422, { error: 'invalid' }));
    expect(await client(m.fetch).createTag('Informatique')).toMatchObject({ ok: false, error: 'TAG_FAILED', httpStatus: 422 });
  });

  it.each([
    ['without id', { name: 'Informatique' }],
    ['without name', { id: 'tNew' }],
    ['not an object', ['tNew']],
  ])('201 %s → TAG_FAILED', async (_label, body) => {
    const m = mockFetch(json(201, body));
    expect(await client(m.fetch).createTag('Informatique')).toMatchObject({ ok: false, error: 'TAG_FAILED' });
  });

  it('201 with HTML → TAG_FAILED', async () => {
    const m = mockFetch(html(201));
    expect(await client(m.fetch).createTag('Informatique')).toMatchObject({ ok: false, error: 'TAG_FAILED' });
  });

  it.each([401, 403])('%i → UNAUTHORIZED', async (status) => {
    const m = mockFetch(json(status, {}));
    expect(await client(m.fetch).createTag('Informatique')).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('fetch rejected → HOMEBOX_UNREACHABLE, no tag name logged', async () => {
    const m = mockFetch(networkError());
    const logs = spyLogs();
    expect(await client(m.fetch).createTag('Informatique')).toMatchObject({ ok: false, error: 'HOMEBOX_UNREACHABLE' });
    expect(logs.metas().map((x) => x.endpoint)).toEqual(['POST /tags']);
    expect(logs.text()).not.toContain('Informatique');
  });
});
