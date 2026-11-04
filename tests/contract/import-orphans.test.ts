import { fakeBrowser } from 'wxt/testing/fake-browser';
import { activeImports, registerImportHandlers } from '@/background/import/handlers';
import { pendingStore } from '@/background/import/pending-store';
import { dispatch } from '@/background/router';
import type { PendingImport } from '@/shared/types';
import { draft } from './orchestrator-harness';

const EXT = 'chrome-extension://abcdefghijklmnop/';
const call = (msg: unknown) => dispatch(msg, { id: fakeBrowser.runtime.id, url: `${EXT}popup.html` });

const running = (id: string, entityId: string | null): PendingImport => ({
  id,
  tabId: 5,
  pageUrl: null,
  draft: draft(),
  entityId,
  steps: { create: entityId ? 'done' : 'pending', update: 'pending', attachments: { 'detected-0': 'pending' }, photo: 'unavailable' },
  photoError: null,
  photoAttempted: false,
  status: 'running',
  error: null,
});

describe('imports orphelins après arrêt du service worker (R8)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p: string) => EXT + p.replace(/^\//, ''));
    activeImports.clear();
    registerImportHandlers();
  });

  it('running absent des imports actifs et sans entityId → failed, réessayable', async () => {
    await pendingStore.save(running('a', null));
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'a', status: 'failed', entityId: null });
    // Persisté : une seconde lecture donne le même état.
    expect((await pendingStore.get('a'))?.status).toBe('failed');
  });

  it('running absent des imports actifs mais avec entityId → partial, réessayable', async () => {
    await pendingStore.save(running('b', 'e1'));
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'b', status: 'partial', entityId: 'e1' });
    expect((await pendingStore.get('b'))?.status).toBe('partial');
  });

  it('running présent dans les imports actifs → reste running', async () => {
    await pendingStore.save(running('c', 'e1'));
    activeImports.add('c');
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'c', status: 'running' });
    expect((await pendingStore.get('c'))?.status).toBe('running');
  });

  it('un import déjà terminé n’est pas modifié', async () => {
    await pendingStore.save({ ...running('d', 'e1'), status: 'partial', error: 'ATTACHMENT_FAILED' });
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ status: 'partial', error: 'ATTACHMENT_FAILED' });
  });

  it('running dont le POST de création a démarré (createAttempted) → failed, orphaned et createUncertain', async () => {
    await pendingStore.save({ ...running('f', null), createAttempted: true });
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'f', status: 'failed', orphaned: true, createUncertain: true });
    expect((await pendingStore.get('f'))?.createUncertain).toBe(true);
  });

  it('running dont le POST n’a pas démarré (lot, import suivant) → failed, orphaned, pas incertain', async () => {
    await pendingStore.save(running('g', null));
    const list = (await call({ type: 'import/pending', tabId: 5 })) as PendingImport[];
    expect(list[0]).toMatchObject({ id: 'g', status: 'failed', orphaned: true });
    expect(list[0]?.createUncertain).toBeFalsy();
  });
});
