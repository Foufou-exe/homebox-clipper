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
});
