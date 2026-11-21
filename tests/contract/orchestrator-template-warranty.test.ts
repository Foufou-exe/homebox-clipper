import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import type { EntityOut, TemplateOut } from '@/background/homebox/types';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { normalizeTemplate } from '@/background/templates/normalize';
import { ok } from '@/shared/errors';
import type { TemplateChoice, WarrantyDraft } from '@/shared/types';
import { PDF_B64, draft, photoOk } from './orchestrator-harness';

/**
 * Warranty on the template path (spec 018, Q-C4, FR-013, invariant 6): the warranty shown (spec 011 first, otherwise
 * the template) is sent explicitly; the path without template keeps `warrantyPatch`. Fixed values, no snapshot.
 */
const TEMPLATE: TemplateOut = {
  id: 'tpl-1',
  name: 'Livre',
  updatedAt: '2026-11-01T10:00:00Z',
  defaultLifetimeWarranty: true,
  defaultWarrantyDetails: 'Garantie éditeur',
  fields: [],
};
/** What HomeBox copied from the template on the created object (and an older date, for the path without template). */
const CREATED: EntityOut = {
  id: 'e1',
  name: 'x',
  parent: { id: 'loc-1' },
  tags: [],
  lifetimeWarranty: true,
  warrantyDetails: 'Garantie éditeur',
  warrantyExpires: '2030-01-01',
};

let FP = '';
beforeAll(async () => {
  const res = await normalizeTemplate(TEMPLATE);
  if (!res.ok) throw new Error('fixture');
  FP = res.value.fingerprint;
});

function run() {
  fakeBrowser.reset();
  const puts: Record<string, unknown>[] = [];
  const client = {
    baseUrl: 'https://homebox.example.com',
    getTemplate: async () => ok(TEMPLATE),
    createFromTemplate: async () => ok({ ...CREATED }),
    createEntity: async () => ok({ ...CREATED }),
    updateEntity: async (_id: string, data: Record<string, unknown>) => {
      puts.push(data);
      return ok({ id: 'e1', name: 'x' });
    },
    getEntity: async () => ok({ id: 'e1', name: 'x', fields: [] }),
    addAttachment: async () => ok(undefined),
    listLocations: async () => ok([]),
    searchEntities: async () => ok([]),
    listTags: async () => ok([]),
    createTag: async () => ok({ id: 't', name: 't' }),
  };
  const orchestrator = createOrchestrator({
    client: client as unknown as HomeBoxClient,
    store: {
      save: (p) => pendingStore.save(p),
      get: (id) => pendingStore.get(id),
      purge: (p) => pendingStore.purge(p),
    },
    downloadDetected: async () => ok({ base64: PDF_B64 }),
    fetchPhoto: async () => ok(photoOk),
    notify: () => {},
    newId: () => 'p1',
  });
  return { orchestrator, puts };
}

const choice = (): TemplateChoice => ({
  id: 'tpl-1',
  name: 'Livre',
  fingerprint: FP,
  insured: false,
  manufacturer: '',
  modelNumber: '',
  fields: [],
});
const w = (over: Partial<WarrantyDraft>): WarrantyDraft => ({
  origin: 'legal',
  expires: null,
  lifetime: false,
  details: '',
  durationMonths: 24,
  edited: false,
  ...over,
});
const LOC = { id: 'loc-1', path: ['Maison'] };

describe('orchestrator — warranty on the template path (FR-013)', () => {
  it('spec 011 warranty (dated) + lifetime template: lifetimeWarranty false, the 011 date sent', async () => {
    const { orchestrator, puts } = run();
    await orchestrator.startImport(
      5,
      [
        draft({
          location: LOC,
          template: choice(),
          warranty: w({ expires: '2027-10-22', details: 'Garantie légale' }),
        }),
      ],
      [],
    );
    expect(puts[0]).toMatchObject({
      lifetimeWarranty: false,
      warrantyExpires: '2027-10-22',
      warrantyDetails: 'Garantie légale',
    });
  });

  it('no 011 warranty, warranty of origin template shown: the template values sent explicitly', async () => {
    const warranty = w({
      origin: 'template',
      lifetime: true,
      details: 'Garantie éditeur',
      durationMonths: null,
    });
    const { orchestrator, puts } = run();
    await orchestrator.startImport(5, [draft({ location: LOC, template: choice(), warranty })], []);
    expect(puts[0]).toMatchObject({ lifetimeWarranty: true, warrantyDetails: 'Garantie éditeur' });
    expect(Object.keys(puts[0]!)).not.toContain('warrantyExpires');
  });

  it('warranty null: lifetimeWarranty false explicitly, no date, no details (the copies of HomeBox are removed)', async () => {
    const { orchestrator, puts } = run();
    await orchestrator.startImport(
      5,
      [draft({ location: LOC, template: choice(), warranty: null })],
      [],
    );
    expect(puts[0]!.lifetimeWarranty).toBe(false);
    expect(Object.keys(puts[0]!)).not.toContain('warrantyExpires');
    expect(Object.keys(puts[0]!)).not.toContain('warrantyDetails');
  });

  it('path without template: warrantyPatch unchanged, a warranty already on the object is not overwritten', async () => {
    const { orchestrator, puts } = run();
    await orchestrator.startImport(
      5,
      [
        draft({
          location: LOC,
          warranty: w({ expires: '2027-10-22', details: 'Garantie légale' }),
        }),
      ],
      [],
    );
    expect(puts[0]).toMatchObject({
      lifetimeWarranty: true,
      warrantyExpires: '2030-01-01',
      warrantyDetails: 'Garantie éditeur',
    });
  });
});
