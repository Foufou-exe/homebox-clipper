import { createHomeBoxClient } from '@/background/homebox/client';
import { html, json, mockFetch, networkError } from './fetch-mock';

/** HomeBox client, item templates (spec 018, Q-C1, contracts/homebox-templates.md §1, §2, §5). Fictitious values only. */
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

const TEMPLATE = {
  id: 'tpl-1',
  name: 'Livre',
  description: 'Romans',
  updatedAt: '2026-11-01T10:00:00Z',
  defaultInsured: true,
  defaultManufacturer: 'Éditions Exemple',
  fields: [{ id: 'f1', type: 'text', name: 'Auteur', textValue: 'Jane Doe' }],
};

afterEach(() => vi.restoreAllMocks());

describe('client HomeBox — listTemplates (GET /api/v1/templates)', () => {
  it('200 → summaries; instance only, with the key, without cookies; template endpoint logged only', async () => {
    const m = mockFetch(
      json(200, [
        {
          id: 'tpl-1',
          name: 'Livre',
          description: 'Romans',
          updatedAt: '2026-11-01T10:00:00Z',
          extra: 1,
        },
        { id: 'tpl-2', name: 'Jeu' },
      ]),
    );
    const logs = spyLogs();
    expect(await client(m.fetch).listTemplates()).toEqual({
      ok: true,
      value: [
        { id: 'tpl-1', name: 'Livre', description: 'Romans', updatedAt: '2026-11-01T10:00:00Z' },
        { id: 'tpl-2', name: 'Jeu' },
      ],
    });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]?.method).toBe('GET');
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/templates`);
    expect(m.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    expect((vi.mocked(m.fetch).mock.calls[0]?.[1] as RequestInit).credentials).toBe('omit');
    expect(logs.metas()).toEqual([
      { endpoint: 'GET /templates', status: 200, ms: expect.any(Number) },
    ]);
    expect(logs.text()).not.toMatch(/Livre|Jeu|tpl-|hb_|example/);
  });

  it('entries without textual id and name are ignored', async () => {
    const m = mockFetch(
      json(200, [
        { id: 'tpl-1', name: 'Livre' },
        { id: 2, name: 'X' },
        { id: 'tpl-3' },
        null,
        'Jeu',
      ]),
    );
    expect(await client(m.fetch).listTemplates()).toEqual({
      ok: true,
      value: [{ id: 'tpl-1', name: 'Livre' }],
    });
  });

  it.each([401, 403])('%i → UNAUTHORIZED', async (status) => {
    expect(await client(mockFetch(json(status, {})).fetch).listTemplates()).toMatchObject({
      ok: false,
      error: 'UNAUTHORIZED',
    });
  });
  it('404 → TEMPLATES_UNSUPPORTED', async () => {
    expect(await client(mockFetch(json(404, {})).fetch).listTemplates()).toMatchObject({
      ok: false,
      error: 'TEMPLATES_UNSUPPORTED',
    });
  });
  it('network error → HOMEBOX_UNREACHABLE', async () => {
    expect(await client(mockFetch(networkError()).fetch).listTemplates()).toMatchObject({
      ok: false,
      error: 'HOMEBOX_UNREACHABLE',
    });
  });
  it.each([
    ['500', json(500, {})],
    ['unreadable JSON', html(200)],
    ['non-array', json(200, { items: [] })],
  ])('%s → TEMPLATES_UNAVAILABLE', async (_label, responder) => {
    expect(await client(mockFetch(responder).fetch).listTemplates()).toMatchObject({
      ok: false,
      error: 'TEMPLATES_UNAVAILABLE',
    });
  });
});

describe('client HomeBox — getTemplate (GET /api/v1/templates/{id})', () => {
  it('200 → the template; id logged as a template only', async () => {
    const m = mockFetch(json(200, TEMPLATE));
    const logs = spyLogs();
    expect(await client(m.fetch).getTemplate('tpl-1')).toEqual({ ok: true, value: TEMPLATE });
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/templates/tpl-1`);
    expect(m.calls[0]?.method).toBe('GET');
    expect(m.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    expect((vi.mocked(m.fetch).mock.calls[0]?.[1] as RequestInit).credentials).toBe('omit');
    expect(logs.metas()).toEqual([
      { endpoint: 'GET /templates/{id}', status: 200, ms: expect.any(Number) },
    ]);
    expect(logs.text()).not.toMatch(/tpl-1|Livre|Auteur|Jane Doe|hb_/);
  });

  it('special characters in the id are encoded', async () => {
    const m = mockFetch(json(200, { ...TEMPLATE, id: 'a/b?c' }));
    await client(m.fetch).getTemplate('a/b?c');
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/templates/a%2Fb%3Fc`);
  });

  it.each([401, 403])('%i → UNAUTHORIZED', async (status) => {
    expect(await client(mockFetch(json(status, {})).fetch).getTemplate('tpl-1')).toMatchObject({
      ok: false,
      error: 'UNAUTHORIZED',
    });
  });
  it('404 → TEMPLATE_NOT_FOUND', async () => {
    expect(await client(mockFetch(json(404, {})).fetch).getTemplate('tpl-1')).toMatchObject({
      ok: false,
      error: 'TEMPLATE_NOT_FOUND',
    });
  });
  it('network error → HOMEBOX_UNREACHABLE', async () => {
    expect(await client(mockFetch(networkError()).fetch).getTemplate('tpl-1')).toMatchObject({
      ok: false,
      error: 'HOMEBOX_UNREACHABLE',
    });
  });
  it.each([
    ['500', json(500, {})],
    ['unreadable JSON', html(200)],
    ['answer without textual id', json(200, { id: 3, name: 'Livre' })],
    ['null', json(200, null)],
  ])('%s → TEMPLATES_UNAVAILABLE', async (_label, responder) => {
    expect(await client(mockFetch(responder).fetch).getTemplate('tpl-1')).toMatchObject({
      ok: false,
      error: 'TEMPLATES_UNAVAILABLE',
    });
  });
});

describe('client HomeBox — createFromTemplate (POST /api/v1/templates/{id}/create-item)', () => {
  const body = {
    name: 'Clavier sans fil Exemple Pro',
    description: 'Acheté sur Amazon.fr',
    quantity: 1,
    parentId: 'loc-1',
  };

  it('201 → created object; exact body with the 4 keys only; template endpoint logged', async () => {
    const m = mockFetch(json(201, { id: 'e1', name: body.name }));
    const logs = spyLogs();
    expect(await client(m.fetch).createFromTemplate('tpl-1', body)).toEqual({
      ok: true,
      value: { id: 'e1', name: body.name },
    });
    expect(m.calls[0]?.method).toBe('POST');
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/templates/tpl-1/create-item`);
    expect(m.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    expect(m.calls[0]?.headers.get('Content-Type')).toBe('application/json');
    const sent = JSON.parse(m.calls[0]?.body as string) as Record<string, unknown>;
    expect(Object.keys(sent)).toEqual(['name', 'description', 'quantity', 'parentId']);
    expect(sent).toEqual(body);
    expect(logs.metas()).toEqual([
      { endpoint: 'POST /templates/{id}/create-item', status: 201, ms: expect.any(Number) },
    ]);
    expect(logs.text()).not.toMatch(/tpl-1|Clavier|loc-1|hb_/);
  });

  it('empty description omitted; never locationId, tagIds or entityTypeId, even if passed', async () => {
    const m = mockFetch(json(201, { id: 'e1', name: 'x' }));
    const extra = {
      name: 'x',
      description: '',
      quantity: 2,
      parentId: 'loc-1',
      locationId: 'l',
      tagIds: ['t'],
      entityTypeId: 'e',
    };
    await client(m.fetch).createFromTemplate('tpl-1', extra as never);
    const sent = JSON.parse(m.calls[0]?.body as string) as Record<string, unknown>;
    expect(Object.keys(sent)).toEqual(['name', 'quantity', 'parentId']);
  });

  it.each([401, 403])('%i → UNAUTHORIZED', async (status) => {
    expect(
      await client(mockFetch(json(status, {})).fetch).createFromTemplate('tpl-1', body),
    ).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
  });
  it('network error → HOMEBOX_UNREACHABLE', async () => {
    expect(await client(mockFetch(networkError()).fetch).createFromTemplate('tpl-1', body)).toEqual(
      { ok: false, error: 'HOMEBOX_UNREACHABLE' },
    );
  });
  it.each([404, 500, 422])('%i → CREATE_FAILED with httpStatus', async (status) => {
    expect(
      await client(mockFetch(json(status, {})).fetch).createFromTemplate('tpl-1', body),
    ).toEqual({ ok: false, error: 'CREATE_FAILED', httpStatus: status });
  });
  it('2xx unreadable → CREATE_FAILED with the 2xx status (uncertain creation)', async () => {
    expect(await client(mockFetch(html(201)).fetch).createFromTemplate('tpl-1', body)).toEqual({
      ok: false,
      error: 'CREATE_FAILED',
      httpStatus: 201,
    });
  });
  it('2xx without id → CREATE_FAILED with the 2xx status', async () => {
    expect(
      await client(mockFetch(json(201, { name: 'x' })).fetch).createFromTemplate('tpl-1', body),
    ).toEqual({ ok: false, error: 'CREATE_FAILED', httpStatus: 201 });
  });
});

describe('client HomeBox — no template write', () => {
  it('the client exposes no method writing a template', () => {
    const c = client(mockFetch().fetch);
    const names = Object.keys(c)
      .filter((k) => /template/i.test(k))
      .sort();
    expect(names).toEqual(['createFromTemplate', 'getTemplate', 'listTemplates']);
  });
});
