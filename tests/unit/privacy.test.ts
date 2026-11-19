import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { importHistoryKey } from '@/background/history/history-crypto';
import { registerHistoryHandlers } from '@/background/history/handlers';
import { historyStore } from '@/background/history/history-store';
import { bytesToBase64 } from '@/shared/pdf';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createHomeBoxClient } from '@/background/homebox/client';
import { checkDuplicates } from '@/background/import/duplicates';
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
    // ADAPTED (016): the credentials carry the instance id; location/list names its target.
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(ok({ id: 'inst-a', baseUrl: 'https://homebox.example.com', apiKey: KEY }));
    registerLocationHandlers();
    const bodies = [json(200, TREE), json(500, TREE), json(200, { name: NAMES[0] }), networkError()];
    for (const body of bodies) {
      const m = mockFetch(body);
      vi.stubGlobal('fetch', m.fetch);
      await dispatch({ type: 'location/list', instanceId: 'inst-a' }, { id: fakeBrowser.runtime.id, url: `${ext}popup.html` });
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
    // ADAPTED (016): the sealed key lives in homeboxInstances.
    const encryptedKey = (all.homeboxInstances as { instances: Array<{ key: { ct: string } }> }).instances[0]!.key.ct;
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

describe('document types privacy (007, Q-U19, principle I, FR-011)', () => {
  const spyConsole = () =>
    (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));
  const docs = [
    { id: 'detected-MARQUEUR-1', origin: 'detected' as const, kind: 'manual' as const, label: 'MARQUEUR-manuel.pdf', url: 'https://www.amazon.fr/d/1.pdf' },
    { id: 'detected-MARQUEUR-2', origin: 'detected' as const, kind: 'warranty' as const, label: 'MARQUEUR-garantie.pdf', url: 'https://www.amazon.fr/d/2.pdf' },
  ];

  async function run(homebox: Parameters<typeof mockFetch>) {
    fakeBrowser.reset();
    await configStore.save({ baseUrl: 'https://homebox.example.com', apiKey: KEY, passphrase: 'une phrase de passe solide' }, 1_000);
    const m = mockFetch(...homebox);
    const key = await importHistoryKey((await configStore.getHistoryKey())!);
    const writer = historyStore.forKey(key);
    const orchestrator = createOrchestrator({
      client: createHomeBoxClient({ baseUrl: 'https://homebox.example.com', apiKey: KEY, fetchImpl: m.fetch }),
      store: pendingStore,
      downloadDetected: async () => ok({ base64: PDF_B64 }),
      fetchPhoto: async () => ok({ bytes: new Uint8Array(), mimeType: 'image/jpeg', filename: 'p.jpg' }),
      notify: () => undefined,
      newId: () => 'p-doc-1',
      history: { start: (p) => writer.start(p, 'https://homebox.example.com'), update: (p) => writer.update(p) },
    });
    return { orchestrator, m };
  }

  it('a manual, a warranty and a 422 fallback: no document data in the console, in storage or off the instance', async () => {
    const spies = spyConsole();
    const { orchestrator, m } = await run([
      json(201, { id: 'e1', name: 'x' }),
      json(200, {}),
      json(422, { error: 'MARQUEUR-manuel.pdf' }),
      json(201, {}),
      json(500, {}),
    ]);
    const r = await orchestrator.startImport(1, [draft({ documents: docs })], []);
    expect(r.ok && r.value[0]).toMatchObject({ status: 'partial', attachmentFallbacks: ['detected-MARQUEUR-1'] });

    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const v of [KEY, 'MARQUEUR', 'manual', 'warranty', 'Clavier sans fil Exemple Pro', '999-0000000-0000001']) {
      expect(output).not.toContain(v);
    }
    // History: no document name, label, id or fallback (the session state is not the history).
    const local = JSON.stringify(await fakeBrowser.storage.local.get(null));
    for (const v of ['MARQUEUR', 'attachmentFallbacks', 'detected-', 'manual-']) expect(local).not.toContain(v);
    // The fallback goes to the same instance, nowhere else.
    expect(m.calls).toHaveLength(5);
    for (const call of m.calls) expect(call.url.startsWith('https://homebox.example.com/')).toBe(true);
    expect(m.calls[3]?.url).toBe(m.calls[2]?.url);
  });

  it('attachmentFallbacks is in no history/list response', async () => {
    const { orchestrator } = await run([
      json(201, { id: 'e1', name: 'x' }),
      json(200, {}),
      json(422, {}),
      json(201, {}),
      json(201, {}),
    ]);
    await orchestrator.startImport(1, [draft({ documents: docs })], []);
    const ext = 'chrome-extension://abcdefghijklmnop/';
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => ext + p.replace(/^\//, ''));
    registerHistoryHandlers();
    const listed = await dispatch({ type: 'history/list' }, { id: fakeBrowser.runtime.id, url: `${ext}popup.html` });
    const text = JSON.stringify(listed);
    expect(text).not.toContain('attachmentFallbacks');
    expect(text).not.toContain('MARQUEUR');
  });

  it('source sweep: no console. in src/ outside the logger; no network call in the new modules', () => {
    const all = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? all(p) : [p];
      });
    for (const f of all(resolve(__dirname, '../../src')).filter((p) => /\.(ts|vue)$/.test(p) && !p.endsWith('shared/logger.ts'))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/console\./);
    }
    for (const rel of ['src/shared/document-kinds.ts', 'src/ui/document-kind-keys.ts']) {
      const src = readFileSync(resolve(__dirname, '../..', rel), 'utf8');
      for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon']) expect(src, `${rel}: ${banned}`).not.toContain(banned);
    }
  });
});

describe('warranty privacy (011, Q-U20, principles I and II, GDPR)', () => {
  const MARKERS = ['2028-11-03', 'Détail secret de garantie', 'Boutique Exemple SARL'];
  const warranty = {
    origin: 'legal' as const,
    expires: '2028-11-03',
    lifetime: false,
    details: 'Détail secret de garantie',
    durationMonths: 24,
    edited: false,
  };
  const spyConsole = () =>
    (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));

  it('an import with a warranty: no date, detail or seller in the console, nothing in storage.local, requests only to the instance', async () => {
    fakeBrowser.reset();
    const spies = spyConsole();
    const m = mockFetch(json(201, { id: 'e1', name: 'x' }), json(500, { error: 'Détail secret de garantie 2028-11-03' }), json(500, {}));
    const orchestrator = createOrchestrator({
      client: createHomeBoxClient({ baseUrl: 'https://homebox.example.com', apiKey: KEY, fetchImpl: m.fetch }),
      store: pendingStore,
      downloadDetected: async () => ok({ base64: PDF_B64 }),
      fetchPhoto: async () => ok({ bytes: new Uint8Array(), mimeType: 'image/jpeg', filename: 'p.jpg' }),
      notify: () => undefined,
      newId: () => 'p1',
    });
    const r = await orchestrator.startImport(1, [draft({ warranty, purchaseFrom: 'Boutique Exemple SARL' })], []);
    expect(r.ok && r.value[0]?.status).toBe('partial');

    const output = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(output.length).toBeGreaterThan(2);
    for (const value of [...MARKERS, KEY]) expect(output).not.toContain(value);
    for (const call of m.calls) expect(call.url.startsWith('https://homebox.example.com/')).toBe(true);
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).not.toContain('2028-11-03');
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).not.toContain('Détail secret');
  });

  it('source sweep: no console outside the logger, no network in the warranty module, no warranty field in the history', () => {
    const src = resolve(__dirname, '../../src');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|vue)$/.test(name)) files.push(path);
      }
    };
    walk(src);
    for (const file of files) {
      if (file.endsWith('shared/logger.ts')) continue;
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\bconsole\./);
    }
    expect(readFileSync(join(src, 'shared/warranty.ts'), 'utf8')).not.toMatch(/\b(fetch\(|XMLHttpRequest|sendBeacon)/);
    for (const file of files.filter((f) => f.includes('/background/history/'))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/warrantyDetails|warrantyExpires|lifetimeWarranty|draft\.warranty|WarrantyDraft/);
    }
  });
});

describe('warranty setting privacy (011, Q-U20, R8)', () => {
  it('storage.local only gains warrantySettings { v, enabled, years }: no date, detail or purchase data', async () => {
    fakeBrowser.reset();
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));
    const { saveWarrantySettings } = await import('@/ui/warranty-settings');
    await saveWarrantySettings({ v: 1, enabled: false, years: 3 });
    const local = await fakeBrowser.storage.local.get(null);
    expect(Object.keys(local)).toEqual(['warrantySettings']);
    expect(local.warrantySettings).toEqual({ v: 1, enabled: false, years: 3 });
    expect(JSON.stringify(local)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(spies.flatMap((s) => s.mock.calls)).toEqual([]);
    // The history never receives the setting.
    expect(Object.keys(local).some((k) => k.startsWith('importHistory'))).toBe(false);
  });
});

describe('automatic lock privacy (013, Q-U12, FR-016, FR-018, FR-019)', () => {
  const root = resolve(__dirname, '../..');
  const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
  const FILES = [
    'src/background/config/auto-lock.ts',
    'src/background/config/config-store.ts',
    'src/shared/lock-policy.ts',
    'src/ui/options/LockCard.vue',
  ];

  it.each(FILES)('%s: no console, request or programmatic navigation', (file) => {
    const source = read(file);
    for (const forbidden of ['console.', 'fetch(', 'XMLHttpRequest', 'tabs.create', 'window.open']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('wxt.config.ts requests neither alarms, nor idle, nor tabs', () => {
    const config = read('wxt.config.ts');
    const permissions = config.slice(config.indexOf('permissions:'), config.indexOf(']', config.indexOf('permissions:')) + 1);
    expect(permissions).toContain("'storage'");
    for (const p of ['alarms', 'idle', "'tabs'"]) expect(permissions, p).not.toContain(p);
  });

  it('the activity timestamp is never used by the UI or the message contract', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|vue)$/.test(name) && readFileSync(path, 'utf8').includes('homeboxActivity')) offenders.push(path);
      }
    };
    walk(resolve(root, 'src/ui'));
    expect(offenders).toEqual([]);
    expect(read('src/shared/messages.ts')).not.toContain('homeboxActivity');
  });
});

describe('update privacy (013, U-9, Q-U12, FR-013, FR-016)', () => {
  const root = resolve(__dirname, '../..');
  const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
  const files = () => {
    const out = ['src/shared/version.ts', 'src/ui/components/UpdateBanner.vue'];
    for (const name of readdirSync(resolve(root, 'src/background/update'))) out.push(`src/background/update/${name}`);
    return out;
  };

  it('src/background/update/ exists with its store and handlers', () => {
    expect(files()).toEqual(expect.arrayContaining(['src/background/update/update-store.ts', 'src/background/update/handlers.ts']));
  });

  it('no request, update check, programmatic navigation or console in the added sources', () => {
    for (const file of files()) {
      const source = read(file);
      for (const forbidden of ['fetch(', 'XMLHttpRequest', 'requestUpdateCheck', 'tabs.create', 'window.open', 'console.']) {
        expect(source, `${file}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('the background entry point never asks the browser to check for updates', () => {
    expect(read('src/entrypoints/background.ts')).not.toContain('requestUpdateCheck');
  });
});

describe('automatic tags privacy documentation (014, Q-U12, FR-020)', () => {
  const doc = (path: string) =>
    readFileSync(resolve(__dirname, '../..', path), 'utf8').replace(/\s+/g, ' ');
  const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  it('PRIVACY.md: suggested tags, local rules (tagSettings, storage.local, never sync), creation only after confirmation, no new recipient', () => {
    const en = doc('PRIVACY.md');
    expect(en).toMatch(/suggested tags/i);
    expect(en).toContain('tagSettings');
    expect(en).toMatch(/rules/i);
    expect(en).toContain('`storage.local`');
    expect(en).toContain('/api/v1/tags');
    expect(en).toMatch(/tags? (are|is) created[^.]*only after your confirmation/i);
    expect(en).toMatch(/no new recipient/i);
    expect(en).toMatch(/never[^.]*import history|import history[^.]*never/i);
  });

  it('PRIVACY.fr.md: the same elements in French', () => {
    const fr = doc('PRIVACY.fr.md');
    expect(fr).toMatch(/tags proposés/i);
    expect(fr).toContain('tagSettings');
    expect(fr).toMatch(/règles/i);
    expect(fr).toContain('`storage.local`');
    expect(fr).toContain('/api/v1/tags');
    expect(fr).toMatch(/créés?[^.]*uniquement après votre confirmation/i);
    expect(fr).toMatch(/aucun nouveau destinataire/i);
  });

  it('both effective dates are identical and not earlier than 18 November 2026 (fixed floor)', () => {
    const en = doc('PRIVACY.md').match(/Effective date: \*\*(\d{1,2}) ([A-Z][a-z]+) (\d{4})\*\*/);
    const fr = doc('PRIVACY.fr.md').match(/Date d'effet : \*\*(\d{1,2}) ([a-zéû]+) (\d{4})\*\*/);
    expect(en).not.toBeNull();
    expect(fr).not.toBeNull();
    const enDate = Date.UTC(Number(en![3]), EN_MONTHS.indexOf(en![2]!), Number(en![1]));
    const frDate = Date.UTC(Number(fr![3]), FR_MONTHS.indexOf(fr![2]!), Number(fr![1]));
    expect(enDate).toBe(frDate);
    expect(enDate).toBeGreaterThanOrEqual(Date.UTC(2026, 10, 18));
  });
});

describe('duplicate check privacy (015, FR-018)', () => {
  const PRODUCT = 'Câble USB-C 2 m noir';
  const NUMBER = '999-0000000-0000001';
  const DUP_KEY = 'hb_xxxxxxxx';
  const FORBIDDEN = [
    PRODUCT, 'noir', 'usb', 'cable', 'Cable usb c noir 2m', 'Perceuse visseuse Bosch 18V', NUMBER, '/item/', DUP_KEY,
  ];
  const items = json(200, {
    items: [
      { id: 's1', name: 'Cable usb c noir 2m' },
      { id: 's2', name: 'Perceuse visseuse Bosch 18V' },
    ],
  });
  const client = (f: typeof fetch) =>
    createHomeBoxClient({ baseUrl: 'https://homebox.example.com', apiKey: DUP_KEY, fetchImpl: f });

  it.each([
    ['success', [items, items, items, items]],
    ['network failure', [networkError(), networkError(), networkError(), networkError()]],
    ['partial failure', [items, json(500, { error: `${PRODUCT} ${NUMBER}` }), items, items]],
  ] as const)('%s: no console output contains a name, a queried word, the order number, a link or the key', async (_l, responders) => {
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    try {
      await checkDuplicates(client(mockFetch(...responders).fetch), NUMBER, PRODUCT);
      const calls = spies.flatMap((s) => s.mock.calls);
      const output = JSON.stringify(calls).toLowerCase();
      for (const value of FORBIDDEN) expect(output).not.toContain(value.toLowerCase());
      for (const call of calls) {
        const meta = call[1] as { endpoint?: string } | undefined;
        if (meta?.endpoint !== undefined) expect(meta.endpoint).toBe('GET /entities?q');
      }
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

describe('instances privacy: migration and fallback view logs (016, Q-U7, FR-030, T032)', () => {
  const spyConsole = () =>
    (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));

  it('a failing migration (storage error, invalid homeboxConfig) only logs the constant config/migrate template', async () => {
    const { instanceStore } = await import('@/background/config/instance-store');
    const { seedLegacy, PASSPHRASE } = await import('./instances-fixture');
    fakeBrowser.reset();
    const spies = spyConsole();
    await seedLegacy();
    const set = vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('storage down'));
    expect(await instanceStore.migrate()).toBe('failed');
    expect((await instanceStore.read())?.instances[0]?.id).toBe('migrated');
    set.mockRestore();
    fakeBrowser.reset();
    await fakeBrowser.storage.local.set({ homeboxConfig: { baseUrl: 'https://homebox.example.com', encryptedKey: 'x', maskedKey: 'hb_••••xxxx' } });
    expect(await instanceStore.migrate()).toBe('failed');
    // Invalid stored instances: read() logs config/invalid only.
    await fakeBrowser.storage.local.set({ homeboxInstances: { v: 1, vault: null, instances: [{ id: 'migrated', name: 'Maison' }] } });
    expect(await instanceStore.read()).toBeNull();

    const calls = spies.flatMap((s) => s.mock.calls);
    expect(calls.length).toBeGreaterThan(0);
    for (const [, meta] of calls) expect(['config/migrate', 'config/invalid']).toContain((meta as { endpoint?: string }).endpoint);
    const output = JSON.stringify(calls);
    for (const v of ['https://homebox.example.com', 'homebox.example.com', 'hb_xxxxxxxx', '"migrated"', 'Maison', PASSPHRASE]) {
      expect(output).not.toContain(v);
    }
  });
});
