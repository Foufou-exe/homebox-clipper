import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { ok } from '@/shared/errors';
import type { DocumentRef } from '@/shared/types';
import { PDF_B64, draft, err, fakeClient, sessionKeys, setup } from './orchestrator-harness';

describe('orchestrateur — reprise après échec partiel (US4)', () => {
  it('PJ en échec → partial ; le retry ne recrée pas l’objet et réussit', async () => {
    const { client, orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED', 500)] });
    const first = await orchestrator.startImport(5, [draft()], []);
    const p = first.ok ? first.value[0] : undefined;
    expect(p).toMatchObject({ status: 'partial', entityId: 'e1', error: 'ATTACHMENT_FAILED' });
    expect(p?.steps).toEqual({ create: 'done', update: 'done', attachments: { 'detected-0': 'failed' } });

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
    expect(p).toMatchObject({ status: 'failed', entityId: null, error: 'HOMEBOX_UNREACHABLE' });
    const retry = await orchestrator.retryImport(p!.id);
    expect(retry.ok && retry.value.status).toBe('success');
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
      notify: () => undefined,
      newId: () => 'unused',
    });
    expect(await pendingStore.listByTab(5)).toHaveLength(1);
    const retry = await restarted.retryImport(id);
    expect(retry.ok && retry.value.status).toBe('success');
    expect(client2.createEntity).not.toHaveBeenCalled();
    expect(client2.addAttachment).toHaveBeenCalledWith('e1', expect.objectContaining({ type: 'receipt' }));
  });
});
