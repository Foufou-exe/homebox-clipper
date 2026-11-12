import {
  groupByOrder,
  missingOf,
  prune,
  reconcile,
  statusOf,
  toEntry,
} from '@/background/history/entry';
import type { ImportDraft, ImportHistoryEntry, PendingImport } from '@/shared/types';
import { draft, invoice } from '../contract/orchestrator-harness';

const CTX = { importedAt: '2026-11-12T10:00:00.000Z', instance: 'https://homebox.example.com' };
const orderDoc = {
  id: 'detected-1',
  origin: 'detected' as const,
  kind: 'order_document' as const,
  label: 'bon.pdf',
  url: 'https://www.amazon.fr/doc.pdf',
};

function pending(over: Partial<PendingImport> = {}, d: Partial<ImportDraft> = {}): PendingImport {
  return {
    id: 'p1',
    tabId: 7,
    pageUrl: 'https://www.amazon.fr/your-orders/order-details',
    draft: draft(d),
    entityId: 'e1',
    steps: {
      create: 'done',
      update: 'done',
      attachments: { 'detected-0': 'done' },
      photo: 'not_requested',
    },
    status: 'success',
    error: null,
    photoError: null,
    photoAttempted: false,
    ...over,
  };
}

const BASE_KEYS = [
  'entityId',
  'id',
  'importedAt',
  'instance',
  'merchantId',
  'missing',
  'name',
  'orderNumber',
  'purchaseDate',
  'reason',
  'status',
  'v',
];

describe('history entry: projection (Q-U1, FR-003)', () => {
  it('whitelist: exactly the keys of the model', () => {
    expect(Object.keys(toEntry(pending(), CTX)).sort()).toEqual(BASE_KEYS);
    expect(toEntry(pending(), CTX)).toEqual({
      v: 1,
      id: 'p1',
      importedAt: CTX.importedAt,
      name: 'Clavier sans fil Exemple Pro',
      merchantId: 'amazon.fr',
      orderNumber: '999-0000000-0000001',
      purchaseDate: '2026-10-22',
      instance: CTX.instance,
      entityId: 'e1',
      status: 'complete',
      missing: [],
      reason: null,
    });
  });

  it('leak by projection: no sensitive draft field ends up in the entry', () => {
    const MARK = 'MARQUEUR_SENSIBLE';
    const d = draft({
      description: `${MARK}-description`,
      purchasePrice: 123456.78,
      currency: `${MARK}-EUR`,
      quantity: 987654,
      purchaseFrom: `${MARK}-vendeur`,
      pageUrl: 'https://www.amazon.fr/your-orders/order-details?secret=MARQUEUR_SENSIBLE-url',
      photo: {
        url: `https://m.media-amazon.com/${MARK}-photo.jpg`,
        merchantId: 'amazon.fr',
        include: true,
      },
      location: { id: `${MARK}-loc`, path: [`${MARK}-path`] },
      documents: [
        { ...invoice, label: `${MARK}-label`, url: `https://www.amazon.fr/${MARK}-doc.pdf` },
      ],
    });
    (d as unknown as Record<string, unknown>).deliveryAddress = `${MARK}-address`;
    const p = pending({ tabId: 424242, draft: d, pageUrl: `https://www.amazon.fr/${MARK}` });
    const s = JSON.stringify(toEntry(p, CTX));
    expect(s).not.toContain(MARK);
    expect(s).not.toContain('123456');
    expect(s).not.toContain('987654');
    expect(s).not.toContain('424242');
    expect(s).not.toContain('www.amazon');
    expect(s).not.toContain('media-amazon');
    expect(s).not.toContain('/item/');
  });

  it('interrupted is never set by the projection', () => {
    expect(
      'interrupted' in toEntry(pending({ status: 'partial', error: 'ATTACHMENT_FAILED' }), CTX),
    ).toBe(false);
  });

  it('name: trimmed, truncated to 255, never empty', () => {
    expect(toEntry(pending({}, { name: '  Clavier  ' }), CTX).name).toBe('Clavier');
    expect(toEntry(pending({}, { name: 'x'.repeat(300) }), CTX).name).toHaveLength(255);
    expect(toEntry(pending({}, { name: '   ' }), CTX).name.length).toBeGreaterThan(0);
    // A surrogate pair is never cut in half.
    const emoji = `${'x'.repeat(254)}😀`;
    const cut = toEntry(pending({}, { name: emoji }), CTX).name;
    expect(cut.length).toBeLessThanOrEqual(255);
    expect(cut).toBe('x'.repeat(254));
  });

  it('orderNumber: trimmed, truncated to 64, otherwise null', () => {
    expect(toEntry(pending({}, { orderNumber: ' 999-0000000-0000001 ' }), CTX).orderNumber).toBe(
      '999-0000000-0000001',
    );
    expect(toEntry(pending({}, { orderNumber: '9'.repeat(80) }), CTX).orderNumber).toHaveLength(64);
    expect(toEntry(pending({}, { orderNumber: '  ' }), CTX).orderNumber).toBeNull();
    expect(toEntry(pending({}, { orderNumber: null }), CTX).orderNumber).toBeNull();
  });

  it('purchaseDate: YYYY-MM-DD only', () => {
    expect(toEntry(pending({}, { purchaseDate: '2026-10-22' }), CTX).purchaseDate).toBe(
      '2026-10-22',
    );
    expect(toEntry(pending({}, { purchaseDate: '22/10/2026' }), CTX).purchaseDate).toBeNull();
    expect(toEntry(pending({}, { purchaseDate: '2026-10-22T10:00' }), CTX).purchaseDate).toBeNull();
    expect(toEntry(pending({}, { purchaseDate: null }), CTX).purchaseDate).toBeNull();
  });

  it('merchantId from the catalog, never a URL', () => {
    expect(toEntry(pending({}, { pageUrl: 'https://www.amazon.fr/x' }), CTX).merchantId).toBe(
      'amazon.fr',
    );
    expect(toEntry(pending({}, { pageUrl: 'https://www.amazon.de/x' }), CTX).merchantId).toBe(
      'amazon.de',
    );
    expect(toEntry(pending({}, { pageUrl: null }), CTX).merchantId).toBeNull();
    expect(toEntry(pending({}, { pageUrl: 'https://www.amazon.ca/x' }), CTX).merchantId).toBeNull();
  });

  it('importedAt and instance come from the context', () => {
    const e = toEntry(pending(), {
      importedAt: '2025-01-01T00:00:00.000Z',
      instance: 'https://autre.example.com/hb',
    });
    expect(e.importedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(e.instance).toBe('https://autre.example.com/hb');
  });
});

describe('statuses and invariants (Q-U3)', () => {
  it('statusOf: success → complete, the others unchanged', () => {
    expect(statusOf(pending({ status: 'success' }))).toBe('complete');
    expect(statusOf(pending({ status: 'partial' }))).toBe('partial');
    expect(statusOf(pending({ status: 'failed', entityId: null }))).toBe('failed');
    expect(statusOf(pending({ status: 'running' }))).toBe('running');
  });

  const table: Array<[string, PendingImport]> = [
    ['complete', pending()],
    [
      'partial',
      pending({
        status: 'partial',
        error: 'ATTACHMENT_FAILED',
        steps: {
          create: 'done',
          update: 'done',
          attachments: { 'detected-0': 'failed' },
          photo: 'not_requested',
        },
      }),
    ],
    [
      'failed before creation',
      pending({
        status: 'failed',
        entityId: null,
        error: 'CREATE_FAILED',
        steps: {
          create: 'failed',
          update: 'pending',
          attachments: { 'detected-0': 'pending' },
          photo: 'not_requested',
        },
      }),
    ],
    [
      'running',
      pending({
        status: 'running',
        error: null,
        entityId: null,
        steps: {
          create: 'pending',
          update: 'pending',
          attachments: { 'detected-0': 'pending' },
          photo: 'pending',
        },
      }),
    ],
    ['inconsistent: failed with entityId', pending({ status: 'failed', error: 'UPDATE_FAILED' })],
    [
      'inconsistent: partial without entityId',
      pending({ status: 'partial', entityId: null, error: 'CREATE_FAILED' }),
    ],
    ['inconsistent: complete with an error', pending({ error: 'ATTACHMENT_FAILED' })],
  ];

  it.each(table)('invariants 2 to 5 hold: %s', (_, p) => {
    const e = toEntry(p, CTX);
    if (e.status === 'complete') {
      expect(e.entityId).not.toBeNull();
      expect(e.missing).toEqual([]);
      expect(e.reason).toBeNull();
    }
    if (e.status === 'failed') {
      expect(e.entityId === null || e.interrupted).toBeTruthy();
      expect(e.missing).toEqual([]);
    }
    if (e.status === 'partial') {
      expect(e.entityId).not.toBeNull();
      expect(e.missing.length > 0 || e.reason !== null || e.interrupted).toBeTruthy();
    }
    if (e.status === 'running') {
      expect(e.reason).toBeNull();
      expect(e.interrupted).toBeUndefined();
    }
  });

  it('reason is an error code, taken from the import', () => {
    expect(toEntry(table[2]![1], CTX).reason).toBe('CREATE_FAILED');
    expect(toEntry(table[1]![1], CTX).reason).toBe('ATTACHMENT_FAILED');
  });
});

describe('missingOf (R3.1, Q-U2)', () => {
  const steps = (s: Partial<PendingImport['steps']>): PendingImport['steps'] => ({
    create: 'done',
    update: 'done',
    attachments: {},
    photo: 'not_requested',
    ...s,
  });
  const p = (
    s: Partial<PendingImport['steps']>,
    docs = [invoice, orderDoc],
    entityId: string | null = 'e1',
  ) => pending({ status: 'partial', entityId, steps: steps(s) }, { documents: docs });

  it('details when the PUT is not done', () => {
    expect(
      missingOf(
        p({ update: 'failed', attachments: { 'detected-0': 'done', 'detected-1': 'done' } }),
      ),
    ).toEqual(['details']);
  });

  it('invoice / documents by kind', () => {
    expect(missingOf(p({ attachments: { 'detected-0': 'failed', 'detected-1': 'done' } }))).toEqual(
      ['invoice'],
    );
    expect(
      missingOf(p({ attachments: { 'detected-0': 'done', 'detected-1': 'pending' } })),
    ).toEqual(['documents']);
    expect(missingOf(p({ attachments: {} }))).toEqual(['invoice', 'documents']);
  });

  it.each([['pending'], ['sending'], ['failed']] as const)('photo %s is missing', (photo) => {
    expect(
      missingOf(p({ photo, attachments: { 'detected-0': 'done', 'detected-1': 'done' } })),
    ).toEqual(['photo']);
  });

  it.each([['not_requested'], ['unavailable'], ['done']] as const)(
    'photo %s is not missing',
    (photo) => {
      expect(
        missingOf(p({ photo, attachments: { 'detected-0': 'done', 'detected-1': 'done' } })),
      ).toEqual([]);
    },
  );

  it('without entityId: []', () => {
    expect(missingOf(p({ update: 'pending', photo: 'pending' }, [invoice], null))).toEqual([]);
  });

  it('no duplicate, always in the order details, invoice, documents, photo', () => {
    const second = { ...invoice, id: 'manual-1', origin: 'manual' as const };
    expect(
      missingOf(p({ update: 'failed', photo: 'failed' }, [orderDoc, second, invoice])),
    ).toEqual(['details', 'invoice', 'documents', 'photo']);
  });
});

const base = (over: Partial<ImportHistoryEntry> = {}): ImportHistoryEntry => ({
  ...toEntry(pending(), CTX),
  ...over,
});

describe('reconcile (R1.3)', () => {
  it('running with entityId → partial, interrupted, no reason', () => {
    const e = reconcile(base({ status: 'running', missing: ['invoice'] }));
    expect(e).toMatchObject({
      status: 'partial',
      interrupted: true,
      reason: null,
      missing: ['invoice'],
    });
  });

  it('running without entityId → failed, interrupted, missing []', () => {
    const e = reconcile(base({ status: 'running', entityId: null }));
    expect(e).toMatchObject({ status: 'failed', interrupted: true, reason: null, missing: [] });
  });

  it('an entry that is not running is returned as is', () => {
    const e = base({ status: 'partial', reason: 'ATTACHMENT_FAILED', missing: ['invoice'] });
    expect(reconcile(e)).toEqual(e);
  });
});

describe('prune: 12 calendar months and 200 entries, injected clock (R2, Q-U9)', () => {
  const NOW = Date.parse('2027-02-28T12:00:00.000Z');
  const at = (iso: string, id = iso) => ({ id, entry: base({ id, importedAt: iso }) });

  it('exactly 12 calendar months: kept; 12 months + 1 day: removed', () => {
    const removed = prune(
      [at('2026-02-28T12:00:00.000Z', 'pile'), at('2026-02-27T12:00:00.000Z', 'vieille')],
      NOW,
    );
    expect(removed).toEqual(['vieille']);
  });

  it('end of month: 31 March minus one month clamps to 28 February (no overflow)', () => {
    // 2028-02-29 minus 12 months = 2027-02-28 (and not 1 March 2027).
    const now = Date.parse('2028-02-29T12:00:00.000Z');
    expect(
      prune(
        [at('2027-02-28T12:00:00.000Z', 'fin-fevrier'), at('2027-02-28T11:59:59.000Z', 'avant')],
        now,
      ),
    ).toEqual(['avant']);
    const march = Date.parse('2027-03-31T00:00:00.000Z');
    expect(
      prune([at('2026-03-31T00:00:00.000Z', 'a'), at('2026-03-30T23:59:59.000Z', 'b')], march),
    ).toEqual(['b']);
  });

  it('the 201st (by importedAt, descending) is removed, and only it', () => {
    const entries = Array.from({ length: 201 }, (_, i) =>
      at(new Date(NOW - i * 60_000).toISOString(), `e${String(i).padStart(3, '0')}`),
    );
    expect(prune(entries, NOW)).toEqual(['e200']);
    expect(prune(entries.slice(0, 200), NOW)).toEqual([]);
  });

  it('150 old + 100 recent: the 150 old are removed, the 100 recent kept', () => {
    const old = Array.from({ length: 150 }, (_, i) =>
      at(new Date(Date.parse('2025-01-01T00:00:00Z') + i * 1000).toISOString(), `old${i}`),
    );
    const recent = Array.from({ length: 100 }, (_, i) =>
      at(new Date(NOW - i * 1000).toISOString(), `new${i}`),
    );
    const removed = prune([...old, ...recent], NOW);
    expect(removed).toHaveLength(150);
    expect(removed.every((id) => id.startsWith('old'))).toBe(true);
  });

  it('invalid v = 1 entries are removed first; recent running entries are kept', () => {
    const removed = prune(
      [
        { id: 'bad', entry: null },
        {
          id: 'run',
          entry: base({ id: 'run', status: 'running', importedAt: '2027-02-28T11:00:00.000Z' }),
        },
      ],
      NOW,
    );
    expect(removed).toEqual(['bad']);
  });
});

describe('groupByOrder (R4.3)', () => {
  it('groups by (merchantId, orderNumber, instance), in place of the most recent entry; no number = alone', () => {
    const e = (id: string, iso: string, over: Partial<ImportHistoryEntry> = {}) =>
      base({ id, importedAt: iso, ...over });
    const list = [
      e('a', '2026-11-12T10:03:00Z'),
      e('m', '2026-11-12T10:02:30Z', { orderNumber: null, merchantId: null }),
      e('b', '2026-11-12T10:02:00Z'),
      e('x', '2026-11-12T10:01:30Z', { orderNumber: '111-0000000-0000002' }),
      e('c', '2026-11-12T10:01:00Z'),
      e('d', '2026-11-12T10:00:30Z', { instance: 'https://autre.example.com' }),
      e('n', '2026-11-12T10:00:00Z', { orderNumber: null, merchantId: null }),
    ];
    const groups = groupByOrder(list);
    expect(groups.map((g) => g.entries.map((x) => x.id))).toEqual([
      ['a', 'b', 'c'],
      ['m'],
      ['x'],
      ['d'],
      ['n'],
    ]);
    expect(groups[0]).toMatchObject({
      orderNumber: '999-0000000-0000001',
      merchantId: 'amazon.fr',
    });
    expect(groups[1]).toMatchObject({ orderNumber: null });
  });
});
