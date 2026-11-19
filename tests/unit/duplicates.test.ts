import { checkDuplicates, findDuplicates, findDuplicatesByName } from '@/background/import/duplicates';
import { fail, ok, type Result } from '@/shared/errors';

const client = (result: ReturnType<typeof ok> | ReturnType<typeof fail>) => ({
  baseUrl: 'https://homebox.example.com',
  searchEntities: vi.fn(async () => result as never),
});

describe('findDuplicates (US5)', () => {
  it('searches the order number in quotes and filters on the normalized name', async () => {
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

  it('no match → []', async () => {
    expect(await findDuplicates(client(ok([])), '999-0000000-0000001', 'x')).toEqual({ ok: true, value: [] });
  });

  it('search error → DUPLICATE_CHECK_FAILED (non-blocking)', async () => {
    const r = await findDuplicates(client(fail('HOMEBOX_UNREACHABLE')), '999-0000000-0000001', 'x');
    expect(r).toEqual({ ok: false, error: 'DUPLICATE_CHECK_FAILED' });
  });

  it('without an order number → no search', async () => {
    const c = client(ok([]));
    expect(await findDuplicates(c, '  ', 'x')).toEqual({ ok: true, value: [] });
    expect(c.searchEntities).not.toHaveBeenCalled();
  });
});

describe('findDuplicatesByName (uncertain creation, R8)', () => {
  it('searches the exact name in quotes, without an order number, and filters on the normalized name', async () => {
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

  it('a quote in the name does not break the query', async () => {
    const c = client(ok([]));
    await findDuplicatesByName(c, 'Écran 27" Pro');
    expect(c.searchEntities).toHaveBeenCalledWith('"Écran 27  Pro"');
  });

  it('search error → DUPLICATE_CHECK_FAILED', async () => {
    expect(await findDuplicatesByName(client(fail('HOMEBOX_UNREACHABLE')), 'x')).toEqual({
      ok: false,
      error: 'DUPLICATE_CHECK_FAILED',
    });
  });
});

describe('checkDuplicates (015)', () => {
  type Item = { id: string; name: string };
  type Reply = Result<Item[]>;
  const BASE = 'https://homebox.example.com';
  const NUMBER = '999-0000000-0000001';
  /** Mocked client: `replies` maps a query (q) to its result; any other query returns []. */
  const searchClient = (replies: Record<string, Reply> = {}) => ({
    baseUrl: BASE,
    searchEntities: vi.fn<(q: string, pageSize?: number) => Promise<Reply>>(async (q) => replies[q] ?? ok([])),
  });
  const url = (id: string) => `${BASE}/item/${id}`;

  it('exact queries: the order number in quotes (no pageSize), then one query per word with pageSize 50', async () => {
    const c = searchClient();
    await checkDuplicates(c, NUMBER, 'Câble USB-C 2 m noir');
    expect(c.searchEntities.mock.calls).toEqual([[`"${NUMBER}"`], ['noir', 50], ['usb', 50], ['cable', 50]]);
  });

  it('without an order number: word queries only, matches: []', async () => {
    const c = searchClient();
    const r = await checkDuplicates(c, '', 'Perceuse visseuse Bosch 18V');
    expect(c.searchEntities.mock.calls).toEqual([['18v', 50], ['perceuse', 50], ['visseuse', 50]]);
    expect(r).toEqual({ ok: true, value: { matches: [], similar: [], moreSimilar: false, incomplete: false } });
  });

  it('a name without a significant word: the order number query only, similar: []', async () => {
    const c = searchClient({ [`"${NUMBER}"`]: ok([{ id: 'a', name: 'Lampe LED' }]) });
    const r = await checkDuplicates(c, NUMBER, 'De la');
    expect(c.searchEntities.mock.calls).toEqual([[`"${NUMBER}"`]]);
    expect(r).toEqual({ ok: true, value: { matches: [], similar: [], moreSimilar: false, incomplete: false } });
  });

  it('no order number and no significant word: no query, empty result', async () => {
    const c = searchClient();
    expect(await checkDuplicates(c, '  ', 'De la')).toEqual({
      ok: true,
      value: { matches: [], similar: [], moreSimilar: false, incomplete: false },
    });
    expect(c.searchEntities).not.toHaveBeenCalled();
  });

  it.each([
    ['US1-1', 'Câble USB-C 2 m noir', 'noir', 'Cable usb c noir 2m'],
    ['US1-2', 'Logitech M185 Souris sans fil, Gris', 'm185', 'Souris sans fil Logitech M185'],
    ['US2-1', 'Perceuse visseuse Bosch 18V', '18v', 'Perceuse visseuse Bosch 18V'],
  ])('%s: a close item returned by a word query is in similar, named as in HomeBox, with its link', async (_id, product, word, item) => {
    const c = searchClient({ [word]: ok([{ id: 's1', name: item }]) });
    const r = await checkDuplicates(c, NUMBER, product);
    expect(r).toEqual({
      ok: true,
      value: { matches: [], similar: [{ id: 's1', name: item, url: url('s1') }], moreSimilar: false, incomplete: false },
    });
  });

  it('US1-6: an unrelated item returned by a word query is left out', async () => {
    const c = searchClient({ noir: ok([{ id: 'l', name: 'Lampe de bureau' }]) });
    const r = await checkDuplicates(c, NUMBER, 'Câble USB-C 2 m noir');
    expect(r.ok && r.value.similar).toEqual([]);
  });

  it('US3-2 / FR-009: a certain duplicate that is also close is only in matches', async () => {
    const item = { id: 'a', name: 'Câble USB-C 2 m noir' };
    const c = searchClient({ [`"${NUMBER}"`]: ok([item]), noir: ok([item]), usb: ok([item]) });
    const r = await checkDuplicates(c, NUMBER, 'Câble USB-C 2 m noir');
    expect(r).toEqual({
      ok: true,
      value: { matches: [{ ...item, url: url('a') }], similar: [], moreSimilar: false, incomplete: false },
    });
  });

  it('SC-002: matches equals what findDuplicates returns for the same inputs', async () => {
    const items = [
      { id: 'a', name: '  clavier SANS fil   Exemple Pro' },
      { id: 'b', name: 'Câble USB-C' },
    ];
    const name = 'Clavier sans fil Exemple Pro';
    const before = await findDuplicates(client(ok(items)), NUMBER, name);
    const after = await checkDuplicates(searchClient({ [`"${NUMBER}"`]: ok(items) }), NUMBER, name);
    expect(before.ok && after.ok).toBe(true);
    expect(after.ok && after.value.matches).toEqual(before.ok && before.value);
  });

  it('an item returned by several queries appears once in similar', async () => {
    const item = { id: 's1', name: 'Cable usb c noir 2m' };
    const c = searchClient({ noir: ok([item]), usb: ok([item]), cable: ok([item]) });
    const r = await checkDuplicates(c, NUMBER, 'Câble USB-C 2 m noir');
    expect(r.ok && r.value.similar).toEqual([{ ...item, url: url('s1') }]);
  });

  it('7 close items → the 5 closest in similar, sorted, and moreSimilar: true', async () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ id: `s${7 - i}`, name: `Câble USB-C noir ${7 - i}` }));
    const c = searchClient({ noir: ok(items) });
    const r = await checkDuplicates(c, '', 'Câble USB-C noir');
    expect(r.ok && r.value.similar.map((m) => m.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(r.ok && r.value.moreSimilar).toBe(true);
  });

  it('partial failure: order number OK + a word query failed → results kept, incomplete: true', async () => {
    const dup = { id: 'a', name: 'Câble USB-C 2 m noir' };
    const close = { id: 's1', name: 'Cable usb c noir 2m' };
    const c = searchClient({ [`"${NUMBER}"`]: ok([dup]), noir: fail('DUPLICATE_CHECK_FAILED'), usb: ok([close]) });
    const r = await checkDuplicates(c, NUMBER, 'Câble USB-C 2 m noir');
    expect(r).toEqual({
      ok: true,
      value: {
        matches: [{ ...dup, url: url('a') }],
        similar: [{ ...close, url: url('s1') }],
        moreSimilar: false,
        incomplete: true,
      },
    });
  });

  it('partial failure: order number failed + words OK → matches: [], similar computed, incomplete: true', async () => {
    const close = { id: 's1', name: 'Cable usb c noir 2m' };
    const c = searchClient({ [`"${NUMBER}"`]: fail('HOMEBOX_UNREACHABLE'), noir: ok([close]) });
    const r = await checkDuplicates(c, NUMBER, 'Câble USB-C 2 m noir');
    expect(r).toEqual({
      ok: true,
      value: { matches: [], similar: [{ ...close, url: url('s1') }], moreSimilar: false, incomplete: true },
    });
  });

  it.each(['HOMEBOX_UNREACHABLE', 'UNAUTHORIZED', 'DUPLICATE_CHECK_FAILED'] as const)(
    'every query failed (%s) → DUPLICATE_CHECK_FAILED',
    async (code) => {
      const c = { baseUrl: BASE, searchEntities: vi.fn<(q: string, pageSize?: number) => Promise<Reply>>(async () => fail(code)) };
      expect(await checkDuplicates(c, NUMBER, 'Câble USB-C 2 m noir')).toEqual({
        ok: false,
        error: 'DUPLICATE_CHECK_FAILED',
      });
      expect(c.searchEntities).toHaveBeenCalledTimes(4);
    },
  );
});

describe('checkDuplicates (015): any origin, with or without an order number (US2, FR-002)', () => {
  const BASE = 'https://homebox.example.com';
  const NUMBER = '999-0000000-0000001';
  const searchClient = (replies: Record<string, Result<{ id: string; name: string }[]>>) => ({
    baseUrl: BASE,
    searchEntities: vi.fn<(q: string, pageSize?: number) => Promise<Result<{ id: string; name: string }[]>>>(
      async (q) => replies[q] ?? ok([]),
    ),
  });

  it('US2-1 / US2-4: an item without any note, found by a word, for a product without an order number → similar', async () => {
    const c = searchClient({ '18v': ok([{ id: 'm1', name: 'Perceuse visseuse Bosch 18V' }]) });
    const r = await checkDuplicates(c, '', 'Perceuse visseuse Bosch 18V');
    expect(r).toEqual({
      ok: true,
      value: {
        matches: [],
        similar: [{ id: 'm1', name: 'Perceuse visseuse Bosch 18V', url: `${BASE}/item/m1` }],
        moreSimilar: false,
        incomplete: false,
      },
    });
  });

  it('US2-2: an item imported from another order (close name) → similar, never matches', async () => {
    const other = { id: 'o1', name: 'Câble USB-C noir 2 m' };
    const c = searchClient({ [`"${NUMBER}"`]: ok([]), noir: ok([other]), usb: ok([other]) });
    const r = await checkDuplicates(c, NUMBER, 'Câble USB-C 2 m noir');
    expect(r.ok && r.value.matches).toEqual([]);
    expect(r.ok && r.value.similar).toEqual([{ ...other, url: `${BASE}/item/o1` }]);
  });

  it('FR-002: an item returned only by a word query (never by the order number query) is kept', async () => {
    const c = searchClient({ [`"${NUMBER}"`]: ok([]), cable: ok([{ id: 'w1', name: 'Cable usb c noir 2m' }]) });
    const r = await checkDuplicates(c, NUMBER, 'Câble USB-C 2 m noir');
    expect(r.ok && r.value.similar.map((m) => m.id)).toEqual(['w1']);
  });

  it('a one-word name only flags an item identical after normalization', async () => {
    const c = searchClient({
      cable: ok([
        { id: 'same', name: 'câble !' },
        { id: 'hdmi', name: 'Câble HDMI' },
      ]),
    });
    const r = await checkDuplicates(c, '', 'Câble');
    expect(c.searchEntities.mock.calls).toEqual([['cable', 50]]);
    expect(r.ok && r.value.similar.map((m) => m.id)).toEqual(['same']);
  });
});
