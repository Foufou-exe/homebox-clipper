import type { EntityField } from '@/background/homebox/types';
import type { OrderFieldValue } from '@/shared/types';

/**
 * Order fields on the service worker side (spec 019, data-model §7, research D3). Pure functions: no storage, no
 * network, nothing logged (field names and values are user data).
 */

/** Same properties as `copyField` of the client (Swagger `repo.EntityFieldData`): a foreign field is sent back as is. */
const copy = (f: EntityField): EntityField => ({
  id: f.id,
  name: f.name,
  type: f.type,
  textValue: f.textValue,
  numberValue: f.numberValue,
  booleanValue: f.booleanValue,
});

/** Same name (edge spaces removed, exact case, as HomeBox distinguishes names) and of type `text`. */
const pairs = (f: EntityField, name: string) => f.type === 'text' && f.name.trim() === name;

/** Copies of the current fields: base of the path without template (sent back as is, #109). */
export function currentFields(current: EntityField[] | null | undefined): EntityField[] {
  return Array.isArray(current) ? current.map(copy) : [];
}

/**
 * Fields of the PUT (research D3.2): each order field replaces in place the first text field of the same name not yet
 * paired (same `id`, confirmed name, new value); otherwise it is added without `id` (created). Every other field is
 * sent back as is (#109, FR-021). Base fields first, creations after.
 */
export function applyOrderFields(
  base: readonly EntityField[],
  order: readonly OrderFieldValue[],
): EntityField[] {
  const out = base.map(copy);
  const used = new Set<number>();
  const created: EntityField[] = [];
  for (const o of order) {
    const values = {
      type: 'text',
      name: o.name,
      textValue: o.value,
      numberValue: 0,
      booleanValue: false,
    };
    const index = out.findIndex((f, i) => !used.has(i) && pairs(f, o.name));
    const match = out[index];
    if (!match) {
      created.push(values);
      continue;
    }
    used.add(index);
    out[index] = match.id === undefined ? values : { id: match.id, ...values };
  }
  return [...out, ...created];
}

/** Read-back (FR-023): each confirmed field is exactly one read text field of the same name with the same value. */
export function orderFieldsMatch(
  read: EntityField[] | null | undefined,
  order: readonly OrderFieldValue[],
): boolean {
  if (!Array.isArray(read)) return false;
  return order.every((o) => {
    const same = read.filter((f) => pairs(f, o.name));
    return same.length === 1 && (same[0]?.textValue ?? '') === o.value;
  });
}
