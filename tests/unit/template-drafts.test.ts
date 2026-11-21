import type { ImportDraft, TemplateDetail, WarrantyDraft } from '@/shared/types';
import type { TagLine } from '@/shared/tags';
import {
  applyTemplate,
  emptyDraft,
  fieldError,
  emptyLineTemplate,
  removeTemplate,
  templateChoiceFor,
  type TemplateLineState,
} from '@/ui/popup/drafts';

/** Application and removal of a template on a product (spec 018, Q-U4, contracts/ui.md §1.3). Fictitious values. */

const DETAIL: TemplateDetail = {
  id: 'tpl-1',
  name: 'Livre',
  fingerprint: 'a'.repeat(64),
  description: 'Un livre de la collection',
  quantity: 2,
  insured: true,
  manufacturer: 'Éditions Exemple',
  modelNumber: 'ED-1',
  lifetimeWarranty: true,
  warrantyDetails: 'Garantie éditeur',
  locationId: 'loc-2',
  tags: [
    { id: 'tag-1', name: 'Livres' },
    { id: 'tag-9', name: 'Supprimé' },
  ],
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
};
const LOCATIONS = [
  { id: 'loc-1', name: 'Bureau', path: ['Maison', 'Bureau'] },
  { id: 'loc-2', name: 'Étagère A', path: ['Maison', 'Étagère A'] },
];
const TAG_OPTIONS = [
  { id: 'tag-1', name: 'Livres' },
  { id: 't-amz', name: 'Amazon' },
];
const amazon: TagLine = {
  key: 'amazon',
  name: 'Amazon',
  id: 't-amz',
  origin: 'merchant',
  checked: true,
};

const line = (draft: Partial<ImportDraft> = {}, tags: TagLine[] = [amazon]): TemplateLineState => ({
  draft: { ...emptyDraft(), name: 'Roman exemple', ...draft },
  tags,
  template: emptyLineTemplate(),
});
const ctx = (over: Partial<Parameters<typeof applyTemplate>[2]> = {}) => ({
  manual: false,
  tagState: 'ready' as const,
  tagOptions: TAG_OPTIONS,
  locations: LOCATIONS,
  currentLocation: null,
  ...over,
});
const legal: WarrantyDraft = {
  origin: 'legal',
  expires: '2028-11-03',
  lifetime: false,
  details: 'Garantie légale',
  durationMonths: 24,
  edited: false,
};

describe('applyTemplate', () => {
  it('name never changed; description set only when empty; detail, values and applied filled', () => {
    const { line: out, location } = applyTemplate(line(), DETAIL, ctx());
    expect(out.draft.name).toBe('Roman exemple');
    expect(out.draft.description).toBe('Un livre de la collection');
    expect(out.template).toMatchObject({
      id: 'tpl-1',
      state: 'ready',
      detail: DETAIL,
      values: { manufacturer: 'Éditions Exemple', modelNumber: 'ED-1', insured: true },
      applied: {
        description: 'Un livre de la collection',
        quantity: null,
        warranty: true,
        tagKeys: ['livres'],
        location: true,
      },
    });
    expect(location).toEqual({ id: 'loc-2', path: ['Maison', 'Étagère A'] });
  });

  it('the description of the product wins (FR-011, P2)', () => {
    const { line: out } = applyTemplate(
      line({ description: 'Acheté sur Amazon.fr le 03/11/2026' }),
      DETAIL,
      ctx(),
    );
    expect(out.draft.description).toBe('Acheté sur Amazon.fr le 03/11/2026');
    expect(out.template.applied.description).toBeNull();
  });

  it('quantity set only in manual entry (FR-012)', () => {
    expect(applyTemplate(line(), DETAIL, ctx()).line.draft.quantity).toBe(1);
    const manual = applyTemplate(line(), DETAIL, ctx({ manual: true })).line;
    expect(manual.draft.quantity).toBe(2);
    expect(manual.template.applied.quantity).toBe(2);
  });

  it('warranty of origin template only when none; a spec 011 warranty is never replaced (FR-013)', () => {
    const none = applyTemplate(line({ warranty: null }), DETAIL, ctx()).line;
    expect(none.draft.warranty).toEqual({
      origin: 'template',
      lifetime: true,
      expires: null,
      details: 'Garantie éditeur',
      durationMonths: null,
      edited: false,
    });
    const kept = applyTemplate(line({ warranty: legal }), DETAIL, ctx()).line;
    expect(kept.draft.warranty).toEqual(legal);
    expect(kept.template.applied.warranty).toBe(false);
  });

  it('tags: union without duplicates, only those present in the list, origin template, checked', () => {
    const out = applyTemplate(line(), DETAIL, ctx()).line;
    expect(out.tags).toEqual([
      amazon,
      { key: 'livres', name: 'Livres', id: 'tag-1', origin: 'template', checked: true },
    ]);
  });

  it('a tag already on the product is neither duplicated nor marked', () => {
    const mine: TagLine = {
      key: 'livres',
      name: 'Livres',
      id: null,
      origin: 'user',
      checked: true,
    };
    const out = applyTemplate(line({}, [mine]), DETAIL, ctx()).line;
    expect(out.tags).toEqual([mine]);
    expect(out.template.applied.tagKeys).toEqual([]);
  });

  it('tag list unavailable: every default tag added, not verified', () => {
    const out = applyTemplate(
      line({}, []),
      DETAIL,
      ctx({ tagState: 'unavailable', tagOptions: [] }),
    ).line;
    expect(out.tags.map((t) => [t.name, t.id, t.origin])).toEqual([
      ['Livres', 'tag-1', 'template'],
      ['Supprimé', 'tag-9', 'template'],
    ]);
  });

  it('location proposed only when the effective location is empty and the default location exists', () => {
    expect(
      applyTemplate(
        line(),
        DETAIL,
        ctx({ currentLocation: { id: 'loc-1', path: ['Maison', 'Bureau'] } }),
      ).location,
    ).toBeNull();
    expect(applyTemplate(line(), { ...DETAIL, locationId: 'loc-x' }, ctx()).location).toBeNull();
  });

  it('fields pre-filled from the template', () => {
    const out = applyTemplate(line(), DETAIL, ctx()).line;
    expect(out.template.values.fields.map((f) => [f.view.name, f.raw, f.error])).toEqual([
      ['Auteur', 'Jane Doe', null],
    ]);
  });
});

describe('removeTemplate', () => {
  it('removes what the template set and keeps what the user changed (US1-8)', () => {
    const applied = applyTemplate(
      line({ warranty: null }, [amazon]),
      DETAIL,
      ctx({ manual: true }),
    ).line;
    const { line: back, removeLocation } = removeTemplate(applied);
    expect(back.draft.description).toBe('');
    expect(back.draft.quantity).toBe(1);
    expect(back.draft.warranty).toBeNull();
    expect(back.tags).toEqual([amazon]);
    expect(back.template).toEqual(emptyLineTemplate());
    expect(removeLocation).toBe(true);
  });

  it('a description, quantity or warranty changed by the user is kept; a tag turned user is kept', () => {
    const applied = applyTemplate(line({ warranty: null }), DETAIL, ctx({ manual: true })).line;
    applied.draft.description = 'Ma description';
    applied.draft.quantity = 5;
    applied.draft.warranty = { ...applied.draft.warranty!, edited: true };
    applied.tags = applied.tags.map((t) => (t.key === 'livres' ? { ...t, origin: 'user' } : t));
    const back = removeTemplate(applied).line;
    expect(back.draft.description).toBe('Ma description');
    expect(back.draft.quantity).toBe(5);
    expect(back.draft.warranty?.origin).toBe('template');
    expect(back.tags.map((t) => t.key)).toEqual(['amazon', 'livres']);
  });
});

describe('templateChoiceFor', () => {
  it('no template → null (no template key written)', () => {
    expect(templateChoiceFor(emptyLineTemplate())).toBeNull();
  });

  it('builds the choice from the values shown (research D1)', () => {
    const t = applyTemplate(line(), DETAIL, ctx()).line.template;
    t.values.manufacturer = 'Autre éditeur';
    t.values.insured = false;
    expect(templateChoiceFor(t)).toEqual({
      id: 'tpl-1',
      name: 'Livre',
      fingerprint: 'a'.repeat(64),
      insured: false,
      manufacturer: 'Autre éditeur',
      modelNumber: 'ED-1',
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
  });
});

describe('fieldError (contracts/ui.md §1.4)', () => {
  const v = (kind: 'text' | 'number' | 'time') => ({
    type: kind,
    kind,
    name: 'x',
    textValue: '',
    numberValue: 0,
    booleanValue: false,
  });
  it.each([
    ['time', '2026-02-30', 'invalidDate'],
    ['time', '2026-11-01', null],
    ['time', '', null],
    ['number', '3,5', 'notInteger'],
    ['number', 'abc', 'notInteger'],
    ['number', '12345678901234567890', 'notInteger'],
    ['number', '-4', null],
    ['number', '', null],
    ['text', 'x'.repeat(501), 'tooLong'],
    ['text', 'x'.repeat(500), null],
  ] as const)('%s « %s » → %s', (kind, raw, expected) => {
    expect(fieldError({ view: v(kind), raw })).toBe(expected);
  });
});
