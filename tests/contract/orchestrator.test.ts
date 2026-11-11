import { buildNotes } from '@/background/import/orchestrator';
import { findDuplicates } from '@/background/import/duplicates';
import { ok } from '@/shared/errors';
import { setTestLanguage } from '../unit/i18n-harness';
import { findDuplicatesByName } from '@/background/import/duplicates';
import { JPEG, draft, draftPhoto, err, invoice, PDF, photoOk, sessionKeys, setup } from './orchestrator-harness';

// The HomeBox note is resolved by `getMessage` (service worker): the real catalog is the source.
vi.mock('@/platform/i18n', async () => {
  const { loadCatalog, makeGetMessage, testLanguage } = await import('../unit/i18n-harness');
  return {
    getMessage: (key: string, subs?: string | string[]) => makeGetMessage(loadCatalog(testLanguage()))(key, subs),
    getUILanguage: () => testLanguage(),
  };
});

describe('orchestrateur — chemin nominal', () => {
  it('creates, updates then attaches the invoice, and purges the state', async () => {
    const { client, orchestrator, notified } = setup();
    const r = await orchestrator.startImport(7, [draft()], []);

    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(r.ok && r.value[0]?.entityId).toBe('e1');
    expect(client.createEntity).toHaveBeenCalledWith({
      name: 'Clavier sans fil Exemple Pro',
      description: 'Acheté sur Amazon.fr le 22/10/2026',
      quantity: 1,
    });
    expect(client.updateEntity).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        id: 'e1',
        purchasePrice: 99.99,
        purchaseDate: '2026-10-22',
        purchaseFrom: 'Amazon.fr',
        notes: 'Commande Amazon.fr : 999-0000000-0000001\nhttps://www.amazon.fr/your-orders/order-details',
      }),
    );
    expect(client.addAttachment).toHaveBeenCalledWith('e1', {
      bytes: PDF,
      filename: 'facture-amazon-999-0000000-0000001.pdf',
      type: 'receipt',
      mimeType: 'application/pdf',
    });
    expect(notified.at(-1)).toBe('success');
    expect(await sessionKeys()).toEqual([]);
  });

  it('two products → two objects with the same invoice, downloaded only once', async () => {
    const { client, orchestrator, downloadDetected } = setup();
    const r = await orchestrator.startImport(7, [draft(), draft({ name: 'Câble USB-C' })], []);
    expect(r.ok && r.value.map((p) => p.entityId)).toEqual(['e1', 'e2']);
    expect(client.addAttachment).toHaveBeenCalledTimes(2);
    expect(downloadDetected).toHaveBeenCalledTimes(1);
    expect(downloadDetected).toHaveBeenCalledWith(7, invoice.url);
  });

  it('UNAUTHORIZED on creation → failed, no object, state kept for retry', async () => {
    const { client, orchestrator } = setup({ create: [err('UNAUTHORIZED', 401)] });
    const r = await orchestrator.startImport(7, [draft()], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'failed', entityId: null, error: 'UNAUTHORIZED' });
    expect(client.updateEntity).not.toHaveBeenCalled();
    expect(client.addAttachment).not.toHaveBeenCalled();
    expect(await sessionKeys()).toEqual(['pendingImport:7:p1']);
  });

  it('rejects a draft without a name (FR-013)', async () => {
    const { client, orchestrator } = setup();
    expect(await orchestrator.startImport(7, [draft({ name: '  ' })], [])).toMatchObject({ ok: false });
    expect(client.createEntity).not.toHaveBeenCalled();
  });

  it('download refused → partial with DOWNLOAD_REFUSED, object kept', async () => {
    const { orchestrator } = setup({}, () => err('DOWNLOAD_REFUSED'));
    const r = await orchestrator.startImport(7, [draft()], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'partial', entityId: 'e1', error: 'DOWNLOAD_REFUSED' });
  });

  it('buildNotes without an order number → no notes', () => {
    expect(buildNotes(draft({ orderNumber: null }))).toBeUndefined();
  });
});

describe('note HomeBox traduisible (summary.orderNote)', () => {
  it('buildNotes writes "Commande Amazon.fr : <no.>" then the page address', () => {
    expect(buildNotes(draft())).toBe(
      'Commande Amazon.fr : 999-0000000-0000001\nhttps://www.amazon.fr/your-orders/order-details',
    );
  });

  it('duplicate detection searches for the number alone, whatever the note label', async () => {
    // Existing object created with another label (another language or version): only the number counts.
    const existing = { id: 'old', name: 'Clavier sans fil Exemple Pro', notes: 'Amazon order: 999-0000000-0000001' };
    const searchEntities = vi.fn(() => Promise.resolve(ok([existing])));
    const r = await findDuplicates(
      { baseUrl: 'https://homebox.example.com', searchEntities } as never,
      '999-0000000-0000001',
      'clavier sans fil exemple pro',
    );
    expect(searchEntities).toHaveBeenCalledWith('"999-0000000-0000001"');
    expect(r.ok && r.value.map((m) => m.id)).toEqual(['old']);
  });
});

describe('HomeBox note in English: duplicate detection and resume independent of the language', () => {
  const NUMBER = '999-0000000-0000001';

  it('buildNotes writes "Amazon.fr order: <no.>" then the page address', () => {
    setTestLanguage('en');
    expect(buildNotes(draft())).toBe(`Amazon.fr order: ${NUMBER}\nhttps://www.amazon.fr/your-orders/order-details`);
  });

  it('an object imported in French is recognized on re-import in English (number alone)', async () => {
    // Object created with the French note; the re-import is done in English.
    setTestLanguage('fr');
    const frenchNote = buildNotes(draft())!;
    expect(frenchNote).toContain(NUMBER);
    setTestLanguage('en');
    expect(buildNotes(draft())!).toContain(NUMBER);
    const existing = { id: 'old', name: 'Clavier sans fil Exemple Pro', notes: frenchNote };
    const searchEntities = vi.fn(() => Promise.resolve(ok([existing])));
    const r = await findDuplicates(
      { baseUrl: 'https://homebox.example.com', searchEntities } as never,
      NUMBER,
      'Clavier sans fil Exemple Pro',
    );
    // The query contains only the number: no language label.
    expect(searchEntities).toHaveBeenCalledWith(`"${NUMBER}"`);
    expect(r.ok && r.value.map((m) => m.id)).toEqual(['old']);
  });

  it('the resume searches by name: same query in French and in English', async () => {
    const queries: string[] = [];
    for (const lang of ['fr', 'en'] as const) {
      setTestLanguage(lang);
      const searchEntities = vi.fn(() => Promise.resolve(ok([])));
      await findDuplicatesByName({ baseUrl: 'https://homebox.example.com', searchEntities } as never, 'Clavier');
      queries.push(String(searchEntities.mock.calls[0]));
    }
    expect(queries).toEqual(['"Clavier"', '"Clavier"']);
  });
});

describe('orchestrator — product photo (US1)', () => {
  it('order create → update → attachment → photo, photo as the primary attachment', async () => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'success', error: null, photoError: null });
    const order = [
      client.createEntity.mock.invocationCallOrder[0],
      client.updateEntity.mock.invocationCallOrder[0],
      client.addAttachment.mock.invocationCallOrder[0],
      client.addAttachment.mock.invocationCallOrder[1],
    ];
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
    expect(client.addAttachment).toHaveBeenNthCalledWith(1, 'e1', expect.objectContaining({ type: 'receipt' }));
    expect(client.addAttachment).toHaveBeenNthCalledWith(2, 'e1', {
      bytes: JPEG,
      filename: 'photo-produit.jpg',
      type: 'photo',
      primary: true,
      mimeType: 'image/jpeg',
    });
    expect(await sessionKeys()).toEqual([]);
  });

  it('the MIME type and name sent come from the signature (PNG)', async () => {
    const png = { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), mimeType: 'image/png', filename: 'photo-produit.png' };
    const { client, orchestrator } = setup({}, undefined, () => ({ ok: true, value: png }));
    await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    expect(client.addAttachment).toHaveBeenLastCalledWith(
      'e1',
      expect.objectContaining({ type: 'photo', mimeType: 'image/png', filename: 'photo-produit.png', primary: true }),
    );
  });

  it('PhotoStep initial : null → unavailable, include false → not_requested, include true → pending', async () => {
    const { orchestrator } = setup();
    const { pendingStore } = await import('@/background/import/pending-store');
    // Value of steps.photo at the first persistence (the object is then modified in place).
    let first: string[] = [];
    const real = pendingStore.save.bind(pendingStore);
    const spy = vi.spyOn(pendingStore, 'save').mockImplementation((p) => {
      first.push(p.steps.photo);
      return real(p);
    });
    const initial = async (d: ReturnType<typeof draft>) => {
      first = [];
      await orchestrator.startImport(7, [d], []);
      return first[0];
    };
    expect({
      none: await initial(draft({ name: 'a', photo: null })),
      off: await initial(draft({ name: 'b', photo: draftPhoto({ include: false }) })),
      on: await initial(draft({ name: 'c', photo: draftPhoto() })),
    }).toEqual({ none: 'unavailable', off: 'not_requested', on: 'pending' });
    spy.mockRestore();
  });

  it('not_requested and unavailable do not prevent success (SC-002) and fetch nothing', async () => {
    const { client, orchestrator, fetchPhoto } = setup();
    const r = await orchestrator.startImport(
      7,
      [draft({ photo: draftPhoto({ include: false }) }), draft({ name: 'Sans photo', photo: null })],
      [],
    );
    expect(r.ok && r.value.map((p) => p.status)).toEqual(['success', 'success']);
    expect(r.ok && r.value.map((p) => p.steps.photo)).toEqual(['not_requested', 'unavailable']);
    expect(fetchPhoto).not.toHaveBeenCalled(); // an unchecked photo is not fetched
    expect(client.addAttachment).toHaveBeenCalledTimes(2); // the two invoices only
  });

  it('`sending` is persisted BEFORE the photo POST, with photoAttempted = true', async () => {
    const { client, orchestrator } = setup();
    const { pendingStore } = await import('@/background/import/pending-store');
    let atPost: { photo: string; attempted: boolean } | null = null;
    client.addAttachment.mockImplementation(async (_id: string, file: { type: string }) => {
      if (file.type === 'photo') {
        const [stored] = await pendingStore.listByTab(7);
        atPost = { photo: stored!.steps.photo, attempted: stored!.photoAttempted };
      }
      return ok(undefined);
    });
    await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    expect(atPost).toEqual({ photo: 'sending', attempted: true });
  });

  it('photoAttempted stays false as long as no photo POST could be sent', async () => {
    const { orchestrator } = setup({}, undefined, () => err('PHOTO_UNAVAILABLE'));
    const r = await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    expect(r.ok && r.value[0]).toMatchObject({ photoAttempted: false });
  });

  it.each(['PHOTO_UNAVAILABLE', 'PHOTO_NOT_IMAGE', 'PHOTO_TOO_LARGE'] as const)(
    'fetch failure (%s) → partial, object and invoice kept, no photo POST',
    async (code) => {
      const { client, orchestrator } = setup({}, undefined, () => err(code));
      const r = await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
      expect(r.ok && r.value[0]).toMatchObject({
        status: 'partial',
        entityId: 'e1',
        error: code,
        photoError: code,
        steps: { create: 'done', update: 'done', attachments: { 'detected-0': 'done' }, photo: 'failed' },
      });
      expect(client.addAttachment).toHaveBeenCalledTimes(1); // the invoice only
      expect(await sessionKeys()).toEqual(['pendingImport:7:p1']);
    },
  );

  it('422 on the photo (scenario 7) → PHOTO_UPLOAD_FAILED, a single object', async () => {
    const { client, orchestrator } = setup({ attach: [ok(undefined), err('ATTACHMENT_FAILED', 422)] });
    const r = await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    expect(r.ok && r.value[0]).toMatchObject({
      status: 'partial',
      error: 'PHOTO_UPLOAD_FAILED',
      photoError: 'PHOTO_UPLOAD_FAILED',
      photoAttempted: true,
    });
    expect(r.ok && r.value[0]?.steps.photo).toBe('failed');
    expect(client.createEntity).toHaveBeenCalledTimes(1);
  });

  it('a higher-priority error (invoice) keeps `error`, the photo keeps `photoError`', async () => {
    const { orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED', 500)] }, undefined, () => err('PHOTO_TOO_LARGE'));
    const r = await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'partial', error: 'ATTACHMENT_FAILED', photoError: 'PHOTO_TOO_LARGE' });
  });

  it('a failed photo does not prevent the invoice from being sent (the photo comes last)', async () => {
    const { client, orchestrator } = setup({}, undefined, () => err('PHOTO_UNAVAILABLE'));
    await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    expect(client.addAttachment).toHaveBeenCalledWith('e1', expect.objectContaining({ type: 'receipt' }));
  });

  it('two products with the same photo → a single download, two POSTs (scenario 10)', async () => {
    const { client, orchestrator, fetchPhoto } = setup();
    const r = await orchestrator.startImport(
      7,
      [draft({ photo: draftPhoto() }), draft({ name: 'Câble USB-C', photo: draftPhoto() })],
      [],
    );
    expect(r.ok && r.value.map((p) => p.status)).toEqual(['success', 'success']);
    expect(fetchPhoto).toHaveBeenCalledTimes(1);
    const photos = client.addAttachment.mock.calls.filter(([, f]) => f.type === 'photo');
    expect(photos.map(([id]) => id)).toEqual(['e1', 'e2']);
  });

  it('a shared fetch failure is also cached (a single request)', async () => {
    const { orchestrator, fetchPhoto } = setup({}, undefined, () => err('PHOTO_UNAVAILABLE'));
    await orchestrator.startImport(7, [draft({ photo: draftPhoto() }), draft({ name: 'b', photo: draftPhoto() })], []);
    expect(fetchPhoto).toHaveBeenCalledTimes(1);
  });

  it('the photo bytes never appear in the persisted state', async () => {
    const { orchestrator } = setup({ attach: [ok(undefined), err('ATTACHMENT_FAILED', 500)] });
    await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    const stored = JSON.stringify(await (await import('wxt/testing/fake-browser')).fakeBrowser.storage.session.get(null));
    expect(stored).not.toContain(Array.from(photoOk.bytes).join(','));
    expect(stored).not.toContain('"bytes"');
  });
});

const GARAGE = { id: 'loc-garage', path: ['Maison', 'Garage'] };
const CAVE = { id: 'loc-cave', path: ['Maison', 'Cave'] };
const tree = (...ids: string[]) =>
  ok(ids.map((id) => ({ id, name: `Nom ${id}`, type: 'location', children: [] })));

describe('orchestrateur — emplacement (US2)', () => {
  it('chosen location → parentId in the POST, never locationId (FR-016)', async () => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(7, [draft({ location: GARAGE })], [], null);
    expect(client.createEntity).toHaveBeenCalledWith({
      name: 'Clavier sans fil Exemple Pro',
      description: 'Acheté sur Amazon.fr le 22/10/2026',
      quantity: 1,
      parentId: 'loc-garage',
    });
    expect(client.createEntity.mock.calls[0]?.[0]).not.toHaveProperty('locationId');
  });

  it('no location → POST body without parentId or locationId, same keys as before (FR-012, SC-006)', async () => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(7, [draft({ location: null })], []);
    expect(Object.keys(client.createEntity.mock.calls[0]?.[0] ?? {})).toEqual(['name', 'description', 'quantity']);
  });

  it('persisted draft without location field (old version) → treated as no location', async () => {
    const { client, orchestrator } = setup();
    const legacy = draft();
    delete (legacy as Partial<typeof legacy>).location;
    await orchestrator.startImport(7, [legacy], []);
    expect(Object.keys(client.createEntity.mock.calls[0]?.[0] ?? {})).toEqual(['name', 'description', 'quantity']);
  });

  it("the PUT sends parentId: the created object's first (V3: a PUT without parentId loses the location)", async () => {
    const { client, orchestrator } = setup({
      create: [ok({ id: 'e1', name: 'x', parent: { id: 'loc-garage' } } as never)],
    });
    await orchestrator.startImport(7, [draft({ location: GARAGE })], []);
    expect(client.updateEntity).toHaveBeenCalledWith('e1', expect.objectContaining({ parentId: 'loc-garage' }));
  });

  it('the PUT sends parentId = draft.location.id when the POST response does not carry the parent', async () => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(7, [draft({ location: GARAGE })], []);
    expect(client.updateEntity).toHaveBeenCalledWith('e1', expect.objectContaining({ parentId: 'loc-garage' }));
  });

  it('with no chosen location, the PUT has no parentId (001 behavior unchanged)', async () => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(7, [draft()], []);
    expect(client.updateEntity.mock.calls[0]?.[1]).not.toHaveProperty('parentId');
  });

  it('PUT resume: parentId taken from the re-read object, otherwise from the persisted draft', async () => {
    const { client, orchestrator } = setup({ update: [err('UPDATE_FAILED', 400)] });
    const first = await orchestrator.startImport(7, [draft({ location: GARAGE })], []);
    const id = first.ok ? first.value[0]!.id : '';
    await orchestrator.retryImport(id);
    expect(client.getEntity).toHaveBeenCalledWith('e1');
    expect(client.updateEntity).toHaveBeenLastCalledWith('e1', expect.objectContaining({ parentId: 'loc-garage' }));
  });

  it('different locations per product (FR-014, FR-016)', async () => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(
      7,
      [draft({ location: GARAGE }), draft({ name: 'Câble', location: CAVE }), draft({ name: 'Souris', location: null })],
      [],
      'loc-garage',
    );
    const bodies = client.createEntity.mock.calls.map(([d]) => d as Record<string, unknown>);
    expect(bodies.map((b) => b.parentId)).toEqual(['loc-garage', 'loc-cave', undefined]);
    expect(bodies[2]).not.toHaveProperty('parentId');
  });

  describe('location disappeared (scenario 18, FR-018)', () => {
    it('POST failure + identifier absent from the re-read tree → LOCATION_NOT_FOUND, no object', async () => {
      const { client, orchestrator } = setup({ create: [err('CREATE_FAILED', 404)], tree: [tree('autre')] });
      const r = await orchestrator.startImport(7, [draft({ location: GARAGE })], [], 'loc-garage');
      expect(r.ok && r.value[0]).toMatchObject({
        status: 'failed',
        entityId: null,
        error: 'LOCATION_NOT_FOUND',
      });
      expect(r.ok && r.value[0]).not.toHaveProperty('createUncertain');
      expect(client.listLocations).toHaveBeenCalledTimes(1);
      expect(client.updateEntity).not.toHaveBeenCalled();
      expect(client.addAttachment).not.toHaveBeenCalled();
      expect(r.ok && r.value[0]?.createAttempted).toBe(false);
    });

    it('identifier present in the re-read tree → CREATE_FAILED', async () => {
      const { orchestrator } = setup({ create: [err('CREATE_FAILED', 500)], tree: [tree('loc-garage')] });
      const r = await orchestrator.startImport(7, [draft({ location: GARAGE })], []);
      expect(r.ok && r.value[0]).toMatchObject({ status: 'failed', error: 'CREATE_FAILED' });
    });

    it('tree re-read failed → CREATE_FAILED (no guessing)', async () => {
      const { orchestrator } = setup({ create: [err('CREATE_FAILED', 500)], tree: [err('LOCATIONS_UNAVAILABLE', 500)] });
      const r = await orchestrator.startImport(7, [draft({ location: GARAGE })], []);
      expect(r.ok && r.value[0]).toMatchObject({ status: 'failed', error: 'CREATE_FAILED' });
    });

    it('401 on creation: UNAUTHORIZED, no tree re-read', async () => {
      const { client, orchestrator } = setup({ create: [err('UNAUTHORIZED', 401)] });
      const r = await orchestrator.startImport(7, [draft({ location: GARAGE })], []);
      expect(r.ok && r.value[0]).toMatchObject({ error: 'UNAUTHORIZED' });
      expect(client.listLocations).not.toHaveBeenCalled();
    });

    it('lost response (HOMEBOX_UNREACHABLE): uncertain creation kept, no re-read', async () => {
      const { client, orchestrator } = setup({ create: [err('HOMEBOX_UNREACHABLE')] });
      const r = await orchestrator.startImport(7, [draft({ location: GARAGE })], []);
      expect(r.ok && r.value[0]).toMatchObject({ error: 'HOMEBOX_UNREACHABLE', createUncertain: true });
      expect(client.listLocations).not.toHaveBeenCalled();
    });

    it('with no chosen location, a POST failure does not re-read the tree', async () => {
      const { client, orchestrator } = setup({ create: [err('CREATE_FAILED', 500)] });
      const r = await orchestrator.startImport(7, [draft()], []);
      expect(r.ok && r.value[0]).toMatchObject({ error: 'CREATE_FAILED' });
      expect(client.listLocations).not.toHaveBeenCalled();
    });

    it("in a batch, one product's failure does not prevent the others", async () => {
      const { orchestrator } = setup({ create: [err('CREATE_FAILED', 404)], tree: [tree('autre')] });
      const r = await orchestrator.startImport(7, [draft({ location: GARAGE }), draft({ name: 'B', location: CAVE })], []);
      expect(r.ok && r.value.map((p) => p.error)).toEqual(['LOCATION_NOT_FOUND', null]);
    });
  });
});

describe('orchestrator — last-location memory (US3)', () => {
  it('written with orderLocationId once the object is created', async () => {
    const { orchestrator, rememberLocation } = setup();
    await orchestrator.startImport(7, [draft({ location: GARAGE })], [], 'loc-garage');
    expect(rememberLocation).toHaveBeenCalledTimes(1);
    expect(rememberLocation).toHaveBeenCalledWith('loc-garage');
  });

  it('not written before creation: the call comes after the POST', async () => {
    const { client, orchestrator, rememberLocation } = setup();
    const order: string[] = [];
    client.createEntity.mockImplementation(async () => {
      order.push('create');
      return ok({ id: 'e1', name: 'x' });
    });
    rememberLocation.mockImplementation(async () => {
      order.push('remember');
    });
    await orchestrator.startImport(7, [draft({ location: GARAGE })], [], 'loc-garage');
    expect(order).toEqual(['create', 'remember']);
  });

  it('not written if no creation succeeded', async () => {
    const { orchestrator, rememberLocation } = setup({ create: [err('CREATE_FAILED', 500)] });
    await orchestrator.startImport(7, [draft({ location: GARAGE })], [], 'loc-garage');
    expect(rememberLocation).not.toHaveBeenCalled();
  });

  it('written if at least one object of the batch is created', async () => {
    const { orchestrator, rememberLocation } = setup({ create: [err('CREATE_FAILED', 500)] });
    await orchestrator.startImport(7, [draft({ location: GARAGE }), draft({ name: 'B', location: GARAGE })], [], 'loc-garage');
    expect(rememberLocation).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined])('orderLocationId = %s (import without location) → memory unchanged (R10)', async (orderLocationId) => {
    const { orchestrator, rememberLocation } = setup();
    await orchestrator.startImport(7, [draft()], [], orderLocationId);
    expect(rememberLocation).not.toHaveBeenCalled();
  });

  it('a change on a single product does not change the memory: only orderLocationId counts', async () => {
    const { orchestrator, rememberLocation } = setup();
    await orchestrator.startImport(7, [draft({ location: CAVE })], [], 'loc-garage');
    expect(rememberLocation).toHaveBeenCalledWith('loc-garage');
  });

  it('a memory write error does not interrupt the import', async () => {
    const { orchestrator, rememberLocation } = setup();
    rememberLocation.mockRejectedValue(new Error('quota'));
    const r = await orchestrator.startImport(7, [draft({ location: GARAGE })], [], 'loc-garage');
    expect(r.ok && r.value[0]?.status).toBe('success');
  });
});

describe('HomeBox note: store of origin found from draft.pageUrl (006, FR-007)', () => {
  const NUMBER = '999-0000000-0000001';
  const DE = 'https://www.amazon.de/your-orders/order-details';

  it('Amazon.de: "Commande Amazon.de : <no.>" / "Amazon.de order: <no.>"', () => {
    expect(buildNotes(draft({ pageUrl: DE }))).toBe(`Commande Amazon.de : ${NUMBER}\n${DE}`);
    setTestLanguage('en');
    expect(buildNotes(draft({ pageUrl: DE }))).toBe(`Amazon.de order: ${NUMBER}\n${DE}`);
  });

  it.each([
    ['https://www.amazon.co.uk/your-orders/order-details', 'Amazon.co.uk'],
    ['https://www.amazon.com/your-orders/order-details', 'Amazon.com'],
    ['https://www.amazon.com.be/your-orders/order-details', 'Amazon.com.be'],
  ])('%s → %s', (pageUrl, name) => {
    setTestLanguage('en');
    expect(buildNotes(draft({ pageUrl }))).toBe(`${name} order: ${NUMBER}\n${pageUrl}`);
  });

  it('manual entry (no page): "Commande : <no.>" / "Order: <no.>", no store claimed', () => {
    expect(buildNotes(draft({ pageUrl: null }))).toBe(`Commande : ${NUMBER}`);
    setTestLanguage('en');
    expect(buildNotes(draft({ pageUrl: null }))).toBe(`Order: ${NUMBER}`);
  });

  it('page of an unknown store or lookalike origin: summary.orderNoteNoStore', () => {
    setTestLanguage('en');
    for (const pageUrl of ['https://www.amazon.ca/x', 'https://www.amazon.de.evil.example/x', 'http://www.amazon.de/x']) {
      expect(buildNotes(draft({ pageUrl }))).toBe(`Order: ${NUMBER}\n${pageUrl}`);
    }
  });

  it('import from Amazon.de: same HomeBox sequence, note with the store of origin', async () => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(7, [draft({ pageUrl: DE, purchaseFrom: 'Amazon.de', documents: [] })], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(client.createEntity).toHaveBeenCalledTimes(1);
    expect(client.updateEntity).toHaveBeenCalledTimes(1);
    const update = client.updateEntity.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(update.notes).toBe(`Commande Amazon.de : ${NUMBER}\n${DE}`);
    expect(update.purchaseFrom).toBe('Amazon.de');
  });
});

describe('foreign currency: amount sent as is, no conversion (006, US2-3, FR-006)', () => {
  it.each([
    ['https://www.amazon.co.uk/your-orders/order-details', 'GBP', 1299.99],
    ['https://www.amazon.com/your-orders/order-details', 'USD', 1234.5],
  ])('%s: price typed by hand (%s %d) sent unchanged, no request outside HomeBox', async (pageUrl, currency, amount) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(7, [draft({ pageUrl, currency, purchasePrice: amount, documents: [] })], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    const update = client.updateEntity.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(update.purchasePrice).toBe(amount);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
