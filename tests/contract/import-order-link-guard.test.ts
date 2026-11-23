import { fakeBrowser } from 'wxt/testing/fake-browser';
import { configStore } from '@/background/config/config-store';
import { activeImports, registerImportHandlers } from '@/background/import/handlers';
import { pendingStore } from '@/background/import/pending-store';
import { orderLinkSettings } from '@/background/order-link/settings';
import { dispatch } from '@/background/router';
import { ok } from '@/shared/errors';
import { draft } from './orchestrator-harness';

/** Spec 025 (FR-005, contracts/runtime-messages.md §2): `orderLink` refused when the option is off for the target. */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = (msg: unknown) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const start = (orderLink: boolean) =>
  call({
    type: 'import/start',
    instanceId: 'inst-a',
    tabId: 5,
    manualFiles: [],
    drafts: [
      draft({ name: 'A', documents: [], ...(orderLink ? { orderLink: true as const } : {}) }),
    ],
  });

describe('import/start: orderLink vs the instance setting (spec 025)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let urls: string[];
  beforeEach(() => {
    fakeBrowser.reset();
    urls = [];
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
      (p: string) => EXT + p.replace(/^\//, ''),
    );
    vi.spyOn(configStore, 'getCredentials').mockResolvedValue(
      ok({ id: 'inst-a', baseUrl: 'https://homebox.example.com', apiKey: 'hb_xxxxxxxx' }),
    );
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return reply(200, { id: 'e1', name: 'x' });
    });
    vi.stubGlobal('fetch', fetchMock);
    activeImports.clear();
    registerImportHandlers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('G1: option off: BAD_MESSAGE, no request, nothing persisted', async () => {
    expect(await start(true)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await pendingStore.listByTab(5)).toEqual([]);
  });

  it('G2: option on: accepted, exactly one external link request, to the instance only', async () => {
    await orderLinkSettings.set('inst-a', { enabled: true });
    await start(true);
    const links = urls.filter((u) => u.endsWith('/attachments/external'));
    expect(links).toEqual(['https://homebox.example.com/api/v1/entities/e1/attachments/external']);
    expect(urls.every((u) => u.startsWith('https://homebox.example.com/'))).toBe(true);
  });

  it('G3: no orderLink, option on: no external link request (sequence unchanged)', async () => {
    await orderLinkSettings.set('inst-a', { enabled: true });
    await start(false);
    expect(urls.some((u) => u.includes('/attachments/external'))).toBe(false);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('G4: no orderLink, option off: unchanged (requests are made, none for a link)', async () => {
    await start(false);
    expect(fetchMock).toHaveBeenCalled();
    expect(urls.some((u) => u.includes('/attachments/external'))).toBe(false);
  });

  it('G5: the option of another instance does not enable this one', async () => {
    await orderLinkSettings.set('inst-b', { enabled: true });
    expect(await start(true)).toEqual({ ok: false, error: 'BAD_MESSAGE' });
  });
});
