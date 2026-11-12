import { createHomeBoxClient, entityOutToUpdate, itemUrl } from '@/background/homebox/client';
import { html, json, mockFetch, networkError } from './fetch-mock';

const BASE = 'https://homebox.example.com';
const client = (f: typeof fetch) => createHomeBoxClient({ baseUrl: BASE, apiKey: 'hb_x', fetchImpl: f });

describe('client HomeBox — import', () => {
  it('createEntity 201 → EntityOut with id', async () => {
    const m = mockFetch(json(201, { id: 'e1', name: 'Clavier' }));
    const r = await client(m.fetch).createEntity({ name: 'Clavier', description: 'd', quantity: 1 });
    expect(r).toEqual({ ok: true, value: { id: 'e1', name: 'Clavier' } });
    expect(m.calls[0]?.method).toBe('POST');
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/entities`);
    expect(JSON.parse(String(m.calls[0]?.body))).toEqual({ name: 'Clavier', description: 'd', quantity: 1 });
    expect(m.calls[0]?.headers.get('Content-Type')).toBe('application/json');
  });

  it('createEntity 500 → CREATE_FAILED', async () => {
    const m = mockFetch(json(500, { error: 'boom' }));
    expect(await client(m.fetch).createEntity({ name: 'x' })).toMatchObject({ ok: false, error: 'CREATE_FAILED' });
  });

  it('createEntity 201 without id → CREATE_FAILED', async () => {
    const m = mockFetch(json(201, {}));
    expect(await client(m.fetch).createEntity({ name: 'x' })).toMatchObject({ ok: false, error: 'CREATE_FAILED' });
  });

  it('createEntity 201 without id or unreadable JSON → CREATE_FAILED with the 2xx status (uncertain creation)', async () => {
    const noId = mockFetch(json(201, {}));
    expect(await client(noId.fetch).createEntity({ name: 'x' })).toMatchObject({ ok: false, error: 'CREATE_FAILED', httpStatus: 201 });
    const bad = mockFetch(() => new Response('pas du json', { status: 200 }));
    expect(await client(bad.fetch).createEntity({ name: 'x' })).toMatchObject({ ok: false, error: 'CREATE_FAILED', httpStatus: 200 });
  });

  it('updateEntity sends a PUT to /entities/{id}', async () => {
    const m = mockFetch(json(200, { id: 'e1', name: 'x' }));
    await client(m.fetch).updateEntity('e1', { id: 'e1', name: 'x', purchasePrice: 9.5 });
    expect(m.calls[0]?.method).toBe('PUT');
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/entities/e1`);
  });

  it('updateEntity 400 → UPDATE_FAILED', async () => {
    const m = mockFetch(json(400, {}));
    expect(await client(m.fetch).updateEntity('e1', { id: 'e1', name: 'x' })).toMatchObject({
      ok: false,
      error: 'UPDATE_FAILED',
    });
  });

  it('addAttachment sends a multipart with file, name and type=receipt', async () => {
    const m = mockFetch(json(201, { id: 'e1' }));
    const bytes = new TextEncoder().encode('%PDF-1.7');
    const r = await client(m.fetch).addAttachment('e1', { bytes, filename: 'facture.pdf', type: 'receipt', mimeType: 'application/pdf' });
    expect(r.ok).toBe(true);
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/entities/e1/attachments`);
    const form = m.calls[0]?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('name')).toBe('facture.pdf');
    expect(form.get('type')).toBe('receipt');
    const file = form.get('file') as File;
    expect(file.type).toBe('application/pdf');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
    // The browser sets the multipart boundary itself.
    expect(m.calls[0]?.headers.has('Content-Type')).toBe(false);
    // SC-006: a PDF never sends `primary`.
    expect(form.has('primary')).toBe(false);
  });

  it("addAttachment photo sends type=photo, primary=true and the image's MIME type", async () => {
    const m = mockFetch(json(201, { id: 'e1' }));
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const r = await client(m.fetch).addAttachment('e1', {
      bytes,
      filename: 'clavier.jpg',
      type: 'photo',
      mimeType: 'image/jpeg',
      primary: true,
    });
    expect(r.ok).toBe(true);
    const form = m.calls[0]?.body as FormData;
    expect(form.get('type')).toBe('photo');
    expect(form.get('primary')).toBe('true');
    expect(form.get('name')).toBe('clavier.jpg');
    const file = form.get('file') as File;
    expect(file.type).toBe('image/jpeg');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  it('addAttachment does not send primary when it is false or absent', async () => {
    const m = mockFetch(json(201, {}), json(201, {}));
    const c = client(m.fetch);
    const base = { bytes: new Uint8Array([1]), filename: 'f.pdf', type: 'attachment' as const, mimeType: 'application/pdf' };
    await c.addAttachment('e1', { ...base, primary: false });
    await c.addAttachment('e1', base);
    for (const call of m.calls) {
      const form = call.body as FormData;
      expect(form.has('primary')).toBe(false);
      expect(form.get('type')).toBe('attachment');
      expect((form.get('file') as File).type).toBe('application/pdf');
    }
  });

  it('addAttachment 422 → ATTACHMENT_FAILED', async () => {
    const m = mockFetch(json(422, { error: 'invalid' }));
    const r = await client(m.fetch).addAttachment('e1', {
      bytes: new Uint8Array([1]),
      filename: 'f.pdf',
      type: 'receipt',
      mimeType: 'application/pdf',
    });
    expect(r).toEqual({ ok: false, error: 'ATTACHMENT_FAILED', httpStatus: 422 });
  });

  it('entityOutToUpdate copies the created object and applies the purchase fields', () => {
    const update = entityOutToUpdate(
      {
        id: 'e1',
        name: 'Clavier',
        description: 'd',
        quantity: 1,
        insured: false,
        entityType: { id: 't1' },
        location: null,
        tags: [],
        serialNumber: '',
      },
      { purchasePrice: 99.99, purchaseDate: '2026-10-22', purchaseFrom: 'Amazon.fr', notes: 'n' },
    );
    expect(update).toEqual({
      id: 'e1',
      name: 'Clavier',
      description: 'd',
      quantity: 1,
      insured: false,
      entityTypeId: 't1',
      tagIds: [],
      purchasePrice: 99.99,
      purchaseDate: '2026-10-22',
      purchaseFrom: 'Amazon.fr',
      notes: 'n',
    });
  });

  it('entityOutToUpdate does not pin an inherited location (resolved location, no locationId)', () => {
    const update = entityOutToUpdate(
      { id: 'e1', name: 'Clavier', location: { id: 'loc-herite' }, parent: null },
      {},
    );
    expect(update).not.toHaveProperty('locationId');
    expect(update).not.toHaveProperty('parentId');
  });

  it("entityOutToUpdate keeps the entity's own locationId and parentId", () => {
    const update = entityOutToUpdate(
      { id: 'e1', name: 'Clavier', locationId: 'loc-propre', location: { id: 'loc-propre' }, parent: { id: 'p1' } },
      {},
    );
    expect(update).toMatchObject({ locationId: 'loc-propre', parentId: 'p1' });
  });

  it('itemUrl points to the HomeBox item page', () => {
    expect(itemUrl(BASE, 'e1')).toBe(`${BASE}/item/e1`);
  });
});

describe('client HomeBox — recherche (US5)', () => {
  it('searchEntities encodes q and limits pageSize to 20', async () => {
    const m = mockFetch(json(200, { items: [{ id: 'a', name: 'x' }], page: 1, pageSize: 20, total: 1 }));
    const r = await client(m.fetch).searchEntities('"999-0000000-0000001"');
    expect(r).toEqual({ ok: true, value: [{ id: 'a', name: 'x' }] });
    const url = new URL(m.calls[0]!.url);
    expect(url.pathname).toBe('/api/v1/entities');
    expect(url.searchParams.get('q')).toBe('"999-0000000-0000001"');
    expect(url.searchParams.get('pageSize')).toBe('20');
  });

  it('searchEntities 500 → DUPLICATE_CHECK_FAILED', async () => {
    const m = mockFetch(json(500, {}));
    expect(await client(m.fetch).searchEntities('x')).toMatchObject({ ok: false, error: 'DUPLICATE_CHECK_FAILED' });
  });
});

describe('client HomeBox — emplacements (US2)', () => {
  const TREE = [{ id: 'l1', name: 'Maison', type: 'location', children: [] }];

  it('listLocations: GET /entities/tree without parameters, with the token', async () => {
    const m = mockFetch(json(200, TREE));
    const r = await client(m.fetch).listLocations();
    expect(r).toEqual({ ok: true, value: TREE });
    expect(m.calls[0]?.method).toBe('GET');
    expect(m.calls[0]?.url).toBe(`${BASE}/api/v1/entities/tree`);
    expect(m.calls[0]?.headers.get('Authorization')).toBe('Bearer hb_x');
  });

  it('listLocations: network error → HOMEBOX_UNREACHABLE', async () => {
    const m = mockFetch(networkError());
    expect(await client(m.fetch).listLocations()).toMatchObject({ ok: false, error: 'HOMEBOX_UNREACHABLE' });
  });

  it.each([401, 403])('listLocations : %i → UNAUTHORIZED', async (status) => {
    const m = mockFetch(json(status, {}));
    expect(await client(m.fetch).listLocations()).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('listLocations: other status → LOCATIONS_UNAVAILABLE', async () => {
    const m = mockFetch(json(500, {}));
    expect(await client(m.fetch).listLocations()).toMatchObject({ ok: false, error: 'LOCATIONS_UNAVAILABLE' });
  });

  it('listLocations : JSON illisible → LOCATIONS_UNAVAILABLE', async () => {
    const m = mockFetch(html(200, '<html>pas du json</html>'));
    expect(await client(m.fetch).listLocations()).toMatchObject({ ok: false, error: 'LOCATIONS_UNAVAILABLE' });
  });

  it('listLocations: non-array response → LOCATIONS_UNAVAILABLE', async () => {
    const m = mockFetch(json(200, { items: [] }));
    expect(await client(m.fetch).listLocations()).toMatchObject({ ok: false, error: 'LOCATIONS_UNAVAILABLE' });
  });

  it('listLocations: no location name logged (success, failure, abnormal response)', async () => {
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    const secret = [{ id: 'l1', name: 'Cave secrète Dupont', type: 'location', children: [] }];
    await client(mockFetch(json(200, secret)).fetch).listLocations();
    await client(mockFetch(json(500, secret)).fetch).listLocations();
    await client(mockFetch(json(200, { name: 'Cave secrète Dupont' })).fetch).listLocations();
    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output.length).toBeGreaterThan(2);
    expect(output).not.toContain('Cave secrète');
    expect(output).toContain('GET /entities/tree');
  });

  it('createEntity with a location: parentId present in the body, never locationId', async () => {
    const m = mockFetch(json(201, { id: 'e1', name: 'Clavier' }));
    await client(m.fetch).createEntity({ name: 'Clavier', quantity: 1, parentId: 'l1' });
    const body = JSON.parse(String(m.calls[0]?.body));
    expect(body).toEqual({ name: 'Clavier', quantity: 1, parentId: 'l1' });
    expect(body).not.toHaveProperty('locationId');
  });

  it('createEntity with no choice: body strictly identical to the existing one (SC-006, scenario 15)', async () => {
    const m = mockFetch(json(201, { id: 'e1', name: 'Clavier' }));
    await client(m.fetch).createEntity({ name: 'Clavier', description: 'd', quantity: 1 });
    expect(String(m.calls[0]?.body)).toBe('{"name":"Clavier","description":"d","quantity":1}');
  });
});

describe('addAttachment: manual and warranty types (007, Q-U4)', () => {
  it.each(['manual', 'warranty'] as const)('type=%s goes in the multipart, application/pdf, no primary', async (type) => {
    const m = mockFetch(json(201, { id: 'e1' }));
    const bytes = new TextEncoder().encode('%PDF-1.4 x');
    const r = await client(m.fetch).addAttachment('e1', { bytes, filename: 'guide.pdf', type, mimeType: 'application/pdf' });
    expect(r.ok).toBe(true);
    const form = m.calls[0]?.body as FormData;
    expect(form.get('type')).toBe(type);
    expect(form.get('name')).toBe('guide.pdf');
    expect((form.get('file') as File).type).toBe('application/pdf');
    expect(form.has('primary')).toBe(false);
  });
});
