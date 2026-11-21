import type { TemplateOut, TemplateSummary } from '@/background/homebox/types';
import { fail, ok, type Result } from '@/shared/errors';
import { fold } from '@/shared/fold';
import type { TagOption, TemplateDetail, TemplateFieldKind, TemplateOption } from '@/shared/types';

/**
 * Normalisation of the HomeBox templates (spec 018, contracts/homebox-templates.md §3). Pure apart from Web Crypto;
 * template data is user data: never logged.
 */

/** Defensive bound: a template with more fields is refused. */
export const MAX_TEMPLATE_FIELDS = 100;

const KINDS: ReadonlySet<string> = new Set(['text', 'number', 'boolean', 'time']);
const kindOf = (type: string): TemplateFieldKind => (KINDS.has(type) ? (type as TemplateFieldKind) : 'unknown');
const str = (x: unknown): string => (typeof x === 'string' ? x : '');

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Default tags with a textual `id` and `name`, in the order of the template. */
function tagsOf(out: TemplateOut): TagOption[] {
  if (!Array.isArray(out.defaultTags)) return [];
  return out.defaultTags.flatMap((t: unknown) => {
    if (typeof t !== 'object' || t === null) return [];
    const { id, name } = t as Record<string, unknown>;
    return typeof id === 'string' && typeof name === 'string' ? [{ id, name }] : [];
  });
}

/**
 * Explicit comparison by UTF-16 code units: the order feeds the SHA-256 fingerprint, which must be identical on every
 * browser and locale (the default `sort()` is the same, but `localeCompare` would depend on the language).
 */
const byCodeUnit = (a: string, b: string): number => {
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

/**
 * Fingerprint (research D9): SHA-256 of the canonical array. `updatedAt` alone is not enough (removing a default tag
 * or location does not change it); `timeValue` is excluded (creation timestamp).
 */
function fingerprintOf(out: TemplateOut, tags: TagOption[]): Promise<string> {
  const fields = Array.isArray(out.fields) ? out.fields : [];
  const canonical = [
    out.updatedAt ?? null,
    out.name,
    out.description ?? null,
    out.defaultDescription ?? null,
    out.defaultQuantity ?? null,
    out.defaultInsured ?? null,
    out.defaultManufacturer ?? null,
    out.defaultModelNumber ?? null,
    out.defaultLifetimeWarranty ?? null,
    out.defaultWarrantyDetails ?? null,
    out.defaultLocation?.id ?? null,
    tags.map((t) => t.id).sort(byCodeUnit),
    fields.map((f) => [f.id ?? null, f.type, f.name, f.textValue ?? '', f.numberValue ?? 0, f.booleanValue ?? false]),
  ];
  return sha256Hex(JSON.stringify(canonical));
}

/** Detail exposed to the interface; more than 100 fields → `TEMPLATES_UNAVAILABLE`. */
export async function normalizeTemplate(out: TemplateOut): Promise<Result<TemplateDetail>> {
  const fields = Array.isArray(out.fields) ? out.fields : [];
  if (fields.length > MAX_TEMPLATE_FIELDS) return fail('TEMPLATES_UNAVAILABLE');
  const tags = tagsOf(out);
  const quantity = out.defaultQuantity;
  return ok({
    id: out.id,
    name: str(out.name),
    fingerprint: await fingerprintOf(out, tags),
    description: str(out.defaultDescription),
    quantity: Number.isInteger(quantity) && (quantity as number) >= 1 ? (quantity as number) : null,
    insured: out.defaultInsured === true,
    manufacturer: str(out.defaultManufacturer),
    modelNumber: str(out.defaultModelNumber),
    lifetimeWarranty: out.defaultLifetimeWarranty === true,
    warrantyDetails: str(out.defaultWarrantyDetails),
    locationId: typeof out.defaultLocation?.id === 'string' ? out.defaultLocation.id : null,
    tags,
    fields: fields.map((f) => ({
      type: str(f.type),
      kind: kindOf(str(f.type)),
      name: str(f.name),
      textValue: str(f.textValue),
      numberValue: typeof f.numberValue === 'number' ? f.numberValue : 0,
      booleanValue: f.booleanValue === true,
    })),
  });
}

const compare = byCodeUnit;

/** Options of the picker, sorted by name, then description (case and accents ignored), then id. */
export function normalizeTemplateList(list: readonly TemplateSummary[]): TemplateOption[] {
  return list
    .map((t) => ({ id: t.id, name: t.name, description: t.description ?? '' }))
    .sort((a, b) => compare(fold(a.name), fold(b.name)) || compare(fold(a.description), fold(b.description)) || compare(a.id, b.id));
}
