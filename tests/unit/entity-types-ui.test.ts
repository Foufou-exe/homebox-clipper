import { completedDraft, previewDraft } from '@/ui/popup/completion';
import {
  entityTypeDraft,
  entityTypeLabels,
  initialEntityTypeId,
  parseEntityTypeView,
  useEntityTypes,
} from '@/ui/popup/entity-types';
import type { EntityTypeListView } from '@/shared/types';
import { draft } from '../contract/orchestrator-harness';

/** Pure logic and per-product state of the entity type selector (spec 023, contracts/ui.md). Fictitious values only. */
const TYPES = [
  { id: 'et-item', name: 'Item' },
  { id: 'et-book', name: 'Livre' },
  { id: 'et-tool', name: 'Outil' },
];
const view = (over: Partial<EntityTypeListView> = {}): EntityTypeListView => ({
  types: TYPES,
  defaultId: 'et-item',
  lastUsedId: null,
  ...over,
});

describe('parseEntityTypeView', () => {
  it('a valid answer with two types or more is kept', () => {
    expect(parseEntityTypeView({ ok: true, value: view() })).toEqual(view());
  });

  it.each([
    ['undefined', undefined],
    ['an error', { ok: false, error: 'ENTITY_TYPES_UNSUPPORTED' }],
    ['no value', { ok: true }],
    ['types not an array', { ok: true, value: { types: 'x', defaultId: null, lastUsedId: null } }],
    ['a single type', { ok: true, value: view({ types: [TYPES[0]!] }) }],
    ['no type', { ok: true, value: view({ types: [] }) }],
  ])('hidden (null): %s', (_label, res) => {
    expect(parseEntityTypeView(res)).toBeNull();
  });

  it('malformed entries are dropped, then the count is checked', () => {
    const res = {
      ok: true,
      value: { types: [TYPES[0], { id: 3, name: 'x' }, null], defaultId: null, lastUsedId: null },
    };
    expect(parseEntityTypeView(res)).toBeNull();
  });

  it('a defaultId or lastUsedId that is not in the list is ignored', () => {
    const res = { ok: true, value: view({ defaultId: 'et-gone', lastUsedId: 'et-gone2' }) };
    expect(parseEntityTypeView(res)).toEqual(view({ defaultId: null, lastUsedId: null }));
  });
});

describe('initialEntityTypeId and entityTypeDraft', () => {
  it('the last type used wins, then the server default, else nothing', () => {
    expect(initialEntityTypeId(view({ lastUsedId: 'et-tool' }))).toBe('et-tool');
    expect(initialEntityTypeId(view())).toBe('et-item');
    expect(initialEntityTypeId(view({ defaultId: null }))).toBeNull();
    expect(initialEntityTypeId(null)).toBeNull();
  });

  it('only a type other than the server default is sent', () => {
    expect(entityTypeDraft('et-tool', 'et-item')).toEqual({ entityTypeId: 'et-tool' });
    expect(entityTypeDraft('et-item', 'et-item')).toEqual({});
    expect(entityTypeDraft(null, 'et-item')).toEqual({});
    expect(entityTypeDraft('et-tool', null)).toEqual({ entityTypeId: 'et-tool' });
    expect(entityTypeDraft(null, null)).toEqual({});
  });
});

describe('entityTypeLabels', () => {
  it('two types with the same name are told apart by a number', () => {
    expect(
      entityTypeLabels([
        { id: 'a', name: 'Outil' },
        { id: 'b', name: 'Livre' },
        { id: 'c', name: 'Outil' },
      ]),
    ).toEqual([
      { id: 'a', label: 'Outil' },
      { id: 'b', label: 'Livre' },
      { id: 'c', label: 'Outil (2)' },
    ]);
  });
});

describe('useEntityTypes (state per product)', () => {
  const ok = (value: EntityTypeListView) => Promise.resolve({ ok: true, value });

  it('without an answer nothing is shown and no type is sent', async () => {
    const state = useEntityTypes();
    expect(state.view.value).toBeNull();
    expect(state.draftFor('a')).toEqual({});
  });

  it('after a load, a product follows the initial value until the user chooses', async () => {
    const state = useEntityTypes();
    await state.load(
      () => ok(view({ lastUsedId: 'et-book' })),
      () => true,
    );
    expect(state.selectedFor('a')).toBe('et-book');
    expect(state.draftFor('a')).toEqual({ entityTypeId: 'et-book' });
    state.choose('a', 'et-item');
    expect(state.selectedFor('a')).toBe('et-item');
    expect(state.draftFor('a')).toEqual({});
    expect(state.selectedFor('b')).toBe('et-book');
  });

  it('an answer of an older generation is ignored', async () => {
    const state = useEntityTypes();
    await state.load(
      () => ok(view()),
      () => false,
    );
    expect(state.view.value).toBeNull();
  });

  it('a rejected request hides the selector', async () => {
    const state = useEntityTypes();
    await state.load(
      () => Promise.reject(new Error('x')),
      () => true,
    );
    expect(state.view.value).toBeNull();
  });

  it('reset forgets the view and the choices', async () => {
    const state = useEntityTypes();
    await state.load(
      () => ok(view()),
      () => true,
    );
    state.choose('a', 'et-tool');
    state.reset();
    expect(state.view.value).toBeNull();
    expect(state.draftFor('a')).toEqual({});
  });
});

describe('previewDraft and completedDraft drop the type (spec 021 never carries one)', () => {
  it('both remove entityTypeId', () => {
    const base = draft({ entityTypeId: 'et-tool' });
    expect('entityTypeId' in previewDraft(base)).toBe(false);
    const done = completedDraft(base, { entityId: 'item-1', itemName: 'Clavier', keys: [] });
    expect('entityTypeId' in done).toBe(false);
  });
});
