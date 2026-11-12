import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { importHistoryKey } from '@/background/history/history-crypto';
import { registerHistoryHandlers } from '@/background/history/handlers';
import { historyStore } from '@/background/history/history-store';
import { bytesToBase64 } from '@/shared/pdf';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createHomeBoxClient } from '@/background/homebox/client';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { ok } from '@/shared/errors';
import { PDF_B64, draft, draftPhoto } from '../contract/orchestrator-harness';
import { fetchPhoto } from '@/background/import/photo-fetch';
import { json, mockFetch, networkError } from '../contract/fetch-mock';
import { configStore } from '@/background/config/config-store';
import { registerLocationHandlers } from '@/background/location/handlers';
import { dispatch } from '@/background/router';

const KEY = 'hb_super_secret_key_9876';
const SENSITIVE = [KEY, 'Clavier sans fil Exemple Pro', '999-0000000-0000001', '99.99', '99,99'];

describe('log privacy (SC-004, principle I)', () => {
  it("no console output contains the key or the purchase data", async () => {
    fakeBrowser.reset();
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    const m = mockFetch(
      json(201, { id: 'e1', name: 'Clavier sans fil Exemple Pro' }),
      json(500, { error: 'Clavier sans fil Exemple Pro 999-0000000-0000001' }),
      json(500, {}),
    );
    const orchestrator = createOrchestrator({
      client: createHomeBoxClient({ baseUrl: 'https://homebox.example.com', apiKey: KEY, fetchImpl: m.fetch }),
      store: pendingStore,
      downloadDetected: async () => ok({ base64: PDF_B64 }),
      fetchPhoto: async () => ok({ bytes: new Uint8Array(), mimeType: 'image/jpeg', filename: 'photo-produit.jpg' }),
      notify: () => undefined,
      newId: () => 'p1',
    });

    const r = await orchestrator.startImport(1, [draft()], []);
    expect(r.ok && r.value[0]?.status).toBe('partial');

    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output.length).toBeGreaterThan(2); // the logger was indeed called
    for (const value of SENSITIVE) expect(output).not.toContain(value);
  });

  it("the Authorization header is only sent to the HomeBox instance", async () => {
    const m = mockFetch(json(201, { id: 'e1', name: 'x' }));
    await createHomeBoxClient({ baseUrl: 'https://homebox.example.com', apiKey: KEY, fetchImpl: m.fetch }).createEntity({
      name: 'x',
    });
    for (const call of m.calls) {
      expect(call.url.startsWith('https://homebox.example.com/')).toBe(true);
    }
  });
});

const PHOTO_URL = 'https://m.media-amazon.com/images/I/test-secret-photo._SL1000_.jpg';
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7, 7]);

/** Full flow with the real `fetchPhoto`: a single mocked `fetch` serves both HomeBox and the image. */
function photoRun(
  imageResponse: () => Response,
  homebox: Parameters<typeof mockFetch>,
) {
  const m = mockFetch(...homebox);
  const calls: { url: string; headers: Headers; init: RequestInit }[] = [];
  const routed = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith('https://m.media-amazon.com/')) {
      calls.push({ url, headers: new Headers(init.headers), init });
      return imageResponse();
    }
    return (m.fetch as unknown as typeof fetch)(input, init);
  }) as unknown as typeof fetch;
  const orchestrator = createOrchestrator({
    client: createHomeBoxClient({ baseUrl: 'https://homebox.example.com', apiKey: KEY, fetchImpl: routed }),
    store: pendingStore,
    downloadDetected: async () => ok({ base64: PDF_B64 }),
    fetchPhoto: (photo) => fetchPhoto(photo, routed),
    notify: () => undefined,
    newId: () => 'p1',
  });
  return { orchestrator, homebox: m, image: calls };
}

const jpeg = () => new Response(JPEG_BYTES as BodyInit, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });

describe('photo privacy (FR-022 to FR-027)', () => {
  const spyConsole = () =>
    (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));

  it("scenario 24: neither key nor image URL in the logs, failures included", async () => {
    fakeBrowser.reset();
    const spies = spyConsole();
    // success, then fetch failure (404), then upload failure (HomeBox 500)
    const ok1 = photoRun(jpeg, [json(201, { id: 'e1', name: 'x' }), json(200, {}), json(201, {}), json(201, {})]);
    await ok1.orchestrator.startImport(1, [draft({ photo: draftPhoto({ url: PHOTO_URL }) })], []);
    const ko = photoRun(() => new Response('x', { status: 404 }), [json(201, { id: 'e2', name: 'x' }), json(200, {}), json(201, {})]);
    await ko.orchestrator.startImport(1, [draft({ photo: draftPhoto({ url: PHOTO_URL }) })], []);
    const ko2 = photoRun(jpeg, [json(201, { id: 'e3', name: 'x' }), json(200, {}), json(201, {}), json(500, {})]);
    await ko2.orchestrator.startImport(1, [draft({ photo: draftPhoto({ url: PHOTO_URL }) })], []);

    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output.length).toBeGreaterThan(2);
    for (const value of [KEY, PHOTO_URL, 'test-secret-photo', 'media-amazon']) expect(output).not.toContain(value);
  });

  it("scenario 23: the image request has neither Authorization nor cookies; the key only goes to HomeBox", async () => {
    fakeBrowser.reset();
    const run = photoRun(jpeg, [json(201, { id: 'e1', name: 'x' }), json(200, {}), json(201, {}), json(201, {})]);
    await run.orchestrator.startImport(1, [draft({ photo: draftPhoto({ url: PHOTO_URL }) })], []);
    expect(run.image).toHaveLength(1);
    const [image] = run.image;
    expect(image?.url).toBe(PHOTO_URL);
    expect([...image!.headers.keys()]).toEqual([]);
    expect(image?.init.credentials).toBe('omit');
    expect(image?.init.referrerPolicy).toBe('no-referrer');
    for (const call of run.homebox.calls) {
      expect(call.url.startsWith('https://homebox.example.com/')).toBe(true);
      expect(call.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
    }
  });

  it("scenario 11: no image byte in storage after success, upload failure and abandon; the URL is purged", async () => {
    const dump = async () =>
      JSON.stringify([await fakeBrowser.storage.session.get(null), await fakeBrowser.storage.local.get(null)]);
    const bytes = JSON.stringify(Array.from(JPEG_BYTES));

    fakeBrowser.reset();
    const success = photoRun(jpeg, [json(201, { id: 'e1', name: 'x' }), json(200, {}), json(201, {}), json(201, {})]);
    await success.orchestrator.startImport(1, [draft({ photo: draftPhoto({ url: PHOTO_URL }) })], []);
    let stored = await dump();
    expect(stored).not.toContain('test-secret-photo');
    expect(stored).not.toContain(bytes);

    fakeBrowser.reset();
    const failed = photoRun(jpeg, [json(201, { id: 'e2', name: 'x' }), json(200, {}), json(201, {}), json(500, {})]);
    const r = await failed.orchestrator.startImport(1, [draft({ photo: draftPhoto({ url: PHOTO_URL }) })], []);
    stored = await dump();
    expect(stored).toContain('test-secret-photo'); // the URL is used for the resume
    expect(stored).not.toContain(bytes);
    expect(stored).not.toContain('"bytes"');

    await failed.orchestrator.abandonImport(r.ok ? r.value[0]!.id : '');
    stored = await dump();
    expect(stored).not.toContain('test-secret-photo');
    expect(stored).not.toContain(bytes);
  });
});

describe('location privacy (scenario 24, SC-008)', () => {
  const NAMES = ['Cave secrète Dupont', 'Garage Martin privé', 'Étagère de Léa'];
  const CHOICE = { id: 'loc-1', path: [NAMES[0]!, NAMES[1]!] };
  const TREE = [
    { id: 'loc-1', name: NAMES[0], type: 'location', children: [{ id: 'loc-2', name: NAMES[2], type: 'location', children: [] }] },
  ];
  const spyConsole = () =>
    (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));

  const run = (...homebox: Parameters<typeof mockFetch>) => {
    const m = mockFetch(...homebox);
    return createOrchestrator({
      client: createHomeBoxClient({ baseUrl: 'https://homebox.example.com', apiKey: KEY, fetchImpl: m.fetch }),
      store: pendingStore,
      downloadDetected: async () => ok({ base64: PDF_B64 }),
      fetchPhoto: async () => ok({ bytes: new Uint8Array(), mimeType: 'image/jpeg', filename: 'p.jpg' }),
      rememberLocation: async () => undefined,
      notify: () => undefined,
      newId: () => 'p1',
    });
  };

  it('no location name or path in the logs: successful import, disappeared location, unreadable tree, lost network', async () => {
    fakeBrowser.reset();
    const spies = spyConsole();
    const d = () => draft({ location: CHOICE, documents: [] });
    // success
    await run(json(201, { id: 'e1', name: 'x' }), json(200, {})).startImport(1, [d()], [], CHOICE.id);
    // disappeared location: 404 then a tree that no longer contains it
    await run(json(404, { error: 'Not Found' }), json(200, [{ id: 'autre', name: NAMES[2], type: 'location' }])).startImport(1, [d()], []);
    // tree failure after the POST failure
    await run(json(500, {}), json(500, { name: NAMES[0] })).startImport(1, [d()], []);
    // lost POST response
    await run(networkError()).startImport(1, [d()], []);

    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output.length).toBeGreaterThan(2);
    expect(output).toContain('GET /entities/tree');
    for (const name of [...NAMES, KEY]) expect(output).not.toContain(name);
  });

  it('no location name in the location/list handler logs (success and failures)', async () => {
    fakeBrowser.reset();
    const spies = spyConsole();
    const ext = 'chrome-extension://abcdefghijklmnop/';
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => ext + p.replace(/^\//, ''));
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(ok({ baseUrl: 'https://homebox.example.com', apiKey: KEY }));
    registerLocationHandlers();
    const bodies = [json(200, TREE), json(500, TREE), json(200, { name: NAMES[0] }), networkError()];
    for (const body of bodies) {
      const m = mockFetch(body);
      vi.stubGlobal('fetch', m.fetch);
      await dispatch({ type: 'location/list' }, { id: fakeBrowser.runtime.id, url: `${ext}popup.html` });
    }
    vi.unstubAllGlobals();

    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output.length).toBeGreaterThan(2);
    expect(output).toContain('GET /entities/tree');
    for (const name of [...NAMES, KEY]) expect(output).not.toContain(name);
  });
});

describe('import history privacy (012, Q-U4, Q-U18, Q-U28, FR-003, FR-010, FR-014)', () => {
  const PRIVATE_ADDRESS = '12 rue Exemple, 75000 Paris';
  const PAGE_URL = 'https://www.amazon.fr/your-orders/order-details';
  const spyConsole = () =>
    (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));

  async function historyRun(...homebox: Parameters<typeof mockFetch>) {
    const m = mockFetch(...homebox);
    const key = await importHistoryKey((await configStore.getHistoryKey())!);
    const writer = historyStore.forKey(key);
    let n = 0;
    return createOrchestrator({
      client: createHomeBoxClient({ baseUrl: 'https://homebox.example.com', apiKey: KEY, fetchImpl: m.fetch }),
      store: pendingStore,
      downloadDetected: async () => ok({ base64: PDF_B64 }),
      fetchPhoto: async () => ok({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg', filename: 'p.jpg' }),
      notify: () => undefined,
      newId: () => `hist-${Date.now()}-${++n}`,
      history: { start: (p) => writer.start(p, 'https://homebox.example.com'), update: (p) => writer.update(p) },
    });
  }

  const sensitiveDraft = () => {
    const d = draft({ pageUrl: PAGE_URL, photo: draftPhoto({ url: PHOTO_URL }) });
    (d as unknown as Record<string, unknown>).deliveryAddress = PRIVATE_ADDRESS;
    return d;
  };

  it('storage.local holds no key, address, page URL, photo URL, price, nor any entry value in clear', async () => {
    fakeBrowser.reset();
    await configStore.save({ baseUrl: 'https://homebox.example.com', apiKey: KEY, passphrase: 'une phrase de passe solide' }, 1_000);
    const hek = bytesToBase64((await configStore.getHistoryKey())!);
    const o = await historyRun(json(201, { id: 'entity-77', name: 'x' }), json(200, {}), json(201, {}), json(201, {}));
    const r = await o.startImport(1, [sensitiveDraft()], []);
    expect(r.ok && r.value[0]?.status).toBe('success');

    const all = await fakeBrowser.storage.local.get(null);
    const raw = JSON.stringify(all);
    for (const v of [KEY, PRIVATE_ADDRESS, PAGE_URL, PHOTO_URL, '99.99', hek]) expect(raw).not.toContain(v);
    const entries = Object.entries(all).filter(([k]) => k.startsWith('importHistory:'));
    expect(entries).toHaveLength(1);
    const entryValues = JSON.stringify(entries.map(([, v]) => v));
    for (const v of ['Clavier sans fil Exemple Pro', '999-0000000-0000001', 'amazon.fr', 'entity-77', 'homebox.example.com']) {
      expect(entryValues).not.toContain(v);
    }
    for (const [, v] of entries) expect(Object.keys(v as object).sort()).toEqual(['ct', 'iv', 'v']);
    // The encrypted API key is in the configuration, never in an entry.
    const encryptedKey = (all.homeboxConfig as { encryptedKey: { ct: string } }).encryptedKey.ct;
    expect(entryValues).not.toContain(encryptedKey);
  });

  it('console output of a complete, partial and failed import with history, then history/*: no name, order, key, address', async () => {
    fakeBrowser.reset();
    const spies = spyConsole();
    await configStore.save({ baseUrl: 'https://homebox.example.com', apiKey: KEY, passphrase: 'une phrase de passe solide' }, 1_000);
    const hek = bytesToBase64((await configStore.getHistoryKey())!);
    await (await historyRun(json(201, { id: 'e1', name: 'x' }), json(200, {}), json(201, {}), json(201, {}))).startImport(1, [sensitiveDraft()], []);
    await (await historyRun(json(201, { id: 'e2', name: 'x' }), json(200, {}), json(500, {}), json(500, {}))).startImport(1, [sensitiveDraft()], []);
    await (await historyRun(json(500, { error: 'Clavier sans fil Exemple Pro' }), json(500, {}))).startImport(1, [sensitiveDraft()], []);

    const ext = 'chrome-extension://abcdefghijklmnop/';
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => ext + p.replace(/^\//, ''));
    registerHistoryHandlers();
    const sender = { id: fakeBrowser.runtime.id, url: `${ext}popup.html` };
    const listed = (await dispatch({ type: 'history/list' }, sender)) as { ok: boolean; value: { entries: { id: string }[] } };
    expect(listed.value.entries).toHaveLength(3);
    await dispatch({ type: 'history/delete', id: listed.value.entries[0]!.id }, sender);
    await dispatch({ type: 'history/clear' }, sender);

    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const v of [KEY, hek, PRIVATE_ADDRESS, 'Clavier sans fil Exemple Pro', '999-0000000-0000001', 'homebox.example.com']) {
      expect(output).not.toContain(v);
    }
  });

  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? sources(p) : [p];
    });

  it('source sweep: no console. in src/background/history/, src/background/config/ nor src/ui/ (FR-010)', () => {
    const files = [
      ...sources(resolve(__dirname, '../../src/background/history')),
      ...sources(resolve(__dirname, '../../src/background/config')),
      ...sources(resolve(__dirname, '../../src/ui')),
    ];
    expect(files.length).toBeGreaterThan(4);
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/console\./);
  });

  it('source sweep: no network nor sync storage in src/background/history/ (FR-002, SC-003)', () => {
    for (const f of sources(resolve(__dirname, '../../src/background/history'))) {
      const src = readFileSync(f, 'utf8');
      for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'storage.sync']) expect(src, `${f}: ${banned}`).not.toContain(banned);
    }
  });
});
