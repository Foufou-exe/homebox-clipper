import { fieldsFor, fieldsMatch, templatePatch } from '@/background/import/template-patch';
import type { EntityField } from '@/background/homebox/types';
import type {
  ImportDraft,
  TemplateChoice,
  TemplateFieldValue,
  WarrantyDraft,
} from '@/shared/types';

/** Pure values of the template path (spec 018, Q-U1, contracts/import-templates.md, data-model §4). Fictitious values. */

const field = (
  over: Partial<TemplateFieldValue> & Pick<TemplateFieldValue, 'kind' | 'name'>,
): TemplateFieldValue => ({
  type: over.kind === 'unknown' ? 'color' : over.kind,
  textValue: '',
  numberValue: 0,
  booleanValue: false,
  ...over,
});

const TEMPLATE: TemplateChoice = {
  id: 'tpl-1',
  name: 'Livre',
  fingerprint: 'a'.repeat(64),
  insured: false,
  manufacturer: 'Éditions Exemple',
  modelNumber: 'ED-1',
  fields: [],
};

const draft = (
  warranty: WarrantyDraft | null | undefined,
  template: Partial<TemplateChoice> = {},
) =>
  ({
    name: 'Clavier sans fil Exemple Pro',
    description: '',
    purchasePrice: null,
    currency: 'EUR',
    purchaseDate: null,
    purchaseFrom: '',
    orderNumber: null,
    quantity: 1,
    pageUrl: null,
    documents: [],
    photo: null,
    location: { id: 'loc-1', path: ['Maison'] },
    warranty,
    template: { ...TEMPLATE, ...template },
  }) as ImportDraft & { template: TemplateChoice };

const w = (over: Partial<WarrantyDraft>): WarrantyDraft => ({
  origin: 'legal',
  expires: null,
  lifetime: false,
  details: '',
  durationMonths: null,
  edited: false,
  ...over,
});

describe('templatePatch', () => {
  it('dated warranty (spec 011): lifetimeWarranty false explicitly, the date sent', () => {
    const p = templatePatch(draft(w({ expires: '2027-10-22', details: 'Garantie légale' })));
    expect(p).toEqual({
      insured: false,
      manufacturer: 'Éditions Exemple',
      modelNumber: 'ED-1',
      lifetimeWarranty: false,
      warrantyExpires: '2027-10-22',
      warrantyDetails: 'Garantie légale',
    });
    expect(Object.hasOwn(p, 'lifetimeWarranty')).toBe(true);
    expect(Object.hasOwn(p, 'insured')).toBe(true);
  });

  it('lifetime warranty: lifetimeWarranty true, no date', () => {
    const p = templatePatch(
      draft(w({ lifetime: true, expires: null, details: 'À vie', origin: 'template' })),
    );
    expect(p.lifetimeWarranty).toBe(true);
    expect(p.warrantyExpires).toBeUndefined();
    expect(p.warrantyDetails).toBe('À vie');
  });

  it('no warranty: lifetimeWarranty false, no date, no details', () => {
    for (const value of [null, undefined]) {
      const p = templatePatch(draft(value));
      expect(p.lifetimeWarranty).toBe(false);
      expect(p.warrantyExpires).toBeUndefined();
      expect(p.warrantyDetails).toBeUndefined();
    }
  });

  it('blank details, empty manufacturer and model number → undefined; insured kept', () => {
    const p = templatePatch(
      draft(w({ details: '  ' }), { manufacturer: '', modelNumber: '', insured: true }),
    );
    expect(p.warrantyDetails).toBeUndefined();
    expect(p.manufacturer).toBeUndefined();
    expect(p.modelNumber).toBeUndefined();
    expect(p.insured).toBe(true);
  });
});

describe('fieldsFor', () => {
  const author = field({ kind: 'text', name: 'Auteur', textValue: 'Jane Doe' });

  it('pairs by (name, type) and takes the id of the current field', () => {
    const current: EntityField[] = [
      { id: 'f1', type: 'text', name: 'Auteur', textValue: 'Modèle' },
    ];
    expect(fieldsFor(current, [author])).toEqual([
      {
        id: 'f1',
        type: 'text',
        name: 'Auteur',
        textValue: 'Jane Doe',
        numberValue: 0,
        booleanValue: false,
      },
    ]);
  });

  it('two fields of the same name and type: paired in order of occurrence', () => {
    const current: EntityField[] = [
      { id: 'f1', type: 'text', name: 'Auteur', textValue: '' },
      { id: 'f2', type: 'text', name: 'Auteur', textValue: '' },
    ];
    const second = field({ kind: 'text', name: 'Auteur', textValue: 'John Doe' });
    expect(fieldsFor(current, [author, second]).map((f) => [f.id, f.textValue])).toEqual([
      ['f1', 'Jane Doe'],
      ['f2', 'John Doe'],
    ]);
  });

  it('same name, other type: not paired; the confirmed field is added without id, the other kept', () => {
    const current: EntityField[] = [{ id: 'f1', type: 'number', name: 'Auteur', numberValue: 4 }];
    const out = fieldsFor(current, [author]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      type: 'text',
      name: 'Auteur',
      textValue: 'Jane Doe',
      numberValue: 0,
      booleanValue: false,
    });
    expect(Object.hasOwn(out[0]!, 'id')).toBe(false);
    expect(out[1]).toMatchObject({ id: 'f1', type: 'number', name: 'Auteur', numberValue: 4 });
  });

  it('a foreign field of the object is sent back as is (invariant 7, #109)', () => {
    const foreign: EntityField = {
      id: 'f9',
      type: 'time',
      name: 'Lu le',
      textValue: '2026-11-01',
      numberValue: 0,
      booleanValue: false,
    };
    const out = fieldsFor([{ id: 'f1', type: 'text', name: 'Auteur' }, foreign], [author]);
    expect(out).toContainEqual(foreign);
    expect(out).toHaveLength(2);
  });

  it('null or undefined current: the confirmed fields only', () => {
    expect(fieldsFor(null, [author])).toHaveLength(1);
    expect(fieldsFor(undefined, [author])).toHaveLength(1);
  });

  it('values sent per research D1 (no timeValue key)', () => {
    const confirmed = [
      field({ kind: 'number', name: 'Pages', textValue: '320', numberValue: 320 }),
      field({ kind: 'boolean', name: 'Lu', textValue: 'true', booleanValue: true }),
      field({ kind: 'time', name: 'Lu le', textValue: '2026-11-01' }),
      field({
        kind: 'unknown',
        type: 'color',
        name: 'Couleur',
        textValue: 'rouge',
        numberValue: 2,
        booleanValue: true,
      }),
    ];
    const out = fieldsFor([], confirmed);
    expect(out).toEqual([
      { type: 'number', name: 'Pages', textValue: '320', numberValue: 320, booleanValue: false },
      { type: 'boolean', name: 'Lu', textValue: 'true', numberValue: 0, booleanValue: true },
      { type: 'time', name: 'Lu le', textValue: '2026-11-01', numberValue: 0, booleanValue: false },
      { type: 'color', name: 'Couleur', textValue: 'rouge', numberValue: 2, booleanValue: true },
    ]);
    for (const f of out) expect(Object.hasOwn(f, 'timeValue')).toBe(false);
  });
});

describe('fieldsMatch', () => {
  const confirmed = [
    field({ kind: 'text', name: 'Auteur', textValue: 'Jane Doe' }),
    field({ kind: 'number', name: 'Pages', textValue: '320', numberValue: 320 }),
    field({ kind: 'boolean', name: 'Lu', textValue: 'true', booleanValue: true }),
    field({ kind: 'time', name: 'Lu le', textValue: '2026-11-01' }),
    field({ kind: 'unknown', type: 'color', name: 'Couleur', textValue: 'rouge' }),
  ];
  const read = (): EntityField[] => [
    { id: '1', type: 'text', name: 'Auteur', textValue: 'Jane Doe' },
    { id: '2', type: 'number', name: 'Pages', textValue: '320', numberValue: 320 },
    { id: '3', type: 'boolean', name: 'Lu', textValue: 'true', booleanValue: true },
    { id: '4', type: 'time', name: 'Lu le', textValue: '2026-11-01' },
    {
      id: '5',
      type: 'color',
      name: 'Couleur',
      textValue: 'rouge',
      numberValue: 0,
      booleanValue: false,
    },
  ];

  it('the 4 types and the unknown one match; absent values read as empty/0/false', () => {
    expect(fieldsMatch(read(), confirmed)).toBe(true);
  });

  it('an extra read field is tolerated', () => {
    expect(
      fieldsMatch([...read(), { type: 'text', name: 'Note', textValue: 'x' }], confirmed),
    ).toBe(true);
  });

  it('a missing confirmed field is a mismatch', () => {
    expect(fieldsMatch(read().slice(1), confirmed)).toBe(false);
    expect(fieldsMatch(null, confirmed)).toBe(false);
    expect(fieldsMatch(null, [])).toBe(true);
  });

  it.each<[string, (r: EntityField[]) => void]>([
    ['text value', (r) => (r[0]!.textValue = 'John Doe')],
    ['number value', (r) => (r[1]!.numberValue = 321)],
    ['number text', (r) => (r[1]!.textValue = '321')],
    ['boolean value', (r) => (r[2]!.booleanValue = false)],
    ['boolean text', (r) => (r[2]!.textValue = 'false')],
    ['date text', (r) => (r[3]!.textValue = '2026-11-02')],
    ['unknown number', (r) => (r[4]!.numberValue = 1)],
  ])('a different %s is a mismatch', (_label, change) => {
    const r = read();
    change(r);
    expect(fieldsMatch(r, confirmed)).toBe(false);
  });

  it('two confirmed fields of the same (name, type) need two distinct read fields', () => {
    const twice = [
      field({ kind: 'text', name: 'Auteur', textValue: 'Jane Doe' }),
      field({ kind: 'text', name: 'Auteur', textValue: 'Jane Doe' }),
    ];
    expect(fieldsMatch([{ type: 'text', name: 'Auteur', textValue: 'Jane Doe' }], twice)).toBe(
      false,
    );
    expect(
      fieldsMatch(
        [
          { type: 'text', name: 'Auteur', textValue: 'Jane Doe' },
          { type: 'text', name: 'Auteur', textValue: 'Jane Doe' },
        ],
        twice,
      ),
    ).toBe(true);
  });
});
