import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { ConfigView, DetectedProduct, DetectedPurchase, DocumentRef, ImportDraft, PendingImport } from '@/shared/types';
import AppHeader from '@/ui/components/AppHeader.vue';
import DocumentPicker from '@/ui/components/DocumentPicker.vue';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import FieldEditor from '@/ui/components/FieldEditor.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';
import ThemeToggle from '@/ui/components/ThemeToggle.vue';
import OptionsApp from '@/ui/options/App.vue';
import PopupApp from '@/ui/popup/App.vue';
import RecoveryView from '@/ui/popup/RecoveryView.vue';
import ResultView from '@/ui/popup/ResultView.vue';
import SummaryView from '@/ui/popup/SummaryView.vue';
import UnlockView from '@/ui/popup/UnlockView.vue';
import { loadCatalog } from './i18n-harness';

// Le mock de `@/platform/i18n` (setup-i18n.ts) sert le vrai catalogue fr.yml : le rendu doit donc
// n'afficher que des valeurs du catalogue, hors données (props, champs) neutralisées par DATA.
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const catalog = loadCatalog('fr');
const DATA = '__DATA__';
// Au moins deux lettres : « v » devant un numéro de version n'est pas un texte traduisible.
const LETTER = /[A-Za-zÀ-ÿ]{2,}/;

/** Valeur du catalogue → expression ancrée ; `$n` accepte n'importe quelle donnée. */
const patterns = Object.values(catalog)
  .filter((v) => v.replace(/\$\d/g, '').trim().length >= 1)
  .map((v) => new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\$\d/g, '.*')}$`, 's'));

/** Exceptions : exemples techniques non traduisibles (format d'adresse et préfixe de clé HomeBox). */
const TECHNICAL_EXAMPLES = new Set(['https://homebox.example.com', 'hb_…']);

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Taille de fichier (formatSize, valeurs de common.size*) accolée au libellé dans le même nœud texte. */
const SIZE = / ?\b\d+(?:\.\d)? (?:o|Ko|Mo)\b/g;

/** Textes statiques, aria-label, title, placeholder et alt rendus (hors données). */
function visibleTexts(wrapper: VueWrapper, data: string[] = []): string[] {
  const out: string[] = [];
  const strip = (s: string) => clean(data.reduce((acc, d) => acc.split(d).join(DATA), clean(s).replace(SIZE, '')));
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) out.push(strip(node.textContent ?? ''));
    if (node instanceof Element) {
      for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
        const v = node.getAttribute(attr);
        if (v) out.push(strip(v));
      }
      node.childNodes.forEach(walk);
    }
  };
  walk(wrapper.element);
  return out.filter((s) => s !== '');
}

function expectCatalogTexts(wrapper: VueWrapper, data: string[] = []) {
  const unknown = visibleTexts(wrapper, data).filter(
    (s) => !TECHNICAL_EXAMPLES.has(s) && LETTER.test(s.split(DATA).join('')) && !patterns.some((p) => p.test(s)),
  );
  expect(unknown, 'textes visibles absents de fr.yml').toEqual([]);
}

const config = (over: Partial<ConfigView> = {}): ConfigView => ({
  configured: true,
  baseUrl: DATA,
  lastCheck: { status: 'ok', version: DATA, at: '2026-10-22T10:00:00Z' },
  ...over,
});

const draft = (over: Partial<ImportDraft> = {}): ImportDraft => ({
  name: DATA,
  description: DATA,
  purchasePrice: 1,
  currency: 'EUR',
  purchaseDate: '2026-10-22',
  purchaseFrom: DATA,
  orderNumber: DATA,
  quantity: 1,
  pageUrl: null,
  documents: [],
  ...over,
});

const detectedDoc: DocumentRef = { id: 'd1', origin: 'detected', kind: 'invoice', label: DATA, size: 2048 };
const manualDoc: DocumentRef = { id: 'm1', origin: 'manual', kind: 'order_document', label: DATA, size: 12 };

const found = <T,>(value: T) => ({ value, selector: 'x' });
const product = (key: string): DetectedProduct => ({
  key,
  name: found(DATA),
  unitPrice: found(9.9),
  currency: found('EUR'),
  quantity: found(1),
  imageUrl: { value: null, reason: 'not_found' },
});
const purchase = (products: DetectedProduct[]): DetectedPurchase => ({
  source: 'amazon.fr',
  pageUrl: 'https://www.amazon.fr/x',
  orderNumber: found(DATA),
  orderDate: found('2026-10-22'),
  seller: found(DATA),
  products,
  documents: [detectedDoc, manualDoc],
});

const pending = (over: Partial<PendingImport> = {}): PendingImport => ({
  id: 'p1',
  tabId: 1,
  pageUrl: null,
  draft: draft({ documents: [detectedDoc, manualDoc] }),
  entityId: 'e1',
  steps: { create: 'done', update: 'failed', attachments: { d1: 'pending', m1: 'failed' } },
  status: 'partial',
  error: 'UPDATE_FAILED',
  ...over,
});

describe('textes de l’interface : tout vient de fr.yml (FR-004)', () => {
  it('ErrorBanner', () => {
    expectCatalogTexts(mount(ErrorBanner, { props: { code: 'UNAUTHORIZED' } }));
  });

  it('InstanceBadge, adresse HTTPS', () => {
    expectCatalogTexts(mount(InstanceBadge, { props: { config: config() } }), [DATA]);
  });

  it('N10 : InstanceBadge sur une adresse http: du réseau local affiche l’avertissement du catalogue', () => {
    const wrapper = mount(InstanceBadge, { props: { config: config({ baseUrl: 'http://192.0.2.10:7745' }) } });
    const warning = wrapper.find('.http');
    expect(warning.exists()).toBe(true);
    expect(warning.text()).toBe(catalog['common.httpWarning']);
    expect(warning.attributes('title')).toBe(catalog['common.httpWarningHint']);
    expect(warning.text()).toBe('HTTP non chiffré');
  });

  it('ThemeToggle', () => {
    const wrapper = mount(ThemeToggle);
    expect(wrapper.attributes('aria-label')).toBe('Thème : Automatique (système). Changer de thème');
    expect(wrapper.attributes('title')).toBe('Thème : Automatique (système)');
    expectCatalogTexts(wrapper);
  });

  it('AppHeader', () => {
    const wrapper = mount(AppHeader, { props: { subtitle: DATA } });
    expect(wrapper.find('.name').text()).toBe('HomeBox Clipper');
    expectCatalogTexts(wrapper, []);
  });

  it('FieldEditor : champs non détectés, devise étrangère et erreurs de validation', () => {
    const wrapper = mount(FieldEditor, {
      props: {
        modelValue: draft({ name: '', currency: 'USD', quantity: 0, purchaseDate: '2999-01-01', purchasePrice: -1 }),
        missing: ['name', 'purchasePrice', 'purchaseDate', 'orderNumber', 'purchaseFrom'],
      },
    });
    expectCatalogTexts(wrapper, ['USD']);
    expect(wrapper.text()).toContain('Devise détectée : USD. HomeBox enregistre le montant sans devise.');
  });

  it('DocumentPicker', () => {
    expectCatalogTexts(mount(DocumentPicker, { props: { allowReplace: true } }));
  });

  it('UnlockView', () => {
    expectCatalogTexts(mount(UnlockView, { props: { config: config() } }), [DATA]);
  });

  it('ResultView : import en cours, partiel et réussi', () => {
    const running = pending({ status: 'running', error: null, steps: { create: 'done', update: 'pending', attachments: {} } });
    const done = pending({ id: 'p2', status: 'success', error: null });
    const wrapper = mount(ResultView, {
      props: { pendings: [running, done, pending({ id: 'p3' })], baseUrl: DATA, running: false },
    });
    expectCatalogTexts(wrapper, [DATA]);
    expect(mount(ResultView, { props: { pendings: [], baseUrl: '', running: true } }).text()).toBe('Import en cours…');
  });

  it('ResultView : objet ajouté (singulier et pluriel)', () => {
    const ok1 = pending({ status: 'success', error: null });
    const props = { baseUrl: DATA, running: false };
    expect(mount(ResultView, { props: { ...props, pendings: [ok1] } }).text()).toContain('Objet ajouté à HomeBox.');
    const many = mount(ResultView, { props: { ...props, pendings: [ok1, { ...ok1, id: 'p2' }] } });
    expect(many.text()).toContain('2 objets ajoutés à HomeBox.');
    expectCatalogTexts(many, [DATA]);
  });

  it('RecoveryView : objet créé puis objet non créé', () => {
    const created = mount(RecoveryView, { props: { pending: pending(), baseUrl: DATA } });
    expectCatalogTexts(created, [DATA]);
    expect(created.text()).toContain('a été créé dans HomeBox');
    const notCreated = mount(RecoveryView, {
      props: { pending: pending({ entityId: null, error: 'CREATE_FAILED' }), baseUrl: '' },
    });
    expectCatalogTexts(notCreated, [DATA]);
    expect(notCreated.text()).toContain('n\'a pas été créé.');
  });

  describe('SummaryView', () => {
    it('achat détecté (plusieurs produits), puis boîte « aucune facture »', async () => {
      vi.mocked(send).mockResolvedValue(ok({ purchase: { ...purchase([product('a'), product('b')]), documents: [] }, warnings: ['INVOICE_MISSING'] }) as never);
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      await flushPromises();
      expectCatalogTexts(wrapper, [DATA]);
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      expect(wrapper.text()).toContain("Aucune facture ne sera jointe. Créer l'objet quand même ?");
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('détection impossible : saisie manuelle et documents locaux/détectés', async () => {
      vi.mocked(send).mockResolvedValue(fail('NOT_AN_ORDER_PAGE') as never);
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      expect(wrapper.text()).toContain("Détection de l'achat…");
      await flushPromises();
      expectCatalogTexts(wrapper, [DATA]);
      expect(wrapper.text()).toContain('Saisissez les informations et joignez un PDF si besoin.');
    });

    it('documents et doublon suspecté', async () => {
      vi.mocked(send).mockImplementation((msg) =>
        Promise.resolve(
          msg.type === 'detect/run'
            ? ok({ purchase: purchase([product('a')]), warnings: [] })
            : ok({ matches: [{ id: 'x', name: DATA, url: DATA }] }),
        ) as never,
      );
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      await flushPromises();
      expect(wrapper.text()).toContain('Facture détectée sur la page 2 Ko');
      expect(wrapper.text()).toContain('Bon de commande fichier local 12 o');
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      expectCatalogTexts(wrapper, [DATA]);
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true);
    });
  });

  describe('popup App', () => {
    it('non configuré', async () => {
      vi.mocked(send).mockResolvedValue({ configured: false } as never);
      const wrapper = mount(PopupApp);
      await flushPromises();
      expect(wrapper.text()).toContain('Configurez votre instance HomeBox pour commencer.');
      expect(wrapper.find('button[aria-label="Configuration"]').attributes('title')).toBe('Configuration');
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('clé migrée à protéger (écran de configuration)', async () => {
      vi.mocked(send).mockResolvedValue(config({ needsPassphrase: true, locked: true }) as never);
      const wrapper = mount(PopupApp);
      await flushPromises();
      expect(wrapper.text()).toContain('Votre clé API doit être ressaisie et protégée par une phrase de passe.');
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('verrouillé', async () => {
      vi.mocked(send).mockResolvedValue(config({ locked: true }) as never);
      const wrapper = mount(PopupApp);
      await flushPromises();
      expect(wrapper.text()).toContain('Phrase de passe');
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('déverrouillé : bouton de verrouillage et avis de clé non protégée', async () => {
      vi.mocked(send).mockResolvedValue(config({ needsPassphrase: true, locked: false }) as never);
      const wrapper = mount(PopupApp);
      await flushPromises();
      expect(wrapper.find('button[aria-label="Verrouiller la clé API"]').exists()).toBe(false); // needsPassphrase
      expectCatalogTexts(wrapper, [DATA]);
    });
  });

  describe('options App', () => {
    const mountOptions = async (view: ConfigView) => {
      vi.mocked(send).mockResolvedValue(view as never);
      const wrapper = mount(OptionsApp);
      await flushPromises();
      return wrapper;
    };

    it('première configuration', async () => {
      const wrapper = await mountOptions({ configured: false });
      expect(wrapper.text()).toContain('Phrase de passe (nouvelle)');
      expect(wrapper.text()).toContain('Au moins 10 caractères.');
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('configuré et déverrouillé', async () => {
      const wrapper = await mountOptions(config({ maskedKey: 'hb_…abcd' }));
      expect(wrapper.text()).toContain('Nécessaire pour déchiffrer la clé actuelle.');
      expect(wrapper.text()).toContain('Supprimer la configuration');
      expectCatalogTexts(wrapper, [DATA, 'hb_…abcd']);
    });

    it('configuré et verrouillé, clé migrée', async () => {
      const wrapper = await mountOptions(config({ locked: true, needsPassphrase: true }));
      expectCatalogTexts(wrapper, [DATA]);
      expect(wrapper.text()).toContain('Apparence');
    });
  });
});
