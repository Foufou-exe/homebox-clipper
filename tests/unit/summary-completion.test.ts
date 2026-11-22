import { flushPromises, mount } from '@vue/test-utils';
import { fail, ok, type Result } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  CompletionPreview,
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  DuplicateCheck,
  DuplicateMatch,
  ImportDraft,
} from '@/shared/types';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { loadCatalog, setTestLanguage } from './i18n-harness';

// Spec 021 (contracts/ui-completion.md §6): "Complete the existing item" in the duplicate dialog, the confirmation that
// lists the changes, and the single submit. `send` is mocked; texts come from the real catalogs (setup-i18n.ts).
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
  instances: [
    {
      id: 'inst-a',
      name: 'homebox.example.com',
      baseUrl: BASE,
      maskedKey: 'hb_••••a1b2',
      lastCheck: null,
      keyState: 'ready',
    },
  ],
  defaultInstanceId: 'inst-a',
};
const found = <T>(value: T) => ({ value, selector: 'x' });
const product = (key: string, name: string, quantity = 1): DetectedProduct => ({
  key,
  name: found(name),
  unitPrice: found(49.99),
  currency: found('EUR'),
  quantity: found(quantity),
  imageUrl: { value: null, reason: 'not_found' },
  seller: found('Amazon EU S.à r.l.'),
});
const purchase = (products: DetectedProduct[]): DetectedPurchase => ({
  source: 'amazon.fr',
  pageUrl: 'https://www.amazon.fr/x',
  orderNumber: found(NUMBER),
  orderDate: found('2026-01-15'),
  seller: found('Amazon EU S.à r.l.'),
  products,
  documents: [
    {
      id: 'detected-0',
      origin: 'detected',
      kind: 'invoice',
      label: `facture-${NUMBER}.pdf`,
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

const KEYBOARD = 'Clavier sans fil Exemple Pro';
const MOUSE = 'Souris sans fil Exemple';
const LAMP = 'Lampe de bureau';

const preview = (
  entityId: string,
  over: Partial<CompletionPreview> = {},
): Result<CompletionPreview> =>
  ok({
    entityId,
    itemName: `${KEYBOARD} (HomeBox)`,
    quantity: 2,
    changes: [
      { key: 'doc:detected-0', category: 'attachments' },
      { key: 'tag:amazon', category: 'tags' },
      { key: 'purchasePrice', category: 'purchase' },
      { key: 'purchaseDate', category: 'purchase' },
    ],
    filled: ['purchaseFrom'],
    ...over,
  });

type Previews = Record<string, Result<CompletionPreview>>;

async function mountSummary(
  p: DetectedPurchase,
  replies: Record<string, Result<DuplicateCheck>>,
  previews: Previews = {},
) {
  vi.mocked(send).mockImplementation(((msg: { type: string; name?: string; entityId?: string }) => {
    if (msg.type === 'detect/run') return Promise.resolve(ok({ purchase: p, warnings: [] }));
    if (msg.type === 'tag/list') return Promise.resolve(ok({ tags: [] }));
    if (msg.type === 'duplicate/check') return Promise.resolve(replies[msg.name ?? ''] ?? check());
    if (msg.type === 'import/complete-preview')
      return Promise.resolve(previews[msg.entityId ?? ''] ?? fail('ITEM_NOT_FOUND', 404));
    if (msg.type === 'template/list')
      return Promise.resolve(ok({ templates: [], defaultTemplate: null, defaultState: 'none' }));
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
const dupDialog = (w: Mounted) => w.find('[role="alertdialog"][aria-labelledby="dup"]');
const confirmation = (w: Mounted) => w.find('.completion-dialog[role="alertdialog"]');
const buttonIn = (root: ReturnType<Mounted['find']>, text: string) =>
  root.findAll('button').find((b) => b.text() === text)!;
const radios = (w: Mounted) => dupDialog(w).findAll('input[type="radio"]');
const submitted = (w: Mounted) => w.emitted('submit') as [{ drafts: ImportDraft[] }][] | undefined;
const previewsSent = () =>
  vi
    .mocked(send)
    .mock.calls.map(([m]) => m)
    .filter((m) => m.type === 'import/complete-preview') as unknown as {
    instanceId: string;
    entityId: string;
    draft: ImportDraft;
  }[];
const category = (w: Mounted, name: string) =>
  confirmation(w).find(`input[type="checkbox"][data-category="${name}"]`);

async function chooseComplete(w: Mounted, entityId: string) {
  const radio = radios(w).find((r) => (r.element as HTMLInputElement).value === entityId)!;
  await radio.setValue(true);
  await flushPromises();
}
async function review(w: Mounted) {
  await buttonIn(dupDialog(w), fr['completion.reviewChanges']!).trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.mocked(send).mockReset();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SummaryView: choices in the duplicate dialog (021, U1 to U3)', () => {
  it('U1: one fieldset per group; a "create" radio (checked) and one radio per item; no combobox/listbox', async () => {
    const w = await mountSummary(purchase([product('a', KEYBOARD), product('b', MOUSE)]), {
      [KEYBOARD]: check({
        matches: [item('d1', KEYBOARD)],
        similar: [item('s1', 'Clavier Exemple')],
      }),
      [MOUSE]: check({ similar: [item('s2', 'Souris Exemple')] }),
    });
    await add(w);
    const sets = dupDialog(w).findAll('fieldset');
    expect(sets).toHaveLength(2);
    expect(sets[0]!.find('legend').text()).toBe(
      fr['completion.choiceLegend']!.replace('$1', KEYBOARD),
    );
    const first = sets[0]!.findAll('input[type="radio"]').map((r) => r.element as HTMLInputElement);
    expect(first.map((r) => r.value)).toEqual(['create', 'd1', 's1']);
    expect(first.map((r) => r.checked)).toEqual([true, false, false]);
    expect(new Set(first.map((r) => r.name)).size).toBe(1);
    expect(
      sets[1]!.findAll('input[type="radio"]').map((r) => (r.element as HTMLInputElement).value),
    ).toEqual(['create', 's2']);
    expect(first[0]!.name).not.toBe(
      (sets[1]!.find('input[type="radio"]').element as HTMLInputElement).name,
    );
    expect(dupDialog(w).find('[role="combobox"], [role="listbox"]').exists()).toBe(false);
  });

  it('U2: no "Complete" chosen → the primary button stays "Créer quand même"', async () => {
    const w = await mountSummary(purchase([product('a', KEYBOARD)]), {
      [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }),
    });
    await add(w);
    expect(dupDialog(w).find('button.primary').text()).toBe(fr['summary.createAnyway']);
  });

  it('U3: one "Complete" → "Voir les changements"; one complete-preview per chosen product, on the target instance', async () => {
    const w = await mountSummary(
      purchase([product('a', KEYBOARD), product('b', MOUSE)]),
      {
        [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }),
        [MOUSE]: check({ similar: [item('s2', 'Souris Exemple')] }),
      },
      { d1: preview('d1') },
    );
    await add(w);
    await chooseComplete(w, 'd1');
    expect(dupDialog(w).find('button.primary').text()).toBe(fr['completion.reviewChanges']);
    await review(w);
    const sent = previewsSent();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'import/complete-preview',
      instanceId: 'inst-a',
      entityId: 'd1',
    });
    expect(sent[0]!.draft.name).toBe(KEYBOARD);
    expect(sent[0]!.draft).not.toHaveProperty('complete');
    expect(sent[0]!.draft).not.toHaveProperty('template');
    expect(sent[0]!.draft.location).toBeNull();
    expect(submitted(w)).toBeUndefined();
  });
});

describe('SummaryView: the completion confirmation (021, U4, U5, U7, U10, U11)', () => {
  async function opened(previews: Previews = { d1: preview('d1') }) {
    const w = await mountSummary(
      purchase([product('a', KEYBOARD)]),
      { [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }) },
      previews,
    );
    await add(w);
    await chooseComplete(w, 'd1');
    await review(w);
    return w;
  }

  it('U4: categories checked (with changes) / disabled (without); labels with values; filled without values; quantity unchecked', async () => {
    const w = await opened();
    const c = confirmation(w);
    expect(c.exists()).toBe(true);
    for (const name of ['attachments', 'tags', 'purchase']) {
      expect((category(w, name).element as HTMLInputElement).checked, name).toBe(true);
      expect((category(w, name).element as HTMLInputElement).disabled, name).toBe(false);
    }
    expect((category(w, 'order').element as HTMLInputElement).checked).toBe(false);
    expect((category(w, 'order').element as HTMLInputElement).disabled).toBe(true);
    const text = c.text();
    expect(text).toContain(`Facture : facture-${NUMBER}.pdf`);
    expect(text).toContain('Tag : Amazon');
    expect(text).toMatch(/Prix : 49,99\s€/);
    expect(text).toContain(fr['completion.change.purchaseDate']!.replace('$1', '15/01/2026'));
    expect(text).toContain(`${fr['completion.filled']!.replace('$1', 'vendeur')}`);
    expect(c.find('a').attributes('href')).toBe(`${BASE}/item/d1`);
    expect(c.find('a').text()).toBe(`${KEYBOARD} (HomeBox)`);
    const quantity = c.find('input[type="checkbox"][data-quantity]');
    expect((quantity.element as HTMLInputElement).checked).toBe(false);
    expect(quantity.element.closest('label')!.textContent).toContain(
      'Augmenter la quantité de 1 (actuellement 2)',
    );
  });

  it('U5: unchecking "Tags" then Confirm → complete.keys without tag:*; a single submit', async () => {
    const w = await opened();
    await category(w, 'tags').setValue(false);
    await buttonIn(confirmation(w), fr['completion.confirm']!).trigger('click');
    await flushPromises();
    expect(submitted(w)).toHaveLength(1);
    const [d] = submitted(w)![0]![0].drafts;
    expect(d!.complete).toEqual({
      entityId: 'd1',
      itemName: `${KEYBOARD} (HomeBox)`,
      keys: ['doc:detected-0', 'purchasePrice', 'purchaseDate'],
    });
    expect(d!.location).toBeNull();
    expect(d).not.toHaveProperty('template');
  });

  it('U7: "Retour" → the duplicate dialog, radio still on the chosen item; nothing emitted', async () => {
    const w = await opened();
    await buttonIn(confirmation(w), fr['completion.back']!).trigger('click');
    await flushPromises();
    expect(confirmation(w).exists()).toBe(false);
    expect(dupDialog(w).exists()).toBe(true);
    const checked = radios(w).find((r) => (r.element as HTMLInputElement).checked)!;
    expect((checked.element as HTMLInputElement).value).toBe('d1');
    expect(dupDialog(w).find('button.primary').text()).toBe(fr['completion.reviewChanges']);
    expect(submitted(w)).toBeUndefined();
  });

  it('U10: alertdialog labelled and described; focus on "Retour"; radios named "Compléter <name>"', async () => {
    const w = await mountSummary(
      purchase([product('a', KEYBOARD)]),
      { [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }) },
      { d1: preview('d1') },
    );
    await add(w);
    const radio = radios(w)[1]!;
    const ids = radio.attributes('aria-labelledby')!.split(' ');
    expect(ids.map((id) => document.getElementById(id)!.textContent!.trim()).join(' ')).toBe(
      `${fr['completion.completeItem']} ${KEYBOARD}`,
    );
    expect(radio.element.closest('label')).toBeNull();
    await chooseComplete(w, 'd1');
    await review(w);
    const c = confirmation(w);
    const label = document.getElementById(c.attributes('aria-labelledby')!);
    const help = document.getElementById(c.attributes('aria-describedby')!);
    expect(label!.textContent).toContain(fr['completion.title']);
    expect(help!.textContent).toBe(fr['completion.help']);
    expect((document.activeElement as HTMLElement | null)?.textContent?.trim()).toBe(
      fr['completion.back'],
    );
    expect(c.find('[role="combobox"], [role="listbox"]').exists()).toBe(false);
  });

  it.each(['fr', 'en'] as const)('U11: translated texts, no raw key (%s)', async (lang) => {
    setTestLanguage(lang);
    const cat = lang === 'fr' ? fr : en;
    const w = await mountSummary(
      purchase([product('a', KEYBOARD)]),
      { [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }) },
      { d1: preview('d1') },
    );
    await add(w);
    expect(dupDialog(w).text()).toContain(cat['completion.createNew']);
    expect(dupDialog(w).text()).not.toContain('completion.');
    await chooseComplete(w, 'd1');
    await buttonIn(dupDialog(w), cat['completion.reviewChanges']!).trigger('click');
    await flushPromises();
    const text = confirmation(w).text();
    expect(text).not.toMatch(/completion\.|summary\.|result\./);
    for (const key of [
      'completion.title',
      'completion.help',
      'completion.back',
      'completion.confirm',
      'completion.category.attachments',
    ]) {
      expect(text).toContain(cat[key]);
    }
  });
});

describe('SummaryView: a mixed batch (021, U8)', () => {
  it('U8: one submit; the created line is the one of today; the completed one has location null and no template', async () => {
    const replies = {
      [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }),
      [MOUSE]: check({ similar: [item('s2', 'Souris Exemple')] }),
    };
    const p = purchase([product('a', KEYBOARD), product('b', MOUSE), product('c', LAMP)]);

    const plain = await mountSummary(p, replies);
    await add(plain);
    await buttonIn(dupDialog(plain), fr['summary.createAnyway']!).trigger('click');
    await flushPromises();
    const reference = submitted(plain)![0]![0].drafts;
    plain.unmount();

    const w = await mountSummary(p, replies, { d1: preview('d1') });
    await add(w);
    await chooseComplete(w, 'd1');
    await review(w);
    await buttonIn(confirmation(w), fr['completion.confirm']!).trigger('click');
    await flushPromises();
    expect(submitted(w)).toHaveLength(1);
    const drafts = submitted(w)![0]![0].drafts;
    expect(drafts.map((d) => d.name)).toEqual([KEYBOARD, MOUSE, LAMP]);
    expect(drafts[1]).toEqual(reference[1]);
    expect(drafts[2]).toEqual(reference[2]);
    expect(drafts[0]!.complete?.entityId).toBe('d1');
    expect(drafts[0]!.location).toBeNull();
    expect(drafts[0]).not.toHaveProperty('template');
  });
});

describe('SummaryView: a failed preview (021, U9)', () => {
  it('U9: ITEM_NOT_FOUND → translated message in the confirmation; "Confirmer" disabled; nothing emitted', async () => {
    const w = await mountSummary(
      purchase([product('a', KEYBOARD)]),
      { [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }) },
      {
        d1: fail('ITEM_NOT_FOUND', 404),
      },
    );
    await add(w);
    await chooseComplete(w, 'd1');
    await review(w);
    const c = confirmation(w);
    expect(c.find('[role="alert"]').text()).toBe(fr['error.ITEM_NOT_FOUND']);
    const confirmButton = buttonIn(c, fr['completion.confirm']!);
    expect((confirmButton.element as HTMLButtonElement).disabled).toBe(true);
    await confirmButton.trigger('click');
    await flushPromises();
    expect(submitted(w)).toBeUndefined();
  });

  it('a rejected send is a failure of that preview, never a silent success', async () => {
    const w = await mountSummary(purchase([product('a', KEYBOARD)]), {
      [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }),
    });
    await add(w);
    await chooseComplete(w, 'd1');
    vi.mocked(send).mockImplementationOnce((() =>
      Promise.reject(new Error('port closed'))) as never);
    await review(w);
    expect(confirmation(w).find('[role="alert"]').text()).toBe(fr['error.HOMEBOX_UNREACHABLE']);
    expect(
      (buttonIn(confirmation(w), fr['completion.confirm']!).element as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('SummaryView: labels of each category (021, US3, US4)', () => {
  async function confirmationWith(
    changes: CompletionPreview['changes'],
    filled: CompletionPreview['filled'] = [],
  ) {
    const w = await mountSummary(
      purchase([product('a', KEYBOARD)]),
      { [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }) },
      {
        d1: preview('d1', { changes, filled }),
      },
    );
    await add(w);
    await chooseComplete(w, 'd1');
    await review(w);
    return confirmation(w);
  }

  it('US3: "Prix : …", "Date d\'achat : …", "Garantie jusqu\'au : …"; "déjà renseigné : vendeur" without its value', async () => {
    const c = await confirmationWith(
      [
        { key: 'purchasePrice', category: 'purchase' },
        { key: 'purchaseDate', category: 'purchase' },
        { key: 'warrantyExpires', category: 'purchase' },
      ],
      ['purchaseFrom'],
    );
    const items = c.findAll('li').map((li) => li.text());
    expect(items[0]).toMatch(/^Prix : 49,99\s€$/);
    expect(items[1]).toBe(fr['completion.change.purchaseDate']!.replace('$1', '15/01/2026'));
    expect(items[2]).toMatch(/^Garantie jusqu'au : \d{2}\/\d{2}\/\d{4}$/);
    expect(c.text()).toContain(
      fr['completion.filled']!.replace('$1', fr['completion.name.purchaseFrom']!),
    );
    expect(c.text()).not.toContain('Amazon EU');
  });

  it('US4: "Champ « Order number » : …" and "Ligne ajoutée aux notes : …" (option on)', async () => {
    vi.mocked(send).mockReset();
    const p = purchase([product('a', KEYBOARD)]);
    vi.mocked(send).mockImplementation(((msg: { type: string; entityId?: string }) => {
      if (msg.type === 'detect/run') return Promise.resolve(ok({ purchase: p, warnings: [] }));
      if (msg.type === 'tag/list') return Promise.resolve(ok({ tags: [] }));
      if (msg.type === 'duplicate/check')
        return Promise.resolve(check({ matches: [item('d1', KEYBOARD)] }));
      if (msg.type === 'order-fields/get') {
        return Promise.resolve(
          ok({
            settings: {
              enabled: true,
              names: { orderNumber: 'Order number', merchant: 'Merchant', orderUrl: 'Order URL' },
            },
          }),
        );
      }
      if (msg.type === 'import/complete-preview') {
        return Promise.resolve(
          preview('d1', {
            changes: [
              { key: 'field:orderNumber', category: 'order' },
              { key: 'notes', category: 'order' },
            ],
            filled: ['field:merchant'],
          }),
        );
      }
      if (msg.type === 'template/list')
        return Promise.resolve(ok({ templates: [], defaultTemplate: null, defaultState: 'none' }));
      return Promise.resolve(ok({ locations: [], lastUsedId: null }));
    }) as never);
    const w = mount(SummaryView, { props: { tabId: 1, config }, attachTo: document.body });
    await flushPromises();
    await add(w);
    await chooseComplete(w, 'd1');
    await review(w);
    const c = confirmation(w);
    const items = c.findAll('li').map((li) => li.text());
    expect(items).toContain(`Champ « Order number » : ${NUMBER}`);
    expect(items).toContain(`Ligne ajoutée aux notes : Commande Amazon.fr : ${NUMBER}`);
    expect(c.text()).toContain(fr['completion.filled']!.replace('$1', 'le champ « Merchant »'));
    expect(previewsSent()[0]!.draft.orderFields?.map((f) => f.role)).toEqual([
      'orderNumber',
      'merchant',
      'orderUrl',
    ]);
    await buttonIn(c, fr['completion.confirm']!).trigger('click');
    await flushPromises();
    const [d] = submitted(w)![0]![0].drafts;
    expect(d!.complete?.keys).toEqual(['field:orderNumber', 'notes']);
    expect(d!.orderFields?.map((f) => f.role)).toEqual(['orderNumber', 'merchant', 'orderUrl']);
  });

  it('US4: order fields are not sent for a completed line without any confirmed field', async () => {
    const w = await mountSummary(
      purchase([product('a', KEYBOARD)]),
      { [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }) },
      {
        d1: preview('d1'),
      },
    );
    await add(w);
    await chooseComplete(w, 'd1');
    await review(w);
    await buttonIn(confirmation(w), fr['completion.confirm']!).trigger('click');
    await flushPromises();
    expect(submitted(w)![0]![0].drafts[0]).not.toHaveProperty('orderFields');
  });
});

describe('SummaryView: quantity (021, US5, U6)', () => {
  it('U6: box unchecked by default; checked → quantityIncrease === draft.quantity', async () => {
    const w = await mountSummary(
      purchase([product('a', KEYBOARD, 3)]),
      { [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }) },
      {
        d1: preview('d1'),
      },
    );
    await add(w);
    await chooseComplete(w, 'd1');
    await review(w);
    const box = confirmation(w).find('input[type="checkbox"][data-quantity]');
    expect((box.element as HTMLInputElement).checked).toBe(false);
    expect(box.element.closest('label')!.textContent).toContain(
      'Augmenter la quantité de 3 (actuellement 2)',
    );
    await box.setValue(true);
    await buttonIn(confirmation(w), fr['completion.confirm']!).trigger('click');
    await flushPromises();
    const [d] = submitted(w)![0]![0].drafts;
    expect(d!.quantity).toBe(3);
    expect(d!.complete?.quantityIncrease).toBe(3);
  });

  it('box left unchecked → no quantityIncrease', async () => {
    const w = await mountSummary(
      purchase([product('a', KEYBOARD)]),
      { [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }) },
      {
        d1: preview('d1'),
      },
    );
    await add(w);
    await chooseComplete(w, 'd1');
    await review(w);
    await buttonIn(confirmation(w), fr['completion.confirm']!).trigger('click');
    await flushPromises();
    expect(submitted(w)![0]![0].drafts[0]!.complete).not.toHaveProperty('quantityIncrease');
  });
});

describe('SummaryView: similar items and mixed batches (021, US6)', () => {
  it('a similar item can be completed: same flow as a certain duplicate', async () => {
    const w = await mountSummary(
      purchase([product('a', KEYBOARD)]),
      { [KEYBOARD]: check({ similar: [item('s1', 'Clavier Exemple')] }) },
      {
        s1: preview('s1', { itemName: 'Clavier Exemple' }),
      },
    );
    await add(w);
    await chooseComplete(w, 's1');
    await review(w);
    expect(previewsSent().map((m) => m.entityId)).toEqual(['s1']);
    await buttonIn(confirmation(w), fr['completion.confirm']!).trigger('click');
    await flushPromises();
    expect(submitted(w)![0]![0].drafts[0]!.complete).toMatchObject({
      entityId: 's1',
      itemName: 'Clavier Exemple',
    });
  });

  it('three products (created, certain duplicate completed, similar item completed) → one submit', async () => {
    const w = await mountSummary(
      purchase([product('a', LAMP), product('b', KEYBOARD), product('c', MOUSE)]),
      {
        [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }),
        [MOUSE]: check({ similar: [item('s2', 'Souris Exemple')] }),
      },
      { d1: preview('d1'), s2: preview('s2', { itemName: 'Souris Exemple' }) },
    );
    await add(w);
    await chooseComplete(w, 'd1');
    await chooseComplete(w, 's2');
    await review(w);
    expect(previewsSent().map((m) => m.entityId)).toEqual(['d1', 's2']);
    expect(confirmation(w).findAll('.completion-item')).toHaveLength(2);
    await buttonIn(confirmation(w), fr['completion.confirm']!).trigger('click');
    await flushPromises();
    expect(submitted(w)).toHaveLength(1);
    const drafts = submitted(w)![0]![0].drafts;
    expect(drafts.map((d) => d.complete?.entityId ?? null)).toEqual([null, 'd1', 's2']);
    expect(drafts[0]).not.toHaveProperty('complete');
  });

  it('two products may choose the same item', async () => {
    const shared = item('d1', KEYBOARD);
    const w = await mountSummary(
      purchase([product('a', KEYBOARD), product('b', `${KEYBOARD} `)]),
      { [KEYBOARD]: check({ matches: [shared] }), [`${KEYBOARD} `]: check({ matches: [shared] }) },
      { d1: preview('d1') },
    );
    await add(w);
    const sets = dupDialog(w).findAll('fieldset');
    await sets[0]!.findAll('input[type="radio"]')[1]!.setValue(true);
    await sets[1]!.findAll('input[type="radio"]')[1]!.setValue(true);
    await flushPromises();
    await review(w);
    await buttonIn(confirmation(w), fr['completion.confirm']!).trigger('click');
    await flushPromises();
    expect(submitted(w)![0]![0].drafts.map((d) => d.complete?.entityId)).toEqual(['d1', 'd1']);
  });
});

describe('SummaryView: while the previews run (021, review M3)', () => {
  it('radios and "Annuler" are disabled; the confirmation opens once the answers arrive', async () => {
    const w = await mountSummary(purchase([product('a', KEYBOARD)]), {
      [KEYBOARD]: check({ matches: [item('d1', KEYBOARD)] }),
    });
    await add(w);
    await chooseComplete(w, 'd1');
    let release!: (r: Result<CompletionPreview>) => void;
    const base = vi.mocked(send).getMockImplementation()!;
    vi.mocked(send).mockImplementation(((msg: { type: string }) =>
      msg.type === 'import/complete-preview'
        ? new Promise((r) => (release = r))
        : base(msg as never)) as never);
    await buttonIn(dupDialog(w), fr['completion.reviewChanges']!).trigger('click');
    await flushPromises();
    for (const r of radios(w)) expect((r.element as HTMLInputElement).disabled).toBe(true);
    const cancel = buttonIn(dupDialog(w), fr['summary.cancel']!);
    expect((cancel.element as HTMLButtonElement).disabled).toBe(true);
    expect((dupDialog(w).find('button.primary').element as HTMLButtonElement).disabled).toBe(true);
    release(preview('d1'));
    await flushPromises();
    expect(confirmation(w).exists()).toBe(true);
  });
});
