import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { registerLocationHandlers } from '@/background/location/handlers';
import { dispatch } from '@/background/router';
import { fail, ok } from '@/shared/errors';

const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = () => dispatch({ type: 'location/list' }, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const TREE = [
  { id: 'm', name: 'Maison', type: 'location', children: [{ id: 'g', name: 'Garage', type: 'location', children: [] }] },
  { id: 'a', name: 'Atelier', type: 'location', children: [] },
];
const ORIGIN = 'https://homebox.example.com';

/** fetch simulé : enregistre chaque requête et répond toujours avec `respond`. */
function stubFetch(respond: () => Response | Promise<Response>) {
  const requests: { method: string; url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      requests.push({ method: init.method ?? 'GET', url: String(input) });
      return respond();
    }),
  );
  return requests;
}

describe('handler location/list (lecture seule)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(ok({ baseUrl: ORIGIN, apiKey: 'hb_test_key_0000' }));
    registerLocationHandlers();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renvoie les emplacements aplatis et triés, lastUsedId = null à ce stade', async () => {
    const requests = stubFetch(() => reply(200, TREE));
    expect(await call()).toEqual({
      ok: true,
      value: {
        locations: [
          { id: 'a', name: 'Atelier', path: ['Atelier'] },
          { id: 'm', name: 'Maison', path: ['Maison'] },
          { id: 'g', name: 'Garage', path: ['Maison', 'Garage'] },
        ],
        lastUsedId: null,
      },
    });
    expect(requests).toEqual([{ method: 'GET', url: `${ORIGIN}/api/v1/entities/tree` }]);
  });

  it('liste vide = ok (pas une erreur)', async () => {
    stubFetch(() => reply(200, []));
    expect(await call()).toEqual({ ok: true, value: { locations: [], lastUsedId: null } });
  });

  it.each(['LOCKED', 'NOT_CONFIGURED'] as const)('%s : erreur renvoyée sans aucune requête', async (code) => {
    vi.mocked(configStore.getCredentials).mockResolvedValue(fail(code));
    const requests = stubFetch(() => reply(200, TREE));
    expect(await call()).toEqual({ ok: false, error: code });
    expect(requests).toEqual([]);
  });

  it.each([401, 403])('%i → UNAUTHORIZED', async (status) => {
    stubFetch(() => reply(status, {}));
    expect(await call()).toMatchObject({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('instance injoignable → HOMEBOX_UNREACHABLE', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await call()).toMatchObject({ ok: false, error: 'HOMEBOX_UNREACHABLE' });
  });

  it.each([
    ['statut 500', () => reply(500, {})],
    ['réponse non tableau', () => reply(200, { items: [] })],
    ['JSON illisible', () => new Response('<html>', { status: 200 })],
  ])('%s → LOCATIONS_UNAVAILABLE', async (_label, respond) => {
    stubFetch(respond);
    expect(await call()).toMatchObject({ ok: false, error: 'LOCATIONS_UNAVAILABLE' });
  });

  it('lecture seule : aucun POST, PUT ni DELETE (FR-022)', async () => {
    const requests = stubFetch(() => reply(200, TREE));
    await call();
    await fakeBrowser.storage.local.set({ lastLocationByInstance: { [ORIGIN]: 'g' } });
    await call();
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
  });

  describe('dernier emplacement utilisé (US3)', () => {
    it('lastUsedId = identifiant mémorisé pour cette instance quand il est dans l’arbre', async () => {
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { [ORIGIN]: 'g' } });
      stubFetch(() => reply(200, TREE));
      expect(await call()).toMatchObject({ ok: true, value: { lastUsedId: 'g' } });
    });

    it('identifiant obsolète → null, sans erreur, et l’entrée est retirée', async () => {
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { [ORIGIN]: 'disparu', 'https://autre.example.com': 'g' } });
      stubFetch(() => reply(200, TREE));
      expect(await call()).toMatchObject({ ok: true, value: { lastUsedId: null } });
      expect((await fakeBrowser.storage.local.get('lastLocationByInstance')).lastLocationByInstance).toEqual({
        'https://autre.example.com': 'g',
      });
    });

    it('mémoire d’une autre instance → null', async () => {
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { 'https://autre.example.com': 'g' } });
      stubFetch(() => reply(200, TREE));
      expect(await call()).toMatchObject({ ok: true, value: { lastUsedId: null } });
    });

    it('liste indisponible : la mémoire n’est pas touchée', async () => {
      await fakeBrowser.storage.local.set({ lastLocationByInstance: { [ORIGIN]: 'g' } });
      stubFetch(() => reply(500, {}));
      expect(await call()).toMatchObject({ ok: false, error: 'LOCATIONS_UNAVAILABLE' });
      expect((await fakeBrowser.storage.local.get('lastLocationByInstance')).lastLocationByInstance).toEqual({
        [ORIGIN]: 'g',
      });
    });
  });
});
