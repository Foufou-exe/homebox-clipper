import { itemUrl, type HomeBoxClient } from '@/background/homebox/client';
import type { EntitySummary } from '@/background/homebox/types';
import { fail, ok, type Result } from '@/shared/errors';
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
  if (!res.ok) return fail('DUPLICATE_CHECK_FAILED');
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
  if (!res.ok) return fail('DUPLICATE_CHECK_FAILED');
  return ok(sameName(client, res.value, name));
}

/**
 * Summary check (spec 015): certain duplicates (same order number in the notes and same name, computed as in
 * `findDuplicates`) and similar items (close name, FR-004) of the whole instance, whatever their origin.
 * At most 1 order-number search + MAX_QUERY_WORDS word searches, in parallel, to the HomeBox instance only.
 * Every search failed → DUPLICATE_CHECK_FAILED; some failed → `incomplete` (product not checked, FR-013).
 * Nothing is logged here (FR-018): the client only logs endpoint templates.
 */
export async function checkDuplicates(
  client: SearchClient,
  orderNumber: string,
  name: string,
): Promise<Result<DuplicateCheck>> {
  const byNumber = orderNumber.trim() !== '';
  const searches: Promise<Result<EntitySummary[]>>[] = [
    ...(byNumber ? [client.searchEntities(`"${orderNumber.trim()}"`)] : []),
    ...queryWords(name).map((w) => client.searchEntities(w, SIMILAR_PAGE_SIZE)),
  ];
  if (searches.length === 0) return ok({ matches: [], similar: [], moreSimilar: false, incomplete: false });
  const results = await Promise.all(searches);
  if (results.every((r) => !r.ok)) return fail('DUPLICATE_CHECK_FAILED');
  const numberResult = byNumber ? results[0] : undefined;
  const matches = numberResult?.ok ? sameName(client, numberResult.value, name) : [];
  const candidates = results.flatMap((r) => (r.ok ? r.value : []));
  const { items, more } = rankSimilar(name, candidates, new Set(matches.map((m) => m.id)));
  return ok({
    matches,
    similar: items.map((e) => toMatch(client, e)),
    moreSimilar: more,
    incomplete: results.some((r) => !r.ok),
  });
}
