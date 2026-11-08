import { itemUrl, type HomeBoxClient } from '@/background/homebox/client';
import { fail, ok, type Result } from '@/shared/errors';
import type { DuplicateMatch } from '@/shared/types';

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Probable duplicate = same order number (searched in the notes, R3) and same product name.
 * Any error is non-blocking: DUPLICATE_CHECK_FAILED.
 */
export async function findDuplicates(
  client: Pick<HomeBoxClient, 'searchEntities' | 'baseUrl'>,
  orderNumber: string,
  name: string,
): Promise<Result<DuplicateMatch[]>> {
  if (orderNumber.trim() === '') return ok([]);
  const res = await client.searchEntities(`"${orderNumber.trim()}"`);
  if (!res.ok) return fail('DUPLICATE_CHECK_FAILED');
  const target = normalize(name);
  return ok(
    res.value
      .filter((e) => normalize(e.name) === target)
      .map((e) => ({ id: e.id, name: e.name, url: itemUrl(client.baseUrl, e.id) })),
  );
}

/**
 * Uncertain creation (R8): the POST may have succeeded without the identifier being saved. At this point the object
 * does not have the order number yet (it only arrives with the PUT): so we search for the exact name, without depending
 * on the number. Accepted false positive: the same product bought another time is flagged.
 */
export async function findDuplicatesByName(
  client: Pick<HomeBoxClient, 'searchEntities' | 'baseUrl'>,
  name: string,
): Promise<Result<DuplicateMatch[]>> {
  const target = normalize(name);
  if (target === '') return ok([]);
  const res = await client.searchEntities(`"${name.replace(/"/g, ' ').trim()}"`);
  if (!res.ok) return fail('DUPLICATE_CHECK_FAILED');
  return ok(
    res.value
      .filter((e) => normalize(e.name) === target)
      .map((e) => ({ id: e.id, name: e.name, url: itemUrl(client.baseUrl, e.id) })),
  );
}
