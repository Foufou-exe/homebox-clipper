import { flushPromises, mount } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok, type ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  ImportDraft,
  TagOption,
} from '@/shared/types';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import TagPicker from '@/ui/components/TagPicker.vue';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { loadCatalog } from './i18n-harness';

/** Tags in the summary (spec 014, Q-U4, contracts/ui.md « SummaryView.vue »). Fictitious values only. */
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const config: ConfigView = {
  configured: true,
  baseUrl: 'https://homebox.example.com',
  lastCheck: { status: 'ok', version: '0.27.0', at: '2026-10-22T10:00:00Z' },
};
const found = <T>(value: T) => ({ value, selector: 'x' });
const product = (key: string, name: string): DetectedProduct => ({
  key,
  name: found(name),
  unitPrice: found(9.9),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: { value: null, reason: 'not_found' },
});
const purchase = (products: DetectedProduct[]): DetectedPurchase => ({
  source: 'amazon.fr',
  pageUrl: 'https://www.amazon.fr/your-orders/order-details',
  orderNumber: found('999-0000000-0000001'),
  orderDate: found('2026-11-03'),
  seller: found('Amazon EU S.à r.l.'),
  products,
  documents: [
    {
      id: 'detected-0',
      origin: 'detected',
      kind: 'invoice',
      label: 'facture-amazon-999.pdf',
      size: 2048,
    },
  ],
});
const SSD = product('a', 'Disque SSD Exemple 1 To');
const USB = product('b', 'Clé USB Exemple');

type TagReply = TagOption[] | ErrorCode | Promise<unknown>;

async function mountSummary(p: DetectedPurchase | null, tags: TagReply = [], settings?: unknown) {
  if (settings !== undefined) await fakeBrowser.storage.local.set({ tagSettings: settings });
  vi.mocked(send).mockImplementation(((msg: { type: string }) => {
    if (msg.type === 'detect/run')
      return Promise.resolve(p ? ok({ purchase: p, warnings: [] }) : fail('NOT_AN_ORDER_PAGE'));
    if (msg.type === 'duplicate/check') return Promise.resolve(ok({ matches: [] }));
    if (msg.type === 'tag/list') {
      if (tags instanceof Promise) return tags;
      return Promise.resolve(typeof tags === 'string' ? fail(tags) : ok({ tags }));
    }
    return Promise.resolve(ok({ locations: [], lastUsedId: null }));
  }) as never);
  const wrapper = mount(SummaryView, { props: { tabId: 1, config }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}
type Mounted = Awaited<ReturnType<typeof mountSummary>>;

const pickers = (w: Mounted) => w.findAllComponents(TagPicker);
const tagNames = (w: Mounted, i = 0) => {
  const picker = pickers(w)[i]!;
  return picker.findAll('li.tag label').map((l) => l.text());
};
const submitted = (w: Mounted) =>
  (w.emitted('submit')?.[0] as [{ drafts: ImportDraft[] }] | undefined)?.[0];
const confirm = async (w: Mounted) => {
  await w.find('button.primary').trigger('click');
  await flushPromises();
};
const sentTypes = () => vi.mocked(send).mock.calls.map((c) => (c[0] as { type: string }).type);

beforeEach(() => {
  fakeBrowser.reset();
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SummaryView: proposed tags (US1-1, US1-5, US1-6, FR-001, FR-003)', () => {
  it('the store brand « Amazon » is proposed and checked at opening, placed after the warranty', async () => {
    const w = await mountSummary(purchase([SSD]));
    expect(pickers(w)).toHaveLength(1);
    expect(tagNames(w)).toEqual(['Amazon']);
    expect((pickers(w)[0]!.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(
      true,
    );
    const html = w.get('.line').html();
    expect(html.indexOf('class="warranty"')).toBeLessThan(html.indexOf('class="tag-picker"'));
  });

  it('tag/list is sent once at mount, without blocking the display', async () => {
    let resolveTags!: (v: unknown) => void;
    const pending = new Promise((r) => (resolveTags = r));
    const w = await mountSummary(purchase([SSD]), pending);
    expect(sentTypes().filter((t) => t === 'tag/list')).toHaveLength(1);
    // Displayed while the list is still loading: no mention yet.
    expect(tagNames(w)).toEqual(['Amazon']);
    expect(w.text()).not.toContain(fr['tags.badge.new']);
    resolveTags(ok({ tags: [] }));
    await flushPromises();
    expect(w.text()).toContain(fr['tags.badge.new']);
  });

  it('existing tags arriving after the display: name and id replaced, no « nouveau » (US1-5)', async () => {
    let resolveTags!: (v: unknown) => void;
    const pending = new Promise((r) => (resolveTags = r));
    const w = await mountSummary(purchase([SSD]), pending);
    resolveTags(ok({ tags: [{ id: 't1', name: 'AMAZON' }] }));
    await flushPromises();
    expect(tagNames(w)).toEqual(['AMAZON']);
    expect(w.text()).not.toContain(fr['tags.badge.new']);
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.tags).toEqual([{ name: 'AMAZON', id: 't1' }]);
  });

  it('each product has its own list, changed independently (US1-6)', async () => {
    const w = await mountSummary(purchase([SSD, USB]));
    expect(pickers(w)).toHaveLength(2);
    await pickers(w)[0]!.get('input[type="checkbox"]').setValue(false);
    await confirm(w);
    const drafts = submitted(w)!.drafts;
    expect(drafts[0]).not.toHaveProperty('tags');
    expect(drafts[1]!.tags).toEqual([{ name: 'Amazon' }]);
  });
});

describe('SummaryView: submit (FR-005, FR-006)', () => {
  it('sends only the checked tags, { name } or { name, id }, as a copy', async () => {
    const w = await mountSummary(purchase([SSD]), [
      { id: 't1', name: 'Amazon' },
      { id: 't2', name: 'Écran' },
    ]);
    const picker = pickers(w)[0]!;
    await picker.get('input[role="combobox"]').setValue('ecran');
    await picker.findAll('[role="option"]')[0]!.trigger('click');
    await picker.get('input[role="combobox"]').setValue('Cuisine');
    await picker.get('input[role="combobox"]').trigger('keydown', { key: 'Enter' });
    expect(tagNames(w)).toEqual(['Amazon', 'Écran', 'Cuisine']);
    await confirm(w);
    const tags = submitted(w)!.drafts[0]!.tags!;
    expect(tags).toEqual([
      { name: 'Amazon', id: 't1' },
      { name: 'Écran', id: 't2' },
      { name: 'Cuisine' },
    ]);
    // A later change on the screen does not change what was sent.
    await pickers(w)[0]!.get('input[type="checkbox"]').setValue(false);
    expect(tags[0]).toEqual({ name: 'Amazon', id: 't1' });
  });

  it('the tags key is omitted when no tag is checked', async () => {
    const w = await mountSummary(purchase([SSD]));
    await pickers(w)[0]!.get('input[type="checkbox"]').setValue(false);
    await confirm(w);
    expect(submitted(w)!.drafts[0]).not.toHaveProperty('tags');
  });

  it('cancel: no import/start, no tag message other than tag/list (US1-7)', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const w = await mountSummary(purchase([SSD]));
    const cancel = w.findAll('.footer button').find((b) => b.text() === fr['summary.cancel'])!;
    await cancel.trigger('click');
    expect(close).toHaveBeenCalled();
    expect(w.emitted('submit')).toBeUndefined();
    expect(sentTypes().filter((t) => t.startsWith('tag/'))).toEqual(['tag/list']);
    expect(sentTypes()).not.toContain('import/start');
  });
});

describe('SummaryView: unreadable list (FR-011)', () => {
  it.each(['TAGS_UNAVAILABLE', 'HOMEBOX_UNREACHABLE'] as ErrorCode[])(
    '%s: one warning (not one per product), « non vérifié » mentions, import still possible',
    async (code) => {
      const w = await mountSummary(purchase([SSD, USB]), code);
      const banners = w
        .findAllComponents(ErrorBanner)
        .filter((b) => b.props('code') === 'TAGS_UNAVAILABLE');
      expect(banners).toHaveLength(1);
      expect(banners[0]!.props('tone')).toBe('warning');
      expect(w.text()).toContain(fr['tags.unavailableHelp']);
      expect(w.text().split(fr['tags.badge.unverified']!).length - 1).toBe(2);
      await confirm(w);
      expect(submitted(w)!.drafts.map((d) => d.tags)).toEqual([
        [{ name: 'Amazon' }],
        [{ name: 'Amazon' }],
      ]);
    },
  );
});

describe('SummaryView: manual entry and edits (E3)', () => {
  it('detection impossible: no merchant tag, no rule', async () => {
    const w = await mountSummary(null, [], {
      v: 1,
      merchantTag: true,
      rules: [{ id: 'r', contains: 'a', tag: 'Tout' }],
    });
    expect(tagNames(w)).toEqual([]);
    expect(pickers(w)[0]!.text()).toContain(fr['tags.none']);
  });

  it('changing the product name does not recompute the tags', async () => {
    const w = await mountSummary(purchase([SSD]), [], {
      v: 1,
      merchantTag: true,
      rules: [{ id: 'r', contains: 'ssd', tag: 'Informatique' }],
    });
    expect(tagNames(w)).toEqual(['Amazon', 'Informatique']);
    await w.get('.line .editor input[id$="-name"]').setValue('Clé USB Exemple');
    expect(tagNames(w)).toEqual(['Amazon', 'Informatique']);
  });
});

describe('SummaryView: user rules (US2-2 to US2-6, US2-8)', () => {
  const rules = (...r: [string, string][]) =>
    r.map(([contains, tag], i) => ({ id: `r${i}`, contains, tag }));

  it('« SSD → Informatique »: proposed and checked only for the matching product', async () => {
    const w = await mountSummary(purchase([SSD, USB]), [], {
      v: 1,
      merchantTag: true,
      rules: rules(['SSD', 'Informatique']),
    });
    expect(tagNames(w, 0)).toEqual(['Amazon', 'Informatique']);
    expect(tagNames(w, 1)).toEqual(['Amazon']);
    expect(
      pickers(w)[0]!
        .findAll('input[type="checkbox"]')
        .map((b) => (b.element as HTMLInputElement).checked),
    ).toEqual([true, true]);
  });

  it('« ecran → Bureau » and the product « Écran sans fil » → « Bureau » (US2-4)', async () => {
    const w = await mountSummary(purchase([product('c', 'Écran sans fil')]), [], {
      v: 1,
      merchantTag: true,
      rules: rules(['ecran', 'Bureau']),
    });
    expect(tagNames(w)).toEqual(['Amazon', 'Bureau']);
  });

  it('several matching rules: all the tags, without duplicates, merchant included (US2-5)', async () => {
    const w = await mountSummary(purchase([SSD]), [], {
      v: 1,
      merchantTag: true,
      rules: rules(
        ['ssd', 'Informatique'],
        ['disque', 'informatique'],
        ['exemple', 'amazon'],
        ['to', 'Bureau'],
      ),
    });
    expect(tagNames(w)).toEqual(['Amazon', 'Informatique', 'Bureau']);
  });

  it('merchantTag false: « Amazon » absent, rules still proposed (US2-8)', async () => {
    const w = await mountSummary(purchase([SSD]), [], {
      v: 1,
      merchantTag: false,
      rules: rules(['SSD', 'Informatique']),
    });
    expect(tagNames(w)).toEqual(['Informatique']);
  });

  it('unreadable setting → defaults (merchant proposed, no rule)', async () => {
    const w = await mountSummary(purchase([SSD]), [], {
      v: 2,
      merchantTag: false,
      rules: rules(['SSD', 'Informatique']),
    });
    expect(tagNames(w)).toEqual(['Amazon']);
  });

  it('a rule changed after opening has no effect on the summary already shown (US2-6, E3)', async () => {
    const w = await mountSummary(purchase([SSD]), [], {
      v: 1,
      merchantTag: true,
      rules: rules(['SSD', 'Informatique']),
    });
    await fakeBrowser.storage.local.set({ tagSettings: { v: 1, merchantTag: false, rules: [] } });
    await flushPromises();
    expect(tagNames(w)).toEqual(['Amazon', 'Informatique']);
  });
});

describe('SummaryView: new tags (US3-2, US3-4, SC-003)', () => {
  it('an unchecked « new » tag is not in the tags of import/start', async () => {
    const w = await mountSummary(purchase([SSD]), [], {
      v: 1,
      merchantTag: true,
      rules: [{ id: 'r', contains: 'ssd', tag: 'Informatique' }],
    });
    expect(w.text()).toContain(fr['tags.badge.new']);
    await pickers(w)[0]!.findAll('input[type="checkbox"]')[1]!.setValue(false);
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.tags).toEqual([{ name: 'Amazon' }]);
  });

  it('next summary: « Amazon » now exists in HomeBox, no « nouveau » and its id is sent', async () => {
    const w = await mountSummary(purchase([SSD]), [{ id: 'tAmazon', name: 'Amazon' }]);
    expect(w.text()).not.toContain(fr['tags.badge.new']);
    await confirm(w);
    expect(submitted(w)!.drafts[0]!.tags).toEqual([{ name: 'Amazon', id: 'tAmazon' }]);
  });
});

describe('SummaryView: HomeBox names not normalised (review 014, point 1)', () => {
  it('a HomeBox tag « Amazon  » and a name in NFD: the import message stays valid, with the right id', async () => {
    const { isMessage } = await vi.importActual<typeof import('@/shared/messages')>('@/shared/messages');
    const nfd = 'Écran'.normalize('NFD');
    const w = await mountSummary(purchase([SSD]), [{ id: 'tA', name: 'Amazon  ' }, { id: 'tE', name: nfd }], {
      v: 1,
      merchantTag: true,
      rules: [{ id: 'r', contains: 'ssd', tag: 'Écran' }],
    });
    await confirm(w);
    const drafts = submitted(w)!.drafts;
    expect(drafts[0]!.tags).toEqual([{ name: 'Amazon', id: 'tA' }, { name: 'Écran', id: 'tE' }]);
    expect(isMessage({ type: 'import/start', tabId: 1, drafts, manualFiles: [] })).toBe(true);
  });
});

describe('SummaryView: at most 50 proposed tags (review 014, point 2)', () => {
  it('60 matching rules: the merchant then the first 49 rules, the import message stays valid', async () => {
    const { isMessage } = await vi.importActual<typeof import('@/shared/messages')>('@/shared/messages');
    const rules = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, contains: 'ssd', tag: `Tag ${i}` }));
    const w = await mountSummary(purchase([SSD]), [], { v: 1, merchantTag: true, rules });
    expect(tagNames(w)).toHaveLength(50);
    expect(tagNames(w)[0]).toBe('Amazon');
    expect(tagNames(w)[49]).toBe('Tag 48');
    await confirm(w);
    const drafts = submitted(w)!.drafts;
    expect(isMessage({ type: 'import/start', tabId: 1, drafts, manualFiles: [] })).toBe(true);
  });
});
