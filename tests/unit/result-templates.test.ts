import { mount } from '@vue/test-utils';
import type { PendingImport } from '@/shared/types';
import ResultView from '@/ui/popup/ResultView.vue';
import { draft } from '../contract/orchestrator-harness';
import { loadCatalog, setTestLanguage } from './i18n-harness';

/** Result of an import with a template (spec 018, Q-U4, contracts/ui.md §2). Fictitious values only. */
const fr = loadCatalog('fr');
const en = loadCatalog('en');
const TEMPLATE = { id: 'tpl-1', name: 'Livre', fingerprint: 'a'.repeat(64), insured: false, manufacturer: '', modelNumber: '', fields: [] };

const pending = (over: Partial<PendingImport> = {}): PendingImport => ({
  id: 'p1',
  tabId: 1,
  pageUrl: null,
  draft: draft({ documents: [], location: { id: 'loc-1', path: ['Maison'] }, template: TEMPLATE }),
  entityId: 'e1',
  steps: { create: 'done', update: 'done', attachments: {}, photo: 'unavailable', templateFields: 'failed' },
  photoError: null,
  photoAttempted: false,
  status: 'partial',
  error: 'TEMPLATE_FIELDS_FAILED',
  templateFieldsError: 'TEMPLATE_FIELDS_FAILED',
  ...over,
});
const view = (p: PendingImport) =>
  mount(ResultView, {
    props: {
      pendings: [p],
      instances: [{ id: 'inst-a', name: 'Maison', baseUrl: 'https://homebox.example.com', maskedKey: 'hb_••••xxxx', lastCheck: null, keyState: 'ready' }],
      running: false,
    },
  });
const step = (lang: Record<string, string>, state: string) => lang['result.stepTemplateFields']!.replace('$1', lang[`result.step${state}`]!);

describe('ResultView: template fields step (US2)', () => {
  it('the step line only exists with steps.templateFields', () => {
    expect(view(pending()).text()).toContain(step(fr, 'Failed'));
    expect(view(pending({ steps: { create: 'done', update: 'done', attachments: {}, photo: 'unavailable', templateFields: 'done' }, status: 'running', error: null })).text()).toContain(step(fr, 'Done'));
    const without = pending({ draft: draft({ documents: [] }), steps: { create: 'done', update: 'done', attachments: {}, photo: 'unavailable' }, status: 'running', error: null, templateFieldsError: undefined });
    expect(view(without).text()).not.toContain(fr['result.stepTemplateFields']!.replace(' $1', ''));
  });

  it('partial TEMPLATE_FIELDS_FAILED: banner of the code, link to the item, retry offered; in French then English', () => {
    const w = view(pending());
    expect(w.text()).toContain(fr['error.TEMPLATE_FIELDS_FAILED']);
    // The item stays linked (existing link of the recovery block).
    expect(w.findAll('a').some((a) => a.attributes('href') === 'https://homebox.example.com/item/e1')).toBe(true);
    expect(w.findAll('button').some((b) => b.text() === fr['recovery.retry'])).toBe(true);
    setTestLanguage('en');
    const e = view(pending());
    expect(e.text()).toContain(en['error.TEMPLATE_FIELDS_FAILED']);
    expect(e.text()).toContain(step(en, 'Failed'));
  });
});

describe('ResultView / RecoveryView: template errors (US6, T083)', () => {
  it.each(['TEMPLATE_NOT_FOUND', 'TEMPLATE_CHANGED'] as const)('batch failure %s (banner shown by App.vue): the « backToSummary » help', (code) => {
    const w = mount(ResultView, {
      props: {
        pendings: [],
        instances: [{ id: 'inst-a', name: 'Maison', baseUrl: 'https://homebox.example.com', maskedKey: 'hb_••••xxxx', lastCheck: null, keyState: 'ready' }],
        running: false,
        batchError: code,
      },
    });
    expect(w.text()).toContain(fr['templates.backToSummary']);
    const other = mount(ResultView, { props: { pendings: [], instances: [], running: false, batchError: 'UNAUTHORIZED' } });
    expect(other.text()).not.toContain(fr['templates.backToSummary']);
  });

  it('App.vue passes its batch error to ResultView (source check)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const app = readFileSync(resolve(__dirname, '../../src/ui/popup/App.vue'), 'utf8');
    expect(app).toMatch(/<ResultView[^>]*:batch-error="error"/s);
  });

  it('retry before creation failed with TEMPLATE_*: banner and « Abandonner »; no « without location » option', () => {
    const p = pending({
      entityId: null,
      steps: { create: 'failed', update: 'pending', attachments: {}, photo: 'unavailable', templateFields: 'pending' },
      status: 'failed',
      error: 'LOCATION_NOT_FOUND',
      templateFieldsError: undefined,
    });
    const w = view(p);
    expect(w.findAll('button').some((b) => b.text() === fr['recovery.abandon'])).toBe(true);
    expect(w.findAll('button').some((b) => b.text() === fr['recovery.retryWithoutLocation'])).toBe(false);
    const tpl = view(pending({ entityId: null, status: 'failed', error: 'TEMPLATE_CHANGED', templateFieldsError: undefined }));
    expect(tpl.text()).toContain(fr['error.TEMPLATE_CHANGED']);
    expect(tpl.findAll('button').some((b) => b.text() === fr['recovery.abandon'])).toBe(true);
  });

  it('without template, « without location » stays offered when the location is gone (unchanged)', () => {
    const p = pending({
      draft: draft({ documents: [], location: { id: 'loc-1', path: ['Maison'] } }),
      entityId: null,
      steps: { create: 'failed', update: 'pending', attachments: {}, photo: 'unavailable' },
      status: 'failed',
      error: 'LOCATION_NOT_FOUND',
      templateFieldsError: undefined,
    });
    const w = view(p);
    expect(w.findAll('button').some((b) => b.text() === fr['recovery.retryWithoutLocation'])).toBe(true);
  });
});
