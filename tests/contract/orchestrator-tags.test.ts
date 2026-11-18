import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { HomeBoxClient } from '@/background/homebox/client';
import type {
  AttachmentUpload,
  EntityOut,
  EntityUpdate,
  TagSummary,
} from '@/background/homebox/types';
import { toEntry } from '@/background/history/entry';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import type { ImportDraft, ImportHistoryEntry, PendingImport, TagChoice } from '@/shared/types';
import { draft } from './orchestrator-harness';

/**
 * Application of the tags during the import (spec 014, Q-C2, contracts/import-tags.md T-1 to T-13).
 * Own simulated client (orchestrator-harness.ts is not modified): it keeps the tags of each object the way
 * HomeBox does (a PUT replaces the whole set), so T-13 checks every PUT against the real current tags.
 * Fixed, fictitious values only.
 */

type Step<T> = Result<T> | (() => Result<T>);
const run = <T>(s: Step<T>) => (typeof s === 'function' ? s() : s);

interface Script {
  create?: Step<EntityOut>[];
  /** Overrides of the next PUTs (a failure is returned without changing the object). */
  update?: (Step<EntityOut> | null)[];
  list?: Step<TagSummary[]>[];
  createTag?: Step<TagSummary>[];
  /** Tags already on an object before the run (e.g. added by the user in HomeBox). */
  seedTags?: Record<string, string[]>;
  /** `absent`: the object read from HomeBox has no `tags` field at all (review 014, point 3). Default: an array. */
  tagsField?: 'array' | 'absent' | 'null';
}

interface Put {
  id: string;
  data: EntityUpdate;
  /** Tags of the object just before this PUT. */
  before: string[];
}

function fakeClient(script: Script) {
  const calls: string[] = [];
  const puts: Put[] = [];
  const entities = new Map<string, { id: string; name: string; tags: string[] }>();
  for (const [id, tags] of Object.entries(script.seedTags ?? {}))
    entities.set(id, { id, name: 'x', tags: [...tags] });
  let n = 0;
  let tagN = 0;
  const out = (id: string): EntityOut => {
    const e = entities.get(id)!;
    if (script.tagsField === 'absent') return { id, name: e.name };
    // Go: a nil slice is serialised as null, and a nil slice is always empty.
    if (script.tagsField === 'null' && e.tags.length === 0) return { id, name: e.name, tags: null } as unknown as EntityOut;
    return { id, name: e.name, tags: e.tags.map((t) => ({ id: t })) };
  };
  const client = {
    baseUrl: 'https://homebox.example.com',
    createEntity: vi.fn(async (data: { name: string }) => {
      calls.push('createEntity');
      const next = script.create?.shift();
      if (next) {
        const r = run(next);
        if (r.ok) entities.set(r.value.id, { id: r.value.id, name: data.name, tags: [] });
        return r;
      }
      const id = `e${++n}`;
      entities.set(id, { id, name: data.name, tags: [] });
      return ok(out(id));
    }),
    getEntity: vi.fn(async (id: string) => {
      calls.push('getEntity');
      if (!entities.has(id)) entities.set(id, { id, name: 'x', tags: [] });
      return ok(out(id));
    }),
    updateEntity: vi.fn(async (id: string, data: EntityUpdate) => {
      calls.push('updateEntity');
      const e = entities.get(id) ?? { id, name: 'x', tags: [] };
      entities.set(id, e);
      puts.push({ id, data: structuredClone(data), before: [...e.tags] });
      const override = script.update?.shift();
      if (override) {
        const r = run(override);
        if (!r.ok) return r;
      }
      // HomeBox: the PUT replaces the whole set of tags (an absent tagIds removes them all).
      e.tags = [...(data.tagIds ?? [])];
      return ok(out(id));
    }),
    addAttachment: vi.fn(async (id: string, file: AttachmentUpload) => {
      void id;
      void file;
      calls.push('addAttachment');
      return ok(undefined);
    }),
    listTags: vi.fn(async () => {
      calls.push('listTags');
      const next = script.list?.shift();
      return next ? run(next) : ok([] as TagSummary[]);
    }),
    createTag: vi.fn(async (name: string) => {
      calls.push(`createTag:${name}`);
      const next = script.createTag?.shift();
      return next ? run(next) : ok({ id: `tNew${++tagN === 1 ? '' : tagN}`, name });
    }),
    listLocations: vi.fn(async () => ok([])),
    searchEntities: vi.fn(async () => ok([])),
    getStatus: vi.fn(),
    checkAuth: vi.fn(),
  };
  return { client, calls, puts, entities };
}

const CTX = { importedAt: '2026-11-18T10:00:00.000Z', instance: 'https://homebox.example.com' };

function setup(script: Script = {}) {
  fakeBrowser.reset();
  const fake = fakeClient(script);
  const history: ImportHistoryEntry[] = [];
  let id = 0;
  const orchestrator = createOrchestrator({
    client: fake.client as unknown as HomeBoxClient,
    store: pendingStore,
    downloadDetected: vi.fn(async () => ok({ base64: '' })),
    fetchPhoto: vi.fn(async () => fail('PHOTO_UNAVAILABLE')),
    history: {
      start: async (p) => void history.push(toEntry(p, CTX)),
      update: async (p) => void history.push(toEntry(p, CTX)),
    },
    notify: () => {},
    newId: () => `p${++id}`,
  });
  return { ...fake, orchestrator, history };
}

/** A product without document or photo: only the create, tag and PUT calls remain. */
const product = (tags?: TagChoice[], over: Partial<ImportDraft> = {}): ImportDraft =>
  draft({ documents: [], ...(tags === undefined ? {} : { tags }), ...over });

const err = (code: ErrorCode, status?: number) => fail(code, status);
const sessionKeys = async () => Object.keys(await fakeBrowser.storage.session.get(null));
const start = async (s: ReturnType<typeof setup>, drafts: ImportDraft[]) => {
  const res = await s.orchestrator.startImport(1, drafts, []);
  if (!res.ok) throw new Error(res.error);
  return res.value;
};

/** T-13: never `tagIds: undefined`, and every `tagIds` sent keeps all the current tags of the object. */
function expectNoTagRemoved(puts: Put[]) {
  for (const put of puts) {
    if ('tagIds' in put.data) {
      expect(Array.isArray(put.data.tagIds)).toBe(true);
      for (const current of put.before) expect(put.data.tagIds).toContain(current);
    } else {
      // No key: the object had no tag to keep (entityOutToUpdate copies the current tags otherwise).
      expect(put.before).toEqual([]);
    }
  }
}

let debug: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('T-1 (existing tag): create, list, PUT with the tag', () => {
  it('exact order createEntity (body without tagIds), listTags, updateEntity with tagIds; success, purge', async () => {
    const s = setup({ list: [ok([{ id: 't1', name: 'Amazon' }])] });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }])]);
    expect(s.calls).toEqual(['createEntity', 'listTags', 'updateEntity']);
    expect(s.client.createEntity.mock.calls[0]![0]).not.toHaveProperty('tagIds');
    expect(s.puts[0]!.data.tagIds).toEqual(['t1']);
    expect(p!.status).toBe('success');
    expect(p!.steps.tags).toBe('done');
    expect(p!.failedTags).toBeUndefined();
    expect(await sessionKeys()).toEqual([]);
    expectNoTagRemoved(s.puts);
  });
});

describe('T-3: without tags, nothing changes', () => {
  it.each([
    ['tags absent', undefined],
    ['tags []', [] as TagChoice[]],
  ])('%s: no tag call, no tagIds key, no steps.tags', async (_label, tags) => {
    // Object without a tags field, like the simulated client of the call-sequence snapshot.
    const s = setup({ tagsField: 'absent' });
    const [p] = await start(s, [product(tags)]);
    expect(s.calls).toEqual(['createEntity', 'updateEntity']);
    expect(s.client.listTags).not.toHaveBeenCalled();
    expect(s.client.createTag).not.toHaveBeenCalled();
    expect('tagIds' in s.puts[0]!.data).toBe(false);
    expect(Object.keys(p!.steps).sort()).toEqual(['attachments', 'create', 'photo', 'update']);
    expect(p!).not.toHaveProperty('failedTags');
    expect(p!.status).toBe('success');
    expectNoTagRemoved(s.puts);
  });
});

describe('T-4: unreadable list', () => {
  it('object created, purchase PUT without added tagIds, partial TAGS_UNAVAILABLE; retry applies the tags only', async () => {
    const s = setup({
      list: [
        err('TAGS_UNAVAILABLE', 500),
        ok([
          { id: 't1', name: 'Amazon' },
          { id: 't2', name: 'Bureau' },
        ]),
      ],
    });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }, { name: 'Bureau' }])]);
    expect(s.calls).toEqual(['createEntity', 'listTags', 'updateEntity']);
    // No added tag: only the current tags of the object (none) are copied.
    expect(s.puts[0]!.data.tagIds ?? []).toEqual([]);
    expect(s.puts[0]!.data.purchasePrice).toBe(99.99);
    expect(p!.status).toBe('partial');
    expect(p!.error).toBe('TAGS_UNAVAILABLE');
    expect(p!.steps.update).toBe('done');
    expect(p!.steps.tags).toBe('failed');
    expect(p!.failedTags).toEqual(['Amazon', 'Bureau']);

    s.calls.length = 0;
    const retry = await s.orchestrator.retryImport(p!.id);
    expect(retry.ok).toBe(true);
    const r = (retry as { value: PendingImport }).value;
    expect(s.calls).toEqual(['listTags', 'getEntity', 'updateEntity']);
    expect(s.puts[1]!.data.tagIds).toEqual(['t1', 't2']);
    expect(s.client.createEntity).toHaveBeenCalledTimes(1);
    expect(r.status).toBe('success');
    expect(r.steps.tags).toBe('done');
    expect(r.failedTags).toBeUndefined();
    expectNoTagRemoved(s.puts);
  });
});

describe('T-6: PUT refused because of the tags, replayed without them', () => {
  it('400 then 200: purchase data saved, update done, tags failed, TAG_FAILED, partial', async () => {
    const s = setup({
      list: [ok([{ id: 't1', name: 'Amazon' }])],
      update: [err('UPDATE_FAILED', 400)],
    });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }])]);
    expect(s.calls).toEqual(['createEntity', 'listTags', 'updateEntity', 'updateEntity']);
    expect(s.puts[0]!.data.tagIds).toEqual(['t1']);
    // Replayed without the added tags: only the current tags of the object (none) are copied.
    expect(s.puts[1]!.data.tagIds ?? []).toEqual([]);
    expect(s.puts[1]!.data.purchasePrice).toBe(99.99);
    expect(s.puts[1]!.data.purchaseDate).toBe('2026-10-22');
    expect(p!.steps.update).toBe('done');
    expect(p!.steps.tags).toBe('failed');
    expect(p!.failedTags).toEqual(['Amazon']);
    expect(p!.error).toBe('TAG_FAILED');
    expect(p!.status).toBe('partial');
    expectNoTagRemoved(s.puts);
  });

  it('401 on the PUT with tags: no replay, UNAUTHORIZED reported first', async () => {
    const s = setup({
      list: [ok([{ id: 't1', name: 'Amazon' }])],
      update: [err('UNAUTHORIZED', 401)],
    });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }])]);
    expect(s.calls).toEqual(['createEntity', 'listTags', 'updateEntity']);
    expect(p!.steps.update).toBe('failed');
    expect(p!.steps.tags).toBe('failed');
    expect(p!.failedTags).toEqual(['Amazon']);
    expect(p!.error).toBe('UNAUTHORIZED');
    expect(p!.status).toBe('partial');
  });

  it('network failure on the PUT with tags: no replay, UPDATE_FAILED reported first', async () => {
    const s = setup({
      list: [ok([{ id: 't1', name: 'Amazon' }])],
      update: [err('HOMEBOX_UNREACHABLE')],
    });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }])]);
    expect(s.calls).toEqual(['createEntity', 'listTags', 'updateEntity']);
    expect(p!.error).toBe('UPDATE_FAILED');
    expect(p!.steps.tags).toBe('failed');
  });
});

describe('T-7: tags already on the object are never removed (FR-007)', () => {
  it('object read again on retry with tags [old] → tagIds starts with old', async () => {
    const s = setup({ list: [err('TAGS_UNAVAILABLE', 500), ok([{ id: 't1', name: 'Amazon' }])] });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }])]);
    expect(p!.status).toBe('partial');
    // Meanwhile, the user adds a tag in HomeBox.
    s.entities.get(p!.entityId!)!.tags = ['old'];
    const retry = await s.orchestrator.retryImport(p!.id);
    expect(retry.ok).toBe(true);
    const last = s.puts.at(-1)!;
    expect(last.data.tagIds).toEqual(['old', 't1']);
    expect(s.entities.get(p!.entityId!)!.tags).toEqual(['old', 't1']);
    expectNoTagRemoved(s.puts);
  });

  it('PUT replayed without the added tags keeps the current tags of the object', async () => {
    const s = setup({
      list: [err('TAGS_UNAVAILABLE', 500), ok([{ id: 't1', name: 'Amazon' }])],
      update: [null, err('UPDATE_FAILED', 400)],
    });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }])]);
    s.entities.get(p!.entityId!)!.tags = ['old'];
    await s.orchestrator.retryImport(p!.id);
    expect(s.puts.at(-1)!.data.tagIds).toEqual(['old', 't1']);
    expect(s.entities.get(p!.entityId!)!.tags).toEqual(['old']);
    expectNoTagRemoved(s.puts);
  });
});

describe('T-9 / T-10: matching against the fresh list', () => {
  it('T-9: id t1 absent from the fresh list, « amazon » present under t9 → t9', async () => {
    const s = setup({ list: [ok([{ id: 't9', name: 'amazon' }])] });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }])]);
    expect(s.puts[0]!.data.tagIds).toEqual(['t9']);
    expect(s.client.createTag).not.toHaveBeenCalled();
    expect(p!.status).toBe('success');
  });

  it('T-10: « Ecran » (a) then « Écran » (b), choice « ÉCRAN » without id → a, no creation', async () => {
    const s = setup({
      list: [
        ok([
          { id: 'a', name: 'Ecran' },
          { id: 'b', name: 'Écran' },
        ]),
      ],
    });
    const [p] = await start(s, [product([{ name: 'ÉCRAN' }])]);
    expect(s.puts[0]!.data.tagIds).toEqual(['a']);
    expect(s.client.createTag).not.toHaveBeenCalled();
    expect(p!.status).toBe('success');
  });
});

describe('T-11: the creation of the object fails', () => {
  it('no tag call, failed, steps.tags unchanged', async () => {
    const s = setup({ create: [err('CREATE_FAILED', 500)] });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }])]);
    expect(s.calls).toEqual(['createEntity']);
    expect(s.client.listTags).not.toHaveBeenCalled();
    expect(s.client.createTag).not.toHaveBeenCalled();
    expect(p!.status).toBe('failed');
    expect(p!.steps.tags).toBe('pending');
    expect(p!.failedTags).toBeUndefined();
  });
});

describe('T-12: no tag name in the logs or in the history', () => {
  it('success, unreadable list and failed PUT: logs and history entries never contain a tag name', async () => {
    const names = ['Amazon', 'Informatique', 'Bureau'];
    const tags = names.map((name) => ({ name }));
    for (const script of [
      {
        list: [
          ok([
            { id: 't1', name: 'Amazon' },
            { id: 't2', name: 'Informatique' },
            { id: 't3', name: 'Bureau' },
          ]),
        ],
      },
      { list: [err('TAGS_UNAVAILABLE', 500)] },
      { list: [ok([{ id: 't1', name: 'Amazon' }])], update: [err('UPDATE_FAILED', 400)] },
    ] as Script[]) {
      const s = setup(script);
      await start(s, [product(tags, { name: 'Disque SSD Exemple 1 To' })]);
      const logs = JSON.stringify([...debug.mock.calls, ...warn.mock.calls]);
      const history = JSON.stringify(s.history);
      expect(s.history.length).toBeGreaterThan(0);
      for (const name of names) {
        expect(logs).not.toContain(name);
        expect(history).not.toContain(name);
      }
      expect(history).not.toMatch(/"tags"|"failedTags"/);
    }
  });
});

describe('T-13: never tagIds undefined, never a removed tag', () => {
  it.each([
    ['without tags', undefined, {}],
    ['with tags', [{ name: 'Amazon', id: 't1' }], { list: [ok([{ id: 't1', name: 'Amazon' }])] }],
    ['unreadable list', [{ name: 'Amazon' }], { list: [err('TAGS_UNAVAILABLE', 500)] }],
    [
      'PUT refused',
      [{ name: 'Amazon', id: 't1' }],
      { list: [ok([{ id: 't1', name: 'Amazon' }])], update: [err('UPDATE_FAILED', 400)] },
    ],
  ] as [string, TagChoice[] | undefined, Script][])('%s', async (_label, tags, script) => {
    const s = setup(script);
    const [p] = await start(s, [product(tags)]);
    expect(s.puts.length).toBeGreaterThan(0);
    for (const put of s.puts)
      expect(Object.entries(put.data).some(([k, v]) => k === 'tagIds' && v === undefined)).toBe(
        false,
      );
    expectNoTagRemoved(s.puts);
    // Retry with tags already on the object.
    if (p!.status === 'partial') {
      s.entities.get(p!.entityId!)!.tags = ['old'];
      await s.orchestrator.retryImport(p!.id);
      expectNoTagRemoved(s.puts);
    }
  });
});

// Replaces the transitional US1 test (« Cuisine » not created): the only expectation of this file that changes (T055).
describe('a tag without a match is created then applied (US3)', () => {
  it('« Cuisine » absent: created once, then applied with the existing tag', async () => {
    const s = setup({ list: [ok([{ id: 't1', name: 'Amazon' }])] });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }, { name: 'Cuisine' }])]);
    expect(s.client.createTag).toHaveBeenCalledTimes(1);
    expect(s.client.createTag).toHaveBeenCalledWith('Cuisine');
    expect(s.puts[0]!.data.tagIds).toEqual(['t1', 'tNew']);
    expect(p!.steps.tags).toBe('done');
    expect(p!.failedTags).toBeUndefined();
    expect(p!.status).toBe('success');
  });
});

describe('T-1 (complete): existing and new tag', () => {
  it('exact order createEntity (without tagIds), listTags, createTag, updateEntity with [t1, tNew]; success, purge', async () => {
    const s = setup({ list: [ok([{ id: 't1', name: 'Amazon' }])] });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }, { name: 'Informatique' }])]);
    expect(s.calls).toEqual(['createEntity', 'listTags', 'createTag:Informatique', 'updateEntity']);
    expect(s.client.createEntity.mock.calls[0]![0]).not.toHaveProperty('tagIds');
    expect(s.puts[0]!.data.tagIds).toEqual(['t1', 'tNew']);
    expect(p!.status).toBe('success');
    expect(await sessionKeys()).toEqual([]);
    expectNoTagRemoved(s.puts);
  });
});

describe('T-2: one creation per call (FR-013)', () => {
  it('three products sharing the new tag « Bureau »: one listTags, one createTag, three PUTs with its id', async () => {
    const s = setup();
    const results = await start(s, [
      product([{ name: 'Bureau' }], { name: 'Clé USB Exemple' }),
      product([{ name: 'bureau' }], { name: 'Disque SSD Exemple 1 To' }),
      product([{ name: 'BUREAU' }], { name: 'Écran sans fil' }),
    ]);
    expect(s.client.listTags).toHaveBeenCalledTimes(1);
    expect(s.client.createTag).toHaveBeenCalledTimes(1);
    expect(s.client.createTag).toHaveBeenCalledWith('Bureau');
    expect(s.puts.map((x) => x.data.tagIds)).toEqual([['tNew'], ['tNew'], ['tNew']]);
    expect(results.map((r) => r.status)).toEqual(['success', 'success', 'success']);
  });

  it('a failed creation is not retried within the same call', async () => {
    const s = setup({ createTag: [err('TAG_FAILED', 422)] });
    const results = await start(s, [product([{ name: 'Bureau' }]), product([{ name: 'Bureau' }])]);
    expect(s.client.createTag).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.failedTags)).toEqual([['Bureau'], ['Bureau']]);
  });
});

describe('T-5: creation failed for one name out of two', () => {
  it('the other is applied, TAG_FAILED, failedTags = the failed name, partial', async () => {
    const s = setup({
      createTag: [err('TAG_FAILED', 422), ok({ id: 'tCuisine', name: 'Cuisine' })],
    });
    const [p] = await start(s, [product([{ name: 'Informatique' }, { name: 'Cuisine' }])]);
    expect(s.puts[0]!.data.tagIds).toEqual(['tCuisine']);
    expect(p!.steps.tags).toBe('failed');
    expect(p!.failedTags).toEqual(['Informatique']);
    expect(p!.error).toBe('TAG_FAILED');
    expect(p!.status).toBe('partial');
    expect(p!.steps.update).toBe('done');
  });
});

describe('T-8: lost response then retry, no duplicate (FR-014)', () => {
  it('createTag HOMEBOX_UNREACHABLE, then the retry finds the tag in the fresh list: no second createTag', async () => {
    const s = setup({
      list: [ok([]), ok([{ id: 'tLost', name: 'Informatique' }])],
      createTag: [err('HOMEBOX_UNREACHABLE')],
    });
    const [p] = await start(s, [product([{ name: 'Informatique' }])]);
    expect(p!.status).toBe('partial');
    expect(p!.failedTags).toEqual(['Informatique']);
    s.calls.length = 0;
    const retry = await s.orchestrator.retryImport(p!.id);
    expect(retry.ok).toBe(true);
    expect(s.calls).toEqual(['listTags', 'getEntity', 'updateEntity']);
    expect(s.client.createTag).toHaveBeenCalledTimes(1);
    expect(s.puts.at(-1)!.data.tagIds).toEqual(['tLost']);
    expect((retry as { value: PendingImport }).value.status).toBe('success');
  });

  it('the retry always reads the list again before any creation', async () => {
    const s = setup({ list: [ok([]), ok([])], createTag: [err('HOMEBOX_UNREACHABLE')] });
    const [p] = await start(s, [product([{ name: 'Informatique' }])]);
    s.calls.length = 0;
    await s.orchestrator.retryImport(p!.id);
    expect(s.calls.slice(0, 2)).toEqual(['listTags', 'createTag:Informatique']);
  });
});

describe('T-4 (variant): unreadable list, then retry with creation of the missing tags', () => {
  it('first call: no creation; retry: list read, missing tag created, tags-only PUT', async () => {
    const s = setup({ list: [err('TAGS_UNAVAILABLE', 500), ok([{ id: 't1', name: 'Amazon' }])] });
    const [p] = await start(s, [product([{ name: 'Amazon' }, { name: 'Informatique' }])]);
    expect(s.client.createTag).not.toHaveBeenCalled();
    expect(p!.error).toBe('TAGS_UNAVAILABLE');
    s.calls.length = 0;
    const retry = await s.orchestrator.retryImport(p!.id);
    expect(s.calls).toEqual(['listTags', 'createTag:Informatique', 'getEntity', 'updateEntity']);
    expect(s.puts.at(-1)!.data.tagIds).toEqual(['t1', 'tNew']);
    expect((retry as { value: PendingImport }).value.status).toBe('success');
  });
});

describe('T-12 (extended) and T-13 with creation', () => {
  it('created tags: no tag name in the logs or the history; never tagIds undefined, tagIds ⊇ current tags', async () => {
    const names = ['Informatique', 'Cuisine', 'Bureau'];
    const s = setup({
      list: [
        ok([{ id: 't3', name: 'Bureau' }]),
        ok([
          { id: 't3', name: 'Bureau' },
          { id: 'tA', name: 'Informatique' },
        ]),
      ],
      createTag: [
        ok({ id: 'tA', name: 'Informatique' }),
        err('TAG_FAILED', 422),
        ok({ id: 'tC', name: 'Cuisine' }),
      ],
    });
    const [p] = await start(s, [product(names.map((name) => ({ name })))]);
    expect(p!.failedTags).toEqual(['Cuisine']);
    s.entities.get(p!.entityId!)!.tags = [...s.entities.get(p!.entityId!)!.tags, 'old'];
    await s.orchestrator.retryImport(p!.id);
    const logs = JSON.stringify([...debug.mock.calls, ...warn.mock.calls]);
    const history = JSON.stringify(s.history);
    for (const name of names) {
      expect(logs).not.toContain(name);
      expect(history).not.toContain(name);
    }
    for (const put of s.puts)
      expect(Object.entries(put.data).some(([k, v]) => k === 'tagIds' && v === undefined)).toBe(
        false,
      );
    expectNoTagRemoved(s.puts);
    expect(s.entities.get(p!.entityId!)!.tags).toEqual(['tA', 't3', 'old', 'tC']);
  });
});

describe('object read without a tags field (review 014, point 3)', () => {
  it('nothing is assumed: no tagIds sent, purchase PUT done, tags failed, TAG_FAILED, partial and retryable', async () => {
    const s = setup({ list: [ok([{ id: 't1', name: 'Amazon' }]), ok([{ id: 't1', name: 'Amazon' }])], tagsField: 'absent' });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }])]);
    expect(s.puts).toHaveLength(1);
    expect('tagIds' in s.puts[0]!.data).toBe(false);
    expect(s.puts[0]!.data.purchasePrice).toBe(99.99);
    expect(p!.steps.update).toBe('done');
    expect(p!.steps.tags).toBe('failed');
    expect(p!.failedTags).toEqual(['Amazon']);
    expect(p!.error).toBe('TAG_FAILED');
    expect(p!.status).toBe('partial');
    // Retry while the field is still absent: still no tagIds sent.
    await s.orchestrator.retryImport(p!.id);
    expect(s.puts.every((put) => !('tagIds' in put.data))).toBe(true);
  });

  it('retry once the object exposes its tags: tags-only PUT with the union, success', async () => {
    const script: Script = { list: [ok([{ id: 't1', name: 'Amazon' }]), ok([{ id: 't1', name: 'Amazon' }])], tagsField: 'absent' };
    const s = setup(script);
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }])]);
    script.tagsField = 'array';
    s.entities.get(p!.entityId!)!.tags = ['old'];
    const retry = await s.orchestrator.retryImport(p!.id);
    expect(s.puts.at(-1)!.data.tagIds).toEqual(['old', 't1']);
    expect((retry as { value: PendingImport }).value.status).toBe('success');
    expectNoTagRemoved(s.puts);
  });
});

describe('object read with "tags": null (Go nil slice = no tag)', () => {
  it('null is treated as an empty list: PUT with the chosen tagIds, success', async () => {
    const s = setup({ list: [ok([{ id: 't1', name: 'Amazon' }])], tagsField: 'null' });
    const [p] = await start(s, [product([{ name: 'Amazon', id: 't1' }, { name: 'Informatique' }])]);
    expect(s.puts).toHaveLength(1);
    expect(s.puts[0]!.data.tagIds).toEqual(['t1', 'tNew']);
    expect(p!.steps.tags).toBe('done');
    expect(p!.failedTags).toBeUndefined();
    expect(p!.status).toBe('success');
    expectNoTagRemoved(s.puts);
  });
});
