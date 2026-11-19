import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { InstanceView, PendingImport } from '@/shared/types';
import RecoveryView from '@/ui/popup/RecoveryView.vue';
import ResultView from '@/ui/popup/ResultView.vue';
import { draft } from '../contract/orchestrator-harness';
import { loadCatalog, makeGetMessage, setTestLanguage } from './i18n-harness';

/** Spec 016, delivery B, US6 (T096): the resume of an interrupted import is tied to ITS instance. Fictitious values. */

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const tr = makeGetMessage(fr);

const inst = (over: Partial<InstanceView> = {}): InstanceView => ({
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready',
  ...over,
});
const A = inst();
const B = inst({ id: 'inst-b', name: 'Atelier', baseUrl: 'https://inventaire.example.org', maskedKey: 'hb_••••bbbb' });

const gone = (over: Partial<PendingImport> = {}): PendingImport => ({
  id: 'p1',
  instanceId: A.id,
  tabId: 1,
  pageUrl: null,
  draft: draft({ documents: [] }),
  entityId: null,
  steps: { create: 'failed', update: 'pending', attachments: {}, photo: 'unavailable' },
  photoError: null,
  photoAttempted: false,
  status: 'failed',
  error: 'LOCATION_NOT_FOUND',
  ...over,
});

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
  vi.mocked(send).mockResolvedValue(ok({ locations: [], lastUsedId: null }) as never);
});

describe('RecoveryView and the instance of the import (016, US6, T096)', () => {
  it('location/list uses pending.instanceId, never the instance proposed in the summary', async () => {
    // B is the default instance of the popup; the import was made to A.
    mount(ResultView, { props: { pendings: [gone()], instances: [B, A], running: false } });
    await flushPromises();
    expect(vi.mocked(send).mock.calls.map(([m]) => m)).toEqual([{ type: 'location/list', instanceId: A.id }]);
  });

  it('two instances: « Import interrompu vers Maison »; the errors are prefixed with its name', async () => {
    const w = mount(ResultView, {
      props: { pendings: [gone({ entityId: 'e1', status: 'partial', error: 'UPDATE_FAILED' })], instances: [A, B], running: false },
    });
    await flushPromises();
    expect(w.get('.recovery-instance').text()).toBe(tr('recovery.instance', ['Maison']));
    expect(w.get('.recovery [role="alert"]').text()).toBe(tr('common.instanceError', ['Maison', fr['error.UPDATE_FAILED']!]));
    // The link of the created object opens in A.
    expect(w.get('.recovery a').attributes('href')).toBe('https://homebox.example.com/item/e1');
  });

  it('« Réessayer » sends import/retry without any target: the service worker uses the instance of the import', async () => {
    vi.mocked(send).mockImplementation(((m: { type: string }) =>
      Promise.resolve(m.type === 'import/retry' ? fail('HOMEBOX_UNREACHABLE') : ok({ locations: [], lastUsedId: null }))) as never);
    const w = mount(RecoveryView, {
      props: { pending: gone({ entityId: 'e1', status: 'partial', error: 'UPDATE_FAILED' }), instance: A, named: true },
    });
    await w.get('button.primary').trigger('click');
    await flushPromises();
    const retry = vi.mocked(send).mock.calls.map(([m]) => m).find((m) => m.type === 'import/retry')!;
    expect(retry).toEqual({ type: 'import/retry', pendingId: 'p1', manualFiles: [] });
    // US6-3: the error names the instance; no other instance is offered.
    expect(w.findAll('[role="alert"]').map((a) => a.text())).toContain(tr('common.instanceError', ['Maison', fr['error.HOMEBOX_UNREACHABLE']!]));
    expect(w.find('select').exists()).toBe(false);
    expect(w.text()).not.toContain('Atelier');
  });

  it('one instance: rendering unchanged (no title, errors not prefixed)', async () => {
    const w = mount(ResultView, {
      props: { pendings: [gone({ entityId: 'e1', status: 'partial', error: 'UPDATE_FAILED' })], instances: [A], running: false },
    });
    await flushPromises();
    expect(w.find('.recovery-instance').exists()).toBe(false);
    expect(w.get('.recovery [role="alert"]').text()).toBe(fr['error.UPDATE_FAILED']);
  });

  it('in English too', async () => {
    setTestLanguage('en');
    const en = loadCatalog('en');
    const w = mount(ResultView, { props: { pendings: [gone()], instances: [A, B], running: false } });
    await flushPromises();
    expect(w.get('.recovery-instance').text()).toBe(makeGetMessage(en)('recovery.instance', ['Maison']));
  });
});
