import { checkDuplicates, MAX_CONFIRM_READS, type FieldFilter } from '@/background/import/duplicates';
import type { EntityOut, EntitySummary } from '@/background/homebox/types';
import { fail, ok, type Result } from '@/shared/errors';

const BASE = 'https://homebox.example.com';
const NUMBER = '999-0000000-0000001';
const NAME = 'Clavier sans fil Exemple Pro';
const FIELD = 'Order number';

const summary = (id: string, name = NAME): EntitySummary => ({ id, name }) as EntitySummary;
const entity = (id: string, fields: EntityOut['fields'], name = NAME): EntityOut => ({ id, name, fields }) as EntityOut;
const textField = (name: string, textValue: string) => ({ name, type: 'text', textValue });

function setup(opts: {
  text?: Result<EntitySummary[]>;
  field?: Result<EntitySummary[]>;
  words?: Result<EntitySummary[]>;
  entities?: Record<string, Result<EntityOut>>;
  fieldName?: string;
}) {
  const searchEntities = vi.fn(async (q: string) =>
    q.startsWith('"') ? (opts.text ?? ok([])) : (opts.words ?? ok([])),
  );
  const searchEntitiesByField = vi.fn(async () => opts.field ?? ok([]));
  const getEntity = vi.fn(async (id: string) => opts.entities?.[id] ?? fail('UPDATE_FAILED'));
  const client = { baseUrl: BASE, searchEntities, searchEntitiesByField, getEntity };
  const filter: FieldFilter = { name: opts.fieldName ?? FIELD, client };
  return { client, filter, searchEntities, searchEntitiesByField, getEntity };
}

const okValue = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error('expected ok');
  return r.value;
};

describe('checkDuplicates with a field filter (spec 020)', () => {
  it('D3: found by the filter only, confirmed by a read', async () => {
    const s = setup({
      field: ok([summary('e1')]),
      entities: { e1: ok(entity('e1', [textField(FIELD, NUMBER)])) },
    });
    const v = okValue(await checkDuplicates(s.client, NUMBER, NAME, s.filter));
    expect(v.matches).toEqual([{ id: 'e1', name: NAME, url: `${BASE}/item/e1` }]);
    expect(v.incomplete).toBe(false);
    expect(s.getEntity).toHaveBeenCalledTimes(1);
    expect(s.searchEntitiesByField).toHaveBeenCalledWith(FIELD, NUMBER);
  });

  it('D4: found by text and filter: one entry, no read', async () => {
    const s = setup({ text: ok([summary('e1')]), field: ok([summary('e1')]) });
    const v = okValue(await checkDuplicates(s.client, NUMBER, NAME, s.filter));
    expect(v.matches.map((m) => m.id)).toEqual(['e1']);
    expect(s.getEntity).not.toHaveBeenCalled();
  });

  it('D5: different name from the filter: not counted, not read', async () => {
    const s = setup({ field: ok([summary('e1', 'Souris sans fil')]) });
    const v = okValue(await checkDuplicates(s.client, NUMBER, NAME, s.filter));
    expect(v.matches).toEqual([]);
    expect(s.getEntity).not.toHaveBeenCalled();
  });

  it('D12: several fields with the same name, only one equals the number', async () => {
    const s = setup({
      field: ok([summary('e1')]),
      entities: { e1: ok(entity('e1', [textField(FIELD, 'autre'), textField(FIELD, NUMBER)])) },
    });
    expect(okValue(await checkDuplicates(s.client, NUMBER, NAME, s.filter)).matches).toHaveLength(1);
  });

  it('D13: configured field name is used by the filter and the confirmation', async () => {
    const s = setup({
      fieldName: 'N° commande',
      field: ok([summary('e1')]),
      entities: { e1: ok(entity('e1', [textField('N° commande', NUMBER)])) },
    });
    const v = okValue(await checkDuplicates(s.client, NUMBER, NAME, s.filter));
    expect(s.searchEntitiesByField).toHaveBeenCalledWith('N° commande', NUMBER);
    expect(v.matches).toHaveLength(1);
  });

  it('D15: number with surrounding spaces is trimmed for the filter and the confirmation', async () => {
    const s = setup({
      field: ok([summary('e1')]),
      entities: { e1: ok(entity('e1', [textField(FIELD, NUMBER)])) },
    });
    const v = okValue(await checkDuplicates(s.client, `  ${NUMBER} `, NAME, s.filter));
    expect(s.searchEntitiesByField).toHaveBeenCalledWith(FIELD, NUMBER);
    expect(v.matches).toHaveLength(1);
  });
});

describe('checkDuplicates: behaviour unchanged without option or number (US2)', () => {
  it('D1: no filter: no filter call, no read, same result as with 3 arguments', async () => {
    const s = setup({ text: ok([summary('e1')]), words: ok([summary('e2', 'Clavier sans fil Exemple')]) });
    const a = await checkDuplicates(s.client, NUMBER, NAME);
    expect(s.searchEntitiesByField).not.toHaveBeenCalled();
    expect(s.getEntity).not.toHaveBeenCalled();
    const b = await checkDuplicates(s.client, NUMBER, NAME, undefined);
    expect(b).toEqual(a);
  });

  it.each(['', '  '])('D2: filter but number %j: no filter call, words only', async (number) => {
    const s = setup({ field: ok([summary('e1')]) });
    const v = okValue(await checkDuplicates(s.client, number, NAME, s.filter));
    expect(s.searchEntitiesByField).not.toHaveBeenCalled();
    expect(s.getEntity).not.toHaveBeenCalled();
    expect(s.searchEntities.mock.calls.every(([q]) => !q.startsWith('"'))).toBe(true);
    expect(v.matches).toEqual([]);
  });

  it('D14: similar and moreSimilar are identical with and without the filter', async () => {
    const similar = summary('e2', 'Clavier sans fil Exemple');
    const make = () =>
      setup({
        words: ok([similar, summary('e3', 'Clavier filaire Exemple Pro')]),
        field: ok([summary('e1'), summary('e9', 'Clavier sans fil Exemple Max')]),
        entities: { e1: ok(entity('e1', [textField(FIELD, NUMBER)])) },
      });
    const without = okValue(await checkDuplicates(make().client, NUMBER, NAME));
    const withFilter = okValue(await checkDuplicates(make().client, NUMBER, NAME, make().filter));
    expect(withFilter.similar).toEqual(without.similar);
    expect(withFilter.moreSimilar).toBe(without.moreSimilar);
    expect(withFilter.similar.map((m) => m.id)).not.toContain('e9');
    expect(withFilter.matches.map((m) => m.id)).toEqual(['e1']);
  });
});

describe('checkDuplicates: never silently ignores a failure (US3)', () => {
  const noMatch: [string, EntityOut['fields']][] = [
    ['field absent', undefined],
    ['null fields', null],
    ['other name', [textField('Other', NUMBER)]],
    ['other name case', [textField('order number', NUMBER)]],
    ['type not text', [{ name: FIELD, type: 'number', textValue: NUMBER }]],
    ['other value', [textField(FIELD, '999-0000000-0000002')]],
    ['value case differs', [textField(FIELD, NUMBER.toUpperCase() + 'x')]],
  ];

  it.each(noMatch)('D6: unfiltered list, read without matching field (%s): no match', async (_l, fields) => {
    const s = setup({ field: ok([summary('e1')]), entities: { e1: ok(entity('e1', fields)) } });
    const v = okValue(await checkDuplicates(s.client, NUMBER, NAME, s.filter));
    expect(v.matches).toEqual([]);
    expect(v.incomplete).toBe(false);
  });

  it('D7: filter fails, text ok: text matches kept, incomplete', async () => {
    const s = setup({ text: ok([summary('e1')]), field: fail('DUPLICATE_CHECK_FAILED') });
    const v = okValue(await checkDuplicates(s.client, NUMBER, NAME, s.filter));
    expect(v.matches.map((m) => m.id)).toEqual(['e1']);
    expect(v.incomplete).toBe(true);
  });

  it('D8: number text search fails, filter and read ok: filter matches, incomplete', async () => {
    const s = setup({
      text: fail('DUPLICATE_CHECK_FAILED'),
      field: ok([summary('e1')]),
      entities: { e1: ok(entity('e1', [textField(FIELD, NUMBER)])) },
    });
    const v = okValue(await checkDuplicates(s.client, NUMBER, NAME, s.filter));
    expect(v.matches.map((m) => m.id)).toEqual(['e1']);
    expect(v.incomplete).toBe(true);
  });

  it('D9: all searches fail: DUPLICATE_CHECK_FAILED', async () => {
    const f = fail<EntitySummary[]>('DUPLICATE_CHECK_FAILED');
    const s = setup({ text: f, field: f, words: f });
    expect(await checkDuplicates(s.client, NUMBER, NAME, s.filter)).toEqual({
      ok: false,
      error: 'DUPLICATE_CHECK_FAILED',
    });
  });

  it('D10: failed read: candidate not counted, incomplete, no error', async () => {
    const s = setup({ field: ok([summary('e1')]), entities: { e1: fail('UPDATE_FAILED') } });
    const v = okValue(await checkDuplicates(s.client, NUMBER, NAME, s.filter));
    expect(v.matches).toEqual([]);
    expect(v.incomplete).toBe(true);
  });

  it('D11: 7 candidates: exactly 5 reads, incomplete, only confirmed among the 5', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const entities = Object.fromEntries(ids.map((id) => [id, ok(entity(id, [textField(FIELD, NUMBER)]))]));
    const s = setup({ field: ok(ids.map((id) => summary(id))), entities });
    const v = okValue(await checkDuplicates(s.client, NUMBER, NAME, s.filter));
    expect(MAX_CONFIRM_READS).toBe(5);
    expect(s.getEntity).toHaveBeenCalledTimes(5);
    expect(v.matches.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(v.incomplete).toBe(true);
  });
});
