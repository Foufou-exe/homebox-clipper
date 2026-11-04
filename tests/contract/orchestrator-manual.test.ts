import { bytesToBase64 } from '@/shared/pdf';
import type { DocumentRef } from '@/shared/types';
import { PDF, PDF_B64, draft, setup } from './orchestrator-harness';

const manualOrderDoc: DocumentRef = {
  id: 'manual-1',
  origin: 'manual',
  kind: 'order_document',
  label: 'bon-de-commande.pdf',
};

describe('orchestrateur — saisie et fichiers manuels (US3)', () => {
  it('un bon de commande manuel est envoyé avec type=attachment', async () => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(3, [draft({ documents: [manualOrderDoc] })], [
      { docId: 'manual-1', filename: 'bon-de-commande.pdf', base64: PDF_B64 },
    ]);
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(client.addAttachment).toHaveBeenCalledWith('e1', {
      bytes: PDF,
      filename: 'bon-de-commande.pdf',
      type: 'attachment',
      mimeType: 'application/pdf',
    });
  });

  it('un fichier manuel non PDF est rejeté côté service worker avant tout appel HomeBox', async () => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(3, [draft({ documents: [manualOrderDoc] })], [
      { docId: 'manual-1', filename: 'x.pdf', base64: bytesToBase64(new TextEncoder().encode('<html>')) },
    ]);
    expect(r).toEqual({ ok: false, error: 'NOT_A_PDF' });
    expect(client.createEntity).not.toHaveBeenCalled();
  });

  it('import sans document : objet créé, aucune pièce jointe, succès', async () => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(3, [draft({ documents: [] })], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(client.addAttachment).not.toHaveBeenCalled();
  });

  it('saisie manuelle complète (aucune détection) : brouillon sans commande ni page', async () => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(3, [
      draft({ orderNumber: null, pageUrl: null, purchaseDate: null, purchasePrice: null, documents: [] }),
    ], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    const update = client.updateEntity.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(update).not.toHaveProperty('notes');
    expect(update).not.toHaveProperty('purchasePrice');
  });
});
