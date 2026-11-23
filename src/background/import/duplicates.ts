import { itemUrl, type HomeBoxClient } from '@/background/homebox/client';
import type { EntityOut, EntitySummary } from '@/background/homebox/types';
import { fail, ok, type ErrorCode, type Result } from '@/shared/errors';
import { queryWords, rankSimilar, SIMILAR_PAGE_SIZE } from '@/shared/similarity';
import type { DuplicateCheck, DuplicateMatch } from '@/shared/types';

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

type SearchClient = Pick<HomeBoxClient, 'searchEntities' | 'baseUrl'>;

const toMatch = (client: SearchClient, e: EntitySummary): DuplicateMatch => ({
  id: e.id,
  name: e.name,
  url: itemUrl(client.baseUrl, e.id),
});

/** Items whose name is the same as `name` (case and spaces ignored): shared by the certain-duplicate searches. */
const sameName = (client: SearchClient, items: EntitySummary[], name: string): DuplicateMatch[] => {
  const target = normalize(name);
  return items.filter((e) => normalize(e.name) === target).map((e) => toMatch(client, e));
};

/**
 * Failure of a search: non-blocking `DUPLICATE_CHECK_FAILED`, except a chosen collection no longer reachable (spec 024),
 * which keeps its own message (FR-010).
 */
function searchFailure(error: ErrorCode): ErrorCode {
  return error === 'COLLECTION_UNAVAILABLE' ? error : 'DUPLICATE_CHECK_FAILED';
}

/**
 * Probable duplicate = same order number (searched in the notes, R3) and same product name.
 * Any error is non-blocking: DUPLICATE_CHECK_FAILED.
 */
export async function findDuplicates(
  client: SearchClient,
  orderNumber: string,
  name: string,
): Promise<Result<DuplicateMatch[]>> {
  if (orderNumber.trim() === '') return ok([]);
  const res = await client.searchEntities(`"${orderNumber.trim()}"`);
  if (!res.ok) return fail(searchFailure(res.error));
  return ok(sameName(client, res.value, name));
}

/**
 * Uncertain creation (R8): the POST may have succeeded without the identifier being saved. At this point the object
 * does not have the order number yet (it only arrives with the PUT): so we search for the exact name, without depending
 * on the number. Accepted false positive: the same product bought another time is flagged.
 */
export async function findDuplicatesByName(
  client: SearchClient,
  name: string,
): Promise<Result<DuplicateMatch[]>> {
  const target = normalize(name);
  if (target === '') return ok([]);
  const res = await client.searchEntities(`"${name.replaceAll('"', ' ').trim()}"`);
  if (!res.ok) return fail(searchFailure(res.error));
  return ok(sameName(client, res.value, name));
}

/** Confirmation reads at most per check (spec 020, R2): bounds the extra requests to the instance. */
export const MAX_CONFIRM_READS = 5;

/** Custom-field filter, present only when the "order details as custom fields" option is on for the target instance. */
export interface FieldFilter {
  /** Name configured for the `orderNumber` role of the target instance. */
  name: string;
  client: Pick<HomeBoxClient, 'searchEntitiesByField' | 'getEntity'>;
}

/** True when the entity has a text field named `fieldName` whose value is exactly `number`. */
export const confirmsOrderNumber = (entity: EntityOut, fieldName: string, number: string): boolean =>
  (entity.fields ?? []).some((f) => f.type === 'text' && f.name.trim() === fieldName && f.textValue === number);

/**
 * Confirms by reading the candidates found only by the filter: the server may ignore `fields` and return an unfiltered
 * list (R1), so a candidate counts only if its own field equals the number. A failed read is not counted and makes the
 * check incomplete; so do the candidates beyond MAX_CONFIRM_READS. Nothing read is logged or stored.
 */
async function confirmByRead(
  filter: FieldFilter,
  number: string,
  candidates: EntitySummary[],
): Promise<{ confirmed: EntitySummary[]; incomplete: boolean }> {
  const read = candidates.slice(0, MAX_CONFIRM_READS);
  const entities = await Promise.all(read.map((c) => filter.client.getEntity(c.id)));
  const confirmed = read.filter((_, i) => {
    const e = entities[i];
    return e?.ok === true && confirmsOrderNumber(e.value, filter.name, number);
  });
  return {
    confirmed,
    incomplete: candidates.length > MAX_CONFIRM_READS || entities.some((e) => !e.ok),
  };
}

/**
 * Certain duplicates: same name and the number found by the text search (no read), then same name found by the filter
 * only and confirmed by a read. Deduplicated by id.
 */
async function certainMatches(
  client: SearchClient,
  name: string,
  number: string,
  textResult: Result<EntitySummary[]> | undefined,
  fieldResult: Result<EntitySummary[]> | undefined,
  filter: FieldFilter | undefined,
): Promise<{ matches: DuplicateMatch[]; incomplete: boolean }> {
  const matches = textResult?.ok ? sameName(client, textResult.value, name) : [];
  if (!filter || !fieldResult?.ok) return { matches, incomplete: false };
  const known = new Set(matches.map((m) => m.id));
  const target = normalize(name);
  const candidates = fieldResult.value.filter((e) => !known.has(e.id) && normalize(e.name) === target);
  const { confirmed, incomplete } = await confirmByRead(filter, number, candidates);
  return { matches: [...matches, ...confirmed.map((e) => toMatch(client, e))], incomplete };
}

/**
 * Summary check (spec 015, 020): certain duplicates (same order number in the notes, or in the order-number custom
 * field when `fieldFilter` is given, and same name) and similar items (close name, FR-004) of the whole instance.
 * At most 1 order-number search + 1 field search + MAX_QUERY_WORDS word searches, in parallel, then at most
 * MAX_CONFIRM_READS reads, to the HomeBox instance only. Every search failed → DUPLICATE_CHECK_FAILED; some failed
 * (or a read failed, or too many candidates) → `incomplete` (product not fully checked, FR-013).
 * Nothing is logged here (FR-018): the client only logs endpoint templates.
 */
export async function checkDuplicates(
  client: SearchClient,
  orderNumber: string,
  name: string,
  fieldFilter?: FieldFilter,
): Promise<Result<DuplicateCheck>> {
  const number = orderNumber.trim();
  const filter = fieldFilter !== undefined && number !== '' ? fieldFilter : undefined;
  const [textResult, fieldResult, ...wordResults] = await Promise.all([
    number === '' ? undefined : client.searchEntities(`"${number}"`),
    filter?.client.searchEntitiesByField(filter.name, number),
    ...queryWords(name).map((w) => client.searchEntities(w, SIMILAR_PAGE_SIZE)),
  ]);
  const results = [textResult, fieldResult, ...wordResults].filter((r) => r !== undefined);
  if (results.length === 0) return ok({ matches: [], similar: [], moreSimilar: false, incomplete: false });
  if (results.every((r) => !r.ok)) {
    const lost = results.some((r) => !r.ok && r.error === 'COLLECTION_UNAVAILABLE');
    return fail(lost ? 'COLLECTION_UNAVAILABLE' : 'DUPLICATE_CHECK_FAILED');
  }
  const certain = await certainMatches(client, name, number, textResult, fieldResult, filter);
  // Similar items come from the text and word searches only; the filter results never enter here.
  const candidates = [textResult, ...wordResults].flatMap((r) => (r?.ok ? r.value : []));
  const { items, more } = rankSimilar(name, candidates, new Set(certain.matches.map((m) => m.id)));
  return ok({
    matches: certain.matches,
    similar: items.map((e) => toMatch(client, e)),
    moreSimilar: more,
    incomplete: results.some((r) => !r.ok) || certain.incomplete,
  });
}
