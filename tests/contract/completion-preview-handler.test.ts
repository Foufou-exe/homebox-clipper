import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { registerImportHandlers } from '@/background/import/handlers';
import { dispatch } from '@/background/router';
import { fail, ok } from '@/shared/errors';
import type { ImportDraft } from '@/shared/types';
import { draft } from './orchestrator-harness';

/**
 * Spec 021 (contracts/homebox-completion.md §4, H1 to H6): `import/complete-preview` reads the chosen item on the target
 * instance only and answers the possible changes, never any other value of the item. Fixed, fictitious values only.
 */

const EXT = 'chrome-extension://abcdefghijklmnop/';
const ORIGIN_A = 'https://homebox.example.com';
const ORIGIN_B = 'https://homebox-b.example.com';
const KEY = 'hb_xxxxxxxx';
const NUMBER = '999-0000000-0000001';
const call = (msg: unknown) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** An item already in HomeBox: notes, fields, tags, a price; the values below must never reach the popup. */
const ITEM = {
  id: 'item-1',
  name: 'Clavier sans fil Exemple Pro',
  quantity: 2,
  notes: 'Note privée de l’objet',
  purchasePrice: 0,
  purchaseFrom: 'Boutique secrète',
  tags: [{ id: 't1', name: 'Bureau privé' }],
  fields: [{ id: 'f1', name: 'Merchant', type: 'text', textValue: 'Valeur privée' }],
  attachments: [{ id: 'a1', type: 'photo', primary: true, title: 'photo-produit.jpg' }],
};

const previewDraft = (over: Partial<ImportDraft> = {}): ImportDraft =>
  draft({
    tags: [{ name: 'Amazon' }],
    photo: {
      url: 'https://m.media-amazon.com/images/I/test-1._SL1000_.jpg',
      merchantId: 'amazon.fr',
      include: true,
    },
    orderFields: [
      { role: 'orderNumber', name: 'Order number', value: NUMBER },
      { role: 'merchant', name: 'Merchant', value: 'Amazon.fr' },
    ],
    ...over,
  });
const MSG = {
  type: 'import/complete-preview',
  instanceId: 'inst-a',
  entityId: 'item-1',
  draft: previewDraft(),
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
    (p: string) => EXT + p.replace(/^\//, ''),
  );
  vi.spyOn(configStore, 'getCredentials').mockImplementation(async (id: string) => {
    if (id === 'inst-a') return ok({ id: 'inst-a', baseUrl: ORIGIN_A, apiKey: KEY });
    if (id === 'inst-b') return ok({ id: 'inst-b', baseUrl: ORIGIN_B, apiKey: 'hb_yyyyyyyy' });
    return fail('INSTANCE_NOT_FOUND');
  });
  registerImportHandlers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('import/complete-preview handler (021, H1 to H6)', () => {
  it('H1: one GET /entities/{id} to the instance of the message with its key; answer = CompletionPreview', async () => {
    const fetchMock = vi.fn(async () => reply(200, ITEM));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call(MSG);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ORIGIN_A}/api/v1/entities/item-1`);
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${KEY}`);
    expect(res).toEqual({
      ok: true,
      value: {
        entityId: 'item-1',
        itemName: 'Clavier sans fil Exemple Pro',
        quantity: 2,
        changes: [
          { key: 'doc:detected-0', category: 'attachments' },
          { key: 'photo', category: 'attachments', primary: false },
          { key: 'tag:amazon', category: 'tags' },
          { key: 'purchasePrice', category: 'purchase' },
          { key: 'purchaseDate', category: 'purchase' },
          { key: 'field:orderNumber', category: 'order' },
          { key: 'notes', category: 'order' },
        ],
        filled: ['purchaseFrom', 'field:merchant'],
      },
    });
  });

  it('H2: 404 → ITEM_NOT_FOUND', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(404, { error: 'not found' })),
    );
    expect(await call(MSG)).toEqual({ ok: false, error: 'ITEM_NOT_FOUND', httpStatus: 404 });
  });

  it('H3: 401 → UNAUTHORIZED; network failure → HOMEBOX_UNREACHABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(401, {})),
    );
    expect(await call(MSG)).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await call(MSG)).toMatchObject({ ok: false, error: 'HOMEBOX_UNREACHABLE' });
  });

  it.each(['LOCKED', 'INSTANCE_NOT_FOUND', 'NOT_CONFIGURED'] as const)(
    'H4: %s → returned without any request',
    async (code) => {
      vi.mocked(configStore.getCredentials).mockResolvedValue(fail(code));
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      expect(await call(MSG)).toEqual({ ok: false, error: code });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('H5: two instances, target B → every request goes to B, none to A', async () => {
    const fetchMock = vi.fn(async () => reply(200, ITEM));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call({ ...MSG, instanceId: 'inst-b' });
    expect(res).toMatchObject({ ok: true });
    const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls).toEqual([`${ORIGIN_B}/api/v1/entities/item-1`]);
    expect(urls.some((u) => u.startsWith(ORIGIN_A))).toBe(false);
  });

  it('H6: the answer carries only entityId, itemName, quantity, changes and filled; nothing is logged nor stored', async () => {
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply(200, ITEM)),
    );
    const res = (await call(MSG)) as { ok: true; value: Record<string, unknown> };
    expect(Object.keys(res.value).sort((a, b) => a.localeCompare(b))).toEqual([
      'changes',
      'entityId',
      'filled',
      'itemName',
      'quantity',
    ]);
    const answer = JSON.stringify(res);
    for (const secret of [
      'Note privée',
      'Boutique secrète',
      'Bureau privé',
      'Valeur privée',
      't1',
      'f1',
      'a1',
    ]) {
      expect(answer).not.toContain(secret);
    }
    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const secret of [
      KEY,
      'Clavier sans fil',
      'Note privée',
      'Valeur privée',
      NUMBER,
      'item-1',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
  });

  it('a malformed message (draft with a completion) is refused before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const bad = {
      ...MSG,
      draft: { ...previewDraft(), complete: { entityId: 'item-1', itemName: 'x', keys: [] } },
    };
    expect(await call(bad)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
