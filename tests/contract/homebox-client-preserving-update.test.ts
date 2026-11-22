import { entityOutToUpdate, preservingUpdate } from '@/background/homebox/client';
import type { EntityOut } from '@/background/homebox/types';

/**
 * Spec 021 (contracts/homebox-completion.md §3, B1 to B5): the PUT body of an EXISTING item keeps every property of
 * `EntityUpdate` (HomeBox v0.27.1), including the sale details and the location sync that `entityOutToUpdate`
 * (creation path, unchanged) does not copy. Fixed, fictitious values only.
 */

/** The 27 properties of `repo.EntityUpdate` in HomeBox v0.27.1 (research R2.1). Frozen on purpose. */
const ENTITY_UPDATE_KEYS_V0_27_1 = [
  'warrantyExpires',
  'purchaseDate',
  'soldDate',
  'name',
  'description',
  'serialNumber',
  'modelNumber',
  'manufacturer',
  'warrantyDetails',
  'purchaseFrom',
  'soldTo',
  'soldNotes',
  'notes',
  'tagIds',
  'fields',
  'assetId',
  'quantity',
  'purchasePrice',
  'soldPrice',
  'parentId',
  'locationId',
  'id',
  'entityTypeId',
  'insured',
  'archived',
  'syncChildEntityLocations',
  'lifetimeWarranty',
] as const;

/** An item read from HomeBox with every property filled. */
const full: EntityOut = {
  id: 'item-1',
  name: 'Clavier sans fil Exemple Pro',
  description: 'Clavier du bureau',
  quantity: 2,
  manufacturer: 'Exemple',
  modelNumber: 'EX-PRO',
  serialNumber: 'SN-0001',
  assetId: '000-001',
  insured: true,
  lifetimeWarranty: false,
  archived: false,
  notes: 'Achat en magasin',
  purchaseFrom: 'Boutique Exemple',
  purchasePrice: 49.99,
  purchaseDate: '2026-01-15',
  warrantyDetails: 'Garantie constructeur',
  warrantyExpires: '2028-01-15',
  soldDate: '2026-10-01',
  soldTo: 'Acheteur Exemple',
  soldPrice: 20,
  soldNotes: 'Vendu entre particuliers',
  syncChildEntityLocations: true,
  locationId: 'loc-own',
  location: { id: 'loc-own' },
  parent: { id: 'loc-1' },
  entityType: { id: 'type-item' },
  tags: [
    { id: 'tag-1', name: 'Bureau' },
    { id: 'tag-2', name: 'Informatique' },
  ],
  attachments: [{ id: 'a1', type: 'photo', primary: true, title: 'photo.jpg' }],
  fields: [
    {
      id: 'f1',
      name: 'Merchant',
      type: 'text',
      textValue: 'Boutique',
      numberValue: 0,
      booleanValue: false,
    },
    {
      id: 'f2',
      name: 'Pieces',
      type: 'number',
      textValue: '',
      numberValue: 3,
      booleanValue: false,
    },
  ],
};

describe('preservingUpdate (021, B1 to B5)', () => {
  it('B1: every property of the read item is copied as is', () => {
    const body = preservingUpdate(full, {});
    expect(body).toEqual({
      id: 'item-1',
      name: 'Clavier sans fil Exemple Pro',
      description: 'Clavier du bureau',
      quantity: 2,
      manufacturer: 'Exemple',
      modelNumber: 'EX-PRO',
      serialNumber: 'SN-0001',
      assetId: '000-001',
      insured: true,
      lifetimeWarranty: false,
      archived: false,
      notes: 'Achat en magasin',
      purchaseFrom: 'Boutique Exemple',
      purchasePrice: 49.99,
      purchaseDate: '2026-01-15',
      warrantyDetails: 'Garantie constructeur',
      warrantyExpires: '2028-01-15',
      soldDate: '2026-10-01',
      soldTo: 'Acheteur Exemple',
      soldPrice: 20,
      soldNotes: 'Vendu entre particuliers',
      syncChildEntityLocations: true,
      locationId: 'loc-own',
      parentId: 'loc-1',
      entityTypeId: 'type-item',
      tagIds: ['tag-1', 'tag-2'],
      fields: [
        {
          id: 'f1',
          name: 'Merchant',
          type: 'text',
          textValue: 'Boutique',
          numberValue: 0,
          booleanValue: false,
        },
        {
          id: 'f2',
          name: 'Pieces',
          type: 'number',
          textValue: '',
          numberValue: 3,
          booleanValue: false,
        },
      ],
    });
  });

  it('B2: the body carries the 27 properties of EntityUpdate v0.27.1, and nothing else', () => {
    expect(ENTITY_UPDATE_KEYS_V0_27_1).toHaveLength(27);
    const body = preservingUpdate(full, {});
    expect(Object.keys(body).sort((a, b) => a.localeCompare(b))).toEqual(
      [...ENTITY_UPDATE_KEYS_V0_27_1].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('B3: a sold item keeps its sale details', () => {
    const sold: EntityOut = {
      id: 'item-2',
      name: 'Perceuse',
      soldDate: '2026-09-30',
      soldTo: 'Voisin',
      soldPrice: 35.5,
      soldNotes: 'Paiement en espèces',
    };
    const body = preservingUpdate(sold, { notes: 'x' });
    expect(body).toMatchObject({
      soldDate: '2026-09-30',
      soldTo: 'Voisin',
      soldPrice: 35.5,
      soldNotes: 'Paiement en espèces',
    });
  });

  it('B4: entityOutToUpdate (creation path) is unchanged: no sale key, no location sync', () => {
    const body = entityOutToUpdate(full, {}) as unknown as Record<string, unknown>;
    for (const key of [
      'soldDate',
      'soldTo',
      'soldPrice',
      'soldNotes',
      'syncChildEntityLocations',
    ]) {
      expect(body, key).not.toHaveProperty(key);
    }
    expect(Object.keys(body)).toHaveLength(22);
  });

  it('B5: a patch { notes, quantity } changes only these two keys', () => {
    const before = preservingUpdate(full, {}) as unknown as Record<string, unknown>;
    const after = preservingUpdate(full, {
      notes: 'Achat en magasin\nCommande : 999-0000000-0000001',
      quantity: 3,
    }) as unknown as Record<string, unknown>;
    const changed = Object.keys(after).filter(
      (k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]),
    );
    expect(changed.sort((a, b) => a.localeCompare(b))).toEqual(['notes', 'quantity']);
    expect(after.notes).toBe('Achat en magasin\nCommande : 999-0000000-0000001');
    expect(after.quantity).toBe(3);
  });

  it('the patch never changes the identifier of the item', () => {
    expect(preservingUpdate(full, { id: 'other' }).id).toBe('item-1');
  });
});
