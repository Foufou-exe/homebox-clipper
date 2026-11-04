import { findDuplicates, findDuplicatesByName } from '@/background/import/duplicates';
import { fail, ok } from '@/shared/errors';

const client = (result: ReturnType<typeof ok> | ReturnType<typeof fail>) => ({
  baseUrl: 'https://homebox.example.com',
  searchEntities: vi.fn(async () => result as never),
});

describe('findDuplicates (US5)', () => {
  it('cherche le numéro de commande entre guillemets et filtre sur le nom normalisé', async () => {
    const c = client(
      ok([
        { id: 'a', name: '  clavier SANS fil   Exemple Pro' },
        { id: 'b', name: 'Câble USB-C' },
      ]),
    );
    const r = await findDuplicates(c, '999-0000000-0000001', 'Clavier sans fil Exemple Pro');
    expect(c.searchEntities).toHaveBeenCalledWith('"999-0000000-0000001"');
    expect(r).toEqual({
      ok: true,
      value: [{ id: 'a', name: '  clavier SANS fil   Exemple Pro', url: 'https://homebox.example.com/item/a' }],
    });
  });

  it('aucune correspondance → []', async () => {
    expect(await findDuplicates(client(ok([])), '999-0000000-0000001', 'x')).toEqual({ ok: true, value: [] });
  });

  it('erreur de recherche → DUPLICATE_CHECK_FAILED (non bloquant)', async () => {
    const r = await findDuplicates(client(fail('HOMEBOX_UNREACHABLE')), '999-0000000-0000001', 'x');
    expect(r).toEqual({ ok: false, error: 'DUPLICATE_CHECK_FAILED' });
  });

  it('sans numéro de commande → pas de recherche', async () => {
    const c = client(ok([]));
    expect(await findDuplicates(c, '  ', 'x')).toEqual({ ok: true, value: [] });
    expect(c.searchEntities).not.toHaveBeenCalled();
  });
});

describe('findDuplicatesByName (création incertaine, R8)', () => {
  it('cherche le nom exact entre guillemets, sans numéro de commande, et filtre sur le nom normalisé', async () => {
    const c = client(
      ok([
        { id: 'a', name: '  clavier SANS fil   Exemple Pro' },
        { id: 'b', name: 'Clavier sans fil Exemple Pro Max' },
      ]),
    );
    const r = await findDuplicatesByName(c, 'Clavier sans fil Exemple Pro');
    expect(c.searchEntities).toHaveBeenCalledWith('"Clavier sans fil Exemple Pro"');
    expect(r).toEqual({
      ok: true,
      value: [{ id: 'a', name: '  clavier SANS fil   Exemple Pro', url: 'https://homebox.example.com/item/a' }],
    });
  });

  it('un guillemet dans le nom ne casse pas la requête', async () => {
    const c = client(ok([]));
    await findDuplicatesByName(c, 'Écran 27" Pro');
    expect(c.searchEntities).toHaveBeenCalledWith('"Écran 27  Pro"');
  });

  it('erreur de recherche → DUPLICATE_CHECK_FAILED', async () => {
    expect(await findDuplicatesByName(client(fail('HOMEBOX_UNREACHABLE')), 'x')).toEqual({
      ok: false,
      error: 'DUPLICATE_CHECK_FAILED',
    });
  });
});
