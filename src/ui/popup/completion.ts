import { orderNoteLine } from '@/background/import/completion';
import { tagKey } from '@/shared/tags';
import type {
  CompletionCategory,
  CompletionChange,
  CompletionChoice,
  CompletionKey,
  CompletionPreview,
  ImportDraft,
} from '@/shared/types';
import { DOCUMENT_KIND_KEYS } from '@/ui/document-kind-keys';
import type { ErrorCode } from '@/shared/errors';
import { errorMessage, formatDate, t, uiLanguage, type MessageKey } from '@/ui/i18n';

/**
 * Display logic of the completion of an existing HomeBox item (spec 021, contracts/ui-completion.md). Pure functions
 * of the popup: no network, no storage, nothing logged. Labels come from tables (key → message), never from nested
 * ternaries.
 */

/** Choice of one product in the duplicate dialog; `create` by default (FR-001). */
export type LineChoice =
  { kind: 'create' } | { kind: 'complete'; entityId: string; itemName: string; url: string };

/** Categories of the confirmation, in display order (U1). */
export const COMPLETION_CATEGORIES: readonly CompletionCategory[] = [
  'attachments',
  'tags',
  'purchase',
  'order',
];

export const CATEGORY_LABELS: Readonly<Record<CompletionCategory, MessageKey>> = {
  attachments: 'completion.category.attachments',
  tags: 'completion.category.tags',
  purchase: 'completion.category.purchase',
  order: 'completion.category.order',
};

/**
 * Errors of a completion (I1): the generic messages say "The item was created but…", which is false for an existing
 * item. These codes get their own text; the others (and every creation) keep the generic one.
 */
const COMPLETION_ERRORS: Partial<Record<ErrorCode, MessageKey>> = {
  UPDATE_FAILED: 'completion.error.UPDATE_FAILED',
  ATTACHMENT_FAILED: 'completion.error.ATTACHMENT_FAILED',
  PHOTO_UPLOAD_FAILED: 'completion.error.PHOTO_UPLOAD_FAILED',
  TAG_FAILED: 'completion.error.TAG_FAILED',
  ORDER_FIELDS_FAILED: 'completion.error.ORDER_FIELDS_FAILED',
};

/** Message of an error for a product completed instead of created. */
export function completionErrorMessage(code: ErrorCode): string {
  const key = COMPLETION_ERRORS[code];
  return key ? t(key) : errorMessage(code);
}

/** Title of the result: created items, completed items, or both (I1). */
export function doneMessage(created: number, completed: number): string {
  if (completed === 0)
    return created > 1 ? t('result.addedMany', [String(created)]) : t('result.addedOne');
  if (created > 0) return t('result.addedAndCompleted', [String(created), String(completed)]);
  return completed > 1 ? t('result.completedMany', [String(completed)]) : t('result.completedOne');
}

/** Primary button of the duplicate dialog: "Create anyway" until one product is set to "Complete" (FR-002, FR-003). */
export function primaryLabel(choices: Iterable<LineChoice>): string {
  for (const c of choices) if (c.kind === 'complete') return t('completion.reviewChanges');
  return t('summary.createAnyway');
}

/** Amount in the currency of the draft, in the interface language; the number alone for an unknown currency. */
export function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(uiLanguage() === 'fr' ? 'fr-FR' : 'en-GB', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return String(amount);
  }
}

/** Labels of the fixed keys, with the value of the draft that will be written. */
const FIXED_CHANGES: Partial<Record<CompletionKey, (d: ImportDraft) => string>> = {
  purchasePrice: (d) =>
    t('completion.change.purchasePrice', [formatAmount(d.purchasePrice ?? 0, d.currency)]),
  purchaseDate: (d) => t('completion.change.purchaseDate', [formatDate(d.purchaseDate ?? '')]),
  purchaseFrom: (d) => t('completion.change.purchaseFrom', [d.purchaseFrom.trim()]),
  warrantyExpires: (d) =>
    t('completion.change.warrantyExpires', [formatDate(d.warranty?.expires ?? '')]),
  lifetimeWarranty: () => t('completion.change.lifetimeWarranty'),
  warrantyDetails: (d) =>
    t('completion.change.warrantyDetails', [d.warranty?.details.trim() ?? '']),
  notes: (d) => t('completion.change.notes', [orderNoteLine(d) ?? '']),
};

/** Names of the fixed keys, without any value (what is "already set" in HomeBox is never shown). */
const FIXED_NAMES: Partial<Record<CompletionKey, MessageKey>> = {
  photo: 'completion.name.photo',
  notes: 'completion.name.notes',
  purchasePrice: 'completion.name.purchasePrice',
  purchaseDate: 'completion.name.purchaseDate',
  purchaseFrom: 'completion.name.purchaseFrom',
  warrantyExpires: 'completion.name.warrantyExpires',
  lifetimeWarranty: 'completion.name.lifetimeWarranty',
  warrantyDetails: 'completion.name.warrantyDetails',
  quantity: 'completion.name.quantity',
};

/** `doc:<id>` → `['doc', '<id>']`; a fixed key → `[key, '']`. */
function splitKey(key: CompletionKey): [string, string] {
  const at = key.indexOf(':');
  return at < 0 ? [key, ''] : [key.slice(0, at), key.slice(at + 1)];
}

const docOf = (d: ImportDraft, id: string) => d.documents.find((x) => x.id === id);
const tagNameOf = (d: ImportDraft, key: string) =>
  (d.tags ?? []).find((x) => tagKey(x.name) === key)?.name ?? key;
const fieldOf = (d: ImportDraft, role: string) =>
  (d.orderFields ?? []).find((o) => o.role === role);

/** Label of one change, with the value that will be written (contracts/ui-completion.md §2). */
export function changeLabel(change: CompletionChange, draft: ImportDraft): string {
  if (change.key === 'photo')
    return change.primary ? t('completion.change.photoPrimary') : t('completion.change.photo');
  const fixed = FIXED_CHANGES[change.key];
  if (fixed) return fixed(draft);
  const [prefix, rest] = splitKey(change.key);
  if (prefix === 'doc') {
    const doc = docOf(draft, rest);
    return doc
      ? t('completion.change.document', [t(DOCUMENT_KIND_KEYS[doc.kind].label), doc.label])
      : rest;
  }
  if (prefix === 'tag') return t('completion.change.tag', [tagNameOf(draft, rest)]);
  const field = fieldOf(draft, rest);
  return field ? t('completion.change.field', [field.name, field.value]) : rest;
}

/** Name of a key, without value: lists "already set" and "filled meanwhile". */
export function keyName(key: CompletionKey, draft: ImportDraft): string {
  const fixed = FIXED_NAMES[key];
  if (fixed) return t(fixed);
  const [prefix, rest] = splitKey(key);
  if (prefix === 'doc') return docOf(draft, rest)?.label ?? rest;
  if (prefix === 'tag') return t('completion.name.tag', [tagNameOf(draft, rest)]);
  return t('completion.name.field', [fieldOf(draft, rest)?.name ?? rest]);
}

/** Names joined for one line of text. */
export const keyNames = (keys: readonly CompletionKey[], draft: ImportDraft): string =>
  keys.map((k) => keyName(k, draft)).join(t('history.listSeparator'));

/** Confirmed choice of one product: the keys of the checked categories only; the quantity only when checked (R2). */
export function choiceFor(
  preview: CompletionPreview,
  checked: ReadonlySet<CompletionCategory>,
  quantityChecked: boolean,
  draft: ImportDraft,
): CompletionChoice {
  const keys = preview.changes.filter((c) => checked.has(c.category)).map((c) => c.key);
  const itemName = (preview.itemName.trim() || draft.name.trim()).slice(0, 255);
  return {
    entityId: preview.entityId,
    itemName,
    keys,
    ...(quantityChecked ? { quantityIncrease: draft.quantity } : {}),
  };
}

/** Draft sent for the preview: no template, no completion, no location (C4; contracts/runtime-messages.md §1). */
export function previewDraft(base: ImportDraft): ImportDraft {
  const draft: ImportDraft = { ...base, location: null };
  delete draft.template;
  delete draft.complete;
  // Spec 023: a completed or previewed item is never given a type.
  delete draft.entityTypeId;
  // Spec 027: the completion path is not extended (no manufacturer, model nor serial number).
  delete draft.identifiers;
  return draft;
}

/**
 * Draft of a product completed instead of created (contracts/ui-completion.md §3): `location: null`, no template, the
 * order fields only when some are confirmed, and the confirmed choice.
 */
export function completedDraft(base: ImportDraft, choice: CompletionChoice): ImportDraft {
  const draft = previewDraft(base);
  if (!choice.keys.some((k) => k.startsWith('field:'))) delete draft.orderFields;
  // Spec 025: a completion never adds the order page link.
  delete draft.orderLink;
  return { ...draft, complete: choice };
}
