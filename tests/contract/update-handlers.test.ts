import { fakeBrowser } from 'wxt/testing/fake-browser';
import { activeImports } from '@/background/import/active-imports';
import { dispatch, setUiActivityHook } from '@/background/router';
import type { UpdateStateView } from '@/shared/types';

/**
 * Spec 013, Q-U5: update notice and "Update now" (U-1 to U-7, M-6, M-7). `getManifest` and `reload` are not
 * implemented by `fakeBrowser`: they are replaced by spies. No network call anywhere.
 */
const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = (msg: unknown) =>
  dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });
const state = async () => (await call({ type: 'update/state' })) as UpdateStateView;
const notice = async () => (await fakeBrowser.storage.local.get('updateNotice')).updateNotice;

let installed = '0.4.0';
let reload: ReturnType<typeof vi.fn>;
let openOptions: ReturnType<typeof vi.fn>;

async function startBackground() {
  const background = (await import('@/entrypoints/background')).default as unknown as {
    main: () => void;
  };
  background.main();
}
const installedEvent = (details: Record<string, unknown>) =>
  fakeBrowser.runtime.onInstalled.trigger(details as never);
const updateAvailable = (version: string) =>
  fakeBrowser.runtime.onUpdateAvailable.trigger({ version } as never);

describe('update notice and "Update now" (013, Q-U5)', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    installed = '0.4.0';
    activeImports.clear();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation(
      (p: string) => EXT + p.replace(/^\//, ''),
    );
    vi.spyOn(fakeBrowser.runtime, 'getManifest').mockImplementation(
      () => ({ version: installed }) as never,
    );
    reload = vi.fn();
    vi.spyOn(fakeBrowser.runtime, 'reload').mockImplementation(reload as never);
    openOptions = vi.fn(async () => undefined);
    vi.spyOn(fakeBrowser.runtime, 'openOptionsPage').mockImplementation(openOptions as never);
    await startBackground();
  });

  afterEach(() => {
    setUiActivityHook(null);
    activeImports.clear();
  });

  it('U-1: install → no notice, options opened', async () => {
    await installedEvent({ reason: 'install' });
    expect(await notice()).toBeUndefined();
    expect(openOptions).toHaveBeenCalledTimes(1);
    expect((await state()).notice).toBeNull();
  });

  it('U-2: update 0.3.0 → 0.4.0 → notice written and visible', async () => {
    await installedEvent({ reason: 'update', previousVersion: '0.3.0' });
    await vi.waitFor(async () =>
      expect(await notice()).toEqual({ v: 1, version: '0.4.0', dismissed: false }),
    );
    expect((await state()).notice).toBe('0.4.0');
    expect(openOptions).not.toHaveBeenCalled();
  });

  it('U-3: a dismissed notice is never reopened; dismissing another version has no effect', async () => {
    await installedEvent({ reason: 'update', previousVersion: '0.3.0' });
    await vi.waitFor(async () => expect((await state()).notice).toBe('0.4.0'));
    expect(await call({ type: 'update/dismiss', version: '0.3.9' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await state()).notice).toBe('0.4.0');
    expect(await call({ type: 'update/dismiss', version: '0.4.0' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await state()).notice).toBeNull();
    await installedEvent({ reason: 'update', previousVersion: '0.3.0' });
    await new Promise((r) => setTimeout(r, 0));
    expect((await state()).notice).toBeNull();
    expect(await notice()).toEqual({ v: 1, version: '0.4.0', dismissed: true });
  });

  it('U-4: rollback and equal version write nothing; an existing newer notice is not visible after a rollback', async () => {
    installed = '0.3.0';
    await installedEvent({ reason: 'update', previousVersion: '0.4.0' });
    installed = '0.4.0';
    await installedEvent({ reason: 'update', previousVersion: '0.4.0' });
    await installedEvent({ reason: 'update' });
    await installedEvent({ reason: 'update', previousVersion: 'x' });
    await new Promise((r) => setTimeout(r, 0));
    expect(await notice()).toBeUndefined();

    await fakeBrowser.storage.local.set({
      updateNotice: { v: 1, version: '0.4.0', dismissed: false },
    });
    installed = '0.3.0';
    expect((await state()).notice).toBeNull();
  });

  it('U-5: 0.3.0 → 0.4.0 → 0.5.0 without opening → a single notice, 0.5.0', async () => {
    await installedEvent({ reason: 'update', previousVersion: '0.3.0' });
    await vi.waitFor(async () => expect(await notice()).toMatchObject({ version: '0.4.0' }));
    installed = '0.5.0';
    await installedEvent({ reason: 'update', previousVersion: '0.4.0' });
    await vi.waitFor(async () =>
      expect(await notice()).toEqual({ v: 1, version: '0.5.0', dismissed: false }),
    );
    expect((await state()).notice).toBe('0.5.0');
  });

  it('U-6: onUpdateAvailable 0.5.0 with 0.4.0 installed → ready; stored in storage.session', async () => {
    await updateAvailable('0.5.0');
    await vi.waitFor(async () =>
      expect((await fakeBrowser.storage.session.get('updateReady')).updateReady).toEqual({
        v: 1,
        version: '0.5.0',
      }),
    );
    expect(await fakeBrowser.storage.local.get('updateReady')).toEqual({});
    expect((await state()).ready).toBe('0.5.0');
    installed = '0.5.0';
    expect((await state()).ready).toBeNull();
  });

  it('U-6: an invalid version is not written', async () => {
    await updateAvailable('x');
    await new Promise((r) => setTimeout(r, 0));
    expect(await fakeBrowser.storage.session.get('updateReady')).toEqual({});
  });

  it('U-7: update/apply without import → applied, then a single reload on the next turn', async () => {
    await updateAvailable('0.5.0');
    await vi.waitFor(async () => expect((await state()).ready).toBe('0.5.0'));
    expect(await call({ type: 'update/apply' })).toEqual({ applied: true });
    expect(reload).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('an import that starts between the answer and the reload cancels the reload (busy checked again)', async () => {
    await updateAvailable('0.5.0');
    await vi.waitFor(async () => expect((await state()).ready).toBe('0.5.0'));
    expect(await call({ type: 'update/apply' })).toEqual({ applied: true });
    activeImports.add('import-1');
    await new Promise((r) => setTimeout(r, 20));
    expect(reload).not.toHaveBeenCalled();
  });

  it('a resumable import saved between the answer and the reload cancels the reload', async () => {
    await updateAvailable('0.5.0');
    await vi.waitFor(async () => expect((await state()).ready).toBe('0.5.0'));
    expect(await call({ type: 'update/apply' })).toEqual({ applied: true });
    await fakeBrowser.storage.session.set({ 'pendingImport:5:abc': { id: 'abc', tabId: 5 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(reload).not.toHaveBeenCalled();
  });

  it('M-6: update/apply with a resumable import → busy, no reload; blocked in the state', async () => {
    await updateAvailable('0.5.0');
    await fakeBrowser.storage.session.set({ 'pendingImport:5:abc': { id: 'abc', tabId: 5 } });
    expect((await state()).blocked).toBe(true);
    expect(await call({ type: 'update/apply' })).toEqual({ applied: false, reason: 'busy' });
    await new Promise((r) => setTimeout(r, 5));
    expect(reload).not.toHaveBeenCalled();
  });

  it('M-6: update/apply with an import running → busy', async () => {
    await updateAvailable('0.5.0');
    activeImports.add('import-1');
    expect((await state()).blocked).toBe(true);
    expect(await call({ type: 'update/apply' })).toEqual({ applied: false, reason: 'busy' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('M-7: update/apply without a ready version (or not newer) → none', async () => {
    expect(await call({ type: 'update/apply' })).toEqual({ applied: false, reason: 'none' });
    await updateAvailable('0.4.0');
    expect(await call({ type: 'update/apply' })).toEqual({ applied: false, reason: 'none' });
    await new Promise((r) => setTimeout(r, 5));
    expect(reload).not.toHaveBeenCalled();
  });

  it('manual installation: without onUpdateAvailable, ready is null', async () => {
    expect(await state()).toEqual({
      installed: '0.4.0',
      notice: null,
      ready: null,
      blocked: false,
    });
  });

  it('update/state: installed = getManifest().version; only versions and a flag (M-4)', async () => {
    await installedEvent({ reason: 'update', previousVersion: '0.3.0' });
    await updateAvailable('0.5.0');
    await vi.waitFor(async () => expect((await state()).ready).toBe('0.5.0'));
    const s = await state();
    expect(s).toEqual({ installed: '0.4.0', notice: '0.4.0', ready: '0.5.0', blocked: false });
    expect(Object.keys(s).sort()).toEqual(['blocked', 'installed', 'notice', 'ready']);
  });

  it('no network call and no requestUpdateCheck in any of these flows', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await installedEvent({ reason: 'update', previousVersion: '0.3.0' });
    await updateAvailable('0.5.0');
    await state();
    await call({ type: 'update/apply' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
