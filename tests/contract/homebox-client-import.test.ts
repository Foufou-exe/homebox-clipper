import { createHomeBoxClient, entityOutToUpdate, itemUrl } from '@/background/homebox/client';
import { json, mockFetch } from './fetch-mock';

const BASE = 'https://homebox.example.com';
const client = (f: typeof fetch) => createHomeBoxClient({ baseUrl: BASE, apiKey: 'hb_x', fetchImpl: f });

describe('client HomeBox — import', () => {
  it('createEntity 201 → EntityOut avec id', async () => {
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

  it('createEntity 201 sans id → CREATE_FAILED', async () => {
    const m = mockFetch(json(201, {}));
    expect(await client(m.fetch).createEntity({ name: 'x' })).toMatchObject({ ok: false, error: 'CREATE_FAILED' });
  });

  it('updateEntity envoie un PUT sur /entities/{id}', async () => {
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

  it('addAttachment envoie un multipart avec file, name et type=receipt', async () => {
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
    // Le navigateur fixe lui-même la frontière multipart.
    expect(m.calls[0]?.headers.has('Content-Type')).toBe(false);
    // SC-006 : un PDF n'envoie jamais `primary`.
    expect(form.has('primary')).toBe(false);
  });

  it('addAttachment photo envoie type=photo, primary=true et le type MIME de l’image', async () => {
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

  it('addAttachment n’envoie pas primary quand il est faux ou absent', async () => {
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

  it('entityOutToUpdate recopie l’objet créé et applique les champs d’achat', () => {
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

  it('entityOutToUpdate n’épingle pas un emplacement hérité (location résolu, sans locationId)', () => {
    const update = entityOutToUpdate(
      { id: 'e1', name: 'Clavier', location: { id: 'loc-herite' }, parent: null },
      {},
    );
    expect(update).not.toHaveProperty('locationId');
    expect(update).not.toHaveProperty('parentId');
  });

  it('entityOutToUpdate conserve le locationId et le parentId propres à l’entité', () => {
    const update = entityOutToUpdate(
      { id: 'e1', name: 'Clavier', locationId: 'loc-propre', location: { id: 'loc-propre' }, parent: { id: 'p1' } },
      {},
    );
    expect(update).toMatchObject({ locationId: 'loc-propre', parentId: 'p1' });
  });

  it('itemUrl pointe vers la page objet de HomeBox', () => {
    expect(itemUrl(BASE, 'e1')).toBe(`${BASE}/item/e1`);
  });
});

describe('client HomeBox — recherche (US5)', () => {
  it('searchEntities encode q et limite pageSize à 20', async () => {
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
