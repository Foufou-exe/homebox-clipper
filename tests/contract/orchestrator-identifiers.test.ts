import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import type { TemplateOut } from '@/background/homebox/types';
import { identifiersPatch } from '@/background/import/identifiers-patch';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { normalizeTemplate } from '@/background/templates/normalize';
import { ok } from '@/shared/errors';
import type { ProductIdentifiers } from '@/shared/identifiers';
import { PDF_B64, draft, err, photoOk, setup } from './orchestrator-harness';

/**
 * Spec 027 (contracts/import-identifiers.md): the confirmed manufacturer, model and serial number ride on the purchase
 * PUT, only for a property the item does not already have. Fixed, fictional values; no snapshot.
 */
const ALL: ProductIdentifiers = {
  manufacturer: 'Fabricant Fictif',
  modelNumber: 'MOD-0001',
  serialNumber: 'SN-FICTIF-01',
};
const putBody = (client: ReturnType<typeof setup>['client'], i = 0) =>
  (client.updateEntity.mock.calls[i]?.[1] ?? {}) as Record<string, unknown>;

describe('identifiersPatch (FR-011, D4)', () => {
  it('no identifiers: no key at all', () => {
    expect(identifiersPatch(undefined, { id: 'e1', name: 'x' })).toEqual({});
  });

  it('every value for an item without them', () => {
    expect(
      identifiersPatch(ALL, { id: 'e1', name: 'x', manufacturer: '', modelNumber: '   ' }),
    ).toEqual(ALL);
  });

  it('never replaces a value already present', () => {
    const current = { id: 'e1', name: 'x', manufacturer: 'Déjà Là', serialNumber: 'SN-EXISTANT' };
    expect(identifiersPatch(ALL, current)).toEqual({ modelNumber: 'MOD-0001' });
  });
});

describe('orchestrator — identifiers on the purchase PUT (US1, US2, US4)', () => {
  it('the three values are sent by the PUT; no extra request', async () => {
    const { client, orchestrator } = setup();
    const res = await orchestrator.startImport(1, [draft({ identifiers: ALL })], []);
    expect(res.ok && res.value[0]?.status).toBe('success');
    expect(client.updateEntity).toHaveBeenCalledTimes(1);
    expect(putBody(client)).toMatchObject(ALL);
    expect(client.getEntity).not.toHaveBeenCalled();
  });

  it('a serial number alone is sent alone', async () => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(
      1,
      [draft({ identifiers: { serialNumber: 'SN-FICTIF-01' } })],
      [],
    );
    const body = putBody(client);
    expect(body.serialNumber).toBe('SN-FICTIF-01');
    expect(Object.keys(body)).not.toContain('manufacturer');
    expect(Object.keys(body)).not.toContain('modelNumber');
  });

  it('without identifiers the PUT has none of the three keys (FR-012)', async () => {
    const { client, orchestrator } = setup();
    await orchestrator.startImport(1, [draft()], []);
    const keys = Object.keys(putBody(client));
    expect(keys).not.toContain('manufacturer');
    expect(keys).not.toContain('modelNumber');
    expect(keys).not.toContain('serialNumber');
  });

  it('retry after a failed PUT: the item is read again and a value set meanwhile is kept (US4-2)', async () => {
    const { client, orchestrator } = setup({
      update: [err('UPDATE_FAILED', 500)],
      get: [ok({ id: 'e1', name: 'x', manufacturer: 'Saisi Dans HomeBox' })],
    });
    const first = await orchestrator.startImport(1, [draft({ identifiers: ALL })], []);
    const p = first.ok ? first.value[0] : undefined;
    expect(p?.status).toBe('partial');
    const retry = await orchestrator.retryImport(p!.id);
    expect(retry.ok && retry.value.status).toBe('success');
    const body = putBody(client, 1);
    expect(body.manufacturer).toBe('Saisi Dans HomeBox');
    expect(body).toMatchObject({ modelNumber: 'MOD-0001', serialNumber: 'SN-FICTIF-01' });
  });

  it('a completed item (spec 021) carrying identifiers is refused before any request (FR-013)', async () => {
    const { client, orchestrator } = setup();
    const complete = { entityId: 'item-1', itemName: 'Clavier', keys: ['photo' as const] };
    const res = await orchestrator.startImport(1, [draft({ identifiers: ALL, complete })], []);
    expect(res.ok).toBe(false);
    expect(client.createEntity).not.toHaveBeenCalled();
    expect(client.updateEntity).not.toHaveBeenCalled();
  });
});

describe('orchestrator — identifiers on the template path (D3)', () => {
  const TEMPLATE: TemplateOut = {
    id: 'tpl-1',
    name: 'Appareil',
    updatedAt: '2026-11-01T10:00:00Z',
    fields: [],
  };
  let fingerprint = '';
  beforeAll(async () => {
    const res = await normalizeTemplate(TEMPLATE);
    if (!res.ok) throw new Error('fixture');
    fingerprint = res.value.fingerprint;
  });

  it('the serial number joins the template PUT; manufacturer and model come from the template section', async () => {
    fakeBrowser.reset();
    const puts: Record<string, unknown>[] = [];
    const client = {
      baseUrl: 'https://homebox.example.com',
      getTemplate: async () => ok(TEMPLATE),
      createFromTemplate: async () =>
        ok({ id: 'e1', name: 'x', parent: { id: 'loc-1' }, tags: [] }),
      updateEntity: async (_id: string, data: Record<string, unknown>) => {
        puts.push(data);
        return ok({ id: 'e1', name: 'x' });
      },
      getEntity: async () => ok({ id: 'e1', name: 'x', fields: [] }),
      addAttachment: async () => ok(undefined),
      listLocations: async () => ok([]),
    };
    const orchestrator = createOrchestrator({
      client: client as unknown as HomeBoxClient,
      store: pendingStore,
      downloadDetected: async () => ok({ base64: PDF_B64 }),
      fetchPhoto: async () => ok(photoOk),
      notify: () => {},
      newId: () => 'p1',
    });
    const template = {
      id: 'tpl-1',
      name: 'Appareil',
      fingerprint,
      insured: false,
      manufacturer: 'Fabricant Fictif',
      modelNumber: 'MOD-0001',
      fields: [],
    };
    const d = draft({
      location: { id: 'loc-1', path: ['Maison'] },
      template,
      identifiers: { serialNumber: 'SN-FICTIF-01' },
    });
    const res = await orchestrator.startImport(1, [d], []);
    expect(res.ok && res.value[0]?.status).toBe('success');
    expect(puts[0]).toMatchObject({
      manufacturer: 'Fabricant Fictif',
      modelNumber: 'MOD-0001',
      serialNumber: 'SN-FICTIF-01',
    });
  });
});
