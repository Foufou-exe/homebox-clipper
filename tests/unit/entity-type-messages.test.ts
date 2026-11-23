import { ERROR_CODES } from '@/shared/errors';
import { isMessage } from '@/shared/messages';
import type { ImportDraft } from '@/shared/types';
import { draft } from '../contract/orchestrator-harness';
import { loadCatalog } from './i18n-harness';

/** Spec 023 (contracts/runtime-messages.md §1, §2): `entity-type/list` and `ImportDraft.entityTypeId`. Fictitious values. */
const start = (d: unknown) => ({
  type: 'import/start',
  instanceId: 'inst-a',
  tabId: 1,
  manualFiles: [],
  drafts: [d],
});
const withType = (over: Record<string, unknown>): ImportDraft =>
  ({ ...draft(), ...over }) as ImportDraft;

describe('entity-type/list', () => {
  it('accepts an instance identifier of 1 to 64 characters, nothing else', () => {
    expect(isMessage({ type: 'entity-type/list', instanceId: 'inst-a' })).toBe(true);
    expect(isMessage({ type: 'entity-type/list', instanceId: '' })).toBe(false);
    expect(isMessage({ type: 'entity-type/list', instanceId: 'x'.repeat(65) })).toBe(false);
    expect(isMessage({ type: 'entity-type/list' })).toBe(false);
  });
});

describe('import/start: drafts[].entityTypeId', () => {
  it('absent: accepted (the draft is unchanged)', () => {
    expect(isMessage(start(draft()))).toBe(true);
  });

  it('a string of 1 to 64 characters is accepted', () => {
    expect(isMessage(start(withType({ entityTypeId: 'et-1' })))).toBe(true);
    expect(isMessage(start(withType({ entityTypeId: 'x'.repeat(64) })))).toBe(true);
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['too long', 'x'.repeat(65)],
    ['a number', 12],
    ['an object', { id: 'et-1' }],
  ])('refused: %s', (_label, value) => {
    expect(isMessage(start(withType({ entityTypeId: value })))).toBe(false);
  });

  it('refused together with a completion (spec 021 path never carries a type)', () => {
    const complete = { entityId: 'item-1', itemName: 'Clavier', keys: ['photo'] };
    expect(isMessage(start(withType({ entityTypeId: 'et-1', complete, location: null })))).toBe(
      false,
    );
    expect(isMessage(start(withType({ complete, location: null })))).toBe(true);
  });

  it('import/complete-preview: the previewed draft carries no type', () => {
    const preview = (d: unknown) => ({
      type: 'import/complete-preview',
      instanceId: 'inst-a',
      entityId: 'item-1',
      draft: d,
    });
    expect(isMessage(preview(draft()))).toBe(true);
    expect(isMessage(preview(withType({ entityTypeId: 'et-1' })))).toBe(false);
  });
});

describe('import/start: entityTypesRead', () => {
  it('absent or boolean accepted, anything else refused', () => {
    const base = { type: 'import/start', instanceId: 'inst-a', tabId: 1, manualFiles: [], drafts: [draft()] };
    expect(isMessage(base)).toBe(true);
    expect(isMessage({ ...base, entityTypesRead: true })).toBe(true);
    expect(isMessage({ ...base, entityTypesRead: 'yes' })).toBe(false);
  });
});

describe('error codes of the entity types', () => {
  it.each(['ENTITY_TYPES_UNAVAILABLE', 'ENTITY_TYPES_UNSUPPORTED', 'ENTITY_TYPE_NOT_FOUND'])(
    '%s is a code with a text in both locales',
    (code) => {
      expect(ERROR_CODES).toContain(code);
      expect(loadCatalog('fr')[`error.${code}`]).toBeTruthy();
      expect(loadCatalog('en')[`error.${code}`]).toBeTruthy();
    },
  );
});
