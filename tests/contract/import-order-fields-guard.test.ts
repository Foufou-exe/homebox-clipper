import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { activeImports, registerImportHandlers } from '@/background/import/handlers';
import { orderFieldSettings } from '@/background/order-fields/settings';
import { pendingStore } from '@/background/import/pending-store';
import { dispatch } from '@/background/router';
import { ok } from '@/shared/errors';
import { draft } from './orchestrator-harness';

/** Review T098: defense in depth, `orderFields` refused when the option is off for the target instance. */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = (msg: unknown) => dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ORDER = [{ role: 'orderNumber' as const, name: 'Order number', value: '123-456' }];
const NAMES = { orderNumber: 'Order number', merchant: 'Merchant', orderUrl: 'Order URL' };
const start = (orderFields?: typeof ORDER) =>
  call({
    type: 'import/start',
    instanceId: 'inst-a',
    tabId: 5,
    manualFiles: [],
    drafts: [draft({ name: 'A', documents: [], ...(orderFields ? { orderNumber: '123-456', orderFields } : {}) })],
  });

describe('import/start: orderFields vs the instance setting', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(
      ok({ id: 'inst-a', baseUrl: 'https://homebox.example.com', apiKey: 'hb_xxxxxxxx' }),
    );
    fetchMock = vi.fn(async () => reply(200, { id: 'e1', name: 'x' }));
    vi.stubGlobal('fetch', fetchMock);
    activeImports.clear();
    registerImportHandlers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('option off: BAD_MESSAGE, no request, nothing persisted', async () => {
    expect(await start(ORDER)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await pendingStore.listByTab(5)).toEqual([]);
  });

  it('option on: accepted (requests are made)', async () => {
    await orderFieldSettings.set('inst-a', { enabled: true, names: NAMES });
    await start(ORDER);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('orderFields absent, option off: unchanged (requests are made)', async () => {
    await start();
    expect(fetchMock).toHaveBeenCalled();
  });
});
