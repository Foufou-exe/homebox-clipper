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

describe('orchestrateur — reprise après échec partiel (US4)', () => {
  it('PJ en échec → partial ; le retry ne recrée pas l’objet et réussit', async () => {
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

  it('PUT en échec → UPDATE_FAILED ; le retry relit l’objet puis rejoue le PUT', async () => {
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

  it('création en échec → le retry rejoue tout', async () => {
    const { client, orchestrator } = setup({ create: [err('HOMEBOX_UNREACHABLE')] });
    const first = await orchestrator.startImport(5, [draft()], []);
    const p = first.ok ? first.value[0] : undefined;
    expect(p).toMatchObject({ status: 'failed', entityId: null, error: 'HOMEBOX_UNREACHABLE', createUncertain: true });
    // Réponse perdue = création incertaine : la reprise cherche le nom (R8), puis crée si rien n'est trouvé.
    client.searchEntities.mockResolvedValue(ok([]));
    const retry = await orchestrator.retryImport(p!.id);
    expect(retry.ok && retry.value.status).toBe('success');
    expect(client.searchEntities).toHaveBeenCalledTimes(1);
    expect(client.createEntity).toHaveBeenCalledTimes(2);
  });

  it('abandonImport purge l’état', async () => {
    const { orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED')] });
    const first = await orchestrator.startImport(5, [draft()], []);
    const p = first.ok ? first.value[0] : undefined;
    expect(await sessionKeys()).toHaveLength(1);
    await orchestrator.abandonImport(p!.id);
    expect(await sessionKeys()).toEqual([]);
  });

  it('un fichier manuel doit être resélectionné pour réessayer (octets jamais conservés)', async () => {
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

  it("l'état survit à un redémarrage du service worker (nouvelle instance)", async () => {
    const { orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED')] });
    const first = await orchestrator.startImport(5, [draft()], []);
    const id = first.ok ? first.value[0]!.id : '';

    // Nouvelle instance, nouveau client : seul storage.session subsiste.
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

  describe('création incertaine (R8) : recherche par nom exact, sans dépendre du numéro de commande', () => {
    /**
     * HomeBox simulé au plus près des faits testés sur 0.27 : le POST ne retient ni `notes` ni numéro de
     * commande ; `q` cherche dans le nom et la description de ce qui a réellement été envoyé.
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

    it('réponse du POST perdue (HOMEBOX_UNREACHABLE) → createUncertain ; la reprise trouve l’objet par son nom, aucun 2e POST', async () => {
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

    it('orphelin dont le POST a démarré (createAttempted) → même recherche, même refus', async () => {
      const ctx = setup();
      const stored = homebox(ctx);
      stored.push({ id: 'h0', name: 'Clavier sans fil Exemple Pro', description: 'Acheté sur Amazon.fr le 22/10/2026' });
      await pendingStore.save({ ...pendingBase(), orphaned: true, createAttempted: true });
      const r = await ctx.orchestrator.retryImport('o1');
      expect(r).toEqual({ ok: false, error: 'DUPLICATE_SUSPECTED' });
      expect(ctx.client.createEntity).not.toHaveBeenCalled();
    });

    it('le POST démarre avec createAttempted déjà écrit en storage (écriture anticipée)', async () => {
      const ctx = setup();
      let seen: boolean | undefined;
      ctx.client.createEntity.mockImplementation(async () => {
        seen = (await pendingStore.get('p1'))?.createAttempted;
        return ok({ id: 'e1', name: 'x' });
      });
      await ctx.orchestrator.startImport(5, [draft()], []);
      expect(seen).toBe(true);
    });

    it('aucun objet de ce nom → la reprise crée l’objet ; la recherche passe avant le POST et le marqueur est retiré', async () => {
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

    it('un objet de nom voisin (autre nom exact) ne bloque pas la reprise', async () => {
      const ctx = setup();
      const stored = homebox(ctx);
      stored.push({ id: 'h0', name: 'Clavier sans fil Exemple Pro Max' });
      await pendingStore.save({ ...pendingBase(), createUncertain: true });
      const r = await ctx.orchestrator.retryImport('o1');
      expect(r.ok && r.value.status).toBe('success');
    });

    it('sans numéro de commande, la recherche par nom a lieu quand même', async () => {
      const ctx = setup();
      const stored = homebox(ctx);
      stored.push({ id: 'h0', name: 'Clavier sans fil Exemple Pro' });
      await pendingStore.save({ ...pendingBase({ orderNumber: null }), createUncertain: true });
      expect(await ctx.orchestrator.retryImport('o1')).toEqual({ ok: false, error: 'DUPLICATE_SUSPECTED' });
    });

    it('recherche en échec → reprise refusée (DUPLICATE_CHECK_FAILED), aucun POST, état conservé', async () => {
      const ctx = setup();
      ctx.client.searchEntities.mockResolvedValue(err('DUPLICATE_CHECK_FAILED'));
      await pendingStore.save({ ...pendingBase(), createUncertain: true });
      expect(await ctx.orchestrator.retryImport('o1')).toEqual({ ok: false, error: 'DUPLICATE_CHECK_FAILED' });
      expect(ctx.client.createEntity).not.toHaveBeenCalled();
      expect((await pendingStore.get('o1'))?.createUncertain).toBe(true);
    });

    it('erreur HTTP explicite (CREATE_FAILED) → échec certain : ni createUncertain ni recherche à la reprise', async () => {
      const { client, orchestrator } = setup({ create: [err('CREATE_FAILED', 422)] });
      const first = await orchestrator.startImport(5, [draft()], []);
      const p = first.ok ? first.value[0]! : undefined;
      expect(p).toMatchObject({ status: 'failed', error: 'CREATE_FAILED', entityId: null });
      expect(p?.createUncertain).toBeFalsy();
      const retry = await orchestrator.retryImport(p!.id);
      expect(retry.ok && retry.value.status).toBe('success');
      expect(client.searchEntities).not.toHaveBeenCalled();
    });

    it('orphelin dont le POST n’a pas démarré → aucune recherche (pas incertain)', async () => {
      const ctx = setup();
      await pendingStore.save({ ...pendingBase(), orphaned: true });
      const r = await ctx.orchestrator.retryImport('o1');
      expect(r.ok && r.value.status).toBe('success');
      expect(ctx.client.searchEntities).not.toHaveBeenCalled();
    });

    it('un premier import ne cherche jamais de doublon', async () => {
      const { client, orchestrator } = setup();
      await orchestrator.startImport(5, [draft()], []);
      expect(client.searchEntities).not.toHaveBeenCalled();
    });

    it('le marqueur orphaned est retiré une fois la reprise lancée', async () => {
      const ctx = setup({ attach: [err('ATTACHMENT_FAILED')] });
      ctx.client.searchEntities.mockResolvedValue(ok([]));
      await pendingStore.save({ ...pendingBase(), orphaned: true, createAttempted: true });
      const r = await ctx.orchestrator.retryImport('o1');
      expect(r.ok && r.value).toMatchObject({ status: 'partial', entityId: 'e1' });
      expect(r.ok && r.value.orphaned).toBeUndefined();
    });
  });

  describe('lot de plusieurs produits : tout est persisté avant le premier POST', () => {
    it('le premier POST voit déjà les deux imports en storage (le second est running, non incertain)', async () => {
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

  describe('reprise de la photo (R8, FR-008)', () => {
    const photoPost = (client: ReturnType<typeof setup>['client']) =>
      client.addAttachment.mock.calls.filter(([, f]) => f.type === 'photo');

    /** Importe avec une photo dont le POST échoue, et rend l'identifiant de l'import à reprendre. */
    async function failedUpload(ctx = setup({ attach: [ok(undefined), err('ATTACHMENT_FAILED', 500)] })) {
      const first = await ctx.orchestrator.startImport(5, [draft({ photo: draftPhoto() })], []);
      const p = first.ok ? first.value[0]! : undefined;
      expect(p).toMatchObject({ status: 'partial', photoAttempted: true, steps: { photo: 'failed' } });
      return { ...ctx, id: p!.id };
    }

    it('photoAttempted = false → retour à pending puis envoi, sans relire l’objet', async () => {
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

    it('photoAttempted = true et photo déjà jointe (type = photo) → done sans envoi (scénario 8)', async () => {
      const ctx = await failedUpload(setup({
        attach: [ok(undefined), err('HOMEBOX_UNREACHABLE')],
        get: [ok({ id: 'e1', name: 'x', attachments: [{ id: 'a1', type: 'receipt' }, { id: 'a2', type: 'photo' }] })],
      }));
      const retry = await ctx.orchestrator.retryImport(ctx.id);
      expect(retry.ok && retry.value).toMatchObject({ status: 'success', photoError: null });
      expect(ctx.client.getEntity).toHaveBeenCalledWith('e1');
      expect(photoPost(ctx.client)).toHaveLength(1); // le seul POST est celui de la première tentative
    });

    it('l’anti-double teste type === photo, jamais primary', async () => {
      const ctx = await failedUpload(setup({
        attach: [ok(undefined), err('ATTACHMENT_FAILED', 500)],
        get: [ok({ id: 'e1', name: 'x', attachments: [{ id: 'a1', type: 'receipt', primary: true }] })],
      }));
      // Une pièce `primary` qui n'est pas une photo ne compte pas : la photo est renvoyée.
      const retry = await ctx.orchestrator.retryImport(ctx.id);
      expect(retry.ok && retry.value.status).toBe('success');
      expect(photoPost(ctx.client)).toHaveLength(2);
    });

    it('photoAttempted = true et aucune photo → retour à pending puis envoi', async () => {
      const ctx = await failedUpload(setup({
        attach: [ok(undefined), err('ATTACHMENT_FAILED', 500)],
        get: [ok({ id: 'e1', name: 'x', attachments: [] })],
      }));
      const retry = await ctx.orchestrator.retryImport(ctx.id);
      expect(retry.ok && retry.value).toMatchObject({ status: 'success', error: null, photoError: null });
      expect(photoPost(ctx.client)).toHaveLength(2);
      expect(await sessionKeys()).toEqual([]);
    });

    it('objet sans champ attachments → traité comme « aucune photo »', async () => {
      const ctx = await failedUpload();
      const retry = await ctx.orchestrator.retryImport(ctx.id);
      expect(retry.ok && retry.value.status).toBe('success');
      expect(photoPost(ctx.client)).toHaveLength(2);
    });

    it('relecture impossible → failed (PHOTO_UPLOAD_FAILED) sans envoi', async () => {
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

    it('reprise depuis `sending` (service worker arrêté pendant le POST) : relecture avant tout envoi', async () => {
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

    it('invariants : entityId défini → aucun nouveau POST /entities ; photo done → aucun nouveau POST de photo', async () => {
      const ctx = setup({ attach: [err('ATTACHMENT_FAILED', 500)] });
      const first = await ctx.orchestrator.startImport(5, [draft({ photo: draftPhoto() })], []);
      const p = first.ok ? first.value[0]! : undefined;
      // facture en échec, photo déjà envoyée : la relance ne renvoie que la facture
      expect(p).toMatchObject({ status: 'partial', error: 'ATTACHMENT_FAILED', steps: { photo: 'done' } });
      const retry = await ctx.orchestrator.retryImport(p!.id);
      expect(retry.ok && retry.value.status).toBe('success');
      expect(ctx.client.createEntity).toHaveBeenCalledTimes(1);
      expect(photoPost(ctx.client)).toHaveLength(1);
      expect(ctx.fetchPhoto).toHaveBeenCalledTimes(1);
    });

    it('relance de la photo seule : ni création, ni mise à jour, ni facture renvoyées', async () => {
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
