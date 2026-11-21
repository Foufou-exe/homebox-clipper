import { normalizeTemplate, normalizeTemplateList } from '@/background/templates/normalize';
import type { TemplateOut } from '@/background/homebox/types';

/** Normalisation and fingerprint of HomeBox templates (spec 018, Q-U1, contracts/homebox-templates.md §3). Fictitious values. */

const BASE: TemplateOut = {
  id: 'tpl-1',
  name: 'Livre',
  description: 'Romans',
  updatedAt: '2026-11-01T10:00:00Z',
  defaultDescription: 'Un livre',
  defaultQuantity: 1,
  defaultInsured: true,
  defaultManufacturer: 'Éditions Exemple',
  defaultModelNumber: 'ED-1',
  defaultLifetimeWarranty: false,
  defaultWarrantyDetails: 'Garantie éditeur',
  defaultLocation: { id: 'loc-1', name: 'Étagère A' },
  defaultTags: [
    { id: 'tag-2', name: 'Romans' },
    { id: 'tag-1', name: 'Livres' },
  ],
  fields: [
    {
      id: 'f1',
      type: 'text',
      name: 'Auteur',
      textValue: 'Jane Doe',
      timeValue: '2026-01-01T00:00:00Z',
    },
    { id: 'f2', type: 'number', name: 'Pages', textValue: '320' },
  ],
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const fp = async (out: TemplateOut) => {
  const res = await normalizeTemplate(out);
  if (!res.ok) throw new Error(res.error);
  return res.value.fingerprint;
};

describe('normalizeTemplate', () => {
  it('normalised detail', async () => {
    const res = await normalizeTemplate(BASE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { fingerprint, ...rest } = res.value;
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(rest).toEqual({
      id: 'tpl-1',
      name: 'Livre',
      description: 'Un livre',
      quantity: 1,
      insured: true,
      manufacturer: 'Éditions Exemple',
      modelNumber: 'ED-1',
      lifetimeWarranty: false,
      warrantyDetails: 'Garantie éditeur',
      locationId: 'loc-1',
      tags: [
        { id: 'tag-2', name: 'Romans' },
        { id: 'tag-1', name: 'Livres' },
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
        {
          type: 'number',
          kind: 'number',
          name: 'Pages',
          textValue: '320',
          numberValue: 0,
          booleanValue: false,
        },
      ],
    });
  });

  it('absent values: empty strings, null quantity and location, no tags, no fields', async () => {
    const res = await normalizeTemplate({
      id: 'tpl-2',
      name: 'Jeu',
      defaultTags: null,
      fields: null,
      defaultLocation: null,
    });
    expect(res.ok && { ...res.value, fingerprint: 'x' }).toEqual({
      id: 'tpl-2',
      name: 'Jeu',
      fingerprint: 'x',
      description: '',
      quantity: null,
      insured: false,
      manufacturer: '',
      modelNumber: '',
      lifetimeWarranty: false,
      warrantyDetails: '',
      locationId: null,
      tags: [],
      fields: [],
    });
  });

  it.each([[0], [1.5], [-2], [undefined]])('defaultQuantity %s → null', async (q) => {
    const res = await normalizeTemplate({ ...BASE, defaultQuantity: q });
    expect(res.ok && res.value.quantity).toBeNull();
  });

  it('defaultQuantity 3 → 3', async () => {
    const res = await normalizeTemplate({ ...BASE, defaultQuantity: 3 });
    expect(res.ok && res.value.quantity).toBe(3);
  });

  it('malformed default tags ignored', async () => {
    const res = await normalizeTemplate({
      ...BASE,
      defaultTags: [
        { id: 'tag-1', name: 'Livres' },
        { id: 3, name: 'x' },
        null,
        { id: 'tag-9' },
      ] as never,
    });
    expect(res.ok && res.value.tags).toEqual([{ id: 'tag-1', name: 'Livres' }]);
  });

  it('known types keep their kind; any other type is unknown, the HomeBox type copied as is', async () => {
    const res = await normalizeTemplate({
      ...BASE,
      fields: [
        { type: 'text', name: 'a' },
        { type: 'number', name: 'b', numberValue: 3 },
        { type: 'boolean', name: 'c', booleanValue: true },
        { type: 'time', name: 'd', textValue: '2026-11-01' },
        { type: 'color', name: 'e', textValue: 'rouge' },
      ],
    });
    expect(res.ok && res.value.fields.map((f) => [f.type, f.kind])).toEqual([
      ['text', 'text'],
      ['number', 'number'],
      ['boolean', 'boolean'],
      ['time', 'time'],
      ['color', 'unknown'],
    ]);
  });

  it('more than 100 fields → TEMPLATES_UNAVAILABLE', async () => {
    const fields = Array.from({ length: 101 }, (_, i) => ({ type: 'text', name: `c${i}` }));
    expect(await normalizeTemplate({ ...BASE, fields })).toEqual({
      ok: false,
      error: 'TEMPLATES_UNAVAILABLE',
    });
    const hundred = Array.from({ length: 100 }, (_, i) => ({ type: 'text', name: `c${i}` }));
    expect((await normalizeTemplate({ ...BASE, fields: hundred })).ok).toBe(true);
  });
});

describe('fingerprint (research D9)', () => {
  it('018-sonar: tag ids sorted by code unit; hard-coded fingerprint computed before the explicit comparator', async () => {
    const out = {
      id: 't',
      name: 'N',
      updatedAt: 'u',
      defaultTags: [
        { id: 'b', name: '1' },
        { id: 'B', name: '2' },
        { id: 'é', name: '3' },
        { id: 'a', name: '4' },
        { id: 'Z', name: '5' },
      ],
      fields: [],
    } as unknown as TemplateOut;
    expect(await fp(out)).toBe('f1b11f733835ef4c7eea2adac38ba5804048b1ac71e584b649fc46e265d5b365');
  });

  it('fixed value: SHA-256 of the canonical array of data-model', async () => {
    const canonical = [
      '2026-11-01T10:00:00Z',
      'Livre',
      'Romans',
      'Un livre',
      1,
      true,
      'Éditions Exemple',
      'ED-1',
      false,
      'Garantie éditeur',
      'loc-1',
      ['tag-1', 'tag-2'],
      [
        ['f1', 'text', 'Auteur', 'Jane Doe', 0, false],
        ['f2', 'number', 'Pages', '320', 0, false],
      ],
    ];
    const expected = await sha256Hex(JSON.stringify(canonical));
    expect(expected).toBe('234d00d6e4452791e8b3ddc2159de8c4261c5afc83824b78571e5013176efa18');
    expect(await fp(BASE)).toBe(expected);
  });

  it('stable', async () => {
    expect(await fp(BASE)).toBe(await fp(structuredClone(BASE)));
  });

  it.each<[string, Partial<TemplateOut>]>([
    ['updatedAt', { updatedAt: '2026-11-02T10:00:00Z' }],
    ['name', { name: 'Livre de poche' }],
    ['description', { description: 'Autre' }],
    ['defaultDescription', { defaultDescription: 'Autre' }],
    ['defaultQuantity', { defaultQuantity: 2 }],
    ['defaultInsured', { defaultInsured: false }],
    ['defaultManufacturer', { defaultManufacturer: 'Autre' }],
    ['defaultModelNumber', { defaultModelNumber: 'ED-2' }],
    ['defaultLifetimeWarranty', { defaultLifetimeWarranty: true }],
    ['defaultWarrantyDetails', { defaultWarrantyDetails: 'Autre' }],
    ['defaultLocation', { defaultLocation: { id: 'loc-2' } }],
    ['no defaultLocation', { defaultLocation: null }],
    ['tag added', { defaultTags: [...BASE.defaultTags!, { id: 'tag-3', name: 'Poche' }] }],
    ['tag removed', { defaultTags: [{ id: 'tag-1', name: 'Livres' }] }],
    ['field name', { fields: [{ ...BASE.fields![0]!, name: 'Autrice' }, BASE.fields![1]!] }],
    ['field type', { fields: [{ ...BASE.fields![0]!, type: 'number' }, BASE.fields![1]!] }],
    ['field value', { fields: [{ ...BASE.fields![0]!, textValue: 'John Doe' }, BASE.fields![1]!] }],
    ['field added', { fields: [...BASE.fields!, { type: 'boolean', name: 'Lu' }] }],
    ['field removed', { fields: [BASE.fields![0]!] }],
    ['field order', { fields: [BASE.fields![1]!, BASE.fields![0]!] }],
  ])('changes when %s changes', async (_label, change) => {
    expect(await fp({ ...BASE, ...change })).not.toBe(await fp(BASE));
  });

  it('does not change when two default tags are swapped (ids sorted)', async () => {
    expect(await fp({ ...BASE, defaultTags: [...BASE.defaultTags!].reverse() })).toBe(
      await fp(BASE),
    );
  });

  it('does not change when only timeValue changes', async () => {
    const fields = [{ ...BASE.fields![0]!, timeValue: '2030-05-05T00:00:00Z' }, BASE.fields![1]!];
    expect(await fp({ ...BASE, fields })).toBe(await fp(BASE));
  });
});

describe('normalizeTemplateList', () => {
  it('sorted by fold(name), then fold(description), then id; absent description → empty', () => {
    expect(
      normalizeTemplateList([
        { id: 'z', name: 'Zèbre' },
        { id: 'b', name: 'etagere', description: 'Bois' },
        { id: 'a', name: 'Étagère', description: 'Bois' },
        { id: 'l2', name: 'Livre', description: 'Poche' },
        { id: 'l1', name: 'Livre', description: 'BD' },
      ]),
    ).toEqual([
      { id: 'a', name: 'Étagère', description: 'Bois' },
      { id: 'b', name: 'etagere', description: 'Bois' },
      { id: 'l1', name: 'Livre', description: 'BD' },
      { id: 'l2', name: 'Livre', description: 'Poche' },
      { id: 'z', name: 'Zèbre', description: '' },
    ]);
  });
});
