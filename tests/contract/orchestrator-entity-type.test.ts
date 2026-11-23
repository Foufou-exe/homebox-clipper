import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import type { EntityTypeSummaryOut, TreeItem } from '@/background/homebox/types';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { normalizeTemplate } from '@/background/templates/normalize';
import { fail, ok, type Result } from '@/shared/errors';
import type { PendingImport, TemplateChoice } from '@/shared/types';
import { PDF_B64, draft } from './orchestrator-harness';

/**
 * Entity type in the import (spec 023, contracts/homebox-entity-types.md §2, §3 and runtime-messages.md §3). Every
 * expectation is a fixed value written by hand. Fictitious values only.
 */
const TYPES: EntityTypeSummaryOut[] = [
  { id: 'et-item', name: 'Item', isLocation: false },
  { id: 'et-tool', name: 'Outil', isLocation: false },
  { id: 'et-room', name: 'Pièce', isLocation: true },
];

function build(opts: {
  create?: Result<unknown>[];
  createFromTemplate?: Result<unknown>[];
  types?: Result<EntityTypeSummaryOut[]>;
  tree?: TreeItem[];
  remember?: (id: string | null) => Promise<void>;
}) {
  fakeBrowser.reset();
  const trace: [string, ...unknown[]][] = [];
  let n = 0;
  const client = {
    baseUrl: 'https://homebox.example.com',
    createEntity: async (data: unknown) => {
      trace.push(['createEntity', JSON.parse(JSON.stringify(data))]);
      return opts.create?.shift() ?? ok({ id: `e${++n}`, name: 'x' });
    },
    createFromTemplate: async (id: string, data: unknown) => {
      trace.push(['createFromTemplate', id, JSON.parse(JSON.stringify(data))]);
      return (
        opts.createFromTemplate?.shift() ??
        ok({ id: `e${++n}`, name: 'x', parent: { id: 'loc-1' }, tags: [], fields: [] })
      );
    },
    getTemplate: async (id: string) => {
      trace.push(['getTemplate', id]);
      return ok({ id, name: 'Livre', fields: [] });
    },
    listEntityTypes: async () => {
      trace.push(['listEntityTypes']);
      return opts.types ?? ok(TYPES);
    },
    listLocations: async () => {
      trace.push(['listLocations']);
      return ok(opts.tree ?? []);
    },
    updateEntity: async (id: string) => {
      trace.push(['updateEntity', id]);
      return ok({ id, name: 'x' });
    },
    getEntity: async (id: string) => {
      trace.push(['getEntity', id]);
      return ok({ id, name: 'x', entityType: { id: 'et-tool' }, tags: [] });
    },
    addAttachment: async () => ok(undefined),
    searchEntities: async () => ok([]),
  };
  let id = 0;
  const rememberEntityType = vi.fn(opts.remember ?? (async () => {}));
  const orchestrator = createOrchestrator({
    client: client as unknown as HomeBoxClient,
    store: pendingStore,
    downloadDetected: async () => ok({ base64: PDF_B64 }),
    fetchPhoto: async () => fail('PHOTO_UNAVAILABLE'),
    rememberEntityType,
    notify: () => {},
    newId: () => `p${++id}`,
  });
  return { orchestrator, trace, rememberEntityType };
}

const names = (trace: [string, ...unknown[]][]) => trace.map((t) => t[0]);
const created = (trace: [string, ...unknown[]][]) =>
  trace.filter((t) => t[0] === 'createEntity').map((t) => t[1]);
const noDoc = { documents: [] };

describe('entity type: creation bodies', () => {
  it('a draft with a type sends entityTypeId in POST /entities', async () => {
    const { orchestrator, trace } = build({});
    await orchestrator.startImport(1, [draft({ ...noDoc, entityTypeId: 'et-tool' })], []);
    expect(created(trace)).toEqual([
      {
        name: 'Clavier sans fil Exemple Pro',
        description: 'Acheté sur Amazon.fr le 22/10/2026',
        quantity: 1,
        entityTypeId: 'et-tool',
      },
    ]);
  });

  it('a draft without a type sends exactly the body of before and never reads the types', async () => {
    const { orchestrator, trace } = build({});
    await orchestrator.startImport(1, [draft(noDoc)], []);
    expect(created(trace)).toEqual([
      {
        name: 'Clavier sans fil Exemple Pro',
        description: 'Acheté sur Amazon.fr le 22/10/2026',
        quantity: 1,
      },
    ]);
    expect(Object.keys(created(trace)[0] as object)).not.toContain('entityTypeId');
    expect(names(trace)).not.toContain('listEntityTypes');
  });

  it('a location and a type: parentId and entityTypeId together', async () => {
    const { orchestrator, trace } = build({});
    await orchestrator.startImport(
      1,
      [draft({ ...noDoc, entityTypeId: 'et-tool', location: { id: 'loc-1', path: ['Maison'] } })],
      [],
    );
    expect(created(trace)[0]).toMatchObject({ parentId: 'loc-1', entityTypeId: 'et-tool' });
  });

  it('the template path carries the type too (create-item)', async () => {
    const detail = await normalizeTemplate({ id: 'tpl-1', name: 'Livre', fields: [] });
    if (!detail.ok) throw new Error('fixture');
    const template: TemplateChoice = {
      id: 'tpl-1',
      name: 'Livre',
      fingerprint: detail.value.fingerprint,
      insured: false,
      manufacturer: '',
      modelNumber: '',
      fields: [],
    };
    const { orchestrator, trace } = build({});
    await orchestrator.startImport(
      1,
      [
        draft({
          ...noDoc,
          template,
          entityTypeId: 'et-tool',
          location: { id: 'loc-1', path: ['Maison'] },
        }),
      ],
      [],
    );
    const call = trace.find((t) => t[0] === 'createFromTemplate');
    expect(call?.[1]).toBe('tpl-1');
    expect(call?.[2]).toEqual({
      name: 'Clavier sans fil Exemple Pro',
      description: 'Acheté sur Amazon.fr le 22/10/2026',
      quantity: 1,
      parentId: 'loc-1',
      entityTypeId: 'et-tool',
    });
  });

  it('a completed product never carries a type (defense): refused before any request', async () => {
    const { orchestrator, trace } = build({});
    const complete = { entityId: 'item-1', itemName: 'Clavier', keys: [] };
    const res = await orchestrator.startImport(
      1,
      [draft({ ...noDoc, complete, entityTypeId: 'et-tool' })],
      [],
    );
    expect(res).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(trace).toEqual([]);
  });
});

describe('entity type: definite creation failure', () => {
  it('404 with a type that no longer exists (or is a location type) → ENTITY_TYPE_NOT_FOUND', async () => {
    const { orchestrator, trace } = build({
      create: [fail('CREATE_FAILED', 404)],
      types: ok([{ id: 'et-item', name: 'Item', isLocation: false }]),
    });
    const res = await orchestrator.startImport(
      1,
      [draft({ ...noDoc, entityTypeId: 'et-gone' })],
      [],
    );
    expect(res.ok && res.value[0]?.error).toBe('ENTITY_TYPE_NOT_FOUND');
    expect(res.ok && res.value[0]?.status).toBe('failed');
    expect(names(trace)).toContain('listEntityTypes');
  });

  it('the type still exists → CREATE_FAILED', async () => {
    const { orchestrator } = build({ create: [fail('CREATE_FAILED', 500)] });
    const res = await orchestrator.startImport(
      1,
      [draft({ ...noDoc, entityTypeId: 'et-tool' })],
      [],
    );
    expect(res.ok && res.value[0]?.error).toBe('CREATE_FAILED');
  });

  it('the types cannot be read again → CREATE_FAILED', async () => {
    const { orchestrator } = build({
      create: [fail('CREATE_FAILED', 404)],
      types: fail('ENTITY_TYPES_UNAVAILABLE'),
    });
    const res = await orchestrator.startImport(
      1,
      [draft({ ...noDoc, entityTypeId: 'et-tool' })],
      [],
    );
    expect(res.ok && res.value[0]?.error).toBe('CREATE_FAILED');
  });

  it('a draft without a type never reads the types after a failure', async () => {
    const { orchestrator, trace } = build({ create: [fail('CREATE_FAILED', 404)] });
    const res = await orchestrator.startImport(1, [draft(noDoc)], []);
    expect(res.ok && res.value[0]?.error).toBe('CREATE_FAILED');
    expect(names(trace)).not.toContain('listEntityTypes');
  });

  it('an unreadable 2xx answer (uncertain creation) is not turned into ENTITY_TYPE_NOT_FOUND', async () => {
    const { orchestrator, trace } = build({
      create: [fail('CREATE_FAILED', 201)],
      types: ok([{ id: 'et-item', name: 'Item', isLocation: false }]),
    });
    const res = await orchestrator.startImport(
      1,
      [draft({ ...noDoc, entityTypeId: 'et-gone' })],
      [],
    );
    expect(res.ok && res.value[0]?.error).toBe('CREATE_FAILED');
    expect(names(trace)).not.toContain('listEntityTypes');
  });

  it('the retry sends the same type again', async () => {
    const { orchestrator, trace } = build({ create: [fail('CREATE_FAILED', 500)] });
    const res = await orchestrator.startImport(
      1,
      [draft({ ...noDoc, entityTypeId: 'et-tool' })],
      [],
    );
    const pending = res.ok ? (res.value[0] as PendingImport) : null;
    await orchestrator.retryImport(pending!.id);
    expect(created(trace).map((b) => (b as { entityTypeId?: string }).entityTypeId)).toEqual([
      'et-tool',
      'et-tool',
    ]);
  });
});

describe('entity type: memory of the last type', () => {
  it('remembers the type of the last created product', async () => {
    const { orchestrator, rememberEntityType } = build({});
    await orchestrator.startImport(
      1,
      [
        draft({ ...noDoc, entityTypeId: 'et-tool' }),
        draft({ ...noDoc, name: 'B', entityTypeId: 'et-book' }),
      ],
      [],
    );
    expect(rememberEntityType).toHaveBeenCalledTimes(1);
    expect(rememberEntityType).toHaveBeenCalledWith('et-book');
  });

  it('remembers null (memory erased) when the server default was used', async () => {
    const { orchestrator, rememberEntityType } = build({});
    await orchestrator.startImport(1, [draft(noDoc)], [], null, true);
    expect(rememberEntityType).toHaveBeenCalledWith(null);
  });

  it('never erases the memory when the type list was not read (transient failure at opening)', async () => {
    const { orchestrator, rememberEntityType } = build({});
    await orchestrator.startImport(1, [draft(noDoc)], []);
    expect(rememberEntityType).not.toHaveBeenCalled();
  });

  it('a chosen type is remembered even without the read flag', async () => {
    const { orchestrator, rememberEntityType } = build({});
    await orchestrator.startImport(1, [draft({ ...noDoc, entityTypeId: 'et-tool' })], []);
    expect(rememberEntityType).toHaveBeenCalledWith('et-tool');
  });

  it('writes nothing when no object was created', async () => {
    const { orchestrator, rememberEntityType } = build({ create: [fail('CREATE_FAILED', 500)] });
    await orchestrator.startImport(1, [draft({ ...noDoc, entityTypeId: 'et-tool' })], []);
    expect(rememberEntityType).not.toHaveBeenCalled();
  });

  it('a write error never interrupts the import', async () => {
    const { orchestrator } = build({
      remember: async () => {
        throw new Error('storage');
      },
    });
    const res = await orchestrator.startImport(
      1,
      [draft({ ...noDoc, entityTypeId: 'et-tool' })],
      [],
    );
    expect(res.ok && res.value[0]?.status).toBe('success');
  });
});
