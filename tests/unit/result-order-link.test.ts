import { mount } from '@vue/test-utils';
import type { PendingImport } from '@/shared/types';
import ResultView from '@/ui/popup/ResultView.vue';
import { draft } from '../contract/orchestrator-harness';
import { loadCatalog } from './i18n-harness';

/** Result and resume of an import with the order page link (spec 025, Q-U3, contracts/ui.md §3). Fictitious values only. */
const fr = loadCatalog('fr');
const INSTANCE = {
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready' as const,
};

const steps = (orderLink?: 'pending' | 'done' | 'failed'): PendingImport['steps'] => ({
  create: 'done',
  update: 'done',
  attachments: {},
  photo: 'unavailable',
  ...(orderLink ? { orderLink } : {}),
});
const pending = (over: Partial<PendingImport> = {}): PendingImport => ({
  id: 'p1',
  tabId: 1,
  pageUrl: null,
  draft: draft({ documents: [], orderLink: true }),
  entityId: 'e1',
  steps: steps('done'),
  photoError: null,
  photoAttempted: false,
  status: 'running',
  error: null,
  ...over,
});
const view = (p: PendingImport) =>
  mount(ResultView, { props: { pendings: [p], instances: [INSTANCE], running: false } });
const line = (state: string) =>
  fr['result.stepOrderLink']!.replace('$1', fr[`result.step${state}`]!);

describe('ResultView: order link step (spec 025)', () => {
  it('R1: running: the step line is listed', () => {
    const w = view(pending({ steps: steps('pending') }));
    expect(w.findAll('ul.steps li').map((li) => li.text())).toContain(line('Pending'));
  });

  it('R2: success: the step is shown done for the product', () => {
    expect(view(pending({ status: 'success' })).text()).toContain(line('Done'));
  });

  it('R3: without the link, no line (state unchanged)', () => {
    const w = view(pending({ steps: steps(), status: 'success', draft: draft({ documents: [] }) }));
    expect(w.text()).not.toContain(fr['result.stepOrderLink']!.split('$1')[0]!.trim());
  });

  it.each(['ORDER_LINK_FAILED', 'ORDER_LINK_UNSUPPORTED'] as const)(
    'R4: partial with %s: failed step, the message of the error, retry button named for the link',
    (code) => {
      const w = view(pending({ status: 'partial', error: code, steps: steps('failed') }));
      expect(w.text()).toContain(line('Failed'));
      expect(w.text()).toContain(fr[`error.${code}`]!);
      expect(w.text()).toContain(fr['recovery.retryOrderLink']!);
    },
  );

  it('R5: another step also remaining: the generic retry label', () => {
    const w = view(
      pending({
        status: 'partial',
        error: 'UPDATE_FAILED',
        steps: { ...steps('failed'), update: 'failed' },
      }),
    );
    expect(w.text()).not.toContain(fr['recovery.retryOrderLink']!);
    expect(w.text()).toContain(fr['recovery.retry']!);
  });
});
