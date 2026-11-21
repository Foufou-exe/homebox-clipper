import { fakeBrowser } from 'wxt/testing/fake-browser';
import { defaultTemplate } from '@/background/templates/default-template';

/** Default template per instance (spec 018, Q-U1, contracts/storage.md §2). Fictitious values only. */
const A = 'inst-a';
const B = 'inst-b';
const KEY = 'defaultTemplateByInstance';
const raw = async () => (await fakeBrowser.storage.local.get(KEY))[KEY];

describe('defaultTemplate (storage.local, defaultTemplateByInstance)', () => {
  beforeEach(() => fakeBrowser.reset());

  it('nothing remembered → null', async () => {
    expect(await defaultTemplate.get(A)).toBeNull();
  });

  it('set: { [instanceId]: { id, name } } in storage.local only; other instances kept', async () => {
    await defaultTemplate.set(A, { id: 'tpl-1', name: 'Livre' });
    await defaultTemplate.set(B, { id: 'tpl-2', name: 'Jeu' });
    expect(await raw()).toEqual({
      [A]: { id: 'tpl-1', name: 'Livre' },
      [B]: { id: 'tpl-2', name: 'Jeu' },
    });
    expect(await defaultTemplate.get(A)).toEqual({ id: 'tpl-1', name: 'Livre' });
    expect(Object.keys(await fakeBrowser.storage.local.get(null))).toEqual([KEY]);
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});
    expect(await fakeBrowser.storage.session.get(null)).toEqual({});
  });

  it('remove: only the requested instance', async () => {
    await defaultTemplate.set(A, { id: 'tpl-1', name: 'Livre' });
    await defaultTemplate.set(B, { id: 'tpl-2', name: 'Jeu' });
    await defaultTemplate.remove(A);
    expect(await raw()).toEqual({ [B]: { id: 'tpl-2', name: 'Jeu' } });
  });

  it.each([
    ['a string', 'x'],
    ['an array', [{ id: 'tpl-1', name: 'Livre' }]],
    ['null', null],
  ])('stored value %s → ignored', async (_label, value) => {
    await fakeBrowser.storage.local.set({ [KEY]: value });
    expect(await defaultTemplate.get(A)).toBeNull();
  });

  it.each([
    ['not an object', 'tpl-1'],
    ['empty id', { id: '', name: 'Livre' }],
    ['id > 64', { id: 'x'.repeat(65), name: 'Livre' }],
    ['empty name', { id: 'tpl-1', name: '' }],
    ['name > 255', { id: 'tpl-1', name: 'x'.repeat(256) }],
    ['numeric id', { id: 1, name: 'Livre' }],
  ])('malformed entry (%s) → ignored', async (_label, entry) => {
    await fakeBrowser.storage.local.set({
      [KEY]: { [A]: entry, [B]: { id: 'tpl-2', name: 'Jeu' } },
    });
    expect(await defaultTemplate.get(A)).toBeNull();
    expect(await defaultTemplate.get(B)).toEqual({ id: 'tpl-2', name: 'Jeu' });
  });

  it('reconcile: no entry → none', async () => {
    expect(
      await defaultTemplate.reconcile(A, [{ id: 'tpl-1', name: 'Livre', description: '' }]),
    ).toEqual({ ref: null, state: 'none' });
  });

  it('reconcile: present, same name → ok, unchanged', async () => {
    await defaultTemplate.set(A, { id: 'tpl-1', name: 'Livre' });
    expect(
      await defaultTemplate.reconcile(A, [{ id: 'tpl-1', name: 'Livre', description: '' }]),
    ).toEqual({
      ref: { id: 'tpl-1', name: 'Livre' },
      state: 'ok',
    });
  });

  it('reconcile: present, renamed → name updated, ok', async () => {
    await defaultTemplate.set(A, { id: 'tpl-1', name: 'Livre' });
    await defaultTemplate.set(B, { id: 'tpl-2', name: 'Jeu' });
    expect(
      await defaultTemplate.reconcile(A, [{ id: 'tpl-1', name: 'Livres', description: '' }]),
    ).toEqual({
      ref: { id: 'tpl-1', name: 'Livres' },
      state: 'ok',
    });
    expect(await raw()).toEqual({
      [A]: { id: 'tpl-1', name: 'Livres' },
      [B]: { id: 'tpl-2', name: 'Jeu' },
    });
  });

  it('reconcile: absent from the list → missing, entry kept (never erased)', async () => {
    await defaultTemplate.set(A, { id: 'tpl-1', name: 'Livre' });
    expect(
      await defaultTemplate.reconcile(A, [{ id: 'tpl-2', name: 'Jeu', description: '' }]),
    ).toEqual({
      ref: { id: 'tpl-1', name: 'Livre' },
      state: 'missing',
    });
    expect(await raw()).toEqual({ [A]: { id: 'tpl-1', name: 'Livre' } });
  });
});
