import { fakeBrowser } from 'wxt/testing/fake-browser';
import { dispatch, register } from '@/background/router';

const BASE = 'chrome-extension://abcdefghijklmnop/';

describe('router — provenance des messages', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((path: string) => BASE + path.replace(/^\//, ''));
    register('config/get', async () => ({ configured: false }));
  });

  const id = () => fakeBrowser.runtime.id;

  it('accepte le popup (sans onglet)', async () => {
    expect(await dispatch({ type: 'config/get' }, { id: id(), url: `${BASE}popup.html` })).toEqual({
      configured: false,
    });
  });

  it("accepte la page d'options ouverte dans un onglet", async () => {
    const sender = { id: id(), url: `${BASE}options.html`, tab: { id: 12 } };
    expect(await dispatch({ type: 'config/get' }, sender)).toEqual({ configured: false });
  });

  it('refuse un message config/* venant du script injecté sur amazon.fr', async () => {
    const sender = { id: id(), url: 'https://www.amazon.fr/your-orders/order-details', tab: { id: 12 } };
    expect(await dispatch({ type: 'config/get' }, sender)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
  });

  it('refuse un expéditeur sans URL', async () => {
    expect(await dispatch({ type: 'config/get' }, { id: id() })).toEqual({ ok: false, error: 'BAD_MESSAGE' });
  });

  it('refuse une autre extension', async () => {
    expect(await dispatch({ type: 'config/get' }, { id: 'autre', url: `${BASE}popup.html` })).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
  });

  it('refuse un message mal formé', async () => {
    expect(await dispatch({ type: 'config/save', baseUrl: 1 }, { id: id(), url: `${BASE}options.html` })).toEqual({
      ok: false,
      error: 'BAD_MESSAGE',
    });
  });

  describe('import/start : forme de drafts[].photo (T043)', () => {
    const sender = () => ({ id: id(), url: `${BASE}popup.html` });
    const start = (photo: unknown) => ({
      type: 'import/start',
      tabId: 1,
      manualFiles: [],
      drafts: [{ name: 'x', photo }],
    });

    beforeEach(() => register('import/start', async () => ({ ok: true, value: [] })));

    it.each([
      ['null', null],
      ['absente', undefined],
      ['bien formée', { url: 'https://m.media-amazon.com/images/I/x.jpg', merchantId: 'amazon.fr', include: true }],
    ])('accepte une photo %s', async (_label, photo) => {
      expect(await dispatch(start(photo), sender())).toEqual({ ok: true, value: [] });
    });

    it.each([
      ['url absente', { merchantId: 'amazon.fr', include: true }],
      ['url non textuelle', { url: 3, merchantId: 'amazon.fr', include: true }],
      ['merchantId absent', { url: 'https://x', include: true }],
      ['include non booléen', { url: 'https://x', merchantId: 'amazon.fr', include: 'oui' }],
      ['chaîne au lieu d’un objet', 'https://x'],
    ])('refuse une photo mal formée : %s', async (_label, photo) => {
      expect(await dispatch(start(photo), sender())).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    });

    it('refuse un brouillon qui n’est pas un objet', async () => {
      expect(await dispatch({ type: 'import/start', tabId: 1, manualFiles: [], drafts: [42] }, sender())).toEqual({
        ok: false,
        error: 'BAD_MESSAGE',
      });
    });
  });
  describe('emplacements (US2)', () => {
    const sender = () => ({ id: id(), url: `${BASE}popup.html` });
    const web = () => ({ id: id(), url: 'https://www.amazon.fr/your-orders/order-details', tab: { id: 12 } });
    const good = { id: 'l1', path: ['Maison', 'Garage'] };

    beforeEach(() => {
      register('location/list', async () => ({ ok: true, value: { locations: [], lastUsedId: null } }));
      register('import/start', async () => ({ ok: true, value: [] }));
      register('import/retry', async () => ({ ok: true, value: {} as never }));
    });

    it('location/list depuis le popup : accepté', async () => {
      expect(await dispatch({ type: 'location/list' }, sender())).toEqual({
        ok: true,
        value: { locations: [], lastUsedId: null },
      });
    });

    it('location/list depuis un script injecté : BAD_MESSAGE (scénario 25, principe I)', async () => {
      expect(await dispatch({ type: 'location/list' }, web())).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    });

    const start = (extra: Record<string, unknown>) => ({ type: 'import/start', tabId: 1, manualFiles: [], drafts: [], ...extra });

    it.each([undefined, null, 'loc-1'])('import/start accepte orderLocationId = %s', async (orderLocationId) => {
      expect(await dispatch(start({ orderLocationId }), sender())).toEqual({ ok: true, value: [] });
    });

    it.each([3, {}, ['x'], true])('import/start refuse orderLocationId = %j', async (orderLocationId) => {
      expect(await dispatch(start({ orderLocationId }), sender())).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    });

    it('import/start refuse un drafts[].location mal formé et accepte un choix bien formé ou null', async () => {
      const withLoc = (location: unknown) => start({ drafts: [{ name: 'x', location }] });
      expect(await dispatch(withLoc(good), sender())).toEqual({ ok: true, value: [] });
      expect(await dispatch(withLoc(null), sender())).toEqual({ ok: true, value: [] });
      for (const bad of ['l1', { id: 3, path: [] }, { id: 'l1' }, { id: 'l1', path: 'Maison' }, { id: 'l1', path: [1] }]) {
        expect(await dispatch(withLoc(bad), sender()), JSON.stringify(bad)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
      }
    });

    const retry = (extra: Record<string, unknown>) => ({ type: 'import/retry', pendingId: 'p1', ...extra });

    it.each([undefined, null, good])('import/retry accepte location = %j', async (location) => {
      expect(await dispatch(retry({ location }), sender())).toMatchObject({ ok: true });
    });

    it.each(['l1', 3, {}, { id: 3, path: [] }, { id: 'l1', path: 'Maison' }])(
      'import/retry refuse location = %j',
      async (location) => {
        expect(await dispatch(retry({ location }), sender())).toEqual({ ok: false, error: 'BAD_MESSAGE' });
      },
    );
  });
});
