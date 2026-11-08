import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { ok } from '@/shared/errors';
import type { DocumentRef } from '@/shared/types';
import { PDF_B64, draft, draftPhoto, err, fakeClient, photoOk, sessionKeys, setup } from './orchestrator-harness';


function pendingBase(over: Partial<ReturnType<typeof draft>> = {}) {
  return {
    id: 'o1',
    tabId: 5,
    pageUrl: null,
    draft: draft(over),
    entityId: null,
    steps: { create: 'pending' as const, update: 'pending' as const, attachments: { 'detected-0': 'pending' as const }, photo: 'unavailable' as const },
    photoError: null,
    photoAttempted: false,
    status: 'failed' as const,
    error: null,
  };
}

describe('orchestrator — resume after partial failure (US4)', () => {
  it('attachment failed → partial; the retry does not recreate the object and succeeds', async () => {
    const { client, orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED', 500)] });
    const first = await orchestrator.startImport(5, [draft()], []);
    const p = first.ok ? first.value[0] : undefined;
    expect(p).toMatchObject({ status: 'partial', entityId: 'e1', error: 'ATTACHMENT_FAILED' });
    expect(p?.steps).toEqual({ create: 'done', update: 'done', attachments: { 'detected-0': 'failed' }, photo: 'unavailable' });

    const retry = await orchestrator.retryImport(p!.id);
    expect(retry.ok && retry.value.status).toBe('success');
    expect(client.createEntity).toHaveBeenCalledTimes(1);
    expect(client.updateEntity).toHaveBeenCalledTimes(1);
    expect(client.addAttachment).toHaveBeenCalledTimes(2);
    expect(await sessionKeys()).toEqual([]);
  });

  it('PUT failed → UPDATE_FAILED; the retry re-reads the object then replays the PUT', async () => {
    const { client, orchestrator } = setup({ update: [err('UPDATE_FAILED', 400)] });
    const first = await orchestrator.startImport(5, [draft()], []);
    const p = first.ok ? first.value[0] : undefined;
    expect(p).toMatchObject({ status: 'partial', error: 'UPDATE_FAILED' });
    expect(p?.steps.attachments['detected-0']).toBe('done');

    const retry = await orchestrator.retryImport(p!.id);
    expect(retry.ok && retry.value.status).toBe('success');
    expect(client.getEntity).toHaveBeenCalledWith('e1');
    expect(client.createEntity).toHaveBeenCalledTimes(1);
    expect(client.addAttachment).toHaveBeenCalledTimes(1);
  });

  it('creation failed → the retry replays everything', async () => {
    const { client, orchestrator } = setup({ create: [err('HOMEBOX_UNREACHABLE')] });
    const first = await orchestrator.startImport(5, [draft()], []);
    const p = first.ok ? first.value[0] : undefined;
    expect(p).toMatchObject({ status: 'failed', entityId: null, error: 'HOMEBOX_UNREACHABLE', createUncertain: true });
    // Lost response = uncertain creation: the resume searches for the name (R8), then creates if nothing is found.
    client.searchEntities.mockResolvedValue(ok([]));
    const retry = await orchestrator.retryImport(p!.id);
    expect(retry.ok && retry.value.status).toBe('success');
    expect(client.searchEntities).toHaveBeenCalledTimes(1);
    expect(client.createEntity).toHaveBeenCalledTimes(2);
  });

  it('abandonImport purges the state', async () => {
    const { orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED')] });
    const first = await orchestrator.startImport(5, [draft()], []);
    const p = first.ok ? first.value[0] : undefined;
    expect(await sessionKeys()).toHaveLength(1);
    await orchestrator.abandonImport(p!.id);
    expect(await sessionKeys()).toEqual([]);
  });

  it('a manual file must be reselected to retry (bytes never kept)', async () => {
    const manual: DocumentRef = { id: 'manual-1', origin: 'manual', kind: 'invoice', label: 'f.pdf' };
    const { orchestrator, client } = setup({ attach: [err('ATTACHMENT_FAILED')] });
    const first = await orchestrator.startImport(5, [draft({ documents: [manual] })], [
      { docId: 'manual-1', filename: 'f.pdf', base64: PDF_B64 },
    ]);
    const p = first.ok ? first.value[0] : undefined;
    expect(JSON.stringify(await fakeBrowser.storage.session.get(null))).not.toContain(PDF_B64);

    expect(await orchestrator.retryImport(p!.id)).toEqual({ ok: false, error: 'MANUAL_FILE_REQUIRED' });
    const retry = await orchestrator.retryImport(p!.id, [{ docId: 'manual-1', filename: 'f.pdf', base64: PDF_B64 }]);
    expect(retry.ok && retry.value.status).toBe('success');
    expect(client.createEntity).toHaveBeenCalledTimes(1);
  });

  it("the state survives a service worker restart (new instance)", async () => {
    const { orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED')] });
    const first = await orchestrator.startImport(5, [draft()], []);
    const id = first.ok ? first.value[0]!.id : '';

    // New instance, new client: only storage.session remains.
    const client2 = fakeClient({});
    const restarted = createOrchestrator({
      client: client2 as unknown as HomeBoxClient,
      store: pendingStore,
      downloadDetected: async () => ok({ base64: PDF_B64 }),
      fetchPhoto: async () => ok(photoOk),
      notify: () => undefined,
      newId: () => 'unused',
    });
    expect(await pendingStore.listByTab(5)).toHaveLength(1);
    const retry = await restarted.retryImport(id);
    expect(retry.ok && retry.value.status).toBe('success');
    expect(client2.createEntity).not.toHaveBeenCalled();
    expect(client2.addAttachment).toHaveBeenCalledWith('e1', expect.objectContaining({ type: 'receipt' }));
  });

  describe('uncertain creation (R8): exact-name search, without depending on the order number', () => {
    /**
     * Mocked HomeBox as close as possible to the facts tested on 0.27: the POST keeps neither `notes` nor the order number;
     * `q` searches the name and description of what was actually sent.
     */
    function homebox(ctx: ReturnType<typeof setup>, opts: { lose?: boolean } = {}) {
      const stored: { id: string; name: string; description?: string }[] = [];
      ctx.client.createEntity.mockImplementation(async (data?: { name: string; description?: string }) => {
        const e = { id: `h${stored.length + 1}`, name: data?.name ?? '', description: data?.description };
        stored.push(e);
        return opts.lose ? err('HOMEBOX_UNREACHABLE') : ok({ id: e.id, name: e.name });
      });
      ctx.client.searchEntities.mockImplementation(async (q: string) => {
        const needle = q.replace(/"/g, '').toLowerCase();
        return ok(
          stored
            .filter((e) => `${e.name} ${e.description ?? ''}`.toLowerCase().includes(needle))
            .map((e) => ({ id: e.id, name: e.name })),
        );
      });
      return stored;
    }

    it('lost POST response (HOMEBOX_UNREACHABLE) → createUncertain; the resume finds the object by its name, no 2nd POST', async () => {
      const ctx = setup();
      const stored = homebox(ctx, { lose: true });
      const first = await ctx.orchestrator.startImport(5, [draft()], []);
      const p = first.ok ? first.value[0]! : undefined;
      expect(p).toMatchObject({ status: 'failed', error: 'HOMEBOX_UNREACHABLE', entityId: null, createUncertain: true });
      expect(stored).toHaveLength(1);

      const r = await ctx.orchestrator.retryImport(p!.id);
      expect(r).toEqual({ ok: false, error: 'DUPLICATE_SUSPECTED' });
      expect(ctx.client.searchEntities).toHaveBeenCalledWith('"Clavier sans fil Exemple Pro"');
      expect(ctx.client.createEntity).toHaveBeenCalledTimes(1);
    });

    it('orphan whose POST has started (createAttempted) → same search, same refusal', async () => {
      const ctx = setup();
      const stored = homebox(ctx);
      stored.push({ id: 'h0', name: 'Clavier sans fil Exemple Pro', description: 'Acheté sur Amazon.fr le 22/10/2026' });
      await pendingStore.save({ ...pendingBase(), orphaned: true, createAttempted: true });
      const r = await ctx.orchestrator.retryImport('o1');
      expect(r).toEqual({ ok: false, error: 'DUPLICATE_SUSPECTED' });
      expect(ctx.client.createEntity).not.toHaveBeenCalled();
    });

    it('the POST starts with createAttempted already written to storage (early write)', async () => {
      const ctx = setup();
      let seen: boolean | undefined;
      ctx.client.createEntity.mockImplementation(async () => {
        seen = (await pendingStore.get('p1'))?.createAttempted;
        return ok({ id: 'e1', name: 'x' });
      });
      await ctx.orchestrator.startImport(5, [draft()], []);
      expect(seen).toBe(true);
    });

    it('no object with this name → the resume creates the object; the search runs before the POST and the marker is removed', async () => {
      const ctx = setup();
      homebox(ctx);
      await pendingStore.save({ ...pendingBase(), createUncertain: true });
      const r = await ctx.orchestrator.retryImport('o1');
      expect(r.ok && r.value.status).toBe('success');
      expect(r.ok && r.value.createUncertain).toBeUndefined();
      expect(ctx.client.searchEntities.mock.invocationCallOrder[0]).toBeLessThan(
        ctx.client.createEntity.mock.invocationCallOrder[0]!,
      );
    });

    it('an object with a similar name (different exact name) does not block the resume', async () => {
      const ctx = setup();
      const stored = homebox(ctx);
      stored.push({ id: 'h0', name: 'Clavier sans fil Exemple Pro Max' });
      await pendingStore.save({ ...pendingBase(), createUncertain: true });
      const r = await ctx.orchestrator.retryImport('o1');
      expect(r.ok && r.value.status).toBe('success');
    });

    it('without an order number, the name search still happens', async () => {
      const ctx = setup();
      const stored = homebox(ctx);
      stored.push({ id: 'h0', name: 'Clavier sans fil Exemple Pro' });
      await pendingStore.save({ ...pendingBase({ orderNumber: null }), createUncertain: true });
      expect(await ctx.orchestrator.retryImport('o1')).toEqual({ ok: false, error: 'DUPLICATE_SUSPECTED' });
    });

    it('search failed → resume refused (DUPLICATE_CHECK_FAILED), no POST, state kept', async () => {
      const ctx = setup();
      ctx.client.searchEntities.mockResolvedValue(err('DUPLICATE_CHECK_FAILED'));
      await pendingStore.save({ ...pendingBase(), createUncertain: true });
      expect(await ctx.orchestrator.retryImport('o1')).toEqual({ ok: false, error: 'DUPLICATE_CHECK_FAILED' });
      expect(ctx.client.createEntity).not.toHaveBeenCalled();
      expect((await pendingStore.get('o1'))?.createUncertain).toBe(true);
    });

    it('unreadable 2xx response or one without id (CREATE_FAILED, 201) → uncertain creation: name search on resume', async () => {
      const { client, orchestrator } = setup({ create: [err('CREATE_FAILED', 201)] });
      const first = await orchestrator.startImport(5, [draft()], []);
      const p = first.ok ? first.value[0] : undefined;
      expect(p).toMatchObject({ status: 'failed', entityId: null, createUncertain: true });
      expect(p?.createAttempted).toBe(true);
      client.searchEntities.mockResolvedValue(ok([]));
      const retry = await orchestrator.retryImport(p!.id);
      expect(retry.ok && retry.value.status).toBe('success');
      expect(client.searchEntities).toHaveBeenCalledTimes(1);
    });

    it('explicit HTTP error (CREATE_FAILED) → definite failure: neither createUncertain nor a search on resume', async () => {
      const { client, orchestrator } = setup({ create: [err('CREATE_FAILED', 422)] });
      const first = await orchestrator.startImport(5, [draft()], []);
      const p = first.ok ? first.value[0]! : undefined;
      expect(p).toMatchObject({ status: 'failed', error: 'CREATE_FAILED', entityId: null });
      expect(p?.createUncertain).toBeFalsy();
      const retry = await orchestrator.retryImport(p!.id);
      expect(retry.ok && retry.value.status).toBe('success');
      expect(client.searchEntities).not.toHaveBeenCalled();
    });

    it('orphan whose POST has not started → no search (not uncertain)', async () => {
      const ctx = setup();
      await pendingStore.save({ ...pendingBase(), orphaned: true });
      const r = await ctx.orchestrator.retryImport('o1');
      expect(r.ok && r.value.status).toBe('success');
      expect(ctx.client.searchEntities).not.toHaveBeenCalled();
    });

    it('a first import never searches for a duplicate', async () => {
      const { client, orchestrator } = setup();
      await orchestrator.startImport(5, [draft()], []);
      expect(client.searchEntities).not.toHaveBeenCalled();
    });

    it('the orphaned marker is removed once the resume has started', async () => {
      const ctx = setup({ attach: [err('ATTACHMENT_FAILED')] });
      ctx.client.searchEntities.mockResolvedValue(ok([]));
      await pendingStore.save({ ...pendingBase(), orphaned: true, createAttempted: true });
      const r = await ctx.orchestrator.retryImport('o1');
      expect(r.ok && r.value).toMatchObject({ status: 'partial', entityId: 'e1' });
      expect(r.ok && r.value.orphaned).toBeUndefined();
    });
  });

  describe('batch of several products: everything is persisted before the first POST', () => {
    it('the first POST already sees both imports in storage (the second is running, not uncertain)', async () => {
      const ctx = setup();
      let snapshot: { id: string; status: string; createAttempted?: boolean }[] = [];
      ctx.client.createEntity.mockImplementationOnce(async () => {
        snapshot = await pendingStore.listByTab(5);
        return ok({ id: 'e1', name: 'x' });
      });
      await ctx.orchestrator.startImport(5, [draft({ name: 'A' }), draft({ name: 'B' })], []);
      expect(snapshot.map((s) => s.id).sort()).toEqual(['p1', 'p2']);
      const second = snapshot.find((s) => s.id === 'p2');
      expect(second).toMatchObject({ status: 'running' });
      expect(second?.createAttempted).toBeFalsy();
    });
  });

  describe('photo resume (R8, FR-008)', () => {
    const photoPost = (client: ReturnType<typeof setup>['client']) =>
      client.addAttachment.mock.calls.filter(([, f]) => f.type === 'photo');

    /** Imports with a photo whose POST fails, and returns the identifier of the import to resume. */
    async function failedUpload(ctx = setup({ attach: [ok(undefined), err('ATTACHMENT_FAILED', 500)] })) {
      const first = await ctx.orchestrator.startImport(5, [draft({ photo: draftPhoto() })], []);
      const p = first.ok ? first.value[0]! : undefined;
      expect(p).toMatchObject({ status: 'partial', photoAttempted: true, steps: { photo: 'failed' } });
      return { ...ctx, id: p!.id };
    }

    it('photoAttempted = false → back to pending then send, without re-reading the object', async () => {
      const ctx = setup({}, undefined, undefined);
      ctx.fetchPhoto.mockResolvedValueOnce(err('PHOTO_UNAVAILABLE'));
      const first = await ctx.orchestrator.startImport(5, [draft({ photo: draftPhoto() })], []);
      const id = first.ok ? first.value[0]!.id : '';
      const retry = await ctx.orchestrator.retryImport(id);
      expect(retry.ok && retry.value).toMatchObject({ status: 'success', error: null, photoError: null });
      expect(photoPost(ctx.client)).toHaveLength(1);
      expect(ctx.client.getEntity).not.toHaveBeenCalled();
      expect(ctx.client.createEntity).toHaveBeenCalledTimes(1);
      expect(ctx.client.updateEntity).toHaveBeenCalledTimes(1);
    });

    it('photoAttempted = true and photo already attached (type = photo) → done without sending (scenario 8)', async () => {
      const ctx = await failedUpload(setup({
        attach: [ok(undefined), err('HOMEBOX_UNREACHABLE')],
        get: [ok({ id: 'e1', name: 'x', attachments: [{ id: 'a1', type: 'receipt' }, { id: 'a2', type: 'photo' }] })],
      }));
      const retry = await ctx.orchestrator.retryImport(ctx.id);
      expect(retry.ok && retry.value).toMatchObject({ status: 'success', photoError: null });
      expect(ctx.client.getEntity).toHaveBeenCalledWith('e1');
      expect(photoPost(ctx.client)).toHaveLength(1); // the only POST is the one from the first attempt
    });

    it('the duplicate guard tests type === photo, never primary', async () => {
      const ctx = await failedUpload(setup({
        attach: [ok(undefined), err('ATTACHMENT_FAILED', 500)],
        get: [ok({ id: 'e1', name: 'x', attachments: [{ id: 'a1', type: 'receipt', primary: true }] })],
      }));
      // A `primary` attachment that is not a photo does not count: the photo is sent again.
      const retry = await ctx.orchestrator.retryImport(ctx.id);
      expect(retry.ok && retry.value.status).toBe('success');
      expect(photoPost(ctx.client)).toHaveLength(2);
    });

    it('photoAttempted = true and no photo → back to pending then send', async () => {
      const ctx = await failedUpload(setup({
        attach: [ok(undefined), err('ATTACHMENT_FAILED', 500)],
        get: [ok({ id: 'e1', name: 'x', attachments: [] })],
      }));
      const retry = await ctx.orchestrator.retryImport(ctx.id);
      expect(retry.ok && retry.value).toMatchObject({ status: 'success', error: null, photoError: null });
      expect(photoPost(ctx.client)).toHaveLength(2);
      expect(await sessionKeys()).toEqual([]);
    });

    it('object without attachments field → treated as "no photo"', async () => {
      const ctx = await failedUpload();
      const retry = await ctx.orchestrator.retryImport(ctx.id);
      expect(retry.ok && retry.value.status).toBe('success');
      expect(photoPost(ctx.client)).toHaveLength(2);
    });

    it('re-read impossible → failed (PHOTO_UPLOAD_FAILED) without sending', async () => {
      const ctx = await failedUpload(setup({
        attach: [ok(undefined), err('ATTACHMENT_FAILED', 500)],
        get: [err('HOMEBOX_UNREACHABLE')],
      }));
      const retry = await ctx.orchestrator.retryImport(ctx.id);
      expect(retry.ok && retry.value).toMatchObject({
        status: 'partial',
        error: 'PHOTO_UPLOAD_FAILED',
        photoError: 'PHOTO_UPLOAD_FAILED',
        steps: { photo: 'failed' },
      });
      expect(photoPost(ctx.client)).toHaveLength(1);
    });

    it('resume from `sending` (service worker stopped during the POST): re-read before any send', async () => {
      const ctx = setup({ get: [ok({ id: 'e1', name: 'x', attachments: [{ id: 'a', type: 'photo' }] })] });
      await pendingStore.save({
        id: 's1',
        tabId: 5,
        pageUrl: null,
        draft: draft({ photo: draftPhoto() }),
        entityId: 'e1',
        steps: { create: 'done', update: 'done', attachments: { 'detected-0': 'done' }, photo: 'sending' },
        photoError: null,
        photoAttempted: true,
        status: 'partial',
        error: null,
        orphaned: true,
      });
      const retry = await ctx.orchestrator.retryImport('s1');
      expect(retry.ok && retry.value.status).toBe('success');
      expect(ctx.client.getEntity).toHaveBeenCalledWith('e1');
      expect(photoPost(ctx.client)).toHaveLength(0);
      expect(ctx.fetchPhoto).not.toHaveBeenCalled();
    });

    it('invariants: entityId set → no new POST /entities; photo done → no new photo POST', async () => {
      const ctx = setup({ attach: [err('ATTACHMENT_FAILED', 500)] });
      const first = await ctx.orchestrator.startImport(5, [draft({ photo: draftPhoto() })], []);
      const p = first.ok ? first.value[0]! : undefined;
      // invoice failed, photo already sent: the retry only resends the invoice
      expect(p).toMatchObject({ status: 'partial', error: 'ATTACHMENT_FAILED', steps: { photo: 'done' } });
      const retry = await ctx.orchestrator.retryImport(p!.id);
      expect(retry.ok && retry.value.status).toBe('success');
      expect(ctx.client.createEntity).toHaveBeenCalledTimes(1);
      expect(photoPost(ctx.client)).toHaveLength(1);
      expect(ctx.fetchPhoto).toHaveBeenCalledTimes(1);
    });

    it('retry of the photo alone: no creation, no update, no invoice resent', async () => {
      const ctx = setup({}, undefined, () => err('PHOTO_NOT_IMAGE'));
      const first = await ctx.orchestrator.startImport(5, [draft({ photo: draftPhoto() })], []);
      const id = first.ok ? first.value[0]!.id : '';
      ctx.fetchPhoto.mockResolvedValue(ok(photoOk));
      const retry = await ctx.orchestrator.retryImport(id);
      expect(retry.ok && retry.value.status).toBe('success');
      expect(ctx.client.createEntity).toHaveBeenCalledTimes(1);
      expect(ctx.client.updateEntity).toHaveBeenCalledTimes(1);
      expect(ctx.client.addAttachment.mock.calls.filter(([, f]) => f.type === 'receipt')).toHaveLength(1);
      expect(ctx.downloadDetected).toHaveBeenCalledTimes(1);
    });
  });
});

describe('orchestrator — resume after LOCATION_NOT_FOUND (T070, FR-018)', () => {
  const GARAGE = { id: 'loc-garage', path: ['Maison', 'Garage'] };
  const CAVE = { id: 'loc-cave', path: ['Maison', 'Cave'] };

  /** First attempt: the location has disappeared (404 then a tree without it). */
  async function notFound() {
    const ctx = setup({ create: [err('CREATE_FAILED', 404)], tree: [ok([])] });
    const first = await ctx.orchestrator.startImport(5, [draft({ location: GARAGE })], []);
    const p = first.ok ? first.value[0]! : (undefined as never);
    expect(p).toMatchObject({ status: 'failed', entityId: null, error: 'LOCATION_NOT_FOUND' });
    return { ...ctx, id: p.id };
  }

  it('retry with a new choice: the object is created at this new location', async () => {
    const { client, orchestrator, id } = await notFound();
    const retry = await orchestrator.retryImport(id, [], CAVE);
    expect(retry.ok && retry.value).toMatchObject({ status: 'success', entityId: 'e1' });
    expect(client.createEntity).toHaveBeenLastCalledWith(expect.objectContaining({ parentId: 'loc-cave' }));
    expect(client.updateEntity).toHaveBeenCalledWith('e1', expect.objectContaining({ parentId: 'loc-cave' }));
  });

  it('retry with null: creation without parentId (import without location)', async () => {
    const { client, orchestrator, id } = await notFound();
    const retry = await orchestrator.retryImport(id, [], null);
    expect(retry.ok && retry.value.status).toBe('success');
    expect(client.createEntity.mock.calls.at(-1)?.[0]).not.toHaveProperty('parentId');
    expect(retry.ok && retry.value.draft.location).toBeNull();
  });

  it("location absent: the draft's choice is unchanged", async () => {
    const { client, orchestrator, id } = await notFound();
    await orchestrator.retryImport(id);
    expect(client.createEntity).toHaveBeenLastCalledWith(expect.objectContaining({ parentId: 'loc-garage' }));
  });

  it('location provided while entityId is set → BAD_MESSAGE with no request (invariant 3)', async () => {
    const ctx = setup({ attach: [err('ATTACHMENT_FAILED')] });
    const first = await ctx.orchestrator.startImport(5, [draft({ location: GARAGE })], []);
    const p = first.ok ? first.value[0]! : (undefined as never);
    expect(p.entityId).toBe('e1');
    for (const c of Object.values(ctx.client)) if (typeof c === 'function' && 'mockClear' in c) c.mockClear();

    expect(await ctx.orchestrator.retryImport(p.id, [], CAVE)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(await ctx.orchestrator.retryImport(p.id, [], null)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    for (const [name, c] of Object.entries(ctx.client)) {
      if (typeof c === 'function' && 'mock' in c) expect(c, name).not.toHaveBeenCalled();
    }
    expect((await pendingStore.get(p.id))?.draft.location).toEqual(GARAGE);
  });

  it('the choice is persisted in the draft: a later resume reuses it', async () => {
    const ctx = setup({ create: [err('CREATE_FAILED', 404), err('CREATE_FAILED', 500)], tree: [ok([]), ok([{ id: 'loc-cave', name: 'x', type: 'location' }])] });
    const first = await ctx.orchestrator.startImport(5, [draft({ location: GARAGE })], []);
    const id = first.ok ? first.value[0]!.id : '';
    await ctx.orchestrator.retryImport(id, [], CAVE); // fails: CREATE_FAILED (the location exists)
    expect((await pendingStore.get(id))?.draft.location).toEqual(CAVE);
    await ctx.orchestrator.retryImport(id);
    expect(ctx.client.createEntity).toHaveBeenLastCalledWith(expect.objectContaining({ parentId: 'loc-cave' }));
  });
});
