import { toEntry } from '@/background/history/entry';
import { ok } from '@/shared/errors';
import type { PendingImport, WarrantyDraft } from '@/shared/types';
import { draft, err, setup } from './orchestrator-harness';

const warranty = (over: Partial<WarrantyDraft> = {}): WarrantyDraft => ({
  origin: 'legal',
  expires: '2028-11-03',
  lifetime: false,
  details: 'Garantie légale de conformité (2 ans)',
  durationMonths: 24,
  edited: false,
  ...over,
});

const body = (client: ReturnType<typeof setup>['client'], n = 0) =>
  client.updateEntity.mock.calls[n]?.[1] as Record<string, unknown>;

describe('orchestrator: warranty in the existing PUT (011, Q-U12, FR-006)', () => {
  it('a conforming warranty: one PUT carries the date and the details, no lifetime flag', async () => {
    const { client, orchestrator } = setup();
    const r = await orchestrator.startImport(3, [draft({ warranty: warranty() })], []);
    expect(r.ok && r.value[0]?.status).toBe('success');
    expect(client.updateEntity).toHaveBeenCalledTimes(1);
    expect(body(client)).toMatchObject({
      warrantyExpires: '2028-11-03',
      warrantyDetails: 'Garantie légale de conformité (2 ans)',
    });
    expect(body(client)).not.toHaveProperty('lifetimeWarranty');
  });

  it('lifetime: lifetimeWarranty true and no date', async () => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(3, [draft({ warranty: warranty({ lifetime: true, details: '' }) })], []);
    expect(body(client)).toMatchObject({ lifetimeWarranty: true });
    expect(body(client)).not.toHaveProperty('warrantyExpires');
  });

  it.each([
    ['empty warranty', warranty({ expires: null, details: '' })],
    ['null', null],
    ['absent', undefined],
  ])('%s: no warranty key in the body', async (_label, w) => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(3, [draft({ warranty: w })], []);
    for (const key of ['warrantyExpires', 'warrantyDetails', 'lifetimeWarranty']) {
      expect(body(client)).not.toHaveProperty(key);
    }
  });

  it('same calls and same steps with or without a warranty; no step added', async () => {
    const without = setup();
    const a = await without.orchestrator.startImport(3, [draft()], []);
    const withW = setup();
    const b = await withW.orchestrator.startImport(3, [draft({ warranty: warranty() })], []);
    expect(withW.client.createEntity).toHaveBeenCalledTimes(1);
    expect(withW.client.updateEntity).toHaveBeenCalledTimes(1);
    expect(withW.client.createEntity.mock.calls.length).toBe(without.client.createEntity.mock.calls.length);
    expect(withW.client.addAttachment.mock.calls.length).toBe(without.client.addAttachment.mock.calls.length);
    expect(withW.client.getEntity.mock.calls.length).toBe(without.client.getEntity.mock.calls.length);
    expect(a.ok && b.ok && b.value[0]?.steps).toEqual(a.ok && a.value[0]?.steps);
  });

  it('a draft without warranty gives the same PUT body as before the feature', async () => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(3, [draft()], []);
    expect(Object.keys(body(client)).some((k) => /warrant/i.test(k))).toBe(false);
  });
});

describe('orchestrator: an existing warranty is never overwritten (011, Q-U13, FR-008, R10)', () => {
  /** Resume of an import whose object already exists in HomeBox with some warranty fields. */
  async function resumeWith(existing: Record<string, unknown>, w: WarrantyDraft) {
    const ctx = setup({
      update: [err('UPDATE_FAILED', 500)],
      get: [ok({ id: 'e1', name: 'x', ...existing })],
    });
    const first = await ctx.orchestrator.startImport(3, [draft({ warranty: w })], []);
    const id = first.ok ? first.value[0]!.id : '';
    const retry = await ctx.orchestrator.retryImport(id);
    expect(retry.ok && retry.value.status).toBe('success');
    return { ctx, put: ctx.client.updateEntity.mock.calls[1]?.[1] as Record<string, unknown> };
  }

  it('an existing date is kept (copied from the object), the details are still sent', async () => {
    const { put } = await resumeWith({ warrantyExpires: '2030-01-01' }, warranty());
    expect(put.warrantyExpires).toBe('2030-01-01');
    expect(put.warrantyDetails).toBe('Garantie légale de conformité (2 ans)');
  });

  it('existing details are kept', async () => {
    const { put } = await resumeWith({ warrantyDetails: 'Garantie constructeur' }, warranty());
    expect(put.warrantyDetails).toBe('Garantie constructeur');
    expect(put.warrantyExpires).toBe('2028-11-03');
  });

  it('an existing lifetime flag is kept', async () => {
    const { put } = await resumeWith({ lifetimeWarranty: true }, warranty({ lifetime: true, details: '' }));
    expect(put.lifetimeWarranty).toBe(true);
    expect(put).not.toHaveProperty('warrantyExpires');
  });

  it('a freshly created object receives everything', async () => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(3, [draft({ warranty: warranty() })], []);
    expect(body(client)).toMatchObject({ warrantyExpires: '2028-11-03' });
    expect(client.getEntity).not.toHaveBeenCalled();
  });
});

describe('orchestrator: probable duplicate, "Create anyway" (011, FR-008)', () => {
  it('creates a new object and never updates the existing one', async () => {
    const { client, orchestrator } = setup();
    client.searchEntities.mockResolvedValue(ok([{ id: 'dup1', name: 'Clavier sans fil Exemple Pro' }]));
    const r = await orchestrator.startImport(3, [draft({ warranty: warranty() })], []);
    expect(r.ok && r.value[0]?.entityId).toBe('e1');
    expect(client.createEntity).toHaveBeenCalledTimes(1);
    for (const call of client.updateEntity.mock.calls) expect(call[0]).toBe('e1');
    expect(client.updateEntity.mock.calls.some((c) => c[0] === 'dup1')).toBe(false);
  });
});

describe('orchestrator: no log added, nothing in the history (011, Q-U12 e/f, principle I)', () => {
  const spies = () =>
    (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));

  it('the console output is identical with and without a warranty, and carries no warranty data', async () => {
    const run = async (w: WarrantyDraft | null) => {
      const s = spies();
      const { orchestrator } = setup();
      await orchestrator.startImport(3, [draft({ warranty: w })], []);
      const calls = s.flatMap((x) => x.mock.calls);
      vi.restoreAllMocks();
      return JSON.stringify(calls);
    };
    const without = await run(null);
    const withW = await run(warranty({ details: 'Détail secret de garantie' }));
    expect(withW).toBe(without);
    for (const marker of ['2028-11-03', 'Détail secret', 'Garantie légale']) expect(withW).not.toContain(marker);
  });

  it('the history entry keeps its exact keys and carries no warranty data', () => {
    const pending: PendingImport = {
      id: 'p1',
      tabId: 7,
      pageUrl: 'https://www.amazon.fr/your-orders/order-details',
      draft: draft({ warranty: warranty() }),
      entityId: 'e1',
      steps: { create: 'done', update: 'done', attachments: { 'detected-0': 'done' }, photo: 'not_requested' },
      status: 'success',
      error: null,
      photoError: null,
      photoAttempted: false,
    };
    const entry = toEntry(pending, { importedAt: '2026-11-12T10:00:00.000Z', instance: 'https://homebox.example.com' });
    expect(Object.keys(entry).sort()).toEqual(
      ['entityId', 'id', 'importedAt', 'instance', 'merchantId', 'missing', 'name', 'orderNumber', 'purchaseDate', 'reason', 'status', 'v'].sort(),
    );
    const json = JSON.stringify(entry);
    expect(json).not.toContain('2028-11-03');
    expect(json).not.toContain('Garantie légale');
  });
});
