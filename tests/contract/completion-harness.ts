import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import type {
  AttachmentUpload,
  EntityField,
  EntityOut,
  EntityUpdate,
  TagSummary,
} from '@/background/homebox/types';
import { createOrchestrator } from '@/background/import/orchestrator';
import type { FetchedPhoto } from '@/background/import/photo-fetch';
import { pendingStore } from '@/background/import/pending-store';
import { fail, ok, type Result } from '@/shared/errors';
import type { CompletionChoice, CompletionKey, ImportDraft, PendingImport } from '@/shared/types';
import { PDF_B64, draft, photoOk } from './orchestrator-harness';

/**
 * Spec 021: a simulated HomeBox that keeps its items the way the real one does (a PUT replaces the whole item, an
 * attachment gets the normalised file name as title, a primary photo removes the primary flag of the others), so that
 * each test checks the explicit list of calls and the state left on the item. Fixed, fictitious values only.
 */

export const NUMBER = '999-0000000-0000001';
export const ITEM_ID = 'item-1';

/** Overrides of the next calls of one method: `null` keeps the simulated behaviour. */
type Queue<T> = (Result<T> | null)[];

export interface CompletionScript {
  /** Items present on the instance before the run. */
  items?: EntityOut[];
  tags?: TagSummary[];
  update?: Queue<EntityOut>;
  attach?: Queue<void>;
  get?: Queue<EntityOut>;
  listTags?: Queue<TagSummary[]>;
  /** Called before each GET /entities/{id}: lets a test change the item between two reads. */
  beforeGet?: (item: EntityOut | undefined, n: number) => void;
  photo?: Result<FetchedPhoto>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sanitize = (name: string) =>
  name
    .slice(name.lastIndexOf('/') + 1)
    .replaceAll('..', '')
    .replaceAll('\\', '');

export function fakeHomeBox(script: CompletionScript = {}) {
  const items = new Map<string, EntityOut>((script.items ?? []).map((i) => [i.id, clone(i)]));
  const tags: TagSummary[] = clone(script.tags ?? []);
  const calls: string[] = [];
  const puts: { id: string; body: EntityUpdate; before: EntityOut }[] = [];
  const uploads: { id: string; file: Omit<AttachmentUpload, 'bytes'> }[] = [];
  let gets = 0;
  let fieldN = 0;
  let attachN = 0;
  const next = <T>(queue: Queue<T> | undefined): Result<T> | null => queue?.shift() ?? null;
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name;

  function applyPut(id: string, body: EntityUpdate): EntityOut {
    const before = items.get(id)!;
    const fields: EntityField[] | undefined = body.fields?.map((f) =>
      f.id ? f : { ...f, id: `nf${++fieldN}` },
    );
    const { tagIds, parentId, entityTypeId, ...rest } = body;
    const after: EntityOut = {
      ...rest,
      id,
      name: body.name,
      attachments: before.attachments,
      tags: (tagIds ?? []).map((t) => ({ id: t, name: tagName(t) ?? t })),
      fields: fields ?? null,
      ...(parentId ? { parent: { id: parentId } } : {}),
      ...(entityTypeId ? { entityType: { id: entityTypeId } } : {}),
    };
    items.set(id, after);
    return after;
  }

  const client = {
    baseUrl: 'https://homebox.example.com',
    createEntity: vi.fn(async (data: { name: string }) => {
      calls.push('POST /entities');
      const created: EntityOut = { id: 'created', name: data.name, tags: [], attachments: [] };
      items.set(created.id, created);
      return ok(clone(created));
    }),
    createFromTemplate: vi.fn(async () => {
      calls.push('POST /templates/{id}/create-item');
      return ok({ id: 'created', name: 'x' } as EntityOut);
    }),
    getTemplate: vi.fn(async () => {
      calls.push('GET /templates/{id}');
      return fail('TEMPLATES_UNAVAILABLE');
    }),
    listLocations: vi.fn(async () => {
      calls.push('GET /entities/tree');
      return ok([]);
    }),
    searchEntities: vi.fn(async () => {
      calls.push('GET /entities?q');
      return ok([]);
    }),
    getEntity: vi.fn(async (id: string) => {
      calls.push(`GET /entities/${id}`);
      script.beforeGet?.(items.get(id), ++gets);
      const forced = next(script.get);
      if (forced) return forced;
      const item = items.get(id);
      return item ? ok(clone(item)) : fail<EntityOut>('UPDATE_FAILED', 404);
    }),
    updateEntity: vi.fn(async (id: string, body: EntityUpdate) => {
      calls.push(`PUT /entities/${id}`);
      puts.push({ id, body: clone(body), before: clone(items.get(id)!) });
      const forced = next(script.update);
      if (forced) return forced;
      return ok(clone(applyPut(id, body)));
    }),
    addAttachment: vi.fn(async (id: string, file: AttachmentUpload) => {
      calls.push(`POST /entities/${id}/attachments`);
      const { bytes, ...rest } = file;
      void bytes;
      uploads.push({ id, file: rest });
      const forced = next(script.attach);
      if (forced) return forced;
      const item = items.get(id)!;
      const list = [...(item.attachments ?? [])];
      if (file.primary) for (const a of list) a.primary = false;
      list.push({
        id: `att${++attachN}`,
        type: file.type,
        primary: Boolean(file.primary),
        title: sanitize(file.filename),
      });
      item.attachments = list;
      return ok(undefined);
    }),
    listTags: vi.fn(async () => {
      calls.push('GET /tags');
      return next(script.listTags) ?? ok(clone(tags));
    }),
    createTag: vi.fn(async (name: string) => {
      calls.push('POST /tags');
      const tag = { id: `tag-${tags.length + 1}`, name };
      tags.push(tag);
      return ok(tag);
    }),
  };
  return { client, calls, puts, uploads, items, tags };
}

export function completionSetup(script: CompletionScript = {}) {
  fakeBrowser.reset();
  const hb = fakeHomeBox(script);
  const rememberLocation = vi.fn(async (id: string) => {
    void id;
  });
  const states: PendingImport[] = [];
  let n = 0;
  const orchestrator = createOrchestrator({
    client: hb.client as unknown as HomeBoxClient,
    store: pendingStore,
    downloadDetected: async () => ok({ base64: PDF_B64 }),
    fetchPhoto: async () => script.photo ?? ok(photoOk),
    rememberLocation,
    notify: (p) => states.push(clone(p)),
    newId: () => `p${++n}`,
  });
  return { ...hb, orchestrator, rememberLocation, states };
}

/** An item created by hand in HomeBox: location, a tag, a field, notes, a seller; no price, date nor attachment. */
export const existing = (over: Partial<EntityOut> = {}): EntityOut => ({
  id: ITEM_ID,
  name: 'Clavier sans fil Exemple Pro',
  description: 'Clavier du bureau',
  quantity: 2,
  insured: false,
  archived: false,
  notes: 'Achat en magasin',
  purchaseFrom: 'Boutique',
  purchasePrice: 0,
  purchaseDate: '',
  warrantyExpires: '',
  warrantyDetails: '',
  lifetimeWarranty: false,
  soldDate: '2026-10-01',
  soldTo: 'Acheteur Exemple',
  soldPrice: 20,
  soldNotes: 'Vendu',
  syncChildEntityLocations: true,
  parent: { id: 'loc-1' },
  entityType: { id: 'type-item' },
  tags: [{ id: 't-bureau', name: 'Bureau' }],
  fields: [
    {
      id: 'f1',
      name: 'Merchant',
      type: 'text',
      textValue: 'Boutique',
      numberValue: 0,
      booleanValue: false,
    },
  ],
  attachments: [],
  ...over,
});

/** Draft of the summary for a product completed instead of created (location null, no template). */
export function completeDraft(
  keys: CompletionKey[],
  over: Partial<ImportDraft> = {},
  choice: Partial<CompletionChoice> = {},
): ImportDraft {
  return draft({
    tags: [{ name: 'Amazon' }],
    photo: {
      url: 'https://m.media-amazon.com/images/I/test-1._SL1000_.jpg',
      merchantId: 'amazon.fr',
      include: true,
    },
    ...over,
    location: null,
    complete: { entityId: ITEM_ID, itemName: 'Clavier sans fil Exemple Pro', keys, ...choice },
  });
}

export const firstOf = (r: Result<PendingImport[]>): PendingImport => {
  if (!r.ok) throw new Error(`import refused: ${r.error}`);
  return r.value[0]!;
};
