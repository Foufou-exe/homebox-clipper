import { flushPromises, mount } from '@vue/test-utils';
import { ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { PendingImport } from '@/shared/types';
import ResultView from '@/ui/popup/ResultView.vue';
import { draft } from '../contract/orchestrator-harness';
import { loadCatalog, setTestLanguage } from './i18n-harness';

/** Result of an import with order fields (spec 019, Q-U4, contracts/ui.md §3). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));
const fr = loadCatalog('fr');
const en = loadCatalog('en');
const NUMBER = '000-0000000-0000000';
const ORDER_FIELDS = [
  { role: 'orderNumber' as const, name: 'Order number', value: NUMBER },
  { role: 'merchant' as const, name: 'Merchant', value: 'Amazon.fr' },
];
const INSTANCE = {
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready' as const,
};

const pending = (over: Partial<PendingImport> = {}): PendingImport => ({
  id: 'p1',
  tabId: 1,
  pageUrl: null,
  draft: draft({ documents: [], orderNumber: NUMBER, orderFields: ORDER_FIELDS }),
  entityId: 'e1',
  steps: {
    create: 'done',
    update: 'done',
    attachments: {},
    photo: 'unavailable',
    orderFields: 'done',
  },
  photoError: null,
  photoAttempted: false,
  status: 'running',
  error: null,
  ...over,
});
const view = (p: PendingImport, instances = [INSTANCE]) =>
  mount(ResultView, { props: { pendings: [p], instances, running: false } });
const step = (lang: Record<string, string>, state: string) =>
  lang['result.stepOrderFields']!.replace('$1', lang[`result.step${state}`]!);

describe('ResultView: order fields step (US1-6)', () => {
  it('running: the step line next to creation, purchase data and photo', () => {
    const w = view(
      pending({
        steps: {
          create: 'done',
          update: 'done',
          attachments: {},
          photo: 'unavailable',
          orderFields: 'pending',
        },
      }),
    );
    const items = w.findAll('ul.steps li').map((li) => li.text());
    expect(items).toContain(step(fr, 'Pending'));
    expect(items[0]).toBe(fr['result.stepCreate']!.replace('$1', fr['result.stepDone']!));
  });

  it('success: « Champs de commande : réussie » shown for the product', () => {
    expect(view(pending({ status: 'success' })).text()).toContain(step(fr, 'Done'));
  });

  it('partial: failed variant (paragraph)', () => {
    const w = view(
      pending({
        status: 'partial',
        error: 'ORDER_FIELDS_FAILED',
        orderFieldsError: 'ORDER_FIELDS_FAILED',
        steps: {
          create: 'done',
          update: 'done',
          attachments: {},
          photo: 'unavailable',
          orderFields: 'failed',
        },
      }),
    );
    expect(w.text()).toContain(step(fr, 'Failed'));
  });

  it('no step line, no « Champs de commande » label without steps.orderFields (option off)', () => {
    for (const status of ['running', 'success', 'partial'] as const) {
      const w = view(
        pending({
          draft: draft({ documents: [] }),
          steps: { create: 'done', update: 'done', attachments: {}, photo: 'unavailable' },
          status,
          error: status === 'partial' ? 'UPDATE_FAILED' : null,
        }),
      );
      expect(w.text()).not.toContain(fr['orderFields.section']);
    }
  });

  it('in English', () => {
    setTestLanguage('en');
    expect(view(pending({ status: 'success' })).text()).toContain(step(en, 'Done'));
  });
});

describe('ResultView / RecoveryView: order fields failed, retry of the step alone (US6, FR-023, FR-026)', () => {
  const FAILED = pending({
    status: 'partial',
    error: 'ORDER_FIELDS_FAILED',
    orderFieldsError: 'ORDER_FIELDS_FAILED',
    steps: {
      create: 'done',
      update: 'done',
      attachments: {},
      photo: 'unavailable',
      orderFields: 'failed',
    },
  });
  const B = {
    ...INSTANCE,
    id: 'inst-b',
    name: 'Atelier',
    baseUrl: 'https://inventaire.example.org',
  };
  const buttons = (w: ReturnType<typeof view>) => w.findAll('button').map((b) => b.text());

  it('banner of the code, link to the item, « Champs de commande : échec », « Réessayer les champs de commande »; then in English', () => {
    const w = view(FAILED);
    expect(w.text()).toContain(fr['error.ORDER_FIELDS_FAILED']);
    expect(
      w.findAll('a').some((a) => a.attributes('href') === 'https://homebox.example.com/item/e1'),
    ).toBe(true);
    expect(w.text()).toContain(step(fr, 'Failed'));
    expect(buttons(w)).toContain(fr['recovery.retryOrderFields']);
    setTestLanguage('en');
    const e = view(FAILED);
    expect(e.text()).toContain(en['error.ORDER_FIELDS_FAILED']);
    expect(e.findAll('button').map((b) => b.text())).toContain(en['recovery.retryOrderFields']);
  });

  it('other steps remaining (a document failed): the label of before, unchanged (« retry the invoice »)', () => {
    const doc = {
      id: 'detected-0',
      origin: 'detected' as const,
      kind: 'invoice' as const,
      label: 'facture-000.pdf',
      url: 'https://www.amazon.fr/documents/download/x/invoice.pdf',
    };
    const w = view({
      ...FAILED,
      draft: { ...FAILED.draft, documents: [doc] },
      steps: { ...FAILED.steps, attachments: { 'detected-0': 'failed' } },
    });
    expect(buttons(w)).toContain(fr['recovery.retryInvoice']);
    expect(buttons(w)).not.toContain(fr['recovery.retryOrderFields']);
  });

  it.each([
    ['tags', { tags: 'failed' as const }],
    ['template fields', { templateFields: 'failed' as const }],
  ])('%s failed too: the generic label', (_label, extra) => {
    const w = view({ ...FAILED, steps: { ...FAILED.steps, ...extra } });
    expect(buttons(w)).toContain(fr['recovery.retry']);
    expect(buttons(w)).not.toContain(fr['recovery.retryOrderFields']);
  });

  it('click: import/retry { pendingId } without a new draft; no field name or value in the text of the resume', async () => {
    vi.mocked(send).mockReset();
    vi.mocked(send).mockResolvedValue(
      ok({
        ...FAILED,
        status: 'success',
        steps: { ...FAILED.steps, orderFields: 'done' },
      }) as never,
    );
    const w = view(FAILED);
    expect(w.text()).not.toContain('Order number');
    expect(w.text()).not.toContain('Merchant');
    await w
      .findAll('button')
      .find((b) => b.text() === fr['recovery.retryOrderFields'])!
      .trigger('click');
    await flushPromises();
    expect(vi.mocked(send).mock.calls.map((c) => c[0])).toEqual([
      { type: 'import/retry', pendingId: 'p1', manualFiles: [] },
    ]);
  });

  it('two instances: the error is prefixed with the name of the instance', () => {
    const w = view({ ...FAILED, instanceId: 'inst-a' }, [INSTANCE, B]);
    expect(w.text()).toContain('Maison');
    expect(w.text()).toContain(fr['error.ORDER_FIELDS_FAILED']);
  });
});
