import {
  copySetting,
  displayedCollection,
  isCollectionId,
  isCollectionName,
  isCollectionRef,
  isCollectionSetting,
  sortCollections,
} from '@/shared/collections';

/** Spec 024 (data-model.md §1): pure validation and display of the target collection. Fictitious ids only. */
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

describe('isCollectionId', () => {
  it.each([ID_A, ID_A.toUpperCase()])('accepts the canonical UUID %s', (id) => {
    expect(isCollectionId(id)).toBe(true);
  });

  it.each([
    '',
    'maison',
    `${ID_A} `,
    ID_A.slice(1),
    `${ID_A}0`,
    ID_A.replaceAll('-', ''),
    42,
    null,
    undefined,
  ])('refuses %s', (id) => {
    expect(isCollectionId(id)).toBe(false);
  });
});

describe('isCollectionName', () => {
  it('1 to 255 characters, not blank', () => {
    expect(isCollectionName('Maison')).toBe(true);
    expect(isCollectionName('x'.repeat(255))).toBe(true);
    expect(isCollectionName('x'.repeat(256))).toBe(false);
    expect(isCollectionName('')).toBe(false);
    expect(isCollectionName('   ')).toBe(false);
    expect(isCollectionName(3)).toBe(false);
  });
});

describe('isCollectionRef / isCollectionSetting', () => {
  it('a reference needs a UUID and a name', () => {
    expect(isCollectionRef({ id: ID_A, name: 'Maison' })).toBe(true);
    expect(isCollectionRef({ id: 'maison', name: 'Maison' })).toBe(false);
    expect(isCollectionRef({ id: ID_A })).toBe(false);
    expect(isCollectionRef([ID_A, 'Maison'])).toBe(false);
  });

  it('default setting, chosen collection, last seen collection', () => {
    expect(isCollectionSetting({ chosen: null, seen: null })).toBe(true);
    expect(isCollectionSetting({ chosen: { id: ID_B, name: 'Atelier' }, seen: null })).toBe(true);
    expect(
      isCollectionSetting({ chosen: null, seen: { id: ID_A, name: 'Maison', several: true } }),
    ).toBe(true);
  });

  it.each([
    ['missing chosen', { seen: null }],
    ['missing seen', { chosen: null }],
    ['bad chosen', { chosen: { id: 'x', name: 'Atelier' }, seen: null }],
    ['seen without several', { chosen: null, seen: { id: ID_A, name: 'Maison' } }],
    ['array', []],
    ['null', null],
  ])('refuses %s', (_label, value) => {
    expect(isCollectionSetting(value)).toBe(false);
  });

  it('copySetting keeps only the declared properties', () => {
    const raw = {
      chosen: { id: ID_B, name: 'Atelier', currency: 'EUR' },
      seen: { id: ID_B, name: 'Atelier', several: true, extra: 1 },
    };
    expect(copySetting(raw)).toEqual({
      chosen: { id: ID_B, name: 'Atelier' },
      seen: { id: ID_B, name: 'Atelier', several: true },
    });
  });
});

describe('sortCollections', () => {
  it('by name ignoring case and accents, then by id; the input is not changed', () => {
    const input = [
      { id: ID_C, name: 'maison' },
      { id: ID_B, name: 'Atelier' },
      { id: ID_A, name: 'Maison' },
      { id: ID_A, name: 'Écurie' },
    ];
    const copy = structuredClone(input);
    expect(sortCollections(input).map((c) => `${c.name}|${c.id.slice(0, 1)}`)).toEqual([
      'Atelier|2',
      'Écurie|1',
      'Maison|1',
      'maison|3',
    ]);
    expect(input).toEqual(copy);
  });
});

describe('displayedCollection (FR-008, FR-009)', () => {
  it('nothing without a setting', () => {
    expect(displayedCollection(undefined)).toBeNull();
    expect(displayedCollection(null)).toBeNull();
    expect(displayedCollection({ chosen: null, seen: null })).toBeNull();
  });

  it('default setting: the name last seen only when the key reaches several collections', () => {
    expect(
      displayedCollection({ chosen: null, seen: { id: ID_A, name: 'Maison', several: true } }),
    ).toBe('Maison');
    expect(
      displayedCollection({ chosen: null, seen: { id: ID_A, name: 'Maison', several: false } }),
    ).toBeNull();
  });

  it('chosen collection: always its name', () => {
    expect(displayedCollection({ chosen: { id: ID_B, name: 'Atelier' }, seen: null })).toBe(
      'Atelier',
    );
    expect(
      displayedCollection({
        chosen: { id: ID_B, name: 'Atelier' },
        seen: { id: ID_B, name: 'Atelier', several: false },
      }),
    ).toBe('Atelier');
  });
});
