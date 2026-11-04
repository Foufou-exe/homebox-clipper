import { itemUrl, type HomeBoxClient } from '@/background/homebox/client';
import { fail, ok, type Result } from '@/shared/errors';
import type { DuplicateMatch } from '@/shared/types';

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Doublon probable = même numéro de commande (cherché dans les notes, R3) et même nom de produit.
 * Toute erreur est non bloquante : DUPLICATE_CHECK_FAILED.
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
 * Création incertaine (R8) : le POST a pu aboutir sans que l'identifiant soit enregistré. À ce stade l'objet
 * n'a pas encore le numéro de commande (il n'arrive qu'au PUT) : on cherche donc le nom exact, sans dépendre
 * du numéro. Faux positif assumé : un même produit acheté une autre fois est signalé.
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
