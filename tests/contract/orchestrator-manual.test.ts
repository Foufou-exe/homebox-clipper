import { bytesToBase64 } from '@/shared/pdf';
import type { DocumentRef } from '@/shared/types';
import { PDF, PDF_B64, draft, setup } from './orchestrator-harness';
import { err } from './orchestrator-harness';
import { setTestLanguage } from '../unit/i18n-harness';

const manualOrderDoc: DocumentRef = {
  id: 'manual-1',
  origin: 'manual',
  kind: 'order_document',
  label: 'bon-de-commande.pdf',
};

describe('orchestrator — manual entry and files (US3)', () => {
  it('a manual order form is uploaded with type=attachment', async () => {
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

  it('a non-PDF manual file is rejected on the service worker side before any HomeBox call', async () => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(3, [draft({ documents: [manualOrderDoc] })], [
      { docId: 'manual-1', filename: 'x.pdf', base64: bytesToBase64(new TextEncoder().encode('<html>')) },
    ]);
    expect(r).toEqual({ ok: false, error: 'NOT_A_PDF' });
    expect(client.createEntity).not.toHaveBeenCalled();
  });

  it('import without document: object created, no attachment, success', async () => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(3, [draft({ documents: [] })], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(client.addAttachment).not.toHaveBeenCalled();
  });

  it('full manual entry (no detection): draft without order or page', async () => {
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

describe('orchestrator — manual entry note (006)', () => {
  it('order number typed by hand, no page: note "Commande : <no.>" without a store', async () => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(3, [draft({ pageUrl: null, documents: [] })], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    const update = client.updateEntity.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(update.notes).toBe('Commande : 999-0000000-0000001');
  });
});

describe('orchestrator: manual and warranty names and checks (007, Q-U2, Q-U8, FR-004, FR-008)', () => {
  const local = (kind: DocumentRef['kind'], label: string): DocumentRef => ({ id: 'manual-1', origin: 'manual', kind, label });

  it.each([
    ['manual', 'guide.pdf', 'guide.pdf'],
    ['manual', 'guide', 'guide.pdf'],
    ['warranty', 'garantie', 'garantie.pdf'],
    ['warranty', 'garantie.PDF', 'garantie.PDF'],
    ['invoice', 'facture', 'facture.pdf'],
    ['order_document', 'bon', 'bon.pdf'],
  ] as const)('%s "%s" is sent as "%s" (filename and name)', async (kind, label, expected) => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(3, [draft({ documents: [local(kind, label)] })], [
      { docId: 'manual-1', filename: label, base64: PDF_B64 },
    ]);
    expect(client.addAttachment.mock.calls[0]?.[1].filename).toBe(expected);
  });

  it.each(['manual', 'warranty', 'delivery_note'] as const)('%s: a non-PDF local file → NOT_A_PDF before any HomeBox call', async (kind) => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(3, [draft({ documents: [local(kind, 'x.pdf')] })], [
      { docId: 'manual-1', filename: 'x.pdf', base64: bytesToBase64(new TextEncoder().encode('<html>')) },
    ]);
    expect(r).toEqual({ ok: false, error: 'NOT_A_PDF' });
    expect(client.createEntity).not.toHaveBeenCalled();
    expect(client.addAttachment).not.toHaveBeenCalled();
  });

  it.each(['manual', 'warranty', 'delivery_note'] as const)('%s: a file over 15 MB → FILE_TOO_LARGE before any HomeBox call', async (kind) => {
    const { client, orchestrator } = setup();
    const big = bytesToBase64(new Uint8Array(15 * 1024 * 1024 + 1));
    const r = await orchestrator.startImport(3, [draft({ documents: [local(kind, 'x.pdf')] })], [
      { docId: 'manual-1', filename: 'x.pdf', base64: big },
    ]);
    expect(r).toEqual({ ok: false, error: 'FILE_TOO_LARGE' });
    expect(client.addAttachment).not.toHaveBeenCalled();
  });

  it.each(['manual', 'warranty'] as const)('%s: a detected document of another origin is refused (V3)', async (kind) => {
    const { client, orchestrator } = setup({}, () => ({ ok: false, error: 'DOWNLOAD_REFUSED' }));
    const d: DocumentRef = { id: 'detected-9', origin: 'detected', kind, label: 'x.pdf', url: 'https://evil.example.com/x.pdf' };
    const r = await orchestrator.startImport(3, [draft({ documents: [d] })], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'partial', error: 'DOWNLOAD_REFUSED' });
    expect(client.addAttachment).not.toHaveBeenCalled();
  });

  it.each(['manual', 'warranty', 'invoice', 'order_document'] as const)('%s: a local document without bytes on resume → MANUAL_FILE_REQUIRED', async (kind) => {
    const s2 = setup();
    const r = await s2.orchestrator.startImport(3, [draft({ documents: [local(kind, 'x.pdf')] })], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'partial', error: 'MANUAL_FILE_REQUIRED' });
    expect(s2.client.addAttachment).not.toHaveBeenCalled();
  });
});

describe('orchestrator: delivery note name (007, Q-U2, FR-003, V6, R5)', () => {
  const note = (label: string): DocumentRef => ({ id: 'manual-1', origin: 'manual', kind: 'delivery_note', label });
  const run = async (label: string) => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(3, [draft({ documents: [note(label)] })], [
      { docId: 'manual-1', filename: label, base64: PDF_B64 },
    ]);
    return { client, r };
  };

  it('scan0012.pdf → bon-de-livraison-scan0012.pdf (filename and name), type attachment', async () => {
    const { client, r } = await run('scan0012.pdf');
    expect(client.addAttachment).toHaveBeenCalledTimes(1);
    expect(client.addAttachment.mock.calls[0]?.[1]).toMatchObject({ filename: 'bon-de-livraison-scan0012.pdf', type: 'attachment' });
    expect(r.ok && r.value[0]?.status).toBe('success');
  });

  it('in English → delivery-note-scan0012.pdf', async () => {
    setTestLanguage('en');
    const { client } = await run('scan0012.pdf');
    expect(client.addAttachment.mock.calls[0]?.[1].filename).toBe('delivery-note-scan0012.pdf');
  });

  it.each(['Bon-de-livraison-12.pdf', 'delivery-note.pdf', 'packing-slip.pdf', 'bordereau-12.pdf', 'Bon de livraison 3.pdf'])(
    'already explicit "%s" is unchanged, no double prefix',
    async (label) => {
      const { client } = await run(label);
      expect(client.addAttachment.mock.calls[0]?.[1].filename).toBe(label);
    },
  );

  it('a label without extension gets .pdf after the prefix', async () => {
    const { client } = await run('scan');
    expect(client.addAttachment.mock.calls[0]?.[1].filename).toBe('bon-de-livraison-scan.pdf');
  });

  it('the resume does not double the prefix and sends the same name; no fallback', async () => {
    const { client, orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED', 500)] });
    const first = await orchestrator.startImport(3, [draft({ documents: [note('scan0012.pdf')] })], [
      { docId: 'manual-1', filename: 'scan0012.pdf', base64: PDF_B64 },
    ]);
    const p = first.ok ? first.value[0] : undefined;
    const retry = await orchestrator.retryImport(p!.id, [{ docId: 'manual-1', filename: 'scan0012.pdf', base64: PDF_B64 }]);
    expect(retry.ok && retry.value.status).toBe('success');
    expect(client.addAttachment.mock.calls.map(([, f]) => f.filename)).toEqual([
      'bon-de-livraison-scan0012.pdf',
      'bon-de-livraison-scan0012.pdf',
    ]);
    expect(client.addAttachment).toHaveBeenCalledTimes(2);
  });
});
