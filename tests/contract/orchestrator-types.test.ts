import type { DocumentKind } from '@/shared/document-kinds';
import type { DocumentRef } from '@/shared/types';
import { draft, err, invoice, setup } from './orchestrator-harness';

const doc = (id: string, kind: DocumentKind, label = `${id}.pdf`): DocumentRef => ({
  id,
  origin: 'detected',
  kind,
  label,
  url: `https://www.amazon.fr/documents/download/${id}.pdf`,
});

const typesSent = (client: ReturnType<typeof setup>['client']) =>
  client.addAttachment.mock.calls.map(([, f]) => f.type);

describe('orchestrator: one HomeBox type per document kind (007, Q-U4, FR-002, FR-003, FR-004)', () => {
  it('one document of each kind → receipt, manual, warranty, attachment, attachment; no primary', async () => {
    const { client, orchestrator } = setup();
    const docs = [
      invoice,
      doc('m1', 'manual'),
      doc('w1', 'warranty'),
      doc('n1', 'delivery_note', 'bon-de-livraison-12.pdf'),
      doc('o1', 'order_document'),
    ];
    const r = await orchestrator.startImport(3, [draft({ documents: docs })], []);
    expect(typesSent(client)).toEqual(['receipt', 'manual', 'warranty', 'attachment', 'attachment']);
    for (const [, f] of client.addAttachment.mock.calls) expect(f.primary).toBeUndefined();
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(r.ok && Object.values(r.value[0]!.steps.attachments)).toEqual(Array(5).fill('done'));
    expect(r.ok && 'attachmentFallbacks' in r.value[0]!).toBe(false);
  });

  it('several documents of the same kind, several products: all sent, each with its type (V8, V9)', async () => {
    const { client, orchestrator } = setup();
    const docs = [invoice, doc('m1', 'manual'), doc('m2', 'manual'), doc('w1', 'warranty')];
    const r = await orchestrator.startImport(
      3,
      [draft({ documents: docs }), draft({ name: 'Souris sans fil Exemple', documents: docs })],
      [],
    );
    expect(r.ok && r.value.map((p) => p.status)).toEqual(['success', 'success']);
    expect(typesSent(client)).toEqual([
      'receipt', 'manual', 'manual', 'warranty',
      'receipt', 'manual', 'manual', 'warranty',
    ]);
  });
});

describe('orchestrator: 422 fallback to a plain attachment (007, R1, V5, Q-U6)', () => {
  it.each(['manual', 'warranty'] as const)('422 on %s → one retry as attachment, same bytes and name, done', async (kind) => {
    const { client, orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED', 422)] });
    const d = doc('x1', kind, 'guide.pdf');
    const r = await orchestrator.startImport(3, [draft({ documents: [d] })], []);
    expect(client.addAttachment).toHaveBeenCalledTimes(2);
    const [first, second] = client.addAttachment.mock.calls.map(([, f]) => f);
    expect(first?.type).toBe(kind);
    expect(second?.type).toBe('attachment');
    expect(second?.bytes).toEqual(first?.bytes);
    expect(second?.filename).toBe(first?.filename);
    expect(client.addAttachment.mock.calls[1]?.[0]).toBe(client.addAttachment.mock.calls[0]?.[0]);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'success', error: null, attachmentFallbacks: ['x1'] });
    expect(r.ok && r.value[0]?.steps.attachments).toEqual({ x1: 'done' });
  });

  it('partial import + fallback: no error reported for that document', async () => {
    const { orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED', 422)], update: [err('UPDATE_FAILED', 400)] });
    const r = await orchestrator.startImport(3, [draft({ documents: [doc('m1', 'manual')] })], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'partial', error: 'UPDATE_FAILED', attachmentFallbacks: ['m1'] });
  });

  it.each([
    ['500', err('ATTACHMENT_FAILED', 500)],
    ['401', err('UNAUTHORIZED', 401)],
    ['403', err('UNAUTHORIZED', 403)],
    ['network', err('HOMEBOX_UNREACHABLE')],
  ])('no fallback on %s: a single call, failed', async (_l, failure) => {
    const { client, orchestrator } = setup({ attach: [failure] });
    const r = await orchestrator.startImport(3, [draft({ documents: [doc('m1', 'manual')] })], []);
    expect(client.addAttachment).toHaveBeenCalledTimes(1);
    expect(r.ok && r.value[0]?.steps.attachments).toEqual({ m1: 'failed' });
    expect(r.ok && 'attachmentFallbacks' in r.value[0]!).toBe(false);
  });

  it.each(['invoice', 'order_document', 'delivery_note'] as const)('no fallback on a 422 for %s', async (kind) => {
    const { client, orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED', 422)] });
    const r = await orchestrator.startImport(3, [draft({ documents: [doc('x', kind)] })], []);
    expect(client.addAttachment).toHaveBeenCalledTimes(1);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'partial', error: 'ATTACHMENT_FAILED' });
  });

  it('422 then failure of the retry: failed, ATTACHMENT_FAILED, exactly two calls', async () => {
    const { client, orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED', 422), err('ATTACHMENT_FAILED', 500)] });
    const r = await orchestrator.startImport(3, [draft({ documents: [doc('m1', 'manual')] })], []);
    expect(client.addAttachment).toHaveBeenCalledTimes(2);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'partial', error: 'ATTACHMENT_FAILED' });
    expect(r.ok && r.value[0]?.steps.attachments).toEqual({ m1: 'failed' });
    expect(r.ok && 'attachmentFallbacks' in r.value[0]!).toBe(false);
  });

  it('a fallback adds no log call and no console output', async () => {
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    const { orchestrator } = setup({ attach: [err('ATTACHMENT_FAILED', 422)] });
    await orchestrator.startImport(3, [draft({ documents: [doc('m1', 'manual', 'secret-name.pdf')] })], []);
    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output).not.toContain('secret-name');
    expect(output).not.toContain('m1');
    expect(output).not.toContain('manual');
    for (const s of spies) s.mockRestore();
  });
});
