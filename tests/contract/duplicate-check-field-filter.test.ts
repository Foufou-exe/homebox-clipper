import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { registerImportHandlers } from '@/background/import/handlers';
import { orderFieldSettings } from '@/background/order-fields/settings';
import { dispatch } from '@/background/router';
import { ok } from '@/shared/errors';
import { DEFAULT_ORDER_FIELD_NAMES } from '@/shared/order-fields';
import { log, logError } from '@/shared/logger';

vi.mock('@/shared/logger', () => ({ log: vi.fn(), logError: vi.fn() }));

const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = (msg: unknown) => dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ORIGIN_A = 'https://homebox.example.com';
const ORIGIN_B = 'https://inventaire.example.org';
const KEY = 'hb_xxxxxxxx';
const NUMBER = '999-0000000-0000001';
const NAME = 'Clavier sans fil Exemple Pro';
const msg = (instanceId: string) => ({ type: 'duplicate/check', instanceId, orderNumber: NUMBER, name: NAME });

interface Recorded {
  url: string;
  auth: string | null;
}

/** Fetch mock: the `fields` filter returns `filtered`; reads return `fields`; everything else is empty. */
function stubFetch(fieldName: string, calls: Recorded[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, auth: new Headers(init.headers).get('Authorization') });
      const u = new URL(url);
      if (u.searchParams.has('fields')) {
        return reply(200, { items: [{ id: 'e1', name: NAME, description: 'secret detail', notes: 'secret notes' }] });
      }
      if (u.pathname === '/api/v1/entities/e1') {
        return reply(200, { id: 'e1', name: NAME, fields: [{ name: fieldName, type: 'text', textValue: NUMBER }] });
      }
      return reply(200, { items: [] });
    }),
  );
}

describe('duplicate/check handler with the order-number field filter (spec 020)', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    vi.mocked(log).mockClear();
    vi.mocked(logError).mockClear();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(configStore, 'getCredentials').mockImplementation(async (id: string) =>
      id === 'inst-b'
        ? ok({ id: 'inst-b', baseUrl: ORIGIN_B, apiKey: 'hb_bbbbbbbb' })
        : ok({ id: 'inst-a', baseUrl: ORIGIN_A, apiKey: KEY }),
    );
    registerImportHandlers();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('H1: option off by default: no `fields` request, no read of an entity', async () => {
    const calls: Recorded[] = [];
    stubFetch(DEFAULT_ORDER_FIELD_NAMES.orderNumber, calls);
    await call(msg('inst-a'));
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(new URL(c.url).searchParams.has('fields')).toBe(false);
      expect(new URL(c.url).pathname).toBe('/api/v1/entities');
    }
  });

  it('H2: option on, default name: one `fields` request to the instance with the key; reply holds id, name, url only', async () => {
    await orderFieldSettings.set('inst-a', { enabled: true, names: { ...DEFAULT_ORDER_FIELD_NAMES } });
    const calls: Recorded[] = [];
    stubFetch(DEFAULT_ORDER_FIELD_NAMES.orderNumber, calls);
    const res = await call(msg('inst-a'));
    const filtered = calls.filter((c) => new URL(c.url).searchParams.has('fields'));
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.url.startsWith(`${ORIGIN_A}/api/v1/entities?`)).toBe(true);
    expect(new URL(filtered[0]!.url).searchParams.get('fields')).toBe(`${DEFAULT_ORDER_FIELD_NAMES.orderNumber}=${NUMBER}`);
    for (const c of calls) {
      expect(c.url.startsWith(`${ORIGIN_A}/api/v1/`)).toBe(true);
      expect(c.auth).toBe(`Bearer ${KEY}`);
    }
    expect(res).toEqual({
      ok: true,
      value: {
        matches: [{ id: 'e1', name: NAME, url: `${ORIGIN_A}/item/e1` }],
        similar: [],
        moreSimilar: false,
        incomplete: false,
      },
    });
    expect(JSON.stringify(res)).not.toContain('secret');
  });

  it('H3: option on for A, off for B, target B: no `fields` request, nothing sent to A', async () => {
    await orderFieldSettings.set('inst-a', { enabled: true, names: { ...DEFAULT_ORDER_FIELD_NAMES } });
    const calls: Recorded[] = [];
    stubFetch(DEFAULT_ORDER_FIELD_NAMES.orderNumber, calls);
    await call(msg('inst-b'));
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.url.startsWith(`${ORIGIN_B}/api/v1/`)).toBe(true);
      expect(new URL(c.url).searchParams.has('fields')).toBe(false);
    }
  });

  it('H4: configured field name is used by the filter', async () => {
    await orderFieldSettings.set('inst-a', {
      enabled: true,
      names: { ...DEFAULT_ORDER_FIELD_NAMES, orderNumber: 'N° commande' },
    });
    const calls: Recorded[] = [];
    stubFetch('N° commande', calls);
    const res = await call(msg('inst-a'));
    const filtered = calls.find((c) => new URL(c.url).searchParams.has('fields'));
    expect(new URL(filtered!.url).searchParams.get('fields')).toBe(`N° commande=${NUMBER}`);
    expect(res).toMatchObject({ ok: true, value: { matches: [{ id: 'e1' }] } });
  });

  it('H5: nothing logged contains the field name or the order number', async () => {
    await orderFieldSettings.set('inst-a', {
      enabled: true,
      names: { ...DEFAULT_ORDER_FIELD_NAMES, orderNumber: 'N° commande' },
    });
    stubFetch('N° commande', []);
    await call(msg('inst-a'));
    const output = JSON.stringify([...vi.mocked(log).mock.calls, ...vi.mocked(logError).mock.calls]);
    expect(output).not.toContain('N° commande');
    expect(output).not.toContain(NUMBER);
  });
});
