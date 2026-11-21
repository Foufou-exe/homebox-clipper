import { describe, expect, it } from 'vitest';
import { entityOutToUpdate } from '@/background/homebox/client';
import type { EntityOut } from '@/background/homebox/types';

/** Issue #109: the full PUT must carry the custom fields of the object, or HomeBox erases them. Fictitious values. */
const FIELDS = [
  { id: 'f1', name: 'Color', type: 'text', textValue: 'black', numberValue: 0, booleanValue: false },
  { id: 'f2', name: 'Ports', type: 'number', textValue: '', numberValue: 4, booleanValue: false },
  { id: 'f3', name: 'Wireless', type: 'boolean', textValue: '', numberValue: 0, booleanValue: true },
  { id: 'f4', name: 'Checked', type: 'time', textValue: '', numberValue: 0, booleanValue: false },
];

const base = (over: Partial<EntityOut> = {}): EntityOut => ({ id: 'e1', name: 'Clavier', ...over });

describe('entityOutToUpdate keeps the custom fields (#109)', () => {
  it('copies fields of every type unchanged, ids included', () => {
    const update = entityOutToUpdate(base({ fields: FIELDS }), { purchasePrice: 9.5 });
    expect(update.fields).toEqual(FIELDS);
    expect(update.purchasePrice).toBe(9.5);
  });

  it('copies only the properties EntityUpdate expects', () => {
    const noisy = [{ ...FIELDS[0], createdAt: 'x', extra: 1 }] as unknown as EntityOut['fields'];
    expect(entityOutToUpdate(base({ fields: noisy }), {}).fields).toEqual([FIELDS[0]]);
  });

  it('does not alias the array read from HomeBox', () => {
    const out = base({ fields: FIELDS });
    expect(entityOutToUpdate(out, {}).fields).not.toBe(out.fields);
  });

  it('a patch without fields leaves them untouched', () => {
    const update = entityOutToUpdate(base({ fields: FIELDS }), { notes: 'n', tagIds: ['t1'] });
    expect(update.fields).toEqual(FIELDS);
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['empty', []],
  ])('%s fields: no `fields` key in the PUT', (_n, fields) => {
    const update = entityOutToUpdate(base({ fields } as Partial<EntityOut>), { notes: 'n' });
    expect('fields' in update).toBe(false);
  });
});
