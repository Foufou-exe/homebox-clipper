import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { generateHistoryKey, importHistoryKey, open } from '@/background/history/history-crypto';
import { historyStore } from '@/background/history/history-store';
import { createHomeBoxClient } from '@/background/homebox/client';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { ok } from '@/shared/errors';
import type { ImportDraft, PendingImport } from '@/shared/types';
import { PDF_B64, draft, photoOk } from '../contract/orchestrator-harness';

/**
 * Spec 021 (FR-022, FR-023, SC-007): completing an existing item logs nothing of the item read nor of the purchase,
 * stores nothing of the item outside the import in progress, and sends the key to the HomeBox instance only. Style of
 * privacy.test.ts (unchanged). Fixed, fictitious values only.
 */

const BASE = 'https://homebox.example.com';
const KEY = 'hb_xxxxxxxx_privacy_completion';
const NUMBER = '999-0000000-0000001';
const ITEM = {
  id: 'item-1',
  name: 'Nom privé de l’objet HomeBox',
  quantity: 2,
  notes: 'Notes privées de l’objet',
  purchaseFrom: 'Vendeur privé',
  purchasePrice: 0,
  tags: [{ id: 't1', name: 'Tag privé' }],
  fields: [{ id: 'f1', name: 'Champ privé', type: 'text', textValue: 'Valeur privée' }],
  attachments: [],
};
const SENSITIVE = [
  KEY,
  'Clavier sans fil Exemple Pro',
  NUMBER,
  '99.99',
  '99,99',
  'Nom privé',
  'Notes privées',
  'Vendeur privé',
  'Tag privé',
  'Champ privé',
  'Valeur privée',
  'item-1',
];

type Mode = 'success' | 'partial' | 'failed';

/** HomeBox simulated at the level of `fetch`: the real client builds the requests. */
function homebox(mode: Mode) {
  const calls: { url: string; auth: string | null }[] = [];
  let current: Record<string, unknown> = { ...ITEM };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    calls.push({ url, auth: new Headers(init.headers).get('Authorization') });
    if (url.endsWith('/entities/item-1') && method === 'GET') {
      return mode === 'failed'
        ? reply(404, { error: `${ITEM.name} not found` })
        : reply(200, current);
    }
    if (url.endsWith('/entities/item-1') && method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      current = { ...current, ...body };
      return reply(200, current);
    }
    if (url.endsWith('/tags') && method === 'GET') return reply(200, []);
    if (url.endsWith('/tags')) return reply(201, { id: 't2', name: 'Amazon' });
    if (url.endsWith('/attachments'))
      return mode === 'partial' ? reply(500, { error: ITEM.notes }) : reply(201, {});
    return reply(200, ITEM);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const completeDraft = (): ImportDraft =>
  draft({
    tags: [{ name: 'Amazon' }],
    photo: {
      url: 'https://m.media-amazon.com/images/I/test-1._SL1000_.jpg',
      merchantId: 'amazon.fr',
      include: true,
    },
    orderFields: [{ role: 'orderNumber', name: 'Order number', value: NUMBER }],
    complete: {
      entityId: 'item-1',
      itemName: 'Nom privé de l’objet HomeBox',
      keys: [
        'doc:detected-0',
        'photo',
        'tag:amazon',
        'purchasePrice',
        'notes',
        'field:orderNumber',
      ],
    },
  });

async function runCompletion(mode: Mode): Promise<{
  result: PendingImport;
  output: string;
  calls: { url: string; auth: string | null }[];
}> {
  fakeBrowser.reset();
  const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
    vi.spyOn(console, k).mockImplementation(() => undefined),
  );
  const hb = homebox(mode);
  const key = await importHistoryKey(generateHistoryKey());
  const writer = historyStore.forKey(key, 'inst-a');
  const orchestrator = createOrchestrator({
    client: createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: hb.fetchImpl }),
    store: pendingStore,
    downloadDetected: async () => ok({ base64: PDF_B64 }),
    fetchPhoto: async () => ok(photoOk),
    history: { start: (p) => writer.start(p, BASE), update: (p) => writer.update(p) },
    notify: () => undefined,
    newId: () => 'p1',
  });
  const r = await orchestrator.startImport(1, [completeDraft()], []);
  if (!r.ok) throw new Error(r.error);
  const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
  for (const s of spies) s.mockRestore();
  return { result: r.value[0]!, output, calls: hb.calls };
}

describe('completion privacy (021, FR-022, FR-023, SC-007)', () => {
  it.each(['success', 'partial', 'failed'] as const)(
    '%s: no console output contains the key nor a value of the item or of the purchase',
    async (mode) => {
      const { result, output } = await runCompletion(mode);
      expect(result.status).toBe(mode);
      for (const value of SENSITIVE) expect(output, value).not.toContain(value);
    },
  );

  it.each(['success', 'partial', 'failed'] as const)(
    '%s: storage.local holds no value of the item (history encrypted, no plain value)',
    async (mode) => {
      await runCompletion(mode);
      const local = JSON.stringify(await fakeBrowser.storage.local.get(null));
      for (const value of SENSITIVE) expect(local, value).not.toContain(value);
    },
  );

  it('the history entry (decrypted) carries completed: true and nothing of the item read', async () => {
    fakeBrowser.reset();
    const hb = homebox('success');
    const key = await importHistoryKey(generateHistoryKey());
    const writer = historyStore.forKey(key, 'inst-a');
    const orchestrator = createOrchestrator({
      client: createHomeBoxClient({ baseUrl: BASE, apiKey: KEY, fetchImpl: hb.fetchImpl }),
      store: pendingStore,
      downloadDetected: async () => ok({ base64: PDF_B64 }),
      fetchPhoto: async () => ok(photoOk),
      history: { start: (p) => writer.start(p, BASE), update: (p) => writer.update(p) },
      notify: () => undefined,
      newId: () => 'p1',
    });
    await orchestrator.startImport(1, [completeDraft()], []);
    const stored = await fakeBrowser.storage.local.get(null);
    const envelopeKey = Object.keys(stored).find((k) => k.startsWith('importHistory:'))!;
    const entry = await open(
      (stored[envelopeKey] as { env?: unknown }).env ?? stored[envelopeKey],
      key,
      'p1',
    );
    expect(entry).toMatchObject({ completed: true, entityId: 'item-1', status: 'complete' });
    const text = JSON.stringify(entry);
    for (const value of [
      'Nom privé',
      'Notes privées',
      'Vendeur privé',
      'Tag privé',
      'Valeur privée',
    ])
      expect(text).not.toContain(value);
  });

  it('the Authorization header is only sent to the HomeBox instance; every request goes to it', async () => {
    const { calls } = await runCompletion('success');
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url.startsWith(`${BASE}/`)).toBe(true);
      expect(call.auth).toBe(`Bearer ${KEY}`);
    }
  });

  it('no console.* in the new modules (logging goes through src/shared/logger.ts only)', () => {
    for (const file of [
      'src/background/import/completion.ts',
      'src/ui/popup/completion.ts',
      'src/ui/components/CompletionDialog.vue',
    ]) {
      expect(readFileSync(resolve(__dirname, '../..', file), 'utf8'), file).not.toMatch(
        /console\./,
      );
    }
  });
});
