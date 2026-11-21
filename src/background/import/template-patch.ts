import type { EntityField, EntityUpdate } from '@/background/homebox/types';
import type { ImportDraft, TemplateChoice, TemplateFieldValue } from '@/shared/types';

/**
 * Values of the template path (spec 018, data-model §4, research D1 to D3). Pure functions: no storage, no network,
 * nothing logged (field names and values are user data).
 */

/**
 * Values of the template sent explicitly by the PUT: the warranty shown (spec 011 first, otherwise the template) is
 * the final value. Only ever applied to an object created by this same import (invariant 6).
 */
export function templatePatch(draft: ImportDraft & { template: TemplateChoice }): Partial<EntityUpdate> {
  const w = draft.warranty ?? null;
  return {
    insured: draft.template.insured,
    manufacturer: draft.template.manufacturer || undefined,
    modelNumber: draft.template.modelNumber || undefined,
    lifetimeWarranty: w?.lifetime === true,
    warrantyExpires: w && !w.lifetime && w.expires ? w.expires : undefined,
    warrantyDetails: w?.details.trim() || undefined,
  };
}

/** Same properties as `copyField` of the client (Swagger `repo.EntityFieldData`): a foreign field is sent back as is. */
const copy = (f: EntityField): EntityField => ({
  id: f.id,
  name: f.name,
  type: f.type,
  textValue: f.textValue,
  numberValue: f.numberValue,
  booleanValue: f.booleanValue,
});

/**
 * Fields of the PUT (research D2): each confirmed field takes the `id` of a current field not yet paired with the same
 * `(name, type)`; one without a match is sent without `id` (created); a current field left unpaired is sent back as is
 * (#109, invariant 7), so a resume never removes a field added meanwhile in HomeBox.
 */
export function fieldsFor(current: EntityField[] | null | undefined, confirmed: readonly TemplateFieldValue[]): EntityField[] {
  const pool = Array.isArray(current) ? current : [];
  const used = new Set<number>();
  const out: EntityField[] = confirmed.map((c) => {
    const index = pool.findIndex((f, i) => !used.has(i) && f.name === c.name && f.type === c.type);
    const values = { type: c.type, name: c.name, textValue: c.textValue, numberValue: c.numberValue, booleanValue: c.booleanValue };
    const match = pool[index];
    if (!match) return values;
    used.add(index);
    return match.id === undefined ? values : { id: match.id, ...values };
  });
  pool.forEach((f, i) => {
    if (!used.has(i)) out.push(copy(f));
  });
  return out;
}

/** Values compared for one kind (research D1); absent values read as ''/0/false. */
function sameValues(read: EntityField, c: TemplateFieldValue): boolean {
  const text = (read.textValue ?? '') === c.textValue;
  const num = (read.numberValue ?? 0) === c.numberValue;
  const bool = (read.booleanValue ?? false) === c.booleanValue;
  switch (c.kind) {
    case 'text':
    case 'time':
      return text;
    case 'number':
      return text && num;
    case 'boolean':
      return text && bool;
    default:
      return text && num && bool;
  }
}

/**
 * Read-back (FR-018): every confirmed field must be present on the object, each matched by a distinct read field of
 * the same `(name, type)` with equal values. Extra read fields are tolerated.
 */
export function fieldsMatch(read: EntityField[] | null | undefined, confirmed: readonly TemplateFieldValue[]): boolean {
  const pool = Array.isArray(read) ? read : [];
  const used = new Set<number>();
  return confirmed.every((c) => {
    const index = pool.findIndex((f, i) => !used.has(i) && f.name === c.name && f.type === c.type && sameValues(f, c));
    if (index < 0) return false;
    used.add(index);
    return true;
  });
}
