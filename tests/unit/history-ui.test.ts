import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, HistoryEntryView, HistoryListView } from '@/shared/types';
import HistoryList from '@/ui/components/HistoryList.vue';
import HistoryCard from '@/ui/options/HistoryCard.vue';
import OptionsApp from '@/ui/options/App.vue';
import PopupApp from '@/ui/popup/App.vue';
import HistoryView from '@/ui/popup/HistoryView.vue';
import SummaryView from '@/ui/popup/SummaryView.vue';
import { formatDate, formatDateTime } from '@/ui/i18n';

vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const BASE = 'https://homebox.example.com';

const historyEntry = (over: Partial<HistoryEntryView> = {}): HistoryEntryView => ({
  v: 1,
  id: 'h1',
  importedAt: '2026-11-12T10:00:00.000Z',
  name: 'Clavier sans fil Exemple Pro',
  merchantId: 'amazon.fr',
  orderNumber: '999-0000000-0000001',
  purchaseDate: '2026-10-22',
  instance: BASE,
  entityId: 'entity-1',
  status: 'complete',
  missing: [],
  reason: null,
  resumable: false,
  ...over,
});

const ready = (entries: HistoryEntryView[], enabled = true): HistoryListView => ({
  state: 'ready',
  enabled,
  entries,
});

/** `send` answers `history/list` with `view`, and `ok(undefined)` for the other history messages. */
function serve(
  view: HistoryListView | (() => HistoryListView),
  extra: Record<string, unknown> = {},
) {
  vi.mocked(send).mockImplementation((msg) => {
    if (msg.type === 'history/list')
      return Promise.resolve(ok(typeof view === 'function' ? view() : view)) as never;
    if (msg.type in extra) return Promise.resolve(extra[msg.type]) as never;
    return Promise.resolve(ok(undefined)) as never;
  });
}

async function list(view: HistoryListView, props: Record<string, unknown> = {}) {
  serve(view);
  const wrapper = mount(HistoryList, {
    props: { baseUrl: BASE, variant: 'popup', ...props },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

const items = (w: VueWrapper) => w.findAll('li.entry');

describe('HistoryList (012, US1, contracts/ui.md)', () => {
  beforeEach(() => {
    vi.mocked(send).mockReset();
  });

  it('loading: popup.loading in role=status, then the list', async () => {
    serve(ready([historyEntry()]));
    const wrapper = mount(HistoryList, { props: { baseUrl: BASE, variant: 'popup' } });
    expect(wrapper.find('[role="status"]').text()).toBe('Chargement…');
    await flushPromises();
    expect(send).toHaveBeenCalledWith({ type: 'history/list' });
    expect(items(wrapper)).toHaveLength(1);
  });

  it('entries most recent first, with name, store, date, status text and purchase date (US1-1)', async () => {
    const wrapper = await list(
      ready([
        historyEntry({
          id: 'a',
          name: 'Produit récent',
          orderNumber: null,
          importedAt: '2026-11-12T10:00:00.000Z',
        }),
        historyEntry({
          id: 'b',
          name: 'Produit ancien',
          orderNumber: null,
          merchantId: 'amazon.de',
          importedAt: '2026-11-01T10:00:00.000Z',
          purchaseDate: null,
        }),
      ]),
    );
    const [first, second] = items(wrapper);
    expect(first!.find('strong').text()).toBe('Produit récent');
    expect(first!.text()).toContain('Amazon.fr');
    expect(first!.text()).toContain(`Importé le ${formatDateTime('2026-11-12T10:00:00.000Z')}`);
    expect(first!.text()).toContain(`Acheté le ${formatDate('2026-10-22')}`);
    expect(first!.find('.badge').text()).toBe('Complet');
    expect(second!.text()).toContain('Amazon.de');
    expect(second!.text()).not.toContain('Acheté le');
  });

  it('store: catalog name, otherwise raw identifier, otherwise manual entry', async () => {
    const wrapper = await list(
      ready([
        historyEntry({ id: 'a', orderNumber: null, merchantId: 'amazon.fr' }),
        historyEntry({ id: 'b', orderNumber: null, merchantId: 'shop.example' as never }),
        historyEntry({ id: 'c', orderNumber: null, merchantId: null }),
      ]),
    );
    const texts = items(wrapper).map((i) => i.find('.store').text());
    expect(texts).toEqual(['Amazon.fr', 'shop.example', 'Saisie manuelle']);
  });

  it.each([
    ['complete', 'Complet', 'badge-complete'],
    ['partial', 'Partiel', 'badge-partial'],
    ['running', 'En cours', 'badge-running'],
    ['failed', 'Échoué', 'badge-failed'],
  ] as const)('status %s: text badge "%s"', async (status, text, cls) => {
    const wrapper = await list(
      ready([historyEntry({ status, entityId: status === 'failed' ? null : 'e' })]),
    );
    const badge = wrapper.find('.badge');
    expect(badge.text()).toBe(text);
    expect(badge.classes()).toContain(cls);
  });

  it('order of several products: one entry per product under an h3 order group (US1-3); no number: no group', async () => {
    const wrapper = await list(
      ready([
        historyEntry({ id: 'a', name: 'A' }),
        historyEntry({ id: 'b', name: 'B' }),
        historyEntry({ id: 'm', name: 'Manuel', orderNumber: null, merchantId: null }),
      ]),
    );
    const headings = wrapper.findAll('h3');
    expect(headings).toHaveLength(1);
    expect(headings[0]!.text()).toBe('Commande 999-0000000-0000001 · Amazon.fr');
    const group = wrapper.find('li.group');
    expect(group.findAll('li.entry').map((l) => l.find('strong').text())).toEqual(['A', 'B']);
    expect(items(wrapper)).toHaveLength(3);
  });

  it('empty list: history.empty in role=status (US1-4); disabled: history.disabledNotice', async () => {
    const empty = await list(ready([]));
    expect(empty.find('p[role="status"]').text()).toContain('Aucun import pour l’instant.');
    const disabled = await list(ready([], false));
    expect(disabled.text()).toContain('L’historique est désactivé');
  });

  describe('"Open in HomeBox" link (FR-005)', () => {
    it('only with entityId and the same instance: itemUrl, new tab, noopener, named by the product', async () => {
      const wrapper = await list(ready([historyEntry({ entityId: 'ent/1' })]));
      const a = wrapper.find('a');
      expect(a.text()).toBe('Ouvrir dans HomeBox');
      expect(a.attributes('href')).toBe(`${BASE}/item/ent%2F1`);
      expect(a.attributes('target')).toBe('_blank');
      expect(a.attributes('rel')).toBe('noopener');
      expect(a.attributes('aria-label')).toBe(
        'Ouvrir Clavier sans fil Exemple Pro dans HomeBox (nouvel onglet)',
      );
    });

    it('other instance: history.otherInstance with the original address, no link', async () => {
      const wrapper = await list(
        ready([historyEntry({ instance: 'https://ancienne.example.com' })]),
      );
      expect(wrapper.find('a').exists()).toBe(false);
      expect(wrapper.text()).toContain(
        'Importé vers une autre instance HomeBox (https://ancienne.example.com) : pas de lien.',
      );
    });

    it('without entityId: no link', async () => {
      const wrapper = await list(
        ready([historyEntry({ status: 'failed', entityId: null, reason: 'CREATE_FAILED' })]),
      );
      expect(wrapper.find('a').exists()).toBe(false);
    });
  });

  describe('locked and unavailable (Q-U37, FR-014)', () => {
    it('popup, locked: history.locked + hint in role=status, unlock button emits, no name nor number', async () => {
      const wrapper = await list({ state: 'locked', enabled: true, entries: [] });
      const status = wrapper.find('p[role="status"]');
      expect(status.text()).toBe('Historique verrouillé');
      expect(wrapper.text()).toContain('Votre historique est chiffré avec votre phrase de passe.');
      expect(wrapper.text()).not.toContain('Clavier');
      expect(wrapper.text()).not.toContain('999-');
      const unlock = wrapper.findAll('button').find((b) => b.text() === 'Déverrouiller')!;
      await unlock.trigger('click');
      expect(wrapper.emitted('unlock')).toHaveLength(1);
    });

    it('options, locked: history.lockedOptionsHint, no unlock button', async () => {
      const wrapper = await list(
        { state: 'locked', enabled: true, entries: [] },
        { variant: 'options' },
      );
      expect(wrapper.text()).toContain('Ouvrez l’extension depuis la barre d’outils');
      expect(wrapper.findAll('button').some((b) => b.text() === 'Déverrouiller')).toBe(false);
    });

    it('unavailable: history.unavailable', async () => {
      const wrapper = await list({ state: 'unavailable', enabled: true, entries: [] });
      expect(wrapper.text()).toContain(
        'L’historique est conservé dès qu’une phrase de passe protège votre clé API.',
      );
    });

    it('read error: history.loadError in role=alert', async () => {
      vi.mocked(send).mockResolvedValue(fail('BAD_MESSAGE') as never);
      const wrapper = mount(HistoryList, { props: { baseUrl: BASE, variant: 'popup' } });
      await flushPromises();
      expect(wrapper.find('[role="alert"]').text()).toBe('L’historique n’a pas pu être lu.');
    });
  });

  it('reload() reads the list again', async () => {
    const wrapper = await list(ready([]));
    serve(ready([historyEntry()]));
    await (wrapper.vm as unknown as { reload(): Promise<void> }).reload();
    await flushPromises();
    expect(items(wrapper)).toHaveLength(1);
  });
});

describe('popup: history view (Q-U23, SC-002)', () => {
  const config = (over: Partial<ConfigView> = {}): ConfigView => ({
    configured: true,
    baseUrl: BASE,
    lastCheck: null,
    ...over,
  });
  const purchase = {
    source: 'amazon.fr',
    pageUrl: 'https://www.amazon.fr/x',
    orderNumber: { value: '999-0000000-0000001', selector: 'x' },
    orderDate: { value: '2026-10-22', selector: 'x' },
    seller: { value: 'Vendeur Exemple', selector: 'x' },
    products: [
      {
        key: 'a',
        name: { value: 'Clavier sans fil Exemple Pro', selector: 'x' },
        unitPrice: { value: 9.9, selector: 'x' },
        currency: { value: 'EUR', selector: 'x' },
        quantity: { value: 1, selector: 'x' },
        imageUrl: { value: null, reason: 'not_found' },
      },
    ],
    documents: [],
  };

  function popup(view: ConfigView) {
    vi.mocked(send).mockImplementation((msg) => {
      if (msg.type === 'config/get') return Promise.resolve(view) as never;
      if (msg.type === 'import/pending') return Promise.resolve([]) as never;
      if (msg.type === 'detect/run')
        return Promise.resolve(ok({ purchase, warnings: [] })) as never;
      if (msg.type === 'location/list')
        return Promise.resolve(ok({ locations: [], lastUsedId: null })) as never;
      if (msg.type === 'history/list') return Promise.resolve(ok(ready([historyEntry()]))) as never;
      return Promise.resolve(ok(undefined)) as never;
    });
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([
      { id: 1, url: 'https://www.amazon.fr/x' },
    ] as never);
  }
  const historyButton = (w: VueWrapper) =>
    w.find('button[aria-label="Ouvrir l’historique des imports"]');

  beforeEach(() => {
    vi.mocked(send).mockReset();
    fakeBrowser.reset();
  });

  it('the header button is visible as soon as configured, locked included, with aria-label and title', async () => {
    popup(config({ locked: true }));
    const locked = mount(PopupApp, { attachTo: document.body });
    await flushPromises();
    expect(historyButton(locked).exists()).toBe(true);
    expect(historyButton(locked).attributes('title')).toBe('Historique');
    locked.unmount();

    popup({ configured: false });
    const none = mount(PopupApp);
    await flushPromises();
    expect(historyButton(none).exists()).toBe(false);
  });

  it('opening then closing keeps the summary mounted with its input; detect/run called once', async () => {
    popup(config({ locked: false }));
    const wrapper = mount(PopupApp, { attachTo: document.body });
    await flushPromises();
    const summary = wrapper.findComponent(SummaryView);
    expect(summary.exists()).toBe(true);
    const input = summary.find('input[type="text"], input:not([type])');
    await input.setValue('Saisie modifiée');

    await historyButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(HistoryView).exists()).toBe(true);
    expect(document.activeElement?.tagName).toBe('H2');
    expect(wrapper.find('h2').attributes('tabindex')).toBe('-1');
    expect(wrapper.text()).toContain('Clavier sans fil Exemple Pro');
    expect((summary.element as HTMLElement).closest('[style*="display: none"]')).not.toBeNull();

    const back = wrapper.findComponent(HistoryView).find('button');
    expect(back.text()).toBe('Retour');
    await back.trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(HistoryView).exists()).toBe(false);
    expect(wrapper.findComponent(SummaryView).element).toBe(summary.element);
    expect(
      (summary.find('input[type="text"], input:not([type])').element as HTMLInputElement).value,
    ).toBe('Saisie modifiée');
    expect(vi.mocked(send).mock.calls.filter(([m]) => m.type === 'detect/run')).toHaveLength(1);
    expect(document.activeElement).toBe(historyButton(wrapper).element);
    wrapper.unmount();
  });

  it('Escape closes the view and gives the focus back to the header button', async () => {
    popup(config({ locked: false }));
    const wrapper = mount(PopupApp, { attachTo: document.body });
    await flushPromises();
    await historyButton(wrapper).trigger('click');
    await flushPromises();
    await wrapper.findComponent(HistoryView).trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(wrapper.findComponent(HistoryView).exists()).toBe(false);
    expect(document.activeElement).toBe(historyButton(wrapper).element);
    wrapper.unmount();
  });

  it('locked: the unlock button closes the view and shows the unlock screen', async () => {
    popup(config({ locked: true }));
    vi.mocked(send).mockImplementation((msg) => {
      if (msg.type === 'config/get') return Promise.resolve(config({ locked: true })) as never;
      if (msg.type === 'history/list')
        return Promise.resolve(ok({ state: 'locked', enabled: true, entries: [] })) as never;
      return Promise.resolve(ok(undefined)) as never;
    });
    const wrapper = mount(PopupApp, { attachTo: document.body });
    await flushPromises();
    await historyButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Historique verrouillé');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Déverrouiller')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(HistoryView).exists()).toBe(false);
    expect(wrapper.find('input[type="password"]').isVisible()).toBe(true);
    wrapper.unmount();
  });
});

describe('options: history card (US1)', () => {
  beforeEach(() => {
    vi.mocked(send).mockReset();
  });

  it('the card sits between the instance card and the appearance card, and shows the list', async () => {
    vi.mocked(send).mockImplementation((msg) => {
      if (msg.type === 'config/get')
        return Promise.resolve({
          configured: true,
          baseUrl: BASE,
          lastCheck: null,
          locked: false,
        }) as never;
      if (msg.type === 'history/list') return Promise.resolve(ok(ready([historyEntry()]))) as never;
      return Promise.resolve(ok(undefined)) as never;
    });
    const wrapper = mount(OptionsApp);
    await flushPromises();
    const cards = wrapper.findAll('section.card');
    const titles = cards.map((c) => c.find('h1, h2').text());
    const i = titles.indexOf('Historique des imports');
    expect(i).toBe(1);
    expect(titles[2]).toBe('Apparence');
    expect(
      cards[1]!.findComponent(HistoryCard).exists() ||
        cards[1]!.findComponent(HistoryList).exists(),
    ).toBe(true);
    expect(cards[1]!.text()).toContain('Clavier sans fil Exemple Pro');
    expect(cards[1]!.find('a').attributes('href')).toBe(`${BASE}/item/entity-1`);
  });
});

describe('HistoryList: incomplete imports (012, US2, Q-U21)', () => {
  beforeEach(() => {
    vi.mocked(send).mockReset();
  });

  it('partial with a missing invoice: badge and "Manquant : facture non envoyée", link kept (US2-1)', async () => {
    const wrapper = await list(ready([historyEntry({ status: 'partial', missing: ['invoice'], reason: 'ATTACHMENT_FAILED' })]));
    expect(wrapper.find('.badge').text()).toBe('Partiel');
    expect(wrapper.find('.missing').text()).toBe('Manquant : facture non envoyée');
    expect(wrapper.text()).toContain('Raison : L\'objet a été créé mais l\'envoi de la facture a échoué.');
    expect(wrapper.find('a').exists()).toBe(true);
  });

  it('several missing items, joined by the separator', async () => {
    const wrapper = await list(ready([historyEntry({ status: 'partial', missing: ['details', 'invoice', 'documents', 'photo'], reason: 'UPDATE_FAILED' })]));
    expect(wrapper.find('.missing').text()).toBe(
      'Manquant : détails d’achat non enregistrés, facture non envoyée, documents non envoyés, photo non envoyée',
    );
  });

  it('failed: "Échoué" with the translated reason and no HomeBox link (US2-2)', async () => {
    const wrapper = await list(ready([historyEntry({ status: 'failed', entityId: null, reason: 'CREATE_FAILED' })]));
    expect(wrapper.find('.badge').text()).toBe('Échoué');
    expect(wrapper.find('.reason').text()).toBe("Raison : La création de l'objet dans HomeBox a échoué.");
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.find('.missing').exists()).toBe(false);
  });

  it('interrupted: recovery.interrupted; resumable: history.resumable', async () => {
    const wrapper = await list(
      ready([historyEntry({ status: 'partial', missing: ['invoice'], reason: null, interrupted: true, resumable: true })]),
    );
    expect(wrapper.text()).toContain("L'import a été interrompu avant la fin.");
    expect(wrapper.find('.resumable').text()).toBe('Peut être repris : ouvrez la page de la commande, puis l’extension.');
    expect(wrapper.find('.reason').exists()).toBe(false);
  });

  it('complete: no missing line, no reason, not resumable', async () => {
    const wrapper = await list(ready([historyEntry()]));
    expect(wrapper.find('.missing').exists()).toBe(false);
    expect(wrapper.find('.reason').exists()).toBe(false);
    expect(wrapper.find('.resumable').exists()).toBe(false);
  });
});

describe('HistoryList: delete and clear all (012, US3, Q-U22)', () => {
  beforeEach(() => {
    vi.mocked(send).mockReset();
  });

  /** Mounted inside a section with an h2, like the popup view and the options card. */
  async function inSection(view: HistoryListView, variant: 'popup' | 'options' = 'popup') {
    serve(view);
    const host = mount(
      {
        components: { HistoryList },
        template: `<section><h2 tabindex="-1">Titre</h2><HistoryList base-url="${BASE}" variant="${variant}" /></section>`,
      },
      { attachTo: document.body },
    );
    await flushPromises();
    return host;
  }
  const deleteButtons = (w: VueWrapper) => w.findAll('button.delete');
  const clearAll = (w: VueWrapper) => w.find('button.clear-all');

  it('Delete: history/delete, the row disappears, announced, focus on the next Delete button; no confirmation', async () => {
    const w = await inSection(ready([historyEntry({ id: 'a', name: 'A', orderNumber: null }), historyEntry({ id: 'b', name: 'B', orderNumber: null }), historyEntry({ id: 'c', name: 'C', orderNumber: null })]));
    const buttons = deleteButtons(w);
    expect(buttons.map((b) => b.text())).toEqual(['Supprimer', 'Supprimer', 'Supprimer']);
    expect(buttons[0]!.attributes('aria-label')).toBe('Supprimer A de l’historique');
    await buttons[0]!.trigger('click');
    await flushPromises();
    expect(send).toHaveBeenCalledWith({ type: 'history/delete', id: 'a' });
    expect(items(w).map((i) => i.find('strong').text())).toEqual(['B', 'C']);
    expect(w.find('p.announce[role="status"]').text()).toBe('Entrée supprimée.');
    expect(document.activeElement).toBe(deleteButtons(w)[0]!.element);
    expect(w.find('[role="group"]').exists()).toBe(false);

    await deleteButtons(w)[1]!.trigger('click');
    await flushPromises();
    expect(document.activeElement).toBe(deleteButtons(w)[0]!.element); // previous one
    await deleteButtons(w)[0]!.trigger('click');
    await flushPromises();
    expect(document.activeElement?.tagName).toBe('H2'); // empty list: the title
    w.unmount();
  });

  it('Clear all: disabled when empty; reveals a non-modal group, focus on Cancel, Escape cancels', async () => {
    const empty = await inSection(ready([]));
    expect(clearAll(empty).attributes('disabled')).toBeDefined();
    empty.unmount();

    const w = await inSection(ready([historyEntry()]));
    expect(clearAll(w).text()).toBe('Tout effacer');
    await clearAll(w).trigger('click');
    const group = w.find('[role="group"]');
    expect(group.exists()).toBe(true);
    expect(group.text()).toContain('Effacer tout l’historique ? Cette action est irréversible.');
    expect(group.attributes('aria-labelledby')).toBeDefined();
    expect(document.activeElement).toBe(group.find('button.cancel').element);
    expect(group.find('button.cancel').text()).toBe('Annuler');
    await group.trigger('keydown', { key: 'Escape' });
    expect(w.find('[role="group"]').exists()).toBe(false);
    expect(document.activeElement).toBe(clearAll(w).element);
    expect(send).not.toHaveBeenCalledWith({ type: 'history/clear' });
    w.unmount();
  });

  it('Clear all confirmed: history/clear, empty list, announced, focus on the title', async () => {
    const w = await inSection(ready([historyEntry()]));
    await clearAll(w).trigger('click');
    await w.find('[role="group"] button.confirm').trigger('click');
    await flushPromises();
    expect(send).toHaveBeenCalledWith({ type: 'history/clear' });
    expect(items(w)).toHaveLength(0);
    expect(w.find('p.announce').text()).toBe('Historique effacé.');
    expect(document.activeElement?.tagName).toBe('H2');
    w.unmount();
  });

  it('Clear all is available while locked, with the same confirmation', async () => {
    const w = await inSection({ state: 'locked', enabled: true, entries: [] });
    expect(clearAll(w).attributes('disabled')).toBeUndefined();
    await clearAll(w).trigger('click');
    await w.find('[role="group"] button.confirm').trigger('click');
    await flushPromises();
    expect(send).toHaveBeenCalledWith({ type: 'history/clear' });
    expect(w.text()).toContain('Historique verrouillé');
    w.unmount();
  });

  it('keyboard order in the popup view: back, clear all, then each entry (link, delete)', async () => {
    serve(ready([historyEntry()]));
    const w = mount(HistoryView, { props: { baseUrl: BASE }, attachTo: document.body });
    await flushPromises();
    const focusables = w.findAll('button, a[href]').map((e) => e.classes().join(' ') || e.element.tagName);
    expect(focusables).toEqual(['back', 'clear-all', 'A', 'delete']);
    w.unmount();
  });
});

describe('options: turning the history off, reset warning (012, US3, Q-U22)', () => {
  beforeEach(() => {
    vi.mocked(send).mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  async function card(view: HistoryListView) {
    let current = view;
    serve(() => current);
    const w = mount(HistoryCard, { props: { baseUrl: BASE }, attachTo: document.body });
    await flushPromises();
    return { w, setView: (v: HistoryListView) => (current = v) };
  }
  const box = (w: VueWrapper) => w.find('input[type="checkbox"]');

  it('the checkbox reflects enabled; checking sends { enabled: true } at once', async () => {
    const { w } = await card(ready([], false));
    expect(w.text()).toContain('Garder un historique local de mes imports');
    expect(w.text()).toContain('Limité à 200 entrées et 12 mois.');
    expect((box(w).element as HTMLInputElement).checked).toBe(false);
    await box(w).setValue(true);
    await flushPromises();
    expect(send).toHaveBeenCalledWith({ type: 'history/set-enabled', enabled: true });
    w.unmount();
  });

  it('unchecking with entries: stays checked, confirmation, Keep cancels; Turn off erases and announces', async () => {
    const { w, setView } = await card(ready([historyEntry()]));
    expect((box(w).element as HTMLInputElement).checked).toBe(true);
    await box(w).setValue(false);
    await flushPromises();
    expect((box(w).element as HTMLInputElement).checked).toBe(true);
    expect(send).not.toHaveBeenCalledWith({ type: 'history/set-enabled', enabled: false });
    const group = w.find('[role="group"]');
    expect(group.text()).toContain('Désactiver l’historique et effacer tout ce qui a été enregistré ?');
    expect(document.activeElement).toBe(group.find('button.keep').element);
    expect(group.find('button.keep').text()).toBe('Le garder activé');
    await group.find('button.keep').trigger('click');
    expect(w.find('[role="group"]').exists()).toBe(false);
    expect((box(w).element as HTMLInputElement).checked).toBe(true);

    await box(w).setValue(false);
    setView(ready([], false));
    await w.find('[role="group"] button.confirm').trigger('click');
    await flushPromises();
    expect(send).toHaveBeenCalledWith({ type: 'history/set-enabled', enabled: false });
    expect((box(w).element as HTMLInputElement).checked).toBe(false);
    expect(w.text()).toContain('L’historique est désactivé');
    expect(w.find('p.card-announce[role="status"]').text()).toBe('Historique désactivé et effacé.');
    expect(items(w)).toHaveLength(0);
    w.unmount();
  });

  it('unchecking without entries: immediate, without confirmation', async () => {
    const { w } = await card(ready([]));
    await box(w).setValue(false);
    await flushPromises();
    expect(send).toHaveBeenCalledWith({ type: 'history/set-enabled', enabled: false });
    expect(w.find('[role="group"]').exists()).toBe(false);
    w.unmount();
  });

  const optionsWith = (config: ConfigView) => {
    vi.mocked(send).mockImplementation((msg) => {
      if (msg.type === 'config/get') return Promise.resolve(config) as never;
      if (msg.type === 'history/list') return Promise.resolve(ok(ready([historyEntry()]))) as never;
      if (msg.type === 'config/delete') {
        config = { configured: false };
        return Promise.resolve(ok(undefined)) as never;
      }
      return Promise.resolve(ok(undefined)) as never;
    });
  };
  const notice = (w: VueWrapper) => w.findAll('[role="alert"]').find((e) => e.text().includes('nouvelle phrase de passe efface'));

  it('reset warning: only when configured, locked and a new API key is typed', async () => {
    optionsWith({ configured: true, baseUrl: BASE, lastCheck: null, locked: true, needsPassphrase: false });
    const locked = mount(OptionsApp);
    await flushPromises();
    expect(notice(locked)).toBeUndefined();
    await locked.find('#apiKey').setValue('hb_xxxxxxxx');
    expect(notice(locked)?.text()).toBe(
      'L’extension est verrouillée : définir maintenant une nouvelle phrase de passe efface l’historique chiffré des imports, qui ne pourrait plus être lu. Déverrouillez d’abord pour le conserver.',
    );
    const submit = locked.find('button[type="submit"]').element;
    expect(notice(locked)!.element.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    optionsWith({ configured: true, baseUrl: BASE, lastCheck: null, locked: false, needsPassphrase: false });
    const unlocked = mount(OptionsApp);
    await flushPromises();
    await unlocked.find('#apiKey').setValue('hb_xxxxxxxx');
    expect(notice(unlocked)).toBeUndefined();
  });

  it('after deleting the configuration, the card reloads the history', async () => {
    vi.stubGlobal('confirm', () => true);
    optionsWith({ configured: true, baseUrl: BASE, lastCheck: null, locked: false, needsPassphrase: false });
    const w = mount(OptionsApp);
    await flushPromises();
    const before = vi.mocked(send).mock.calls.filter(([m]) => m.type === 'history/list').length;
    await w.findAll('button').find((b) => b.text() === 'Supprimer la configuration')!.trigger('click');
    await flushPromises();
    expect(vi.mocked(send).mock.calls.filter(([m]) => m.type === 'history/list').length).toBe(before + 1);
  });
});
