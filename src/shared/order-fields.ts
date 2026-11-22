import { MAX_FIELD_NAME_BYTES, MAX_FIELD_TEXT_BYTES, utf8ByteLength } from './utf8';

/**
 * Order details as HomeBox custom fields (spec 019, data-model §1). Pure module shared by the service worker and the
 * pages: no storage, no network, nothing logged (field names and values are user data).
 */

export type OrderFieldRole = 'orderNumber' | 'merchant' | 'orderUrl';
export const ORDER_FIELD_ROLES: readonly OrderFieldRole[] = ['orderNumber', 'merchant', 'orderUrl'];

/** HomeBox data names, identical in English and in French (FR-002): never translated. */
export const DEFAULT_ORDER_FIELD_NAMES: Readonly<Record<OrderFieldRole, string>> = {
  orderNumber: 'Order number',
  merchant: 'Merchant',
  orderUrl: 'Order URL',
};

export interface OrderFieldSettings {
  enabled: boolean;
  names: Record<OrderFieldRole, string>;
}

/** Option off by default (FR-001), with the default names. */
export const DEFAULT_ORDER_FIELD_SETTINGS: Readonly<OrderFieldSettings> = {
  enabled: false,
  names: { ...DEFAULT_ORDER_FIELD_NAMES },
};

export type FieldNameError = 'empty' | 'tooLong' | 'duplicate' | 'forbiddenChar';

/** `=` separates the name and the value in the HomeBox field filter (#106); control characters are refused. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_NAME_CHAR = /[=\u0000-\u001F\u007F-\u009F]/;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Error of a field name (FR-003), compared after trim; `others` = the two other names of the same instance.
 * Priority: empty > forbiddenChar > tooLong > duplicate. Bounds in UTF-8 bytes, like HomeBox.
 */
export function fieldNameError(name: string, others: readonly string[]): FieldNameError | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  if (FORBIDDEN_NAME_CHAR.test(trimmed)) return 'forbiddenChar';
  if (utf8ByteLength(trimmed) > MAX_FIELD_NAME_BYTES) return 'tooLong';
  if (others.some((o) => sameName(o, trimmed))) return 'duplicate';
  return null;
}

export type OrderValueError = 'tooLong' | 'invalidUrl';

const isWebAddress = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

/** Error of a value, compared after trim; empty ⇒ null (the field is not created, FR-012). */
export function orderValueError(role: OrderFieldRole, value: string): OrderValueError | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (utf8ByteLength(trimmed) > MAX_FIELD_TEXT_BYTES) return 'tooLong';
  if (role === 'orderUrl' && !isWebAddress(trimmed)) return 'invalidUrl';
  return null;
}

/** Existing name that differs only by case or edge spaces (FR-005); null otherwise or if identical. */
export function caseVariantOf(name: string, existing: readonly string[]): string | null {
  const trimmed = name.trim();
  return existing.find((e) => sameName(e, trimmed) && e !== trimmed) ?? null;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Settings as stored and as sent by `order-fields/set`: names already trimmed, valid and distinct. */
export function isOrderFieldSettings(x: unknown): x is OrderFieldSettings {
  if (!isRecord(x) || typeof x.enabled !== 'boolean' || !isRecord(x.names)) return false;
  const names = x.names;
  if (!ORDER_FIELD_ROLES.every((r) => typeof names[r] === 'string')) return false;
  const list = ORDER_FIELD_ROLES.map((r) => names[r] as string);
  return list.every(
    (n, i) =>
      n === n.trim() &&
      fieldNameError(
        n,
        list.filter((_, j) => j !== i),
      ) === null,
  );
}
