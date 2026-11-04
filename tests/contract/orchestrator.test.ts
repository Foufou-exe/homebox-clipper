import { buildNotes } from '@/background/import/orchestrator';
import { findDuplicates } from '@/background/import/duplicates';
import { ok } from '@/shared/errors';
import { JPEG, draft, draftPhoto, err, invoice, PDF, photoOk, sessionKeys, setup } from './orchestrator-harness';

// La note HomeBox est résolue par `getMessage` (service worker) : le catalogue réel sert de source.
vi.mock('@/platform/i18n', async () => {
  const { loadCatalog, makeGetMessage } = await import('../unit/i18n-harness');
  return { getMessage: makeGetMessage(loadCatalog('fr')), getUILanguage: () => 'fr' };
});

describe('orchestrateur — chemin nominal', () => {
  it('crée, met à jour puis joint la facture, et purge l’état', async () => {
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

  it('deux produits → deux objets avec la même facture, téléchargée une seule fois', async () => {
    const { client, orchestrator, downloadDetected } = setup();
    const r = await orchestrator.startImport(7, [draft(), draft({ name: 'Câble USB-C' })], []);
    expect(r.ok && r.value.map((p) => p.entityId)).toEqual(['e1', 'e2']);
    expect(client.addAttachment).toHaveBeenCalledTimes(2);
    expect(downloadDetected).toHaveBeenCalledTimes(1);
    expect(downloadDetected).toHaveBeenCalledWith(7, invoice.url);
  });

  it('UNAUTHORIZED à la création → failed, aucun objet, état conservé pour réessayer', async () => {
    const { client, orchestrator } = setup({ create: [err('UNAUTHORIZED', 401)] });
    const r = await orchestrator.startImport(7, [draft()], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'failed', entityId: null, error: 'UNAUTHORIZED' });
    expect(client.updateEntity).not.toHaveBeenCalled();
    expect(client.addAttachment).not.toHaveBeenCalled();
    expect(await sessionKeys()).toEqual(['pendingImport:7:p1']);
  });

  it('refuse un brouillon sans nom (FR-013)', async () => {
    const { client, orchestrator } = setup();
    expect(await orchestrator.startImport(7, [draft({ name: '  ' })], [])).toMatchObject({ ok: false });
    expect(client.createEntity).not.toHaveBeenCalled();
  });

  it('téléchargement refusé → partial avec DOWNLOAD_REFUSED, objet conservé', async () => {
    const { orchestrator } = setup({}, () => err('DOWNLOAD_REFUSED'));
    const r = await orchestrator.startImport(7, [draft()], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'partial', entityId: 'e1', error: 'DOWNLOAD_REFUSED' });
  });

  it('buildNotes sans numéro de commande → pas de notes', () => {
    expect(buildNotes(draft({ orderNumber: null }))).toBeUndefined();
  });
});

describe('note HomeBox traduisible (summary.orderNote)', () => {
  it('buildNotes écrit « Commande Amazon.fr : <n°> » puis l’adresse de la page', () => {
    expect(buildNotes(draft())).toBe(
      'Commande Amazon.fr : 999-0000000-0000001\nhttps://www.amazon.fr/your-orders/order-details',
    );
  });

  it('la détection de doublons cherche le numéro seul, quel que soit le libellé de la note', async () => {
    // Objet existant créé avec un autre libellé (autre langue ou autre version) : seul le numéro compte.
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

describe('orchestrateur — photo du produit (US1)', () => {
  it('ordre create → update → pièce jointe → photo, photo en pièce principale', async () => {
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

  it('le type MIME et le nom envoyés viennent de la signature (PNG)', async () => {
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
    // Valeur de steps.photo à la première persistance (l'objet est ensuite modifié en place).
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

  it('not_requested et unavailable n’empêchent pas success (SC-002) et ne récupèrent rien', async () => {
    const { client, orchestrator, fetchPhoto } = setup();
    const r = await orchestrator.startImport(
      7,
      [draft({ photo: draftPhoto({ include: false }) }), draft({ name: 'Sans photo', photo: null })],
      [],
    );
    expect(r.ok && r.value.map((p) => p.status)).toEqual(['success', 'success']);
    expect(r.ok && r.value.map((p) => p.steps.photo)).toEqual(['not_requested', 'unavailable']);
    expect(fetchPhoto).not.toHaveBeenCalled(); // une photo décochée n'est pas récupérée
    expect(client.addAttachment).toHaveBeenCalledTimes(2); // les deux factures seulement
  });

  it('`sending` est persisté AVANT le POST de la photo, avec photoAttempted = true', async () => {
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

  it('photoAttempted reste faux tant qu’aucun POST de photo n’a pu partir', async () => {
    const { orchestrator } = setup({}, undefined, () => err('PHOTO_UNAVAILABLE'));
    const r = await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    expect(r.ok && r.value[0]).toMatchObject({ photoAttempted: false });
  });

  it.each(['PHOTO_UNAVAILABLE', 'PHOTO_NOT_IMAGE', 'PHOTO_TOO_LARGE'] as const)(
    'récupération en échec (%s) → partial, objet et facture conservés, aucun POST de photo',
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
      expect(client.addAttachment).toHaveBeenCalledTimes(1); // la facture seulement
      expect(await sessionKeys()).toEqual(['pendingImport:7:p1']);
    },
  );

  it('422 sur la photo (scénario 7) → PHOTO_UPLOAD_FAILED, un seul objet', async () => {
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

  it('une erreur plus prioritaire (facture) garde `error`, la photo garde `photoError`', async () => {
    const { orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED', 500)] }, undefined, () => err('PHOTO_TOO_LARGE'));
    const r = await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'partial', error: 'ATTACHMENT_FAILED', photoError: 'PHOTO_TOO_LARGE' });
  });

  it('une photo en échec n’empêche pas la facture d’être envoyée (la photo vient en dernier)', async () => {
    const { client, orchestrator } = setup({}, undefined, () => err('PHOTO_UNAVAILABLE'));
    await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    expect(client.addAttachment).toHaveBeenCalledWith('e1', expect.objectContaining({ type: 'receipt' }));
  });

  it('deux produits de même photo → un seul téléchargement, deux POST (scénario 10)', async () => {
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

  it('un échec de récupération partagé est aussi mis en cache (une seule requête)', async () => {
    const { orchestrator, fetchPhoto } = setup({}, undefined, () => err('PHOTO_UNAVAILABLE'));
    await orchestrator.startImport(7, [draft({ photo: draftPhoto() }), draft({ name: 'b', photo: draftPhoto() })], []);
    expect(fetchPhoto).toHaveBeenCalledTimes(1);
  });

  it('les octets de la photo ne figurent jamais dans l’état persisté', async () => {
    const { orchestrator } = setup({ attach: [ok(undefined), err('ATTACHMENT_FAILED', 500)] });
    await orchestrator.startImport(7, [draft({ photo: draftPhoto() })], []);
    const stored = JSON.stringify(await (await import('wxt/testing/fake-browser')).fakeBrowser.storage.session.get(null));
    expect(stored).not.toContain(Array.from(photoOk.bytes).join(','));
    expect(stored).not.toContain('"bytes"');
  });
});
