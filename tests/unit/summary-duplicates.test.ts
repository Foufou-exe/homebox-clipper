import { flushPromises, mount } from '@vue/test-utils';
import { fail, ok, type Result } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  DuplicateCheck,
  DuplicateMatch,
  ImportDraft,
} from '@/shared/types';
import FieldEditor from '@/ui/components/FieldEditor.vue';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { loadCatalog, setTestLanguage } from './i18n-harness';

// Spec 015 (Q-U3, contracts/ui.md "Tests d'interface"): the duplicate dialog with certain duplicates and similar
// items, grouped by product. `send` is mocked; texts come from the real catalogs (setup-i18n.ts).
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const fr = loadCatalog('fr');
const en = loadCatalog('en');
const NUMBER = '999-0000000-0000001';
const BASE = 'https://homebox.example.com';
const config: ConfigView = {
  configured: true,
  baseUrl: BASE,
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
  seller: found('Amazon EU S.à r.l.'),
});
const purchase = (
  products: DetectedProduct[],
  orderNumber: string | null = NUMBER,
): DetectedPurchase => ({
  source: 'amazon.fr',
  pageUrl: 'https://www.amazon.fr/x',
  orderNumber: orderNumber === null ? { value: null, reason: 'not_found' } : found(orderNumber),
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

const item = (id: string, name: string): DuplicateMatch => ({
  id,
  name,
  url: `${BASE}/item/${id}`,
});
const check = (over: Partial<DuplicateCheck> = {}): Result<DuplicateCheck> =>
  ok({ matches: [], similar: [], moreSimilar: false, incomplete: false, ...over });

const CABLE = 'Câble USB-C 2 m noir';
const MOUSE = 'Logitech M185 Souris sans fil, Gris';
const DRILL = 'Perceuse visseuse Bosch 18V';

type Reply = Result<DuplicateCheck> | 'reject';

/** `duplicate/check` replies keyed by product name; any other product gets an empty result. */
async function mountSummary(p: DetectedPurchase, replies: Record<string, Reply> = {}) {
  vi.mocked(send).mockImplementation(((msg: { type: string; name?: string }) => {
    if (msg.type === 'detect/run') return Promise.resolve(ok({ purchase: p, warnings: [] }));
    if (msg.type === 'tag/list') return Promise.resolve(ok({ tags: [] }));
    if (msg.type === 'duplicate/check') {
      const r = replies[msg.name ?? ''];
      if (r === 'reject') return Promise.reject(new Error('port closed'));
      return Promise.resolve(r ?? check());
    }
    return Promise.resolve(ok({ locations: [], lastUsedId: null }));
  }) as never);
  const wrapper = mount(SummaryView, { props: { tabId: 1, config }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}
type Mounted = Awaited<ReturnType<typeof mountSummary>>;

const add = async (w: Mounted) => {
  await w.find('.footer button.primary').trigger('click');
  await flushPromises();
};
const dialog = (w: Mounted) => w.find('[role="alertdialog"][aria-labelledby="dup"]');
const dialogButton = (w: Mounted, text: string) =>
  dialog(w)
    .findAll('button')
    .find((b) => b.text() === text)!;
const submitted = (w: Mounted) =>
  w.emitted('submit') as [{ drafts: ImportDraft[]; duplicateCheckFailed: boolean }][] | undefined;
const sentChecks = () =>
  vi
    .mocked(send)
    .mock.calls.map(([m]) => m)
    .filter((m) => m.type === 'duplicate/check');
const h3s = (w: Mounted) =>
  dialog(w)
    .findAll('h3')
    .map((h) => h.text());
const h4s = (w: Mounted) =>
  dialog(w)
    .findAll('h4')
    .map((h) => h.text());
const links = (w: Mounted) =>
  dialog(w)
    .findAll('a')
    .map((a) => ({ text: a.text(), href: a.attributes('href') }));

beforeEach(() => {
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SummaryView: similar items in the duplicate dialog (015, US1)', () => {
  it('US1-1: a similar item alone → dialog, "Ressemblances" section, link named as in HomeBox, no submit', async () => {
    const w = await mountSummary(purchase([product('a', CABLE)]), {
      [CABLE]: check({ similar: [item('s1', 'Cable usb c noir 2m')] }),
    });
    await add(w);
    expect(dialog(w).exists()).toBe(true);
    expect(h4s(w)).toContain(fr['duplicates.similarTitle']);
    expect(h4s(w)).not.toContain('Doublon sûr');
    expect(links(w)).toEqual([{ text: 'Cable usb c noir 2m', href: `${BASE}/item/s1` }]);
    const a = dialog(w).find('a');
    expect(a.attributes('target')).toBe('_blank');
    expect(a.attributes('rel')).toBe('noopener');
    expect(submitted(w)).toBeUndefined();
  });

  it('US1-3: "Annuler" closes the dialog, emits nothing and leaves the summary intact', async () => {
    const replies: Record<string, Reply> = {
      'Câble USB-C noir (modifié)': check({ similar: [item('s1', 'Cable usb c noir 2m')] }),
    };
    const w = await mountSummary(purchase([product('a', CABLE), product('b', DRILL)]), replies);
    await w
      .findAllComponents(FieldEditor)[0]!
      .find('input[id$="-name"]')
      .setValue('Câble USB-C noir (modifié)');
    await add(w);
    expect(dialog(w).exists()).toBe(true);
    await dialogButton(w, 'Annuler').trigger('click');
    await flushPromises();
    expect(dialog(w).exists()).toBe(false);
    expect(submitted(w)).toBeUndefined();
    expect((document.activeElement as HTMLElement | null)?.textContent?.trim()).toBe(
      fr['summary.add'],
    );
    // Same choices at the next confirmation: names, checked products and documents unchanged.
    delete replies['Câble USB-C noir (modifié)'];
    await add(w);
    const [payload] = submitted(w)![0]!;
    expect(payload.drafts.map((d) => d.name)).toEqual(['Câble USB-C noir (modifié)', DRILL]);
    expect(payload.drafts[0]!.documents.map((d) => d.id)).toEqual(['detected-0']);
  });

  it('US1-4: "Créer quand même" emits submit once, with every checked product', async () => {
    const w = await mountSummary(purchase([product('a', CABLE), product('b', DRILL)]), {
      [CABLE]: check({ similar: [item('s1', 'Cable usb c noir 2m')] }),
    });
    await add(w);
    await dialogButton(w, 'Créer quand même').trigger('click');
    await flushPromises();
    expect(submitted(w)).toHaveLength(1);
    const [payload] = submitted(w)![0]!;
    expect(payload.drafts.map((d) => d.name)).toEqual([CABLE, DRILL]);
    expect(payload.duplicateCheckFailed).toBe(false);
  });

  it('US1-5: no result → no dialog, submit emitted with duplicateCheckFailed: false', async () => {
    const w = await mountSummary(purchase([product('a', 'Lampe de bureau')]));
    await add(w);
    expect(dialog(w).exists()).toBe(false);
    expect(submitted(w)).toHaveLength(1);
    expect(submitted(w)![0]![0].duplicateCheckFailed).toBe(false);
  });

  it('US1-7 / FR-008: two products concerned out of three → two groups named after them, in summary order', async () => {
    const shared = item('s9', 'Souris sans fil Logitech M185');
    const w = await mountSummary(
      purchase([product('a', MOUSE), product('b', 'Lampe de bureau'), product('c', CABLE)]),
      {
        [MOUSE]: check({ similar: [shared] }),
        [CABLE]: check({ similar: [item('s1', 'Cable usb c noir 2m'), shared] }),
      },
    );
    await add(w);
    expect(h3s(w)).toEqual([MOUSE, CABLE]);
    const groups = dialog(w).findAll('.dup-group');
    expect(groups[0]!.text()).toContain('Souris sans fil Logitech M185');
    expect(groups[1]!.text()).toContain('Souris sans fil Logitech M185');
  });

  it('FR-010: moreSimilar → the "other similar items" mention; absent otherwise', async () => {
    const w = await mountSummary(purchase([product('a', CABLE), product('b', MOUSE)]), {
      [CABLE]: check({ similar: [item('s1', 'Cable usb c noir 2m')], moreSimilar: true }),
      [MOUSE]: check({ similar: [item('s2', 'Souris sans fil Logitech M185')] }),
    });
    await add(w);
    const groups = dialog(w).findAll('.dup-group');
    expect(fr['duplicates.moreSimilar']).toBe(
      "D'autres objets ressemblants existent dans HomeBox.",
    );
    expect(groups[0]!.text()).toContain(fr['duplicates.moreSimilar']);
    expect(groups[1]!.text()).not.toContain(fr['duplicates.moreSimilar']);
  });

  it('an unchecked product is never checked', async () => {
    const w = await mountSummary(purchase([product('a', CABLE), product('b', DRILL)]));
    await w.findAll('.line > label.pick input[type="checkbox"]')[1]!.setValue(false);
    await add(w);
    expect(sentChecks()).toEqual([{ type: 'duplicate/check', orderNumber: NUMBER, name: CABLE }]);
  });

  it('a name edited before confirmation is the one sent', async () => {
    const w = await mountSummary(purchase([product('a', CABLE)]));
    await w.findComponent(FieldEditor).find('input[id$="-name"]').setValue('Câble USB-C tressé');
    await add(w);
    expect(sentChecks()).toEqual([
      { type: 'duplicate/check', orderNumber: NUMBER, name: 'Câble USB-C tressé' },
    ]);
  });
});

describe('SummaryView: check failures stay visible and never block (015, FR-013)', () => {
  it('total failure without any duplicate → no dialog, submit with duplicateCheckFailed: true', async () => {
    const w = await mountSummary(purchase([product('a', CABLE)]), {
      [CABLE]: fail('DUPLICATE_CHECK_FAILED'),
    });
    await add(w);
    expect(dialog(w).exists()).toBe(false);
    expect(submitted(w)).toHaveLength(1);
    expect(submitted(w)![0]![0].duplicateCheckFailed).toBe(true);
  });

  it('one product failed + a similar item for another → the dialog lists the unchecked product, plus the banner', async () => {
    const w = await mountSummary(purchase([product('a', CABLE), product('b', DRILL)]), {
      [CABLE]: check({ similar: [item('s1', 'Cable usb c noir 2m')] }),
      [DRILL]: fail('DUPLICATE_CHECK_FAILED'),
    });
    await add(w);
    expect(fr['duplicates.unchecked']).toBe("Ces produits n'ont pas pu être vérifiés :");
    expect(dialog(w).text()).toContain(fr['duplicates.unchecked']);
    expect(
      dialog(w)
        .findAll('li')
        .map((li) => li.text()),
    ).toContain(DRILL);
    expect(w.text()).toContain("La vérification des doublons n'a pas pu être effectuée.");
    await dialogButton(w, 'Créer quand même').trigger('click');
    expect(submitted(w)![0]![0].duplicateCheckFailed).toBe(true);
  });

  it('incomplete: true → the product is listed as not checked and its results are shown', async () => {
    const w = await mountSummary(purchase([product('a', CABLE)]), {
      [CABLE]: check({ similar: [item('s1', 'Cable usb c noir 2m')], incomplete: true }),
    });
    await add(w);
    expect(links(w).map((l) => l.text)).toEqual(['Cable usb c noir 2m']);
    expect(dialog(w).text()).toContain(fr['duplicates.unchecked']);
    expect(
      dialog(w)
        .findAll('li')
        .map((li) => li.text()),
    ).toContain(CABLE);
  });

  it('a rejected send is a failure: the loop goes on and submit stays possible', async () => {
    const w = await mountSummary(purchase([product('a', DRILL), product('b', CABLE)]), {
      [DRILL]: 'reject',
      [CABLE]: check({ similar: [item('s1', 'Cable usb c noir 2m')] }),
    });
    await add(w);
    expect(sentChecks()).toHaveLength(2);
    expect(h3s(w)).toEqual([CABLE]);
    expect(
      dialog(w)
        .findAll('li')
        .map((li) => li.text()),
    ).toContain(DRILL);
    await dialogButton(w, 'Créer quand même').trigger('click');
    expect(submitted(w)).toHaveLength(1);
    expect(submitted(w)![0]![0].duplicateCheckFailed).toBe(true);
  });
});

describe('SummaryView: duplicate dialog accessibility and texts (015, FR-019, FR-020)', () => {
  it('alertdialog labelled and described, focus on "Annuler", links then buttons, no aria-label on links', async () => {
    const w = await mountSummary(purchase([product('a', CABLE)]), {
      [CABLE]: check({
        similar: [item('s1', 'Cable usb c noir 2m'), item('s2', 'Câble USB-C noir')],
      }),
    });
    await add(w);
    const d = dialog(w);
    expect(d.attributes('role')).toBe('alertdialog');
    expect(d.attributes('aria-labelledby')).toBe('dup');
    expect(d.attributes('aria-describedby')).toBe('dup-help');
    expect(d.find('#dup').text()).toContain('Un objet semblable existe déjà dans HomeBox.');
    expect(d.find('#dup-help').text()).toBe(fr['duplicates.help']);
    expect((document.activeElement as HTMLElement | null)?.textContent?.trim()).toBe('Annuler');
    expect(d.element.contains(document.activeElement)).toBe(true);
    const focusable = d.findAll('a[href], button').map((e) => e.element.tagName);
    expect(focusable).toEqual(['A', 'A', 'BUTTON', 'BUTTON']);
    for (const a of d.findAll('a')) expect(a.attributes('aria-label')).toBeUndefined();
  });

  it.each(['fr', 'en'] as const)('US1-8: translated labels, no raw key (%s)', async (lang) => {
    setTestLanguage(lang);
    const cat = lang === 'fr' ? fr : en;
    const w = await mountSummary(purchase([product('a', CABLE), product('b', DRILL)]), {
      [CABLE]: check({ similar: [item('s1', 'Cable usb c noir 2m')], moreSimilar: true }),
      [DRILL]: fail('DUPLICATE_CHECK_FAILED'),
    });
    await add(w);
    const text = dialog(w).text();
    expect(text).not.toContain('duplicates.');
    for (const key of ['help', 'similarTitle', 'similarHelp', 'moreSimilar', 'unchecked']) {
      expect(cat[`duplicates.${key}`], key).toBeTruthy();
      expect(text).toContain(cat[`duplicates.${key}`]);
    }
  });

  it('names are rendered as text, never as HTML', async () => {
    const productName = '<b>x</b> Câble USB-C noir';
    const w = await mountSummary(purchase([product('a', productName)]), {
      [productName]: check({ similar: [item('s1', '<b>y</b> Cable usb c noir')] }),
    });
    await add(w);
    expect(dialog(w).find('b').exists()).toBe(false);
    expect(h3s(w)).toEqual([productName]);
    expect(links(w)[0]!.text).toBe('<b>y</b> Cable usb c noir');
  });
});

describe('SummaryView: products without an order number are checked too (015, US2, FR-003, SC-005)', () => {
  it('US2-3: a checked product without an order number sends duplicate/check with orderNumber ""', async () => {
    const w = await mountSummary(purchase([product('a', DRILL)], null));
    await add(w);
    expect(sentChecks()).toEqual([{ type: 'duplicate/check', orderNumber: '', name: DRILL }]);
  });

  it('a product without an order number with a similar item → dialog, group named after it, item under "Ressemblances"', async () => {
    const w = await mountSummary(purchase([product('a', DRILL)], null), {
      [DRILL]: check({ similar: [item('m1', 'Perceuse visseuse Bosch 18V')] }),
    });
    await add(w);
    expect(dialog(w).exists()).toBe(true);
    expect(h3s(w)).toEqual([DRILL]);
    expect(h4s(w)).toEqual([fr['duplicates.similarTitle']]);
    expect(links(w)).toEqual([{ text: 'Perceuse visseuse Bosch 18V', href: `${BASE}/item/m1` }]);
  });

  it('two products, only one with an order number: one message per checked product, in summary order', async () => {
    const w = await mountSummary(purchase([product('a', CABLE), product('b', DRILL)]));
    // The second product loses its order number (manual edit).
    await w.findAllComponents(FieldEditor)[1]!.find('input[id$="-order"]').setValue('');
    await add(w);
    expect(sentChecks()).toEqual([
      { type: 'duplicate/check', orderNumber: NUMBER, name: CABLE },
      { type: 'duplicate/check', orderNumber: '', name: DRILL },
    ]);
  });

  it('a product without an order number and without any result → no dialog, submit emitted', async () => {
    const w = await mountSummary(purchase([product('a', 'Lampe de bureau')], null));
    await add(w);
    expect(dialog(w).exists()).toBe(false);
    expect(submitted(w)).toHaveLength(1);
  });

  it('every checked product is checked: as many messages as checked products', async () => {
    const w = await mountSummary(
      purchase(
        [
          product('a', CABLE),
          product('b', DRILL),
          product('c', MOUSE),
          product('d', 'Lampe de bureau'),
        ],
        null,
      ),
    );
    await w.findAll('.line > label.pick input[type="checkbox"]')[2]!.setValue(false);
    await add(w);
    expect(sentChecks().map((m) => (m as { name: string }).name)).toEqual([
      CABLE,
      DRILL,
      'Lampe de bureau',
    ]);
  });
});

describe('SummaryView: certain duplicates first, distinct from similar items (015, US3, FR-006, FR-009)', () => {
  const SAFE = 'Doublon sûr';
  const SIMILAR = 'Ressemblances';

  it('US3-1: a certain duplicate → "Doublon sûr" heading, its explanation and the link', async () => {
    const w = await mountSummary(purchase([product('a', CABLE)]), {
      [CABLE]: check({ matches: [item('d1', CABLE)] }),
    });
    await add(w);
    expect(fr['duplicates.safeTitle']).toBe(SAFE);
    expect(h4s(w)).toEqual([SAFE]);
    expect(dialog(w).text()).toContain(fr['duplicates.safeHelp']);
    expect(links(w)).toEqual([{ text: CABLE, href: `${BASE}/item/d1` }]);
  });

  it('US3-3: certain duplicate and similar items for one product → "Doublon sûr" before "Ressemblances", own explanations', async () => {
    const w = await mountSummary(purchase([product('a', CABLE)]), {
      [CABLE]: check({
        matches: [item('d1', CABLE)],
        similar: [item('s1', 'Cable usb c noir 2m')],
      }),
    });
    await add(w);
    expect(h4s(w)).toEqual([SAFE, SIMILAR]);
    expect(fr['duplicates.safeHelp']).not.toBe(fr['duplicates.similarHelp']);
    const text = dialog(w).text();
    expect(text.indexOf(fr['duplicates.safeHelp']!)).toBeLessThan(
      text.indexOf(fr['duplicates.similarHelp']!),
    );
    expect(links(w).map((l) => l.text)).toEqual([CABLE, 'Cable usb c noir 2m']);
  });

  it('US3-1 / FR-006: the group with a certain duplicate comes first; the others keep the summary order', async () => {
    const w = await mountSummary(
      purchase([product('a', MOUSE), product('b', DRILL), product('c', CABLE)]),
      {
        [MOUSE]: check({ similar: [item('s2', 'Souris sans fil Logitech M185')] }),
        [DRILL]: check({ similar: [item('s3', 'Perceuse visseuse Bosch 18V')] }),
        [CABLE]: check({ matches: [item('d1', CABLE)] }),
      },
    );
    await add(w);
    expect(h3s(w)).toEqual([CABLE, MOUSE, DRILL]);
  });

  it('an empty section is not shown', async () => {
    const w = await mountSummary(purchase([product('a', CABLE), product('b', MOUSE)]), {
      [CABLE]: check({ matches: [item('d1', CABLE)] }),
      [MOUSE]: check({ similar: [item('s2', 'Souris sans fil Logitech M185')] }),
    });
    await add(w);
    const groups = dialog(w).findAll('.dup-group');
    expect(groups[0]!.findAll('h4').map((h) => h.text())).toEqual([SAFE]);
    expect(groups[1]!.findAll('h4').map((h) => h.text())).toEqual([SIMILAR]);
  });

  it('FR-009: an item of matches is shown once in its group, and may appear under several products', async () => {
    const shared = item('d1', 'Câble USB-C 2 m noir');
    const w = await mountSummary(
      purchase([product('a', CABLE), product('b', 'Câble USB-C 2 m noir ')]),
      {
        [CABLE]: check({ matches: [shared] }),
        ['Câble USB-C 2 m noir ']: check({ matches: [shared] }),
      },
    );
    await add(w);
    const groups = dialog(w).findAll('.dup-group');
    expect(groups).toHaveLength(2);
    for (const g of groups)
      expect(g.findAll('a').map((a) => a.attributes('href'))).toEqual([`${BASE}/item/d1`]);
  });

  it('FR-010: every certain duplicate is shown (7 → 7 links)', async () => {
    const matches = Array.from({ length: 7 }, (_, i) => item(`d${i}`, CABLE));
    const w = await mountSummary(purchase([product('a', CABLE)]), { [CABLE]: check({ matches }) });
    await add(w);
    expect(links(w)).toHaveLength(7);
  });

  it('US3-4 / SC-002: the dialog keeps the DUPLICATE_SUSPECTED title with a certain duplicate alone', async () => {
    const w = await mountSummary(purchase([product('a', CABLE)]), {
      [CABLE]: check({ matches: [item('d1', CABLE)] }),
    });
    await add(w);
    expect(dialog(w).find('#dup').text()).toContain('Un objet semblable existe déjà dans HomeBox.');
  });
});
