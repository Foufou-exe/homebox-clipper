import { MERCHANT_CATALOG } from '@/content/merchants/catalog';
import { formatDate, t } from '@/ui/i18n';
import type {
  DetectedProduct,
  DetectedPurchase,
  ImportDraft,
  LocationChoice,
  LocationOption,
  TagOption,
  TemplateChoice,
  TemplateDetail,
  TemplateFieldValue,
  TemplateFieldView,
  WarrantyDraft,
} from '@/shared/types';
import {
  DEFAULT_WARRANTY_SETTINGS,
  isStoreSeller,
  isValidIsoDate,
  proposeWarranty,
  type WarrantyProposal,
  type WarrantySettings,
  type WarrantyTexts,
} from '@/shared/warranty';
import { MAX_FIELD_NAME_BYTES, MAX_FIELD_TEXT_BYTES, utf8ByteLength } from '@/shared/utf8';
import { MAX_TAGS_PER_PRODUCT, findExisting, normalizeTagName, proposeTags, tagKey, tagNameError, type TagLine, type TagSettings } from '@/shared/tags';

export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return t('common.sizeBytes', [String(bytes)]);
  if (bytes < 1024 * 1024) return t('common.sizeKb', [String(Math.round(bytes / 1024))]);
  return t('common.sizeMb', [(bytes / 1024 / 1024).toFixed(1)]);
}

/** Description of the item: the store of origin and the purchase date in the interface language (FR-007). */
export function defaultDescription(purchaseDate: string | null, storeName: string): string {
  return purchaseDate
    ? t('summary.defaultDescription', [storeName, formatDate(purchaseDate)])
    : t('summary.defaultDescriptionNoDate', [storeName]);
}

export function emptyDraft(): ImportDraft {
  return {
    name: '',
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
    location: null,
    warranty: null,
  };
}

/** Context of the drafts: the warranty setting, read when the popup opens (spec 011). Optional everywhere. */
export interface DraftContext {
  settings: WarrantySettings;
}

/** Duration shown in the default details: always a whole number of years (24, 36, `years x 12`). */
function yearsLabel(months: number): string {
  const years = Math.round(months / 12);
  return years === 1 ? t('warranty.duration.one') : t('warranty.duration.other', [String(years)]);
}

/** Texts of the proposed warranty, in the interface language (FR-009). */
export function warrantyTexts(): WarrantyTexts {
  return {
    legal: (months) => t('warranty.detail.legal', [yearsLabel(months)]),
    fallback: (months) => t('warranty.detail.fallback', [yearsLabel(months)]),
    withPage: (detail, pageLabel) => t('warranty.detail.withPage', [detail, pageLabel]),
  };
}

/** Store of a detected purchase: `source` is always set by its extractor. */
function storeOf(purchase: DetectedPurchase) {
  return MERCHANT_CATALOG.find((e) => e.id === purchase.source);
}

/**
 * Warranty proposed for a product, with the reason of an empty section. The reason stays next to the draft
 * (never inside it, never sent nor persisted).
 */
export function proposalFor(
  purchase: DetectedPurchase,
  product: DetectedProduct | null,
  ctx?: DraftContext,
): WarrantyProposal {
  const store = storeOf(purchase);
  return proposeWarranty({
    purchaseDate: purchase.orderDate.value,
    country: store?.country ?? null,
    sellerIsStore: isStoreSeller(product?.seller?.value ?? null, store?.ownSellers ?? []),
    settings: ctx?.settings ?? DEFAULT_WARRANTY_SETTINGS,
    pageWarranty: product?.pageWarranty?.value ?? null,
    texts: warrantyTexts(),
  });
}

/** Editable draft pre-filled with the detected values (or empty if not detected). */
export function draftFrom(purchase: DetectedPurchase, product: DetectedProduct | null, ctx?: DraftContext): ImportDraft {
  const date = purchase.orderDate.value;
  const imageUrl = product?.imageUrl.value ?? null;
  const store = storeOf(purchase);
  const storeName = store?.displayName ?? purchase.source;
  return {
    name: product?.name.value ?? '',
    description: defaultDescription(date, storeName),
    purchasePrice: product?.unitPrice.value ?? null,
    // Price not detected: currency of the store (GBP on Amazon.co.uk), never a conversion (R9).
    currency: product?.currency.value ?? store?.defaultCurrency ?? 'EUR',
    purchaseDate: date,
    purchaseFrom: purchase.seller.value ?? storeName,
    orderNumber: purchase.orderNumber.value,
    quantity: product?.quantity.value ?? 1,
    pageUrl: purchase.pageUrl,
    documents: [],
    // Checked by default (FR-002); `null` without a detected photo or in manual entry.
    photo: imageUrl ? { url: imageUrl, merchantId: purchase.source, include: true } : null,
    // Resolved at submission from the order choice and the row choice (FR-014).
    location: null,
    warranty: proposalFor(purchase, product, ctx).warranty,
  };
}

/** Fields not detected, flagged in the form (FR-008). */
export function missingFields(purchase: DetectedPurchase | null, product: DetectedProduct | null): string[] {
  if (!purchase) return [];
  const missing: string[] = [];
  if (!product || product.name.value === null) missing.push('name');
  if (!product || product.unitPrice.value === null) missing.push('purchasePrice');
  if (purchase.orderDate.value === null) missing.push('purchaseDate');
  if (purchase.orderNumber.value === null) missing.push('orderNumber');
  if (purchase.seller.value === null) missing.push('purchaseFrom');
  return missing;
}

/** Errors of the main fields (everything but the warranty, which shows its own). */
export function fieldErrors(d: ImportDraft, today = new Date().toISOString().slice(0, 10)): string[] {
  const errors: string[] = [];
  if (d.name.trim() === '') errors.push(t('fields.errors.nameRequired'));
  if (d.name.length > 255) errors.push(t('fields.errors.nameTooLong'));
  if (d.description.length > 1000) errors.push(t('fields.errors.descriptionTooLong'));
  if (d.purchasePrice !== null && (!Number.isFinite(d.purchasePrice) || d.purchasePrice < 0)) {
    errors.push(t('fields.errors.priceInvalid'));
  }
  if (d.purchaseDate !== null && d.purchaseDate > today) errors.push(t('fields.errors.dateInFuture'));
  if (d.purchaseFrom.length > 255) errors.push(t('fields.errors.sellerTooLong'));
  if (!Number.isInteger(d.quantity) || d.quantity < 1) errors.push(t('fields.errors.quantityInvalid'));
  return errors;
}

/** Errors of the warranty section: invalid expiry date, details too long. */
export function warrantyErrors(w: WarrantyDraft | null | undefined): string[] {
  if (!w) return [];
  const errors: string[] = [];
  if (w.expires !== null && !isValidIsoDate(w.expires)) errors.push(t('warranty.errors.dateInvalid'));
  if (w.details.length > 1000) errors.push(t('warranty.errors.detailsTooLong'));
  return errors;
}

export function draftErrors(d: ImportDraft, today = new Date().toISOString().slice(0, 10)): string[] {
  return [...fieldErrors(d, today), ...warrantyErrors(d.warranty)];
}

/**
 * Tags proposed for a product (spec 014), all checked: the store brand (if enabled and known), then the user rules
 * evaluated on the detected name, at opening only (E3). Manual entry: no store, no name, so nothing proposed.
 */
export function tagLinesFor(merchantTagName: string | null, productName: string | null, settings: TagSettings): TagLine[] {
  return proposeTags({ merchantTagName, productName, settings }).map(({ name, origin }) => ({
    key: tagKey(name),
    name,
    id: null,
    origin,
    checked: true,
  }));
}

/*
 * HomeBox templates in the summary (spec 018, contracts/ui.md §1.3, §1.4, data-model §7). Pure functions: the
 * component keeps the state in memory only; nothing is logged nor persisted.
 */

/** Maximum size of a text field value (HomeBox `MaxLen(500)`), in UTF-8 bytes (#116). */
export const MAX_FIELD_TEXT = MAX_FIELD_TEXT_BYTES;

/** Edited value of one custom field: `raw` for text, number and date; `checked` for a boolean. */
export interface FieldInput {
  view: TemplateFieldView;
  raw: string;
  checked: boolean;
  error: 'notInteger' | 'tooLong' | 'invalidDate' | null;
}

/** Template of one product, in the memory of the popup only. */
export interface LineTemplate {
  /** Current choice; null = « None ». */
  id: string | null;
  /** `error`: the template was deleted before the import (US6-1); the choice is kept, the confirmation blocked. */
  state: 'none' | 'loading' | 'ready' | 'error';
  detail: TemplateDetail | null;
  values: { manufacturer: string; modelNumber: string; insured: boolean; fields: FieldInput[] };
  /** What the template set, to remove it on a change (FR-003). */
  applied: {
    description: string | null;
    quantity: number | null;
    warranty: boolean;
    tagKeys: string[];
    location: boolean;
  };
}

/** The part of a summary line a template reads and changes. */
export interface TemplateLineState {
  draft: ImportDraft;
  tags: TagLine[];
  template: LineTemplate;
}

export interface ApplyContext {
  /** Manual entry (`product === null`): the quantity of the template is used (FR-012). */
  manual: boolean;
  tagState: 'loading' | 'ready' | 'unavailable';
  tagOptions: readonly TagOption[];
  locations: readonly LocationOption[];
  /** Effective location of the product (order choice or its own). */
  currentLocation: LocationChoice | null;
}

export function emptyLineTemplate(): LineTemplate {
  return {
    id: null,
    state: 'none',
    detail: null,
    values: { manufacturer: '', modelNumber: '', insured: false, fields: [] },
    applied: { description: null, quantity: null, warranty: false, tagKeys: [], location: false },
  };
}

const isInteger = (raw: string) => /^-?\d+$/.test(raw) && Number.isSafeInteger(Number(raw));

/** Error of one field (contracts/ui.md §1.4): empty is always accepted. */
export function fieldError(input: Pick<FieldInput, 'view' | 'raw'>): FieldInput['error'] {
  const raw = input.raw;
  switch (input.view.kind) {
    case 'text':
      return utf8ByteLength(raw) > MAX_FIELD_TEXT ? 'tooLong' : null;
    case 'number':
      return raw.trim() === '' || isInteger(raw.trim()) ? null : 'notInteger';
    case 'time':
      return raw === '' || isValidIsoDate(raw) ? null : 'invalidDate';
    default:
      return null;
  }
}

/** Pre-fill (research D1): never `timeValue`, which is only a creation timestamp. */
export function fieldInputFor(view: TemplateFieldView): FieldInput {
  let raw = view.textValue;
  const invalid = (view.kind === 'number' && !isInteger(raw)) || (view.kind === 'time' && !isValidIsoDate(raw));
  if (invalid) raw = '';
  return { view, raw, checked: view.booleanValue, error: null };
}

/** Value sent for one field (research D1): numbers and booleans also in text; a date in `textValue`. */
export function fieldValue(input: FieldInput): TemplateFieldValue {
  const { type, kind, name } = input.view;
  switch (kind) {
    case 'number': {
      const raw = input.raw.trim();
      if (raw === '') return { type, kind, name, textValue: '', numberValue: 0, booleanValue: false };
      const n = Number(raw);
      return { type, kind, name, textValue: String(n), numberValue: n, booleanValue: false };
    }
    case 'boolean':
      return { type, kind, name, textValue: String(input.checked), numberValue: 0, booleanValue: input.checked };
    case 'unknown':
      // Read-only: the values of the template, as is (FR-008).
      return { type, kind, name, textValue: input.view.textValue, numberValue: input.view.numberValue, booleanValue: input.view.booleanValue };
    default:
      return { type, kind, name, textValue: input.raw, numberValue: 0, booleanValue: false };
  }
}

/** Spec 019: a field merged with an order field (name trimmed in `exclude`) is neither sent nor checked here. */
const notExcluded = (exclude: ReadonlySet<string>) => (f: FieldInput) => !exclude.has(f.view.name.trim());

/**
 * True when the template of the line blocks the confirmation: loading, deleted, or a field in error. `exclude`
 * (spec 019): names of the fields merged with an order field; without it, the behavior of spec 018.
 */
export function templateBlocks(t: LineTemplate, exclude: readonly string[] = []): boolean {
  if (t.id === null) return false;
  if (t.state !== 'ready' || !t.detail) return true;
  const kept = notExcluded(new Set(exclude));
  const fieldInError = t.values.fields.some((f) => kept(f) && fieldError(f) !== null);
  return fieldInError || t.values.manufacturer.length > 255 || t.values.modelNumber.length > 255;
}

/**
 * Choice sent with the import (data-model §3), built from the values shown; `null` without a ready template.
 * `exclude` (spec 019): the fields merged with an order field are not sent; without it, the behavior of spec 018.
 */
export function templateChoiceFor(t: LineTemplate, exclude: readonly string[] = []): TemplateChoice | null {
  if (t.id === null || t.state !== 'ready' || !t.detail) return null;
  return {
    id: t.detail.id,
    name: t.detail.name,
    fingerprint: t.detail.fingerprint,
    insured: t.values.insured,
    manufacturer: t.values.manufacturer,
    modelNumber: t.values.modelNumber,
    fields: t.values.fields.filter(notExcluded(new Set(exclude))).map(fieldValue),
  };
}

const bounded = (x: unknown, max: number, min = 0) => typeof x === 'string' && x.length >= min && x.length <= max;
const boundedBytes = (x: unknown, max: number, min = 0) =>
  typeof x === 'string' && x.length <= max && utf8ByteLength(x) >= min && utf8ByteLength(x) <= max;

/** Defense of the interface (data-model §2): a detail out of bounds is treated as unreadable. */
export function isTemplateDetail(x: unknown): x is TemplateDetail {
  if (typeof x !== 'object' || x === null) return false;
  const d = x as Record<string, unknown>;
  return (
    bounded(d.id, 64, 1) &&
    bounded(d.name, 255, 1) &&
    /^[0-9a-f]{64}$/.test(String(d.fingerprint)) &&
    bounded(d.description, 1000) &&
    bounded(d.manufacturer, 255) &&
    bounded(d.modelNumber, 255) &&
    bounded(d.warrantyDetails, 1000) &&
    typeof d.insured === 'boolean' &&
    typeof d.lifetimeWarranty === 'boolean' &&
    (d.quantity === null || (Number.isInteger(d.quantity) && (d.quantity as number) >= 1)) &&
    (d.locationId === null || bounded(d.locationId, 255, 1)) &&
    Array.isArray(d.tags) &&
    Array.isArray(d.fields) &&
    d.fields.length <= 100 &&
    d.fields.every((f: unknown) => {
      if (typeof f !== 'object' || f === null) return false;
      const v = f as Record<string, unknown>;
      return (
        bounded(v.type, 32, 1) &&
        ['text', 'number', 'boolean', 'time', 'unknown'].includes(String(v.kind)) &&
        boundedBytes(v.name, MAX_FIELD_NAME_BYTES, 1) &&
        boundedBytes(v.textValue, MAX_FIELD_TEXT) &&
        Number.isSafeInteger(v.numberValue) &&
        typeof v.booleanValue === 'boolean'
      );
    })
  );
}

/** Line of a default tag: with the list ready, only a tag still present in HomeBox (never created from a template). */
function templateTagLine(key: string, name: string, id: string, ctx: ApplyContext): TagLine | null {
  if (ctx.tagState !== 'ready') return { key, name, id, origin: 'template', checked: true };
  const existing = findExisting({ name, id }, ctx.tagOptions);
  if (!existing) return null;
  const hbName = normalizeTagName(existing.name);
  return tagNameError(hbName) === null ? { key: tagKey(hbName), name: hbName, id: existing.id, origin: 'template', checked: true } : null;
}

/** Default tags of the template added to the line (FR-015): union by key, never a duplicate nor a mark on an existing line. */
function templateTags(tags: TagLine[], detail: TemplateDetail, ctx: ApplyContext): { tags: TagLine[]; keys: string[] } {
  const out = [...tags];
  const keys: string[] = [];
  for (const tag of detail.tags) {
    const name = normalizeTagName(tag.name);
    if (tagNameError(name) !== null || out.length >= MAX_TAGS_PER_PRODUCT) continue;
    const key = tagKey(name);
    if (out.some((l) => l.key === key)) continue;
    const line = templateTagLine(key, name, tag.id, ctx);
    if (!line || out.some((l) => l.key === line.key)) continue;
    out.push(line);
    keys.push(line.key);
  }
  return { tags: out, keys };
}

/**
 * Applies a template detail on a line (contracts/ui.md §1.3), after removal of the previous one. Returns the new line
 * and the default location to propose (or `null`); the caller places it (order field or product).
 */
export function applyTemplate(
  input: TemplateLineState,
  detail: TemplateDetail,
  ctx: ApplyContext,
): { line: TemplateLineState; location: LocationChoice | null } {
  const draft: ImportDraft = { ...input.draft };
  const applied: LineTemplate['applied'] = { description: null, quantity: null, warranty: false, tagKeys: [], location: false };
  if (draft.description.trim() === '' && detail.description !== '') {
    draft.description = detail.description;
    applied.description = detail.description;
  }
  if (ctx.manual && detail.quantity !== null) {
    draft.quantity = detail.quantity;
    applied.quantity = detail.quantity;
  }
  if (!draft.warranty && (detail.lifetimeWarranty || detail.warrantyDetails !== '')) {
    draft.warranty = { origin: 'template', lifetime: detail.lifetimeWarranty, expires: null, details: detail.warrantyDetails, durationMonths: null, edited: false };
    applied.warranty = true;
  }
  const { tags, keys } = templateTags(input.tags, detail, ctx);
  applied.tagKeys = keys;
  const proposed = ctx.currentLocation === null && detail.locationId ? ctx.locations.find((l) => l.id === detail.locationId) : undefined;
  applied.location = proposed !== undefined;
  return {
    line: {
      draft,
      tags,
      template: {
        id: detail.id,
        state: 'ready',
        detail,
        values: {
          manufacturer: detail.manufacturer,
          modelNumber: detail.modelNumber,
          insured: detail.insured,
          fields: detail.fields.map(fieldInputFor),
        },
        applied,
      },
    },
    location: proposed ? { id: proposed.id, path: [...proposed.path] } : null,
  };
}

/** Removes what the template set and is still unchanged (FR-003, US1-8); `removeLocation` when it proposed one. */
export function removeTemplate(input: TemplateLineState): { line: TemplateLineState; removeLocation: boolean } {
  const { applied } = input.template;
  const draft: ImportDraft = { ...input.draft };
  if (applied.description !== null && draft.description === applied.description) draft.description = '';
  if (applied.quantity !== null && draft.quantity === applied.quantity) draft.quantity = 1;
  if (applied.warranty && draft.warranty?.origin === 'template' && !draft.warranty.edited) draft.warranty = null;
  const tags = input.tags.filter((t) => !(t.origin === 'template' && applied.tagKeys.includes(t.key)));
  return { line: { draft, tags, template: emptyLineTemplate() }, removeLocation: applied.location };
}

/**
 * A changed template (US6-2): the new detail replaces the old one, the values entered are kept for the fields of the
 * same `(name, type)` at the same occurrence. Returns the list of changes (fields added, removed, defaults changed).
 */
export function mergeChangedDetail(t: LineTemplate, next: TemplateDetail): { template: LineTemplate; changes: string[] } {
  const old = t.detail;
  const occurrence = (fields: readonly TemplateFieldView[], i: number) => {
    const target = fields[i];
    return target ? fields.slice(0, i).filter((f) => f.name === target.name && f.type === target.type).length : 0;
  };
  const find = <T extends { name: string; type: string }>(list: readonly T[], f: TemplateFieldView, occ: number): T | undefined =>
    list.filter((x) => x.name === f.name && x.type === f.type)[occ];
  const fields = next.fields.map((view, i) => {
    const kept = find(
      t.values.fields.map((input) => ({ ...input, name: input.view.name, type: input.view.type })),
      view,
      occurrence(next.fields, i),
    );
    return kept ? { view, raw: kept.raw, checked: kept.checked, error: null } : fieldInputFor(view);
  });
  const changes: string[] = [];
  const before = old?.fields ?? [];
  next.fields.forEach((f, i) => {
    const prev = find(before, f, occurrence(next.fields, i));
    if (!prev) changes.push(`+ ${f.name}`);
    else if (prev.textValue !== f.textValue || prev.numberValue !== f.numberValue || prev.booleanValue !== f.booleanValue) changes.push(f.name);
  });
  before.forEach((f, i) => {
    if (!find(next.fields, f, occurrence(before, i))) changes.push(`− ${f.name}`);
  });
  return { template: { ...t, state: 'ready', detail: next, values: { ...t.values, fields } }, changes };
}
