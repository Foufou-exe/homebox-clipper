import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import type {
  AttachmentUpload,
  EntityField,
  TemplateOut,
  TreeItem,
} from '@/background/homebox/types';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import type { FetchedPhoto } from '@/background/import/photo-fetch';
import { orderFieldSettings } from '@/background/order-fields/settings';
import { normalizeTemplate } from '@/background/templates/normalize';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import type {
  DraftPhoto,
  ImportDraft,
  OrderFieldValue,
  PendingImport,
  TemplateChoice,
} from '@/shared/types';
import { PDF_B64, draft, photoOk } from './orchestrator-harness';

/**
 * Call sequence of the orchestrator WITH order fields (spec 019, Q-C3, contracts/import-order-fields.md §2 to §5).
 * Local copy of the recorder of `orchestrator-call-sequence.test.ts` and `orchestrator-template-sequence.test.ts`;
 * the shared harness is only used for its fixed draft. Every expectation is a fixed value written by hand
 * (`toEqual`): no snapshot, no git reference. Fictitious values only.
 */
type Script = {
  getTemplate?: Result<unknown>[];
  createFromTemplate?: Result<unknown>[];
  create?: Result<unknown>[];
  update?: Result<unknown>[];
  attach?: Result<void>[];
  get?: Result<unknown>[];
  search?: Result<unknown[]>[];
  tags?: Result<unknown[]>[];
};
type Trace = [string, ...unknown[]][];

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const upload = (f: AttachmentUpload) => ({ ...f, bytes: `<${f.bytes.length} bytes>` });
const err = (code: ErrorCode, status?: number) => fail(code, status);

const NUMBER = '000-0000000-0000000';
const ORDER_URL = 'https://www.amazon.fr/gp/your-account/order-details';
const NOTES = `Commande Amazon.fr : ${NUMBER}\n${ORDER_URL}`;
const LOC = { id: 'loc-1', path: ['Maison', 'Bureau'] };
const ORDER: OrderFieldValue[] = [
  { role: 'orderNumber', name: 'Order number', value: NUMBER },
  { role: 'merchant', name: 'Merchant', value: 'Amazon.fr' },
  { role: 'orderUrl', name: 'Order URL', value: ORDER_URL },
];
const text = (name: string, textValue: string, id?: string): EntityField => ({
  ...(id === undefined ? {} : { id }),
  type: 'text',
  name,
  textValue,
  numberValue: 0,
  booleanValue: false,
});
/** The three order fields as created by the PUT (no id). */
const SENT = [
  text('Order number', NUMBER),
  text('Merchant', 'Amazon.fr'),
  text('Order URL', ORDER_URL),
];
/** The three order fields as read back after the PUT. */
const READ = [
  text('Order number', NUMBER, 'n1'),
  text('Merchant', 'Amazon.fr', 'n2'),
  text('Order URL', ORDER_URL, 'n3'),
];
const COULEUR = text('Couleur', 'Rouge', 'f9');

function recorder(script: Script) {
  fakeBrowser.reset();
  const trace: Trace = [];
  const rec = (call: string, ...args: unknown[]) => trace.push([call, ...args.map(clone)]);
  let n = 0;
  const next = <T>(queue: Result<T>[] | undefined, fallback: () => Result<T>) =>
    Promise.resolve(queue?.shift() ?? fallback());
  const client = {
    baseUrl: 'https://homebox.example.com',
    getTemplate: async (id: string) => {
      rec('client.getTemplate', id);
      return next(script.getTemplate, () => ok(LIVRE));
    },
    createFromTemplate: async (id: string, body: unknown) => {
      rec('client.createFromTemplate', id, body);
      return next(script.createFromTemplate, () =>
        ok({ id: `e${++n}`, name: 'x', parent: { id: 'loc-1' }, tags: [], fields: CREATED_FIELDS }),
      );
    },
    createEntity: async (data: unknown) => {
      rec('client.createEntity', data);
      return next(script.create, () => ok({ id: `e${++n}`, name: 'x', parent: { id: 'loc-1' } }));
    },
    updateEntity: async (id: string, data: unknown) => {
      rec('client.updateEntity', id, data);
      return next(script.update, () => ok({ id, name: 'x' }));
    },
    getEntity: async (id: string) => {
      rec('client.getEntity', id);
      return next(script.get, () => ok({ id, name: 'x', tags: [], fields: READ }));
    },
    addAttachment: async (id: string, file: AttachmentUpload) => {
      rec('client.addAttachment', id, upload(file));
      return next(script.attach, () => ok(undefined));
    },
    listLocations: async () => {
      rec('client.listLocations');
      return ok([] as TreeItem[]);
    },
    searchEntities: async (q: string) => {
      rec('client.searchEntities', q);
      return next(script.search, () => ok([]));
    },
    listTags: async () => {
      rec('client.listTags');
      return next(script.tags, () => ok([{ id: 'tag-1', name: 'Livres' }]));
    },
    createTag: async (name: string) => {
      rec('client.createTag', name);
      return ok({ id: 'tag-new', name });
    },
  };
  const store = {
    save: async (p: PendingImport) => {
      rec('store.save', p);
      await pendingStore.save(p);
    },
    get: async (id: string) => {
      rec('store.get', id);
      return pendingStore.get(id);
    },
    purge: async (p: PendingImport) => {
      rec('store.purge', p);
      await pendingStore.purge(p);
    },
  };
  let id = 0;
  const orchestrator = createOrchestrator({
    client: client as unknown as HomeBoxClient,
    store,
    downloadDetected: async (tabId: number, url: string) => {
      rec('downloadDetected', tabId, url);
      return ok({ base64: PDF_B64 });
    },
    fetchPhoto: async (photo: DraftPhoto) => {
      rec('fetchPhoto', photo);
      return ok(photoOk as FetchedPhoto);
    },
    notify: (p) => rec('notify', p),
    newId: () => `p${++id}`,
  });
  return { orchestrator, trace };
}

/** Template « Livre » whose text field « Order number » is merged with the order field (removed from `fields`). */
const LIVRE: TemplateOut = {
  id: 'tpl-1',
  name: 'Livre',
  updatedAt: '2026-11-01T10:00:00Z',
  defaultInsured: true,
  defaultManufacturer: 'Éditions Exemple',
  fields: [
    { id: 'tf1', type: 'text', name: 'Order number', textValue: '' },
    { id: 'tf2', type: 'text', name: 'Auteur', textValue: '' },
  ],
};
/** Fields copied by HomeBox on the object created from the template. */
const CREATED_FIELDS: EntityField[] = [text('Order number', '', 'f1'), text('Auteur', '', 'f2')];

let FP = '';
beforeAll(async () => {
  const res = await normalizeTemplate(LIVRE);
  if (!res.ok) throw new Error('fixture');
  FP = res.value.fingerprint;
});

const choice = (): TemplateChoice => ({
  id: 'tpl-1',
  name: 'Livre',
  fingerprint: FP,
  insured: true,
  manufacturer: 'Éditions Exemple',
  modelNumber: '',
  fields: [
    {
      type: 'text',
      kind: 'text',
      name: 'Auteur',
      textValue: 'Jane Doe',
      numberValue: 0,
      booleanValue: false,
    },
  ],
});
const orderDraft = (over: Partial<ImportDraft> = {}): ImportDraft =>
  draft({
    orderNumber: NUMBER,
    pageUrl: ORDER_URL,
    documents: [],
    location: LOC,
    orderFields: ORDER,
    ...over,
  });
const withTemplate = (over: Partial<ImportDraft> = {}) =>
  orderDraft({ template: choice(), ...over });

const names = (trace: Trace) => trace.map((c) => c[0]);
const callsOf = (trace: Trace, name: string) => trace.filter((c) => c[0] === name);
const putsOf = (trace: Trace) =>
  callsOf(trace, 'client.updateEntity').map((c) => c[2] as Record<string, unknown>);
const savesOf = (trace: Trace) => callsOf(trace, 'store.save').map((c) => c[1] as PendingImport);
const lastSave = (trace: Trace) => savesOf(trace).at(-1)!;
const first = (r: Result<PendingImport[]>) => (r.ok ? r.value[0]! : null);

/** Purchase data of the PUT without template, for the fictitious draft. */
const PURCHASE = {
  id: 'e1',
  name: 'x',
  purchaseFrom: 'Amazon.fr',
  purchasePrice: 99.99,
  purchaseDate: '2026-10-22',
  notes: NOTES,
  parentId: 'loc-1',
};
/** Sequence of a successful product without template, documents, photo or tags. */
const SUCCESS_NAMES = [
  'store.save',
  'store.save',
  'notify',
  'store.save',
  'notify',
  'client.createEntity',
  'store.save',
  'notify',
  'client.updateEntity',
  'client.getEntity',
  'store.save',
  'notify',
  'notify',
  'store.purge',
];

describe('orchestrator — order fields (spec 019, Q-C3)', () => {
  it('O1. without template, 3 fields, object without field: 1 POST, 1 PUT with 3 fields without id, notes unchanged, 1 GET', async () => {
    const { orchestrator, trace } = recorder({});
    const res = await orchestrator.startImport(5, [orderDraft()], []);
    expect(names(trace)).toEqual(SUCCESS_NAMES);
    expect((trace[0]![1] as PendingImport).steps).toEqual({
      create: 'pending',
      update: 'pending',
      attachments: {},
      photo: 'unavailable',
      orderFields: 'pending',
    });
    expect(putsOf(trace)).toEqual([{ ...PURCHASE, fields: SENT }]);
    expect(callsOf(trace, 'client.getEntity')).toEqual([['client.getEntity', 'e1']]);
    expect(lastSave(trace).steps).toEqual({
      create: 'done',
      update: 'done',
      attachments: {},
      photo: 'unavailable',
      orderFields: 'done',
    });
    expect(first(res)?.status).toBe('success');
    expect('orderFieldsError' in first(res)!).toBe(false);
  });

  it('O1b. the notes are the same as an import without the option (SC-006, FR-021)', async () => {
    const without = recorder({});
    await without.orchestrator.startImport(5, [orderDraft({ orderFields: undefined })], []);
    const withFields = recorder({});
    await withFields.orchestrator.startImport(5, [orderDraft()], []);
    expect(putsOf(without.trace)[0]!.notes).toBe(NOTES);
    expect(putsOf(withFields.trace)[0]!.notes).toBe(NOTES);
  });

  it('O2. without template, object with a foreign field « Couleur »: copied (same id) + 3 fields; read-back OK', async () => {
    const { orchestrator, trace } = recorder({
      create: [ok({ id: 'e1', name: 'x', parent: { id: 'loc-1' }, fields: [COULEUR] })],
      get: [ok({ id: 'e1', name: 'x', fields: [COULEUR, ...READ] })],
    });
    const res = await orchestrator.startImport(5, [orderDraft()], []);
    expect(putsOf(trace)).toEqual([{ ...PURCHASE, fields: [COULEUR, ...SENT] }]);
    expect(lastSave(trace).steps.orderFields).toBe('done');
    expect(first(res)?.status).toBe('success');
  });

  it('O3. with template, « Order number » merged: create-item; template field updated in place; ONE read-back; one « Order number »', async () => {
    const { orchestrator, trace } = recorder({
      get: [
        ok({
          id: 'e1',
          name: 'x',
          tags: [],
          fields: [
            text('Order number', NUMBER, 'f1'),
            text('Auteur', 'Jane Doe', 'f2'),
            READ[1]!,
            READ[2]!,
          ],
        }),
      ],
    });
    const res = await orchestrator.startImport(5, [withTemplate()], []);
    expect(names(trace)).toEqual([
      'client.getTemplate',
      'store.save',
      'store.save',
      'notify',
      'store.save',
      'notify',
      'client.createFromTemplate',
      'store.save',
      'notify',
      'client.updateEntity',
      'client.getEntity',
      'store.save',
      'notify',
      'notify',
      'store.purge',
    ]);
    expect((trace[1]![1] as PendingImport).steps).toEqual({
      create: 'pending',
      update: 'pending',
      attachments: {},
      photo: 'unavailable',
      templateFields: 'pending',
      orderFields: 'pending',
    });
    expect(putsOf(trace)).toEqual([
      {
        ...PURCHASE,
        insured: true,
        lifetimeWarranty: false,
        manufacturer: 'Éditions Exemple',
        tagIds: [],
        fields: [
          text('Auteur', 'Jane Doe', 'f2'),
          text('Order number', NUMBER, 'f1'),
          SENT[1],
          SENT[2],
        ],
      },
    ]);
    const fields = putsOf(trace)[0]!.fields as EntityField[];
    expect(fields.filter((f) => f.name === 'Order number')).toHaveLength(1);
    expect(callsOf(trace, 'client.getEntity')).toHaveLength(1);
    expect(lastSave(trace).steps).toMatchObject({
      update: 'done',
      templateFields: 'done',
      orderFields: 'done',
    });
    expect(first(res)?.status).toBe('success');
  });

  it('O3b. with template, read-back of neither: the template error is reported first', async () => {
    const { orchestrator } = recorder({
      get: [ok({ id: 'e1', name: 'x', fields: CREATED_FIELDS })],
    });
    const p = first(await orchestrator.startImport(5, [withTemplate()], []))!;
    expect(p.steps).toMatchObject({
      update: 'done',
      templateFields: 'failed',
      orderFields: 'failed',
    });
    expect(p.error).toBe('TEMPLATE_FIELDS_FAILED');
    expect(p.templateFieldsError).toBe('TEMPLATE_FIELDS_FAILED');
    expect(p.orderFieldsError).toBe('ORDER_FIELDS_FAILED');
  });

  it('O3c. with template, PUT refused 500: fallback with the template fields only, read-back settles the template fields', async () => {
    const { orchestrator, trace } = recorder({
      update: [err('UPDATE_FAILED', 500)],
      get: [
        ok({ id: 'e1', name: 'x', fields: [CREATED_FIELDS[0]!, text('Auteur', 'Jane Doe', 'f2')] }),
      ],
    });
    const p = first(await orchestrator.startImport(5, [withTemplate()], []))!;
    const puts = putsOf(trace);
    expect(puts).toHaveLength(2);
    expect(puts[1]).toEqual({
      ...PURCHASE,
      insured: true,
      lifetimeWarranty: false,
      manufacturer: 'Éditions Exemple',
      tagIds: [],
      fields: [text('Auteur', 'Jane Doe', 'f2'), text('Order number', '', 'f1')],
    });
    expect(callsOf(trace, 'client.getEntity')).toHaveLength(1);
    expect(p.steps).toMatchObject({
      update: 'done',
      templateFields: 'done',
      orderFields: 'failed',
    });
    expect(p.status).toBe('partial');
    expect(p.error).toBe('ORDER_FIELDS_FAILED');
  });

  it('O4. PUT with fields refused 500: 2nd PUT without the order fields, built on the created object; no read-back', async () => {
    const { orchestrator, trace } = recorder({ update: [err('UPDATE_FAILED', 500)] });
    const res = await orchestrator.startImport(5, [orderDraft()], []);
    expect(names(trace)).toEqual([
      'store.save',
      'store.save',
      'notify',
      'store.save',
      'notify',
      'client.createEntity',
      'store.save',
      'notify',
      'client.updateEntity',
      'client.updateEntity',
      'store.save',
      'notify',
      'store.save',
      'notify',
    ]);
    expect(putsOf(trace)).toEqual([{ ...PURCHASE, fields: SENT }, PURCHASE]);
    const p = first(res)!;
    expect(p.steps).toEqual({
      create: 'done',
      update: 'done',
      attachments: {},
      photo: 'unavailable',
      orderFields: 'failed',
    });
    expect(p.status).toBe('partial');
    expect(p.error).toBe('ORDER_FIELDS_FAILED');
    expect(p.orderFieldsError).toBe('ORDER_FIELDS_FAILED');
  });

  it('O5. PUT with fields and tags refused 500, then refused again: 3 PUT (all; without order fields with tags; without tags)', async () => {
    const { orchestrator, trace } = recorder({
      create: [ok({ id: 'e1', name: 'x', parent: { id: 'loc-1' }, tags: [] })],
      update: [err('UPDATE_FAILED', 500), err('UPDATE_FAILED', 500)],
    });
    const res = await orchestrator.startImport(
      5,
      [orderDraft({ tags: [{ name: 'Livres', id: 'tag-1' }] })],
      [],
    );
    expect(putsOf(trace)).toEqual([
      { ...PURCHASE, tagIds: ['tag-1'], fields: SENT },
      { ...PURCHASE, tagIds: ['tag-1'] },
      { ...PURCHASE, tagIds: [] },
    ]);
    expect(callsOf(trace, 'client.getEntity')).toEqual([]);
    const p = first(res)!;
    expect(p.steps).toMatchObject({ update: 'done', tags: 'failed', orderFields: 'failed' });
    expect(p.failedTags).toEqual(['Livres']);
    expect(p.error).toBe('ORDER_FIELDS_FAILED');
  });

  it('O6. PUT lost (network, no HTTP status): no fallback; update failed, UPDATE_FAILED', async () => {
    const { orchestrator, trace } = recorder({ update: [err('HOMEBOX_UNREACHABLE')] });
    const p = first(await orchestrator.startImport(5, [orderDraft()], []))!;
    expect(putsOf(trace)).toEqual([{ ...PURCHASE, fields: SENT }]);
    expect(callsOf(trace, 'client.getEntity')).toEqual([]);
    expect(p.steps).toMatchObject({ update: 'failed', orderFields: 'failed' });
    expect(p.error).toBe('UPDATE_FAILED');
  });

  it.each([401, 403])('O6b. PUT refused %i: no fallback; UNAUTHORIZED', async (status) => {
    const { orchestrator, trace } = recorder({ update: [err('UNAUTHORIZED', status)] });
    const p = first(await orchestrator.startImport(5, [orderDraft()], []))!;
    expect(putsOf(trace)).toHaveLength(1);
    expect(p.steps).toMatchObject({ update: 'failed', orderFields: 'failed' });
    expect(p.error).toBe('UNAUTHORIZED');
  });

  it('O7. read-back mismatch, then retry: fields-only PUT on the object read again, read-back; done; no POST', async () => {
    const mismatch = [READ[0]!, text('Merchant', 'Autre', 'n2'), READ[2]!];
    const current = {
      id: 'e1',
      name: 'x',
      parent: { id: 'loc-1' },
      purchasePrice: 50,
      purchaseDate: '2026-10-22',
      purchaseFrom: 'Amazon.fr',
      notes: NOTES,
      tags: [],
      fields: mismatch,
    };
    const { orchestrator, trace } = recorder({
      get: [
        ok({ id: 'e1', name: 'x', fields: mismatch }),
        ok(current),
        ok({ ...current, fields: READ }),
      ],
    });
    const p = first(await orchestrator.startImport(5, [orderDraft()], []))!;
    expect(p.steps).toMatchObject({ update: 'done', orderFields: 'failed' });
    expect(p.status).toBe('partial');
    expect(p.error).toBe('ORDER_FIELDS_FAILED');

    trace.length = 0;
    const retried = await orchestrator.retryImport(p.id);
    expect(names(trace)).toEqual([
      'store.get',
      'store.save',
      'notify',
      'client.getEntity',
      'client.updateEntity',
      'client.getEntity',
      'store.save',
      'notify',
      'notify',
      'store.purge',
    ]);
    expect(putsOf(trace)).toEqual([
      {
        id: 'e1',
        name: 'x',
        purchaseFrom: 'Amazon.fr',
        purchasePrice: 50,
        purchaseDate: '2026-10-22',
        notes: NOTES,
        parentId: 'loc-1',
        tagIds: [],
        fields: [READ[0], text('Merchant', 'Amazon.fr', 'n2'), READ[2]],
      },
    ]);
    expect(retried.ok && retried.value.status).toBe('success');
    expect(retried.ok && retried.value.steps.orderFields).toBe('done');
    expect(retried.ok && 'orderFieldsError' in retried.value).toBe(false);
  });

  it('O7b. with template, both field steps failed, retry: ONE fields-only PUT with the template values and both lists', async () => {
    const { orchestrator, trace } = recorder({
      get: [
        ok({ id: 'e1', name: 'x', fields: CREATED_FIELDS }),
        ok({ id: 'e1', name: 'x', parent: { id: 'loc-1' }, tags: [], fields: CREATED_FIELDS }),
        ok({
          id: 'e1',
          name: 'x',
          fields: [
            text('Auteur', 'Jane Doe', 'f2'),
            text('Order number', NUMBER, 'f1'),
            READ[1]!,
            READ[2]!,
          ],
        }),
      ],
    });
    const p = first(await orchestrator.startImport(5, [withTemplate()], []))!;
    expect(p.steps).toMatchObject({ templateFields: 'failed', orderFields: 'failed' });
    trace.length = 0;
    const retried = await orchestrator.retryImport(p.id);
    expect(putsOf(trace)).toEqual([
      {
        id: 'e1',
        name: 'x',
        insured: true,
        lifetimeWarranty: false,
        manufacturer: 'Éditions Exemple',
        parentId: 'loc-1',
        tagIds: [],
        fields: [
          text('Auteur', 'Jane Doe', 'f2'),
          text('Order number', NUMBER, 'f1'),
          SENT[1],
          SENT[2],
        ],
      },
    ]);
    expect(callsOf(trace, 'client.getEntity')).toHaveLength(2);
    expect(names(trace)).not.toContain('client.getTemplate');
    expect(retried.ok && retried.value.steps).toMatchObject({
      templateFields: 'done',
      orderFields: 'done',
    });
  });

  it('O8. read-back with TWO « Order number » fields: mismatch → failed', async () => {
    const { orchestrator } = recorder({
      get: [ok({ id: 'e1', name: 'x', fields: [...READ, text('Order number', NUMBER, 'n4')] })],
    });
    const p = first(await orchestrator.startImport(5, [orderDraft()], []))!;
    expect(p.steps.orderFields).toBe('failed');
    expect(p.error).toBe('ORDER_FIELDS_FAILED');
  });

  it('O9. retry after the option was disabled and the names changed: the confirmed names and values are sent', async () => {
    const custom: OrderFieldValue[] = [
      { role: 'orderNumber', name: 'N° commande', value: NUMBER },
      { role: 'merchant', name: 'Boutique', value: 'Amazon.fr' },
    ];
    const { orchestrator, trace } = recorder({
      update: [err('HOMEBOX_UNREACHABLE')],
      get: [
        ok({ id: 'e1', name: 'x', parent: { id: 'loc-1' } }),
        ok({
          id: 'e1',
          name: 'x',
          fields: [text('N° commande', NUMBER, 'n1'), text('Boutique', 'Amazon.fr', 'n2')],
        }),
      ],
    });
    const p = first(await orchestrator.startImport(5, [orderDraft({ orderFields: custom })], []))!;
    expect(p.steps.update).toBe('failed');
    await fakeBrowser.storage.local.set({
      orderFieldsByInstance: {
        'inst-a': {
          enabled: false,
          names: { orderNumber: 'Numéro', merchant: 'Vendeur', orderUrl: 'Adresse' },
        },
      },
    });
    const settings = vi.spyOn(orderFieldSettings, 'get');
    trace.length = 0;
    const retried = await orchestrator.retryImport(p.id);
    expect(settings).not.toHaveBeenCalled();
    expect(names(trace)).toEqual([
      'store.get',
      'store.save',
      'notify',
      'client.getEntity',
      'client.updateEntity',
      'client.getEntity',
      'store.save',
      'notify',
      'notify',
      'store.purge',
    ]);
    expect(putsOf(trace)).toEqual([
      { ...PURCHASE, fields: [text('N° commande', NUMBER), text('Boutique', 'Amazon.fr')] },
    ]);
    expect(retried.ok && retried.value.steps).toMatchObject({
      update: 'done',
      orderFields: 'done',
    });
    settings.mockRestore();
  });

  it('O10. two products: each PUT carries its own values; one read-back per product', async () => {
    const other: OrderFieldValue[] = [
      { role: 'orderNumber', name: 'Order number', value: '000-0000000-0000001' },
      { role: 'merchant', name: 'Merchant', value: 'Amazon.de' },
    ];
    const { orchestrator, trace } = recorder({
      get: [
        ok({ id: 'e1', name: 'x', fields: READ }),
        ok({
          id: 'e2',
          name: 'x',
          fields: [
            text('Order number', '000-0000000-0000001', 'm1'),
            text('Merchant', 'Amazon.de', 'm2'),
          ],
        }),
      ],
    });
    const res = await orchestrator.startImport(
      5,
      [
        orderDraft(),
        orderDraft({
          name: 'Souris Exemple',
          orderNumber: '000-0000000-0000001',
          orderFields: other,
        }),
      ],
      [],
    );
    const puts = putsOf(trace);
    expect(puts.map((p) => p.fields)).toEqual([
      SENT,
      [text('Order number', '000-0000000-0000001'), text('Merchant', 'Amazon.de')],
    ]);
    expect(callsOf(trace, 'client.getEntity').map((c) => c[1])).toEqual(['e1', 'e2']);
    expect(res.ok && res.value.map((p) => p.status)).toEqual(['success', 'success']);
  });

  it('O11. orderFields ABSENT, object with « Couleur »: same sequence as today, no read-back, no new key', async () => {
    const { orchestrator, trace } = recorder({
      create: [ok({ id: 'e1', name: 'x', parent: { id: 'loc-1' }, fields: [COULEUR] })],
    });
    await orchestrator.startImport(5, [orderDraft({ orderFields: undefined })], []);
    expect(names(trace)).toEqual([
      'store.save',
      'store.save',
      'notify',
      'store.save',
      'notify',
      'client.createEntity',
      'store.save',
      'notify',
      'client.updateEntity',
      'store.save',
      'notify',
      'notify',
      'store.purge',
    ]);
    expect(putsOf(trace)).toEqual([{ ...PURCHASE, fields: [COULEUR] }]);
    for (const p of savesOf(trace)) {
      expect(Object.keys(p.draft)).not.toContain('orderFields');
      expect(Object.keys(p.steps)).not.toContain('orderFields');
      expect(Object.keys(p)).not.toContain('orderFieldsError');
    }
  });

  it('O12. uncertain creation: no field written while entityId is unknown; retry: name search, then the full sequence', async () => {
    const { orchestrator, trace } = recorder({ create: [err('HOMEBOX_UNREACHABLE')] });
    const p = first(await orchestrator.startImport(5, [orderDraft()], []))!;
    expect(p.status).toBe('failed');
    expect(p.entityId).toBeNull();
    expect(callsOf(trace, 'client.updateEntity')).toEqual([]);
    expect(p.steps.orderFields).toBe('pending');
    trace.length = 0;
    const retried = await orchestrator.retryImport(p.id);
    expect(names(trace).slice(0, 2)).toEqual(['store.get', 'client.searchEntities']);
    expect(callsOf(trace, 'client.createEntity')).toHaveLength(1);
    expect(putsOf(trace)).toEqual([{ ...PURCHASE, fields: SENT }]);
    expect(callsOf(trace, 'client.getEntity')).toEqual([['client.getEntity', 'e1']]);
    expect(retried.ok && retried.value.status).toBe('success');
  });
});
