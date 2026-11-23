import { mount } from '@vue/test-utils';
import type { CollectionSetting } from '@/shared/collections';
import type { InstanceView, PendingImport } from '@/shared/types';
import ResultView from '@/ui/popup/ResultView.vue';
import { draft } from '../contract/orchestrator-harness';
import { loadCatalog, setTestLanguage } from './i18n-harness';

/** Result of an import and the target collection (spec 024, FR-009, US1-3, US1-4). Fictitious values only. */
const fr = loadCatalog('fr');
const en = loadCatalog('en');
const tr = (cat: Record<string, string>, key: string, ...args: string[]) =>
  args.reduce((s, a, i) => s.replace(`$${i + 1}`, a), cat[key]!);
const ID_M = '11111111-1111-4111-8111-111111111111';
const ID_W = '22222222-2222-4222-8222-222222222222';

const success = (over: Partial<PendingImport> = {}): PendingImport => ({
  id: 'p1',
  tabId: 1,
  pageUrl: null,
  instanceId: 'inst-a',
  draft: draft({ documents: [] }),
  entityId: 'e1',
  steps: { create: 'done', update: 'done', attachments: {}, photo: 'not_requested' },
  photoError: null,
  photoAttempted: false,
  status: 'success',
  error: null,
  ...over,
});
const instance = (collection?: CollectionSetting): InstanceView => ({
  id: 'inst-a',
  name: 'Maison',
  baseUrl: 'https://homebox.example.com',
  maskedKey: 'hb_••••xxxx',
  lastCheck: null,
  keyState: 'ready',
  ...(collection ? { collection } : {}),
});
const view = (p: PendingImport, i: InstanceView) =>
  mount(ResultView, { props: { pendings: [p], instances: [i], running: false } });

describe('ResultView: the collection of the created item (FR-009)', () => {
  it('import made in Atelier: « Dans la collection Atelier : si le lien ne s’ouvre pas… », next to the link', () => {
    const w = view(
      success({ collection: { id: ID_W, name: 'Atelier' } }),
      instance({ chosen: { id: ID_W, name: 'Atelier' }, seen: null }),
    );
    expect(w.get('a').attributes('href')).toBe('https://homebox.example.com/item/e1');
    expect(w.text()).toContain(tr(fr, 'collections.resultLine', 'Atelier'));
  });

  it('default setting, several collections seen: the default one is named', () => {
    const w = view(
      success(),
      instance({ chosen: null, seen: { id: ID_M, name: 'Maison', several: true } }),
    );
    expect(w.text()).toContain(tr(fr, 'collections.resultLine', 'Maison'));
  });

  it('default setting with one collection, or never checked: nothing added (US1-4, US1-5)', () => {
    for (const i of [
      instance(),
      instance({ chosen: null, seen: { id: ID_M, name: 'Maison', several: false } }),
    ]) {
      const w = view(success(), i);
      expect(w.text()).not.toContain(fr['collections.resultLine']!.split('$1')[0]!);
    }
  });

  it('no link (nothing created): no collection line', () => {
    const w = view(
      success({
        entityId: null,
        status: 'failed',
        error: 'COLLECTION_UNAVAILABLE',
        steps: { create: 'failed', update: 'pending', attachments: {}, photo: 'not_requested' },
      }),
      instance({ chosen: { id: ID_W, name: 'Atelier' }, seen: null }),
    );
    expect(w.text()).not.toContain(tr(fr, 'collections.resultLine', 'Atelier'));
    expect(w.text()).toContain(fr['error.COLLECTION_UNAVAILABLE']);
  });

  it('M2: the collection of the import, even when the setting changed since', () => {
    const w = view(
      success({ collection: { id: ID_W, name: 'Atelier' } }),
      instance({
        chosen: { id: '33333333-3333-4333-8333-333333333333', name: 'Grenier' },
        seen: null,
      }),
    );
    expect(w.text()).toContain(tr(fr, 'collections.resultLine', 'Atelier'));
    expect(w.text()).not.toContain('Grenier');
  });

  it('M2: import made in the default collection while a collection is chosen now: no line (never the wrong name)', () => {
    const w = view(success(), instance({ chosen: { id: ID_W, name: 'Atelier' }, seen: null }));
    expect(w.text()).not.toContain('Atelier');
  });

  it('in English too', () => {
    setTestLanguage('en');
    const w = view(
      success({ collection: { id: ID_W, name: 'Atelier' } }),
      instance({ chosen: { id: ID_W, name: 'Atelier' }, seen: null }),
    );
    expect(w.text()).toContain(tr(en, 'collections.resultLine', 'Atelier'));
  });
});
