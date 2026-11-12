import { storeForPageUrl } from '@/content/merchants/catalog';
import type { MerchantId } from '@/shared/merchant-ids';
import type {
  HistoryMissing,
  HistoryStatus,
  ImportHistoryEntry,
  PendingImport,
} from '@/shared/types';

/**
 * Pure functions of the import history (spec 012, data-model.md): no storage, no clock.
 * `toEntry` copies field by field (never `{ ...draft }`): it is the minimisation barrier (FR-003).
 */

export const MAX_ENTRIES = 200;
export const MAX_AGE_MONTHS = 12;
const MAX_NAME = 255;
const MAX_ORDER = 64;

/** Cuts to `max` UTF-16 units without splitting a surrogate pair. */
function cut(value: string, max: number): string {
  if (value.length <= max) return value;
  const sliced = value.slice(0, max);
  const last = sliced.charCodeAt(sliced.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? sliced.slice(0, -1) : sliced;
}

export function statusOf(p: PendingImport): HistoryStatus {
  if (p.status === 'success') return 'complete';
  // Invariants 3 and 4 by construction: an object that exists is never "failed", and "partial" needs an object.
  if (p.status === 'failed' && p.entityId) return 'partial';
  if (p.status === 'partial' && !p.entityId) return 'failed';
  return p.status;
}

/** research.md R3.1: what is missing from an object created in HomeBox. */
export function missingOf(p: PendingImport): HistoryMissing[] {
  if (!p.entityId) return [];
  const missing: HistoryMissing[] = [];
  const notSent = (kind: 'invoice' | 'order_document') =>
    p.draft.documents.some((d) => d.kind === kind && p.steps.attachments[d.id] !== 'done');
  if (p.steps.update !== 'done') missing.push('details');
  if (notSent('invoice')) missing.push('invoice');
  if (notSent('order_document')) missing.push('documents');
  const photo = p.steps.photo ?? 'not_requested';
  if (photo === 'pending' || photo === 'sending' || photo === 'failed') missing.push('photo');
  return missing;
}

export function toEntry(
  p: PendingImport,
  ctx: { importedAt: string; instance: string },
): ImportHistoryEntry {
  const status = statusOf(p);
  const name = cut(p.draft.name.trim(), MAX_NAME);
  const order = cut((p.draft.orderNumber ?? '').trim(), MAX_ORDER);
  const date = p.draft.purchaseDate;
  const finished = status === 'partial' || status === 'failed';
  return {
    v: 1,
    id: p.id,
    importedAt: ctx.importedAt,
    // The empty name is refused before any import (orchestrator); the placeholder only keeps the entry valid.
    name: name || '—',
    merchantId: storeForPageUrl(p.draft.pageUrl)?.id ?? null,
    orderNumber: order || null,
    purchaseDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    instance: ctx.instance,
    entityId: p.entityId ?? null,
    status,
    missing: status === 'complete' || status === 'failed' ? [] : missingOf(p),
    reason: finished ? (p.error ?? null) : null,
  };
}

/** A `running` entry with no process behind it anymore (R1.3): `partial` or `failed`, interrupted, no reason. */
export function reconcile(entry: ImportHistoryEntry): ImportHistoryEntry {
  if (entry.status !== 'running') return entry;
  return entry.entityId
    ? { ...entry, status: 'partial', reason: null, interrupted: true }
    : { ...entry, status: 'failed', missing: [], reason: null, interrupted: true };
}

/** `now` minus 12 calendar months, in UTC, clamped to the end of the month (29 Feb 2028 → 28 Feb 2027). */
export function cutoff(now: number): number {
  const d = new Date(now);
  const year = d.getUTCFullYear() - Math.floor(MAX_AGE_MONTHS / 12);
  const month = d.getUTCMonth() - (MAX_AGE_MONTHS % 12);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(
    year,
    month,
    Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

/**
 * Identifiers to delete (R2): invalid `v = 1` entries, then those older than 12 calendar months, then
 * those beyond the 200th by `importedAt` descending.
 */
export function prune(
  entries: Array<{ id: string; entry: ImportHistoryEntry | null }>,
  now: number,
): string[] {
  const invalid = entries.filter((e) => e.entry === null).map((e) => e.id);
  const limit = cutoff(now);
  const valid = entries.filter(
    (e): e is { id: string; entry: ImportHistoryEntry } => e.entry !== null,
  );
  const old = valid.filter((e) => Date.parse(e.entry.importedAt) < limit);
  const kept = valid.filter((e) => Date.parse(e.entry.importedAt) >= limit).sort(byRecent);
  return [...invalid, ...old.map((e) => e.id), ...kept.slice(MAX_ENTRIES).map((e) => e.id)];
}

function byRecent(a: { entry: ImportHistoryEntry }, b: { entry: ImportHistoryEntry }): number {
  return (
    Date.parse(b.entry.importedAt) - Date.parse(a.entry.importedAt) ||
    a.entry.id.localeCompare(b.entry.id)
  );
}

/** Sorts by `importedAt` descending (most recent first). */
export function sortRecent<T extends ImportHistoryEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => byRecent({ entry: a }, { entry: b }));
}

export interface OrderGroup<T extends ImportHistoryEntry> {
  orderNumber: string | null;
  merchantId: MerchantId | null;
  entries: T[];
}

/**
 * Display grouping (R4.3): entries sharing (merchantId, orderNumber, instance) form a group placed where its
 * most recent entry is. An entry without an order number is alone. Input expected sorted most recent first.
 */
export function groupByOrder<T extends ImportHistoryEntry>(entries: T[]): Array<OrderGroup<T>> {
  const groups: Array<OrderGroup<T>> = [];
  const byKey = new Map<string, OrderGroup<T>>();
  for (const entry of entries) {
    if (entry.orderNumber === null) {
      groups.push({ orderNumber: null, merchantId: entry.merchantId, entries: [entry] });
      continue;
    }
    const key = JSON.stringify([entry.merchantId, entry.orderNumber, entry.instance]);
    const existing = byKey.get(key);
    if (existing) existing.entries.push(entry);
    else {
      const group = {
        orderNumber: entry.orderNumber,
        merchantId: entry.merchantId,
        entries: [entry],
      };
      byKey.set(key, group);
      groups.push(group);
    }
  }
  return groups;
}
