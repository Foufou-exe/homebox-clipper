import { fakeBrowser } from 'wxt/testing/fake-browser';
import { registerConfigHandlers } from '@/background/config/handlers';
import { dispatch } from '@/background/router';
import { json, mockFetch } from './fetch-mock';

const EXT = 'chrome-extension://abcdefghijklmnop/';
const URL_A = 'https://homebox.example.com';
const KEY = 'hb_secret_api_key_a1b2';
const PASS = 'une phrase de passe solide';

const call = (msg: unknown) => dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}options.html` });
const homeboxOk = () => mockFetch(json(200, { health: true, build: { version: 'v0.27.0' } }), json(200, {}));

describe('handlers de configuration (phrase de passe)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
    registerConfigHandlers();
  });

  it('refuse une phrase de passe trop courte', async () => {
    expect(await call({ type: 'config/save', baseUrl: URL_A, apiKey: KEY, passphrase: 'court' })).toEqual({
      ok: false,
      error: 'WEAK_PASSPHRASE',
    });
  });

  it('enregistre une clé chiffrée puis permet verrouillage et déverrouillage', async () => {
    vi.stubGlobal('fetch', homeboxOk().fetch);
    const saved = await call({ type: 'config/save', baseUrl: URL_A, apiKey: KEY, passphrase: PASS });
    expect(saved).toMatchObject({ ok: true, value: { configured: true, locked: false } });
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).not.toContain(KEY);

    expect(await call({ type: 'session/lock' })).toMatchObject({ locked: true });
    expect(await call({ type: 'config/test' })).toEqual({ ok: false, error: 'LOCKED' });
    expect(await call({ type: 'session/unlock', passphrase: 'mauvaise phrase' })).toEqual({
      ok: false,
      error: 'WRONG_PASSPHRASE',
    });
    expect(await call({ type: 'session/unlock', passphrase: PASS })).toMatchObject({ ok: true, value: { locked: false } });
  }, 20_000);

  it("changer d'URL en conservant la clé exige la bonne phrase de passe", async () => {
    vi.stubGlobal('fetch', homeboxOk().fetch);
    await call({ type: 'config/save', baseUrl: URL_A, apiKey: KEY, passphrase: PASS });

    const wrong = await call({ type: 'config/save', baseUrl: 'https://autre.example.com', apiKey: '', passphrase: 'mauvaise phrase' });
    expect(wrong).toEqual({ ok: false, error: 'WRONG_PASSPHRASE' });

    const m = homeboxOk();
    vi.stubGlobal('fetch', m.fetch);
    const moved = await call({ type: 'config/save', baseUrl: 'https://autre.example.com', apiKey: '', passphrase: PASS });
    expect(moved).toMatchObject({ ok: true, value: { baseUrl: 'https://autre.example.com' } });
    expect(m.calls[1]?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
  }, 30_000);
});
