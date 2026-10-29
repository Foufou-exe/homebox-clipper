import { buildNotes } from '@/background/import/orchestrator';
import { findDuplicates } from '@/background/import/duplicates';
import { ok } from '@/shared/errors';
import { draft, err, invoice, PDF, sessionKeys, setup } from './orchestrator-harness';

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
