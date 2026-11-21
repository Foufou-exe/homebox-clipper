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
import { normalizeTemplate } from '@/background/templates/normalize';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import type { DraftPhoto, ImportDraft, PendingImport, TemplateChoice } from '@/shared/types';
import { PDF_B64, draft, draftPhoto, photoOk } from './orchestrator-harness';

/**
 * Call sequence of the TEMPLATE path of the orchestrator (spec 018, Q-C3, contracts/import-templates.md §2 to §5).
 * Local copy of the recorder of `orchestrator-call-sequence.test.ts`, extended with the template methods. Every
 * expectation is a fixed value written by hand (`toEqual`): no snapshot, no git reference. Fictitious values only.
 */
type Script = {
  getTemplate?: Result<unknown>[];
  createFromTemplate?: Result<unknown>[];
  create?: Result<unknown>[];
  update?: Result<unknown>[];
  attach?: Result<void>[];
  get?: Result<unknown>[];
  tree?: Result<TreeItem[]>[];
  search?: Result<unknown[]>[];
  tags?: Result<unknown[]>[];
  createTag?: Result<unknown>[];
};

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const upload = (f: AttachmentUpload) => ({ ...f, bytes: `<${f.bytes.length} bytes>` });
const err = (code: ErrorCode, status?: number) => fail(code, status);

function recorder(script: Script) {
  fakeBrowser.reset();
  const trace: [string, ...unknown[]][] = [];
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
      return next(script.create, () => ok({ id: `e${++n}`, name: 'x', parent: undefined }));
    },
    updateEntity: async (id: string, data: unknown) => {
      rec('client.updateEntity', id, data);
      return next(script.update, () => ok({ id, name: 'x' }));
    },
    getEntity: async (id: string) => {
      rec('client.getEntity', id);
      return next(script.get, () => ok({ id, name: 'x', tags: [], fields: READ_FIELDS }));
    },
    addAttachment: async (id: string, file: AttachmentUpload) => {
      rec('client.addAttachment', id, upload(file));
      return next(script.attach, () => ok(undefined));
    },
    listLocations: async () => {
      rec('client.listLocations');
      return next(script.tree, () => ok([] as TreeItem[]));
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
      return next(script.createTag, () => ok({ id: 'tag-new', name }));
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
    rememberLocation: async (locationId: string) => {
      rec('rememberLocation', locationId);
    },
    notify: (p) => rec('notify', p),
    newId: () => `p${++id}`,
  });
  return { orchestrator, trace };
}

const LIVRE: TemplateOut = {
  id: 'tpl-1',
  name: 'Livre',
  updatedAt: '2026-11-01T10:00:00Z',
  defaultInsured: true,
  defaultManufacturer: 'Éditions Exemple',
  fields: [
    { id: 'tf1', type: 'text', name: 'Auteur', textValue: '' },
    { id: 'tf2', type: 'text', name: 'Collection', textValue: 'Poche' },
  ],
};
/** Fields copied by HomeBox on the created object (text only). */
const CREATED_FIELDS: EntityField[] = [
  { id: 'f1', type: 'text', name: 'Auteur', textValue: '', numberValue: 0, booleanValue: false },
  {
    id: 'f2',
    type: 'text',
    name: 'Collection',
    textValue: 'Poche',
    numberValue: 0,
    booleanValue: false,
  },
];
/** Fields read back after the PUT: the confirmed values. */
const READ_FIELDS: EntityField[] = [
  {
    id: 'f1',
    type: 'text',
    name: 'Auteur',
    textValue: 'Jane Doe',
    numberValue: 0,
    booleanValue: false,
  },
  {
    id: 'f2',
    type: 'text',
    name: 'Collection',
    textValue: 'Poche',
    numberValue: 0,
    booleanValue: false,
  },
];

let FP = '';
beforeAll(async () => {
  const res = await normalizeTemplate(LIVRE);
  if (!res.ok) throw new Error('fixture');
  FP = res.value.fingerprint;
});

const LOC = { id: 'loc-1', path: ['Maison', 'Bureau'] };
const choice = (over: Partial<TemplateChoice> = {}): TemplateChoice => ({
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
    {
      type: 'text',
      kind: 'text',
      name: 'Collection',
      textValue: 'Poche',
      numberValue: 0,
      booleanValue: false,
    },
  ],
  ...over,
});
const withTemplate = (over: Partial<ImportDraft> = {}): ImportDraft =>
  draft({
    photo: draftPhoto(),
    location: LOC,
    tags: [{ name: 'Livres', id: 'tag-1' }],
    template: choice(),
    ...over,
  });

const names = (trace: [string, ...unknown[]][]) => trace.map((c) => c[0]);
const callsOf = (trace: [string, ...unknown[]][], name: string) =>
  trace.filter((c) => c[0] === name);
const pendingOf = (r: Result<PendingImport[]>) => (r.ok ? r.value[0]! : null);

describe('orchestrator — template path (spec 018)', () => {
  it('T1. full import: exact sequence, create-item instead of POST /entities, PUT with the template values, read-back', async () => {
    const { orchestrator, trace } = recorder({});
    const res = await orchestrator.startImport(5, [withTemplate()], [], 'loc-1');
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
      'client.listTags',
      'client.updateEntity',
      'client.getEntity',
      'store.save',
      'notify',
      'downloadDetected',
      'client.addAttachment',
      'store.save',
      'notify',
      'fetchPhoto',
      'store.save',
      'notify',
      'client.addAttachment',
      'store.save',
      'notify',
      'notify',
      'store.purge',
      'rememberLocation',
    ]);
    expect(trace[0]).toEqual(['client.getTemplate', 'tpl-1']);
    const firstSave = trace[1]![1] as PendingImport;
    expect(firstSave.steps).toEqual({
      create: 'pending',
      update: 'pending',
      attachments: { 'detected-0': 'pending' },
      photo: 'pending',
      tags: 'pending',
      templateFields: 'pending',
    });
    expect(firstSave.draft.template).toEqual(choice());
    expect((trace[4]![1] as PendingImport).createAttempted).toBe(true);
    expect(callsOf(trace, 'client.createFromTemplate')).toEqual([
      [
        'client.createFromTemplate',
        'tpl-1',
        {
          name: 'Clavier sans fil Exemple Pro',
          description: 'Acheté sur Amazon.fr le 22/10/2026',
          quantity: 1,
          parentId: 'loc-1',
        },
      ],
    ]);
    const put = callsOf(trace, 'client.updateEntity')[0]!;
    expect(put[1]).toBe('e1');
    expect(put[2]).toEqual({
      id: 'e1',
      name: 'x',
      insured: true,
      lifetimeWarranty: false,
      purchaseFrom: 'Amazon.fr',
      purchasePrice: 99.99,
      purchaseDate: '2026-10-22',
      notes: expect.stringContaining('999-0000000-0000001'),
      parentId: 'loc-1',
      tagIds: ['tag-1'],
      fields: [
        {
          id: 'f1',
          type: 'text',
          name: 'Auteur',
          textValue: 'Jane Doe',
          numberValue: 0,
          booleanValue: false,
        },
        {
          id: 'f2',
          type: 'text',
          name: 'Collection',
          textValue: 'Poche',
          numberValue: 0,
          booleanValue: false,
        },
      ],
      manufacturer: 'Éditions Exemple',
    });
    expect(callsOf(trace, 'client.getEntity')).toEqual([['client.getEntity', 'e1']]);
    expect((trace[12]![1] as PendingImport).steps).toMatchObject({
      update: 'done',
      tags: 'done',
      templateFields: 'done',
    });
    expect(names(trace)).not.toContain('client.createEntity');
    expect(pendingOf(res)?.status).toBe('success');
  });

  it('T2. template deleted before creation: TEMPLATE_NOT_FOUND, one read, nothing persisted nor created', async () => {
    const { orchestrator, trace } = recorder({ getTemplate: [err('TEMPLATE_NOT_FOUND', 404)] });
    expect(await orchestrator.startImport(5, [withTemplate()], [], 'loc-1')).toEqual({
      ok: false,
      error: 'TEMPLATE_NOT_FOUND',
    });
    expect(names(trace)).toEqual(['client.getTemplate']);
  });

  it('T2b. other read error: that code, nothing persisted', async () => {
    const { orchestrator, trace } = recorder({ getTemplate: [err('HOMEBOX_UNREACHABLE')] });
    expect(await orchestrator.startImport(5, [withTemplate()], [])).toEqual({
      ok: false,
      error: 'HOMEBOX_UNREACHABLE',
    });
    expect(names(trace)).toEqual(['client.getTemplate']);
  });

  it('T3. template changed in a batch of 3 products: TEMPLATE_CHANGED, nothing created for any of them', async () => {
    const { orchestrator, trace } = recorder({
      getTemplate: [ok({ ...LIVRE, name: 'Livre modifié' })],
    });
    const res = await orchestrator.startImport(
      5,
      [withTemplate(), withTemplate({ name: 'Roman B' }), draft({ name: 'Sans modèle' })],
      [],
    );
    expect(res).toEqual({ ok: false, error: 'TEMPLATE_CHANGED' });
    expect(names(trace)).toEqual(['client.getTemplate']);
  });

  it('T4. mixed batch « Livre » × 2 + « None »: one template read; the third follows the path without template', async () => {
    const { orchestrator, trace } = recorder({
      get: [
        ok({ id: 'e1', name: 'x', tags: [], fields: READ_FIELDS }),
        ok({ id: 'e2', name: 'x', tags: [], fields: READ_FIELDS }),
      ],
    });
    const plain = draft({ name: 'Souris Exemple' });
    const res = await orchestrator.startImport(
      5,
      [
        withTemplate({ photo: null, tags: undefined }),
        withTemplate({ name: 'Roman B', photo: null, tags: undefined }),
        plain,
      ],
      [],
    );
    expect(callsOf(trace, 'client.getTemplate')).toEqual([['client.getTemplate', 'tpl-1']]);
    expect(
      callsOf(trace, 'client.createFromTemplate').map((c) => (c[2] as { name: string }).name),
    ).toEqual(['Clavier sans fil Exemple Pro', 'Roman B']);
    const creates = callsOf(trace, 'client.createEntity');
    expect(creates).toHaveLength(1);
    expect(Object.keys(creates[0]![1] as object)).toEqual(['name', 'description', 'quantity']);
    const puts = callsOf(trace, 'client.updateEntity');
    expect(puts).toHaveLength(3);
    const third = puts[2]![2] as Record<string, unknown>;
    expect(third).toEqual({
      id: 'e3',
      name: 'x',
      purchaseFrom: 'Amazon.fr',
      purchasePrice: 99.99,
      purchaseDate: '2026-10-22',
      notes: expect.stringContaining('999-0000000-0000001'),
    });
    const savedThird = callsOf(trace, 'store.save')
      .map((c) => c[1] as PendingImport)
      .filter((p) => p.id === 'p3');
    for (const p of savedThird) {
      expect(Object.keys(p.draft)).not.toContain('template');
      expect(Object.keys(p.steps)).not.toContain('templateFields');
    }
    expect(res.ok && res.value.map((p) => p.status)).toEqual(['success', 'success', 'success']);
  });

  it('T5. read-back mismatch: templateFields failed, partial; retry = fields step only, no creation, no template read', async () => {
    const { orchestrator, trace } = recorder({
      get: [
        ok({
          id: 'e1',
          name: 'x',
          tags: [],
          fields: [{ ...READ_FIELDS[0]!, textValue: 'Autre' }, READ_FIELDS[1]!],
        }),
        // retry: current object, then read-back
        ok({
          id: 'e1',
          name: 'x',
          tags: [{ id: 'tag-1' }],
          parent: { id: 'loc-1' },
          fields: [{ ...READ_FIELDS[0]!, textValue: 'Autre' }, READ_FIELDS[1]!],
        }),
        ok({ id: 'e1', name: 'x', tags: [{ id: 'tag-1' }], fields: READ_FIELDS }),
      ],
    });
    const first = await orchestrator.startImport(5, [withTemplate({ photo: null })], [], 'loc-1');
    const p = pendingOf(first)!;
    expect(p.status).toBe('partial');
    expect(p.error).toBe('TEMPLATE_FIELDS_FAILED');
    expect(p.steps).toMatchObject({
      create: 'done',
      update: 'done',
      tags: 'done',
      templateFields: 'failed',
    });
    expect(p.templateFieldsError).toBe('TEMPLATE_FIELDS_FAILED');
    expect(p.entityId).toBe('e1');

    trace.length = 0;
    const retry = await orchestrator.retryImport(p.id);
    expect(names(trace).filter((n) => n.startsWith('client.'))).toEqual([
      'client.getEntity',
      'client.updateEntity',
      'client.getEntity',
    ]);
    const put = callsOf(trace, 'client.updateEntity')[0]![2] as Record<string, unknown>;
    expect(put).toEqual({
      id: 'e1',
      name: 'x',
      insured: true,
      lifetimeWarranty: false,
      manufacturer: 'Éditions Exemple',
      parentId: 'loc-1',
      tagIds: ['tag-1'],
      fields: [
        {
          id: 'f1',
          type: 'text',
          name: 'Auteur',
          textValue: 'Jane Doe',
          numberValue: 0,
          booleanValue: false,
        },
        {
          id: 'f2',
          type: 'text',
          name: 'Collection',
          textValue: 'Poche',
          numberValue: 0,
          booleanValue: false,
        },
      ],
    });
    expect(retry.ok && retry.value.status).toBe('success');
    expect(retry.ok && retry.value.steps.templateFields).toBe('done');
  });

  it('T5b. tags and fields both remaining: a single PUT combines them', async () => {
    const { orchestrator, trace } = recorder({
      get: [
        // start: read-back mismatch
        ok({ id: 'e1', name: 'x', tags: [], fields: [] }),
        // retry: current object, then read-back
        ok({ id: 'e1', name: 'x', tags: [], fields: CREATED_FIELDS }),
        ok({ id: 'e1', name: 'x', tags: [{ id: 'tag-1' }], fields: READ_FIELDS }),
      ],
      tags: [err('TAGS_UNAVAILABLE', 500), ok([{ id: 'tag-1', name: 'Livres' }])],
    });
    const first = await orchestrator.startImport(5, [withTemplate({ photo: null })], []);
    const p = pendingOf(first)!;
    expect(p.steps).toMatchObject({ update: 'done', tags: 'failed', templateFields: 'failed' });
    trace.length = 0;
    const retry = await orchestrator.retryImport(p.id);
    const puts = callsOf(trace, 'client.updateEntity');
    expect(puts).toHaveLength(1);
    expect(puts[0]![2]).toMatchObject({
      tagIds: ['tag-1'],
      fields: expect.any(Array),
      insured: true,
    });
    expect(retry.ok && retry.value.status).toBe('success');
  });

  it('T6. creation response lost: uncertain; retry searches the name, re-checks the template, a single object', async () => {
    const { orchestrator, trace } = recorder({ createFromTemplate: [err('HOMEBOX_UNREACHABLE')] });
    const first = await orchestrator.startImport(
      5,
      [withTemplate({ photo: null, tags: undefined })],
      [],
    );
    const p = pendingOf(first)!;
    expect(p.status).toBe('failed');
    expect(p.createUncertain).toBe(true);
    trace.length = 0;
    const retry = await orchestrator.retryImport(p.id);
    expect(names(trace).filter((n) => n.startsWith('client.'))).toEqual([
      'client.searchEntities',
      'client.getTemplate',
      'client.createFromTemplate',
      'client.updateEntity',
      'client.getEntity',
      'client.addAttachment',
    ]);
    expect(retry.ok && retry.value.status).toBe('success');
  });

  it.each<[string, Result<unknown>, ErrorCode]>([
    ['changed', ok({ ...LIVRE, updatedAt: '2026-11-02T10:00:00Z' }), 'TEMPLATE_CHANGED'],
    ['deleted', err('TEMPLATE_NOT_FOUND', 404), 'TEMPLATE_NOT_FOUND'],
  ])(
    'T6b. template %s at the retry: no creation, the import stays failed and abandonable',
    async (_label, read, code) => {
      const { orchestrator, trace } = recorder({
        createFromTemplate: [err('HOMEBOX_UNREACHABLE')],
        getTemplate: [ok(LIVRE), read],
      });
      const first = await orchestrator.startImport(
        5,
        [withTemplate({ photo: null, tags: undefined })],
        [],
      );
      const p = pendingOf(first)!;
      trace.length = 0;
      const res = await orchestrator.retryImport(p.id);
      expect(res).toEqual({ ok: false, error: code });
      expect(names(trace).filter((n) => n.startsWith('client.'))).toEqual([
        'client.searchEntities',
        'client.getTemplate',
      ]);
      expect((await pendingStore.get(p.id))?.status).toBe('failed');
      expect(await orchestrator.abandonImport(p.id)).toEqual({ ok: true, value: undefined });
    },
  );

  it('T7. PUT refused (500): update and templateFields failed; with tags, the fallback PUT keeps the template values; then retry', async () => {
    const { orchestrator, trace } = recorder({
      update: [err('UPDATE_FAILED', 500), err('UPDATE_FAILED', 500)],
      get: [
        ok({ id: 'e1', name: 'x', tags: [], parent: { id: 'loc-1' }, fields: CREATED_FIELDS }),
        ok({ id: 'e1', name: 'x', tags: [{ id: 'tag-1' }], fields: READ_FIELDS }),
      ],
    });
    const first = await orchestrator.startImport(5, [withTemplate({ photo: null })], []);
    const p = pendingOf(first)!;
    expect(p.steps).toMatchObject({ update: 'failed', templateFields: 'failed', tags: 'failed' });
    expect(p.templateFieldsError).toBe('TEMPLATE_FIELDS_FAILED');
    expect(p.error).toBe('UPDATE_FAILED');
    const puts = callsOf(trace, 'client.updateEntity');
    expect(puts).toHaveLength(2);
    expect(puts[0]![2]).toMatchObject({
      tagIds: ['tag-1'],
      insured: true,
      manufacturer: 'Éditions Exemple',
      fields: expect.any(Array),
    });
    // Fallback PUT (FR-012 of 014): only the current tags of the object, without the added ones.
    expect((puts[1]![2] as { tagIds?: string[] }).tagIds ?? []).toEqual([]);
    expect(puts[1]![2]).toMatchObject({
      insured: true,
      manufacturer: 'Éditions Exemple',
      lifetimeWarranty: false,
      fields: expect.any(Array),
    });
    expect(names(trace)).not.toContain('client.getEntity');
    trace.length = 0;
    const retry = await orchestrator.retryImport(p.id);
    expect(names(trace).filter((n) => n.startsWith('client.'))).toEqual([
      'client.listTags',
      'client.getEntity',
      'client.updateEntity',
      'client.getEntity',
    ]);
    expect(retry.ok && retry.value.status).toBe('success');
  });

  it('defense: a pending import with template and no location (retry) → BAD_MESSAGE, create failed, no request', async () => {
    const { orchestrator, trace } = recorder({});
    const pending: PendingImport = {
      id: 'p9',
      tabId: 5,
      pageUrl: null,
      draft: withTemplate({ location: null, photo: null, tags: undefined }),
      entityId: null,
      steps: {
        create: 'pending',
        update: 'pending',
        attachments: { 'detected-0': 'pending' },
        photo: 'unavailable',
        templateFields: 'pending',
      },
      status: 'failed',
      error: null,
      photoError: null,
      photoAttempted: false,
    };
    await pendingStore.save(pending);
    expect(await orchestrator.retryImport('p9')).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(names(trace).filter((n) => n.startsWith('client.'))).toEqual([]);
    const saved = await pendingStore.get('p9');
    expect(saved?.steps.create).toBe('failed');
    expect(saved?.error).toBe('BAD_MESSAGE');
  });

  it('defense: retry asking for no location on an import with template → BAD_MESSAGE before any request', async () => {
    const { orchestrator, trace } = recorder({
      createFromTemplate: [err('CREATE_FAILED', 500)],
      tree: [ok([{ id: 'loc-1', name: 'Bureau', type: 'location' }])],
    });
    const first = await orchestrator.startImport(
      5,
      [withTemplate({ photo: null, tags: undefined })],
      [],
    );
    const p = pendingOf(first)!;
    trace.length = 0;
    expect(await orchestrator.retryImport(p.id, [], null)).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
    expect(names(trace).filter((n) => n.startsWith('client.'))).toEqual([]);
  });

  it('defense: a batch with a template and no location → BAD_MESSAGE, no request', async () => {
    const { orchestrator, trace } = recorder({});
    expect(await orchestrator.startImport(5, [withTemplate({ location: null })], [])).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
    expect(trace).toEqual([]);
  });

  it('definite failure of create-item: template read again; 404 → TEMPLATE_NOT_FOUND', async () => {
    const { orchestrator, trace } = recorder({
      createFromTemplate: [err('CREATE_FAILED', 404)],
      getTemplate: [ok(LIVRE), err('TEMPLATE_NOT_FOUND', 404)],
    });
    const first = await orchestrator.startImport(
      5,
      [withTemplate({ photo: null, tags: undefined })],
      [],
    );
    expect(pendingOf(first)?.error).toBe('TEMPLATE_NOT_FOUND');
    expect(pendingOf(first)?.steps.create).toBe('failed');
    expect(names(trace).filter((n) => n.startsWith('client.'))).toEqual([
      'client.getTemplate',
      'client.createFromTemplate',
      'client.getTemplate',
    ]);
  });

  it('definite failure of create-item, template still there: location re-read (LOCATION_NOT_FOUND / CREATE_FAILED)', async () => {
    const { orchestrator, trace } = recorder({
      createFromTemplate: [err('CREATE_FAILED', 404), err('CREATE_FAILED', 500)],
      tree: [ok([]), ok([{ id: 'loc-1', name: 'Bureau', type: 'location' }])],
    });
    const a = await orchestrator.startImport(
      5,
      [withTemplate({ photo: null, tags: undefined })],
      [],
    );
    expect(pendingOf(a)?.error).toBe('LOCATION_NOT_FOUND');
    const b = await orchestrator.startImport(
      5,
      [withTemplate({ photo: null, tags: undefined })],
      [],
    );
    expect(pendingOf(b)?.error).toBe('CREATE_FAILED');
    expect(names(trace)).not.toContain('client.createEntity');
  });

  it('noCreate tag missing from the list: not created, fails alone (TAG_FAILED)', async () => {
    const { orchestrator, trace } = recorder({ tags: [ok([])] });
    const res = await orchestrator.startImport(
      5,
      [withTemplate({ photo: null, tags: [{ name: 'Livres', id: 'tag-1', noCreate: true }] })],
      [],
    );
    expect(names(trace)).not.toContain('client.createTag');
    expect(pendingOf(res)?.failedTags).toEqual(['Livres']);
    expect(pendingOf(res)?.steps.templateFields).toBe('done');
  });
});
