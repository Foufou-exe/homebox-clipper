import { isMessage } from '@/shared/messages';
import type { CompletionChoice, ImportDraft } from '@/shared/types';
import { draft, invoice } from '../contract/orchestrator-harness';

/**
 * Spec 021 (contracts/runtime-messages.md §4, M1 to M10): the `import/complete-preview` message and the validation of
 * `ImportDraft.complete` on `import/start`. Fixed, fictitious values only.
 */

const NUMBER = '999-0000000-0000001';

/** A draft that can carry a completion: one document, one tag, the order fields, no location, no template. */
const base = (over: Partial<ImportDraft> = {}): ImportDraft =>
  draft({
    tags: [{ name: 'Amazon' }],
    orderFields: [
      { role: 'orderNumber', name: 'Order number', value: NUMBER },
      { role: 'merchant', name: 'Merchant', value: 'Amazon.fr' },
    ],
    ...over,
  });

const complete = (over: Partial<CompletionChoice> = {}): CompletionChoice => ({
  entityId: 'item-1',
  itemName: 'Clavier sans fil Exemple Pro',
  keys: ['doc:detected-0', 'photo', 'tag:amazon', 'purchasePrice', 'notes', 'field:orderNumber'],
  ...over,
});

const start = (d: unknown) => ({
  type: 'import/start',
  instanceId: 'inst-a',
  tabId: 1,
  manualFiles: [],
  drafts: [d],
});
const preview = (over: Record<string, unknown> = {}) => ({
  type: 'import/complete-preview',
  instanceId: 'inst-a',
  entityId: 'item-1',
  draft: base(),
  ...over,
});
const template = {
  id: 'tpl-1',
  name: 'Bureau',
  fingerprint: 'a'.repeat(64),
  insured: false,
  manufacturer: '',
  modelNumber: '',
  fields: [],
};

describe('import/complete-preview (021, M1 to M3)', () => {
  it('M1: a valid preview is accepted', () => {
    expect(isMessage(preview())).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['65 characters', 'x'.repeat(65)],
    ['a number', 42],
  ])('M2: entityId %s is refused', (_l, entityId) => {
    expect(isMessage(preview({ entityId }))).toBe(false);
  });

  it('M2: an invalid instance or an invalid draft is refused', () => {
    expect(isMessage(preview({ instanceId: '' }))).toBe(false);
    expect(isMessage(preview({ draft: { ...base(), documents: 'x' } }))).toBe(false);
    expect(isMessage(preview({ draft: null }))).toBe(false);
  });

  it('M3: a preview draft with a template or with a completion is refused', () => {
    const located = base({ location: { id: 'loc-1', path: ['Bureau'] } });
    expect(isMessage(preview({ draft: { ...located, template } }))).toBe(false);
    expect(isMessage(preview({ draft: { ...base(), complete: complete() } }))).toBe(false);
  });
});

describe('import/start with ImportDraft.complete (021, M4 to M10)', () => {
  it('M4: a valid completion (one key of each shape) is accepted', () => {
    expect(isMessage(start({ ...base(), complete: complete() }))).toBe(true);
    const every = complete({
      keys: [
        'doc:detected-0',
        'photo',
        'tag:amazon',
        'purchasePrice',
        'purchaseDate',
        'purchaseFrom',
        'warrantyExpires',
        'lifetimeWarranty',
        'warrantyDetails',
        'notes',
        'field:orderNumber',
        'field:merchant',
      ],
      quantityIncrease: 1,
    });
    expect(isMessage(start({ ...base(), complete: every }))).toBe(true);
    expect(isMessage(start({ ...base(), complete: complete({ keys: [] }) }))).toBe(true);
  });

  it.each([
    ['an unknown key', ['name']],
    ['a duplicated key', ['notes', 'notes']],
    ['quantity in keys', ['quantity']],
    ['an empty doc key', ['doc:']],
    ['an empty tag key', ['tag:']],
    ['an unknown field role', ['field:color']],
    ['a non-string key', [42]],
  ])('M5: %s is refused', (_l, keys) => {
    expect(isMessage(start({ ...base(), complete: complete({ keys: keys as never }) }))).toBe(
      false,
    );
  });

  it('M5: 201 keys are refused', () => {
    const docs = Array.from({ length: 201 }, (_, i) => ({ ...invoice, id: `d${i}` }));
    const keys = docs.map((d) => `doc:${d.id}` as const);
    expect(
      isMessage(
        start({ ...base({ documents: docs }), complete: complete({ keys: keys.slice(0, 200) }) }),
      ),
    ).toBe(true);
    expect(isMessage(start({ ...base({ documents: docs }), complete: complete({ keys }) }))).toBe(
      false,
    );
  });

  it('M6: doc:x without a document x, field:merchant without such an order field, tag of no checked tag', () => {
    expect(isMessage(start({ ...base(), complete: complete({ keys: ['doc:x'] }) }))).toBe(false);
    const noMerchant = base({
      orderFields: [{ role: 'orderNumber', name: 'Order number', value: NUMBER }],
    });
    expect(
      isMessage(start({ ...noMerchant, complete: complete({ keys: ['field:merchant'] }) })),
    ).toBe(false);
    expect(isMessage(start({ ...base(), complete: complete({ keys: ['tag:bureau'] }) }))).toBe(
      false,
    );
  });

  it.each([0, 1.5, 2, '1', null])(
    'M7: quantityIncrease %j is refused (draft quantity 1)',
    (quantityIncrease) => {
      expect(isMessage(start({ ...base(), complete: { ...complete(), quantityIncrease } }))).toBe(
        false,
      );
    },
  );

  it('M7: quantityIncrease equal to the draft quantity is accepted', () => {
    expect(
      isMessage(start({ ...base({ quantity: 3 }), complete: complete({ quantityIncrease: 3 }) })),
    ).toBe(true);
  });

  it('M8: complete + template, complete + a location are refused', () => {
    const located = base({ location: { id: 'loc-1', path: ['Bureau'] } });
    expect(isMessage(start({ ...located, template, complete: complete() }))).toBe(false);
    expect(isMessage(start({ ...located, complete: complete() }))).toBe(false);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'item-1'],
  ])('M9: complete %s is refused', (_l, value) => {
    expect(isMessage(start({ ...base(), complete: value }))).toBe(false);
  });

  it.each([
    ['an empty entityId', { entityId: '' }],
    ['a 65-character entityId', { entityId: 'x'.repeat(65) }],
    ['an empty itemName', { itemName: '' }],
    ['a 256-character itemName', { itemName: 'x'.repeat(256) }],
    ['keys not an array', { keys: 'notes' }],
  ])('M9: %s is refused', (_l, over) => {
    expect(isMessage(start({ ...base(), complete: { ...complete(), ...over } }))).toBe(false);
  });

  it('M10: a draft without complete is validated as before', () => {
    expect(isMessage(start(base()))).toBe(true);
    expect(isMessage(start(draft()))).toBe(true);
    expect(isMessage(start({ ...draft(), location: { id: 'loc-1', path: ['Bureau'] } }))).toBe(
      true,
    );
    expect(isMessage(start({ ...draft(), photo: 'x' }))).toBe(false);
  });
});
