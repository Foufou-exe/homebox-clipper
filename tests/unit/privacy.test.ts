import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createHomeBoxClient } from '@/background/homebox/client';
import { createOrchestrator } from '@/background/import/orchestrator';
import { pendingStore } from '@/background/import/pending-store';
import { ok } from '@/shared/errors';
import { PDF_B64, draft, draftPhoto } from '../contract/orchestrator-harness';
import { fetchPhoto } from '@/background/import/photo-fetch';
import { json, mockFetch } from '../contract/fetch-mock';

const KEY = 'hb_super_secret_key_9876';
const SENSITIVE = [KEY, 'Clavier sans fil Exemple Pro', '999-0000000-0000001', '99.99', '99,99'];

describe('confidentialité des journaux (SC-004, principe I)', () => {
  it("aucune sortie console ne contient la clé ni les données d'achat", async () => {
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
    expect(output.length).toBeGreaterThan(2); // le logger a bien été appelé
    for (const value of SENSITIVE) expect(output).not.toContain(value);
  });

  it("l'en-tête Authorization n'est envoyé qu'à l'instance HomeBox", async () => {
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

/** Parcours complet avec le vrai `fetchPhoto` : un seul `fetch` simulé sert HomeBox et l'image. */
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

describe('confidentialité de la photo (FR-022 à FR-027)', () => {
  const spyConsole = () =>
    (['log', 'debug', 'info', 'warn', 'error'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => undefined));

  it("scénario 24 : ni clé, ni URL d'image dans les journaux, échecs compris", async () => {
    fakeBrowser.reset();
    const spies = spyConsole();
    // réussite, puis échec de récupération (404), puis échec d'envoi (HomeBox 500)
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

  it("scénario 23 : la requête d'image n'a ni Authorization ni cookies ; la clé ne va qu'à HomeBox", async () => {
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

  it("scénario 11 : aucun octet d'image en storage après réussite, échec d'envoi et abandon ; l'URL est purgée", async () => {
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
    expect(stored).toContain('test-secret-photo'); // l'URL sert à la reprise
    expect(stored).not.toContain(bytes);
    expect(stored).not.toContain('"bytes"');

    await failed.orchestrator.abandonImport(r.ok ? r.value[0]!.id : '');
    stored = await dump();
    expect(stored).not.toContain('test-secret-photo');
    expect(stored).not.toContain(bytes);
  });
});
