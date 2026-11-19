import { mount } from '@vue/test-utils';
import type { PendingImport } from '@/shared/types';
import ResultView from '@/ui/popup/ResultView.vue';
import { draft } from '../contract/orchestrator-harness';
import { loadCatalog, setTestLanguage } from './i18n-harness';

/** Result of an import whose tags failed (spec 014, FR-012, E2). Fictitious values only. */
const fr = loadCatalog('fr');
const en = loadCatalog('en');

const pending = (over: Partial<PendingImport> = {}): PendingImport => ({
  id: 'p1',
  tabId: 1,
  pageUrl: null,
  draft: draft({ documents: [], tags: [{ name: 'Informatique' }] }),
  entityId: 'e1',
  steps: { create: 'done', update: 'done', attachments: {}, photo: 'unavailable', tags: 'failed' },
  photoError: null,
  photoAttempted: false,
  status: 'partial',
  error: 'TAG_FAILED',
  failedTags: ['Informatique'],
  ...over,
});
const view = (p: PendingImport) =>
  // ADAPTED (016, T071): ResultView receives the instances instead of one address (same link with one instance).
  mount(ResultView, {
    props: {
      pendings: [p],
      instances: [{ id: 'inst-a', name: 'homebox.example.com', baseUrl: 'https://homebox.example.com', maskedKey: 'hb_••••a1b2', lastCheck: null, keyState: 'ready' }],
      running: false,
    },
  });

describe('ResultView: tags not added (FR-012)', () => {
  it('partial with failedTags: the line « Tags non ajoutés : Informatique »', () => {
    const w = view(pending());
    expect(w.text()).toContain('Tags non ajoutés : Informatique');
  });

  it('several names are joined', () => {
    const w = view(pending({ failedTags: ['Informatique', 'Bureau'] }));
    expect(w.text()).toContain('Tags non ajoutés : Informatique, Bureau');
  });

  it('without failedTags: no line', () => {
    const w = view(pending({ failedTags: undefined, error: 'UPDATE_FAILED' }));
    expect(w.text()).not.toContain('Tags non ajoutés');
  });

  it.each(['TAG_FAILED', 'TAGS_UNAVAILABLE'] as const)('%s: translated message in fr then en, « Réessayer » offered', (code) => {
    const w = view(pending({ error: code }));
    expect(w.text()).toContain(fr[`error.${code}`]);
    expect(w.findAll('button').some((b) => b.text() === fr['recovery.retry'])).toBe(true);
    setTestLanguage('en');
    const e = view(pending({ error: code }));
    expect(e.text()).toContain(en[`error.${code}`]);
    expect(e.text()).toContain('Tags not added: Informatique');
  });
});
