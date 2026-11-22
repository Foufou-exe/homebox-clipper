import type { EntityField, EntityOut, EntityUpdate } from '@/background/homebox/types';
import { storeForPageUrl } from '@/content/merchants/catalog';
import { getMessage } from '@/platform/i18n';
import { tagKey } from '@/shared/tags';
import type {
  CompletionCategory,
  CompletionChange,
  CompletionChoice,
  CompletionKey,
  CompletionPreview,
  DocumentRef,
  ImportDraft,
  OrderFieldValue,
} from '@/shared/types';
import { isEmptyHomeBox, isValidIsoDate } from '@/shared/warranty';
import { currentFields } from './order-fields';

/**
 * Completion of an EXISTING HomeBox item (spec 021, data-model §3, contracts/completion-plan.md). Pure functions: no
 * storage, no network, no clock, nothing logged (the item read and the draft are user data). Only additions are ever
 * computed: a value already set in HomeBox is never part of a patch.
 */

/** Same limit as `warrantyPatch` (`warrantyDetails`, 1000 characters). */
const MAX_DETAILS = 1000;

/** HomeBox empty value: absent, `null`, `""` or the zero date (research R1). */
export const isEmptyValue = (v: unknown): boolean => isEmptyHomeBox(v);

/** HomeBox stores the price as a plain number: `0` is indistinguishable from "not set" (research R1.2). */
export const isEmptyPrice = (p: number | null | undefined): boolean =>
  p === undefined || p === null || p === 0;

/** A warranty is set when it is lifetime or has an expiry date (research R1.4). */
export const hasWarranty = (e: EntityOut): boolean =>
  e.lifetimeWarranty === true || !isEmptyValue(e.warrantyExpires);

/** A delivery note whose name already says what it is keeps it (no double prefix); otherwise the prefix is added. */
const EXPLICIT_DELIVERY_NOTE =
  /bon[-_ ]?de[-_ ]?livraison|delivery[-_ ]?note|packing[-_ ]?slip|bordereau/i;

/** Name of the attachment of a document (moved from the orchestrator, unchanged; re-exported there). */
export function attachmentName(doc: DocumentRef): string {
  const base =
    doc.kind === 'delivery_note' && !EXPLICIT_DELIVERY_NOTE.test(doc.label)
      ? `${getMessage('documents.deliveryNotePrefix')}${doc.label}`
      : doc.label;
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

/** Title HomeBox gives an attachment (`sanitizeAttachmentName`: base name, then `..`, `/` and `\` removed). */
export function attachmentTitle(name: string): string {
  // Trailing slashes removed without a regular expression (no backtracking, Sonar S8786).
  let end = name.length;
  while (end > 0 && name[end - 1] === '/') end--;
  const trimmed = name.slice(0, end);
  const base = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return base.replaceAll('..', '').replaceAll('/', '').replaceAll('\\', '');
}

/**
 * Notes line of the order (FR-015): the same text as the first line of the creation note (`summary.orderNote` with the
 * store of origin, else `summary.orderNoteNoStore`), without the page address. `null` without an order number.
 */
export function orderNoteLine(draft: ImportDraft): string | null {
  const number = draft.orderNumber?.trim();
  if (!number) return null;
  const store = storeForPageUrl(draft.pageUrl);
  return store
    ? getMessage('summary.orderNote', [store.displayName, number])
    : getMessage('summary.orderNoteNoStore', [number]);
}

/**
 * Notes line of the order (FR-015): added at the end of the notes read (after a newline, or alone), only when they do
 * not already contain the order number. `notes`: the notes to send when `add`.
 */
export function orderLine(
  e: EntityOut,
  draft: ImportDraft,
  note: string | null,
): { add: boolean; notes: string } {
  const current = e.notes ?? '';
  const number = draft.orderNumber?.trim() ?? '';
  if (number === '' || !note || current.includes(number)) return { add: false, notes: current };
  return { add: true, notes: current === '' ? note : `${current}\n${note}` };
}

/** Changes and keys already set, for one category. */
interface Part {
  changes: CompletionChange[];
  filled: CompletionKey[];
}

/** Records one key the draft provides: a change when applicable on the item, otherwise "already set". */
function decide(
  part: Part,
  category: CompletionCategory,
  key: CompletionKey,
  applicable: boolean,
): void {
  if (applicable) part.changes.push({ key, category });
  else part.filled.push(key);
}

const emptyPart = (): Part => ({ changes: [], filled: [] });

/** Warranty details of the draft, trimmed; `''` when absent or too long. */
function draftDetails(draft: ImportDraft): string {
  const details = draft.warranty?.details.trim() ?? '';
  return details.length <= MAX_DETAILS ? details : '';
}

/** Purchase and warranty (research D1): each value of the draft only when the item's is empty. */
export function purchaseChanges(e: EntityOut, draft: ImportDraft): Part {
  const part = emptyPart();
  const add = (key: CompletionKey, applicable: boolean) =>
    decide(part, 'purchase', key, applicable);
  if (draft.purchasePrice !== null) add('purchasePrice', isEmptyPrice(e.purchasePrice));
  if (isValidIsoDate(draft.purchaseDate)) add('purchaseDate', isEmptyValue(e.purchaseDate));
  if (draft.purchaseFrom.trim() !== '') add('purchaseFrom', isEmptyValue(e.purchaseFrom));
  const w = draft.warranty;
  if (w?.lifetime) add('lifetimeWarranty', !hasWarranty(e));
  else if (w && isValidIsoDate(w.expires)) add('warrantyExpires', !hasWarranty(e));
  if (draftDetails(draft) !== '') add('warrantyDetails', isEmptyValue(e.warrantyDetails));
  return part;
}

/** A custom field of the same name exists (edge spaces removed, exact case, any type: rule of spec 019). */
const hasField = (e: EntityOut, name: string): boolean =>
  Array.isArray(e.fields) &&
  e.fields.some((f) => typeof f.name === 'string' && f.name.trim() === name.trim());

/** Order fields absent from the item, then the notes line. */
export function orderChanges(e: EntityOut, draft: ImportDraft, note: string | null): Part {
  const part = emptyPart();
  for (const o of draft.orderFields ?? [])
    decide(part, 'order', `field:${o.role}`, !hasField(e, o.name));
  if (draft.orderNumber?.trim() && note)
    decide(part, 'order', 'notes', orderLine(e, draft, note).add);
  return part;
}

/** A checked tag already on the item: same identifier, otherwise same key (case, accents and spacing ignored). */
export function tagPresent(e: EntityOut, choice: { name: string; id?: string }): boolean {
  const key = tagKey(choice.name);
  return (e.tags ?? []).some(
    (t) =>
      (choice.id !== undefined && t.id === choice.id) ||
      (typeof t.name === 'string' && tagKey(t.name) === key),
  );
}

/** Checked tags missing from the item; no tag is ever removed. */
export function tagChanges(e: EntityOut, draft: ImportDraft): Part {
  const part = emptyPart();
  for (const choice of draft.tags ?? [])
    decide(part, 'tags', `tag:${tagKey(choice.name)}`, !tagPresent(e, choice));
  return part;
}

/** Titles of the attachments of the item. */
const titlesOf = (e: EntityOut): Set<string> =>
  new Set((e.attachments ?? []).flatMap((a) => (typeof a.title === 'string' ? [a.title] : [])));

/** A document whose (normalised) title is already among the attachments of the item (FR-018). */
export const attachmentPresent = (e: EntityOut, doc: DocumentRef): boolean =>
  titlesOf(e).has(attachmentTitle(attachmentName(doc)));

/** Number of photos of the item: the resume guard of the completion photo (research D3). */
export const photoCount = (e: EntityOut): number =>
  (e.attachments ?? []).filter((a) => a.type === 'photo').length;

/** The item has a primary photo (research D3). */
export const hasPrimaryPhoto = (e: EntityOut): boolean =>
  (e.attachments ?? []).some((a) => a.type === 'photo' && a.primary === true);

/** Documents whose title is not on the item yet; the photo (always added when checked), primary only without one. */
export function attachmentChanges(e: EntityOut, draft: ImportDraft): Part {
  const part = emptyPart();
  for (const doc of draft.documents)
    decide(part, 'attachments', `doc:${doc.id}`, !attachmentPresent(e, doc));
  if (draft.photo?.include)
    part.changes.push({ key: 'photo', category: 'attachments', primary: !hasPrimaryPhoto(e) });
  return part;
}

/** Plan of a completion on the item read: attachments, tags, purchase, order (contracts/completion-plan.md §1). */
export function planCompletion(
  e: EntityOut,
  draft: ImportDraft,
  note: string | null,
): Omit<CompletionPreview, 'entityId' | 'itemName'> {
  const parts = [
    attachmentChanges(e, draft),
    tagChanges(e, draft),
    purchaseChanges(e, draft),
    orderChanges(e, draft, note),
  ];
  return {
    quantity: typeof e.quantity === 'number' ? e.quantity : 0,
    changes: parts.flatMap((p) => p.changes),
    filled: parts.flatMap((p) => p.filled),
  };
}

/** Keys written by the PUT of a completion (documents, photo and tags have their own steps). */
const isPatchKey = (k: CompletionKey): boolean =>
  !k.startsWith('doc:') && !k.startsWith('tag:') && k !== 'photo';

/** Value of one purchase key, taken from the draft. */
function purchaseValue(draft: ImportDraft, key: CompletionKey): Partial<EntityUpdate> {
  switch (key) {
    case 'purchasePrice':
      return { purchasePrice: draft.purchasePrice ?? undefined };
    case 'purchaseDate':
      return { purchaseDate: draft.purchaseDate ?? undefined };
    case 'purchaseFrom':
      return { purchaseFrom: draft.purchaseFrom.trim() };
    case 'warrantyExpires':
      return { warrantyExpires: draft.warranty?.expires ?? undefined };
    case 'lifetimeWarranty':
      return { lifetimeWarranty: true };
    case 'warrantyDetails':
      return { warrantyDetails: draftDetails(draft) };
    default:
      return {};
  }
}

/** A field added by the completion: sent without `id`, so HomeBox creates it (same shape as spec 019). */
const newField = (o: OrderFieldValue): EntityField => ({
  type: 'text',
  name: o.name,
  textValue: o.value,
  numberValue: 0,
  booleanValue: false,
});

/** Same date, whatever the time part HomeBox may add. */
const sameDate = (read: string | undefined, value: string | null | undefined): boolean =>
  typeof read === 'string' && typeof value === 'string' && value !== '' && read.startsWith(value);

/** The item already holds, for one key, exactly the value of the draft (research R5: a lost PUT answer). */
const WRITTEN: Partial<
  Record<CompletionKey, (e: EntityOut, d: ImportDraft, note: string | null) => boolean>
> = {
  purchasePrice: (e, d) => d.purchasePrice !== null && e.purchasePrice === d.purchasePrice,
  purchaseDate: (e, d) => sameDate(e.purchaseDate, d.purchaseDate),
  purchaseFrom: (e, d) => d.purchaseFrom.trim() !== '' && e.purchaseFrom === d.purchaseFrom.trim(),
  warrantyExpires: (e, d) => sameDate(e.warrantyExpires, d.warranty?.expires),
  lifetimeWarranty: (e, d) => e.lifetimeWarranty === true && d.warranty?.lifetime === true,
  warrantyDetails: (e, d) => draftDetails(d) !== '' && e.warrantyDetails === draftDetails(d),
  notes: (e, _d, note) =>
    Boolean(note) && typeof e.notes === 'string' && e.notes.endsWith(note ?? ''),
};

/**
 * A confirmed key that is no longer applicable because the item already holds the value of the draft: written by an
 * earlier attempt whose answer was lost, so it is "already done", never "filled meanwhile" (FR-021).
 */
function alreadyWritten(
  e: EntityOut,
  draft: ImportDraft,
  key: CompletionKey,
  note: string | null,
): boolean {
  const check = WRITTEN[key];
  if (check) return check(e, draft, note);
  if (!key.startsWith('field:')) return false;
  const field = (draft.orderFields ?? []).find((o) => `field:${o.role}` === key);
  return (
    field !== undefined &&
    Array.isArray(e.fields) &&
    e.fields.some(
      (f) =>
        typeof f.name === 'string' && f.name.trim() === field.name && f.textValue === field.value,
    )
  );
}

/**
 * Patch of the completion PUT (contracts/completion-plan.md §1, research D4): the confirmed keys still applicable on
 * the item read just before; the other confirmed keys are `skipped`, never forced. `quantity`: value to send, from
 * `quantityPlan`. `fields`: the order fields added, for the read-back. Never `name`, `description`, `parentId`,
 * `locationId`, `entityTypeId` nor `tagIds` (the tags are united by the orchestrator).
 */
export function completionPatch(
  e: EntityOut,
  draft: ImportDraft,
  choice: CompletionChoice,
  note: string | null,
  quantity?: number,
): {
  patch: Partial<EntityUpdate>;
  applied: CompletionKey[];
  skipped: CompletionKey[];
  /** Confirmed keys no longer applicable because the item already holds the draft value (our own earlier write). */
  already: CompletionKey[];
  fields: OrderFieldValue[];
} {
  const possible = new Set(planCompletion(e, draft, note).changes.map((c) => c.key));
  const confirmed = choice.keys.filter(isPatchKey);
  const applied = confirmed.filter((k) => possible.has(k));
  const notApplicable = confirmed.filter((k) => !possible.has(k));
  const already = notApplicable.filter((k) => alreadyWritten(e, draft, k, note));
  const skipped = notApplicable.filter((k) => !already.includes(k));
  const roles = new Set(
    applied.filter((k) => k.startsWith('field:')).map((k) => k.slice('field:'.length)),
  );
  const fields = (draft.orderFields ?? []).filter((o) => roles.has(o.role));
  let patch: Partial<EntityUpdate> = {};
  for (const key of applied) patch = { ...patch, ...purchaseValue(draft, key) };
  if (applied.includes('notes')) patch.notes = orderLine(e, draft, note).notes;
  if (fields.length > 0) patch.fields = [...currentFields(e.fields), ...fields.map(newField)];
  if (quantity !== undefined) patch.quantity = quantity;
  return { patch, applied, skipped, already, fields };
}

/**
 * Quantity of a completion (FR-016, research R5): base and target are remembered before the PUT, so that a resume never
 * applies the increase twice. Read = base ⇒ the target is sent; read = target ⇒ already applied; otherwise the
 * quantity changed meanwhile: nothing is sent, and the key is reported as skipped.
 */
export function quantityPlan(
  read: number,
  increase: number,
  state?: { quantityBase?: number; quantityTarget?: number },
): { base: number; target: number; send?: number; skipped: boolean } {
  if (state?.quantityBase === undefined || state.quantityTarget === undefined) {
    return { base: read, target: read + increase, send: read + increase, skipped: false };
  }
  const { quantityBase: base, quantityTarget: target } = state;
  if (read === base) return { base, target, send: target, skipped: false };
  return { base, target, skipped: read !== target };
}
