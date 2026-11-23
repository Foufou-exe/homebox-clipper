import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { PendingImport } from '@/shared/types';
import RecoveryView from '@/ui/popup/RecoveryView.vue';
import { draft } from '../contract/orchestrator-harness';
import { loadCatalog } from './i18n-harness';

/** Spec 023: after ENTITY_TYPE_NOT_FOUND nothing was created, a retry would fail again: only abandon is offered. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));
const fr = loadCatalog('fr');
const inst = { id: 'inst-a', name: 'Maison', baseUrl: 'https://homebox.example.com', maskedKey: 'hb_••••xxxx', lastCheck: null, keyState: 'ready' as const };
const pending = (over: Partial<PendingImport> = {}): PendingImport => ({
  id: 'p1',
  instanceId: 'inst-a',
  tabId: 1,
  pageUrl: null,
  draft: draft({ documents: [], entityTypeId: 'et-gone' }),
  entityId: null,
  steps: { create: 'failed', update: 'pending', attachments: {}, photo: 'unavailable' },
  photoError: null,
  photoAttempted: false,
  status: 'failed',
  error: 'ENTITY_TYPE_NOT_FOUND',
  ...over,
});

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
  vi.mocked(send).mockResolvedValue(ok(undefined) as never);
});

describe('RecoveryView with ENTITY_TYPE_NOT_FOUND', () => {
  it('no retry button, only abandon', async () => {
    const w = mount(RecoveryView, { props: { pending: pending(), instance: inst } });
    await flushPromises();
    expect(w.find('button.primary').exists()).toBe(false);
    expect(w.findAll('button').map((b) => b.text())).toEqual([fr['recovery.abandon']]);
  });

  it('abandon sends import/abandon and emits abandoned', async () => {
    const w = mount(RecoveryView, { props: { pending: pending(), instance: inst } });
    await w.get('button').trigger('click');
    await flushPromises();
    expect(vi.mocked(send)).toHaveBeenCalledWith({ type: 'import/abandon', pendingId: 'p1' });
    expect(w.emitted('abandoned')).toEqual([['p1']]);
  });

  it('another error keeps the retry button', async () => {
    const w = mount(RecoveryView, { props: { pending: pending({ error: 'CREATE_FAILED' }), instance: inst } });
    await flushPromises();
    expect(w.find('button.primary').exists()).toBe(true);
  });
});
