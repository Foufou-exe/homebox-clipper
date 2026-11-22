import { storeForPageUrl } from '@/content/merchants/catalog';
import {
  ORDER_FIELD_ROLES,
  orderValueError,
  type OrderFieldRole,
  type OrderFieldSettings,
  type OrderValueError,
} from '@/shared/order-fields';
import type { ImportDraft, OrderFieldValue } from '@/shared/types';
import { t } from '@/ui/i18n';
import type { FieldInput, LineTemplate } from './drafts';

/*
 * Order fields in the summary (spec 019, contracts/ui.md §2, data-model §6). Pure functions: the component keeps the
 * state in memory only (it disappears with the popup); nothing is logged nor persisted.
 */

/** Values of the merchant and of the URL of one product; `edited`: changed by the user in the section. */
export interface LineOrderFields {
  merchant: { value: string; edited: boolean };
  orderUrl: { value: string; edited: boolean };
}

export type OrderRowState = 'create' | 'empty' | 'merged' | 'conflict';

export interface OrderFieldRow {
  role: OrderFieldRole;
  /** Name of the settings of the target instance. */
  name: string;
  /** Value shown (trimmed when sent). */
  value: string;
  state: OrderRowState;
  error: OrderValueError | null;
  /** `conflict`: type of the template field (label); `merged`: exact name of the merged template field. */
  templateType?: string;
  templateFieldName?: string;
}

/** Initial values (FR-011): the store of origin used in the notes and the order page address. */
export function initialOrderFields(draft: ImportDraft): LineOrderFields {
  return {
    merchant: { value: storeForPageUrl(draft.pageUrl)?.displayName ?? '', edited: false },
    orderUrl: { value: draft.pageUrl ?? '', edited: false },
  };
}

/** Labels of the template field types that cannot hold an order field (FR-017). */
const TYPE_KEYS = {
  number: 'orderFields.type.number',
  boolean: 'orderFields.type.boolean',
  time: 'orderFields.type.time',
  unknown: 'orderFields.type.unknown',
} as const;

/** Type shown for a conflict: the first non-text field; several text fields (P3): their HomeBox type as is. */
function typeLabel(same: readonly FieldInput[]): string {
  const other = same.find((f) => f.view.kind !== 'text');
  return other
    ? t(TYPE_KEYS[other.view.kind as keyof typeof TYPE_KEYS])
    : (same[0]?.view.type ?? '');
}

/**
 * Value of a role: the number is always the single entry of the draft (FR-010; empty ⇒ no merge, P1). Merchant and URL
 * (FR-016): the entry once edited, else the value of the order, else the text value of the merged template field.
 */
function valueOf(
  role: OrderFieldRole,
  draft: ImportDraft,
  values: LineOrderFields,
  merged: FieldInput | undefined,
): string {
  if (role === 'orderNumber') return draft.orderNumber ?? '';
  const own = values[role];
  if (own.edited || own.value.trim() !== '' || !merged) return own.value;
  return merged.raw;
}

/** One row (research D7): conflict, empty, merged with a text field of the template, or created. */
function rowFor(
  role: OrderFieldRole,
  name: string,
  draft: ImportDraft,
  values: LineOrderFields,
  fields: readonly FieldInput[],
): OrderFieldRow {
  // Exact name (edge spaces ignored, case kept: HomeBox distinguishes the names).
  const same = fields.filter((f) => f.view.name.trim() === name);
  const single = same.length === 1 && same[0]?.view.kind === 'text' ? same[0] : undefined;
  if (same.length > 0 && !single) {
    return {
      role,
      name,
      value: valueOf(role, draft, values, undefined),
      state: 'conflict',
      error: null,
      templateType: typeLabel(same),
    };
  }
  const value = valueOf(role, draft, values, single);
  const error = orderValueError(role, value);
  if (value.trim() === '') return { role, name, value, state: 'empty', error };
  if (single)
    return { role, name, value, state: 'merged', error, templateFieldName: single.view.name };
  return { role, name, value, state: 'create', error };
}

/** Rows shown for one product, in the order number, merchant, URL; only a template ready is taken into account. */
export function orderFieldRows(
  settings: OrderFieldSettings,
  draft: ImportDraft,
  values: LineOrderFields,
  template: LineTemplate,
): OrderFieldRow[] {
  const fields = template.state === 'ready' ? template.values.fields : [];
  return ORDER_FIELD_ROLES.map((role) => rowFor(role, settings.names[role], draft, values, fields));
}

const sent = (r: OrderFieldRow) => r.state === 'create' || r.state === 'merged';

/** True when a row to create has an error (FR-013): the confirmation is blocked. */
export function orderFieldsBlock(rows: readonly OrderFieldRow[]): boolean {
  return rows.some((r) => sent(r) && r.error !== null);
}

/** Order fields sent with the import; `null` when none is to create (no key at all, FR-025). */
export function orderFieldsFor(rows: readonly OrderFieldRow[]): OrderFieldValue[] | null {
  const out = rows
    .filter((r) => sent(r) && r.error === null)
    .map((r) => ({ role: r.role, name: r.name, value: r.value.trim() }));
  return out.length ? out : null;
}

/** Names (trimmed) of the template fields merged into an order field: removed from `template.fields`. */
export function mergedTemplateNames(rows: readonly OrderFieldRow[]): string[] {
  return rows.flatMap((r) =>
    r.state === 'merged' && r.templateFieldName !== undefined ? [r.templateFieldName.trim()] : [],
  );
}
