import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fail, ok } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  DocumentRef,
  DraftPhoto,
  ImportDraft,
  LocationChoice,
  LocationOption,
  PendingImport,
} from '@/shared/types';
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
import LocationPicker from '@/ui/components/LocationPicker.vue';
import { IDENTICAL_OK, loadCatalog, setTestLanguage } from './i18n-harness';
import { ERROR_CODES } from '@/shared/errors';

// The `@/platform/i18n` mock (setup-i18n.ts) serves the real fr.yml catalog: the rendering must therefore
// only display catalog values, apart from data (props, fields) neutralized by DATA.
vi.mock('@/shared/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  send: vi.fn(),
}));

const catalog = loadCatalog('fr');
const DATA = '__DATA__';
// At least two letters: a "v" before a version number is not translatable text.
const LETTER = /[A-Za-zÀ-ÿ]{2,}/;

/** Catalog value → anchored expression; `$n` accepts any data. */
const patterns = Object.values(catalog)
  .filter((v) => v.replace(/\$\d/g, '').trim().length >= 1)
  .map((v) => new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\$\d/g, '.*')}$`, 's'));

/** Exceptions: non-translatable technical examples (address format and HomeBox key prefix). */
const TECHNICAL_EXAMPLES = new Set(['https://homebox.example.com', 'hb_…']);

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
/** File size (formatSize, common.size* values) attached to the label in the same text node. */
const SIZE = / ?\b\d+(?:\.\d)? (?:o|Ko|Mo|B|KB|MB)\b/g;

/** Rendered static texts, aria-label, title, placeholder and alt (apart from data). */
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
  photo: null,
  location: null,
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
  steps: { create: 'done', update: 'failed', attachments: { d1: 'pending', m1: 'failed' }, photo: 'unavailable' },
  photoError: null,
  photoAttempted: false,
  status: 'partial',
  error: 'UPDATE_FAILED',
  ...over,
});

describe('interface texts: everything comes from fr.yml (FR-004)', () => {
  it('ErrorBanner', () => {
    expectCatalogTexts(mount(ErrorBanner, { props: { code: 'UNAUTHORIZED' } }));
  });

  it('InstanceBadge, adresse HTTPS', () => {
    expectCatalogTexts(mount(InstanceBadge, { props: { config: config() } }), [DATA]);
  });

  it('N10: InstanceBadge on a local-network http: address displays the catalog warning', () => {
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

  it('FieldEditor: undetected fields, foreign currency and validation errors', () => {
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

  it('ResultView: import in progress, partial and successful', () => {
    const running = pending({ status: 'running', error: null, steps: { create: 'done', update: 'pending', attachments: {}, photo: 'pending' } });
    const done = pending({ id: 'p2', status: 'success', error: null });
    const wrapper = mount(ResultView, {
      props: { pendings: [running, done, pending({ id: 'p3' })], baseUrl: DATA, running: false },
    });
    expectCatalogTexts(wrapper, [DATA]);
    expect(mount(ResultView, { props: { pendings: [], baseUrl: '', running: true } }).text()).toBe('Import en cours…');
  });

  it('ResultView: object added (singular and plural)', () => {
    const ok1 = pending({ status: 'success', error: null });
    const props = { baseUrl: DATA, running: false };
    expect(mount(ResultView, { props: { ...props, pendings: [ok1] } }).text()).toContain('Objet ajouté à HomeBox.');
    const many = mount(ResultView, { props: { ...props, pendings: [ok1, { ...ok1, id: 'p2' }] } });
    expect(many.text()).toContain('2 objets ajoutés à HomeBox.');
    expectCatalogTexts(many, [DATA]);
  });

  it('RecoveryView: object created then object not created', () => {
    const created = mount(RecoveryView, { props: { pending: pending(), baseUrl: DATA } });
    expectCatalogTexts(created, [DATA]);
    expect(created.text()).toContain('a été créé dans HomeBox');
    const notCreated = mount(RecoveryView, {
      props: { pending: pending({ entityId: null, error: 'CREATE_FAILED' }), baseUrl: '' },
    });
    expectCatalogTexts(notCreated, [DATA]);
    expect(notCreated.text()).toContain('n\'a pas été créé.');
    // Uncertain creation: never claim that the object does not exist.
    for (const state of [{ createUncertain: true }, { orphaned: true, createAttempted: true }]) {
      const uncertain = mount(RecoveryView, {
        props: { pending: pending({ entityId: null, error: 'DUPLICATE_SUSPECTED', ...state }), baseUrl: '' },
      });
      expect(uncertain.text()).toContain('a peut-être été créé');
      expect(uncertain.text()).not.toContain('n\'a pas été créé.');
    }
  });

  describe('SummaryView', () => {
    it('purchase detected (several products), then "aucune facture" box', async () => {
      vi.mocked(send).mockResolvedValue(ok({ purchase: { ...purchase([product('a'), product('b')]), documents: [] }, warnings: ['INVOICE_MISSING'] }) as never);
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      await flushPromises();
      expectCatalogTexts(wrapper, [DATA]);
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      expect(wrapper.text()).toContain("Aucune facture ne sera jointe. Créer l'objet quand même ?");
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('detection impossible: manual entry and local/detected documents', async () => {
      vi.mocked(send).mockResolvedValue(fail('NOT_AN_ORDER_PAGE') as never);
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      expect(wrapper.text()).toContain("Détection de l'achat…");
      await flushPromises();
      expectCatalogTexts(wrapper, [DATA]);
      expect(wrapper.text()).toContain('Saisissez les informations et joignez un PDF si besoin.');
    });

    it('documents and suspected duplicate', async () => {
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

  describe('product photo (US1)', () => {
    const PHOTO = 'https://m.media-amazon.com/images/I/test-1._SL1000_.jpg';
    const withPhoto = (key: string): DetectedProduct => ({ ...product(key), imageUrl: found(PHOTO) });
    const mountSummary = async (products: DetectedProduct[]) => {
      vi.mocked(send).mockResolvedValue(ok({ purchase: purchase(products), warnings: [] }) as never);
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      await flushPromises();
      return wrapper;
    };
    const submitted = (wrapper: VueWrapper) =>
      (wrapper.emitted('submit')?.[0]?.[0] as { drafts: ImportDraft[] }).drafts;

    it('SummaryView: 64 px image and checkbox checked by default (scenario 1, FR-001, FR-002)', async () => {
      const wrapper = await mountSummary([withPhoto('a')]);
      const img = wrapper.find('.photo img');
      expect(img.attributes('src')).toBe(PHOTO);
      expect(img.attributes('width')).toBe('64');
      expect(img.attributes('height')).toBe('64');
      const box = wrapper.find('.photo input[type="checkbox"]');
      expect((box.element as HTMLInputElement).checked).toBe(true);
      expect(wrapper.find('.photo').text()).toBe("Envoyer cette photo avec l'objet");
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('SummaryView: the checkbox is reflected in draft.photo.include at submission (FR-002)', async () => {
      vi.mocked(send).mockImplementation((msg) =>
        Promise.resolve(
          msg.type === 'detect/run'
            ? ok({ purchase: purchase([withPhoto('a')]), warnings: [] })
            : ok({ matches: [] }),
        ) as never,
      );
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      await flushPromises();
      await wrapper.find('.photo input[type="checkbox"]').setValue(false);
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      expect(submitted(wrapper)[0]?.photo).toEqual({ url: PHOTO, merchantId: 'amazon.fr', include: false } satisfies DraftPhoto);
    });

    it('SummaryView: photo checked → draft.photo.include true, with the URL and the merchant', async () => {
      vi.mocked(send).mockImplementation((msg) =>
        Promise.resolve(
          msg.type === 'detect/run'
            ? ok({ purchase: purchase([withPhoto('a')]), warnings: [] })
            : ok({ matches: [] }),
        ) as never,
      );
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      await flushPromises();
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      expect(submitted(wrapper)[0]?.photo).toEqual({ url: PHOTO, merchantId: 'amazon.fr', include: true });
    });

    it('SummaryView: without a photo, summary.photoNone and draft.photo = null (scenario 4)', async () => {
      vi.mocked(send).mockImplementation((msg) =>
        Promise.resolve(
          msg.type === 'detect/run' ? ok({ purchase: purchase([product('a')]), warnings: [] }) : ok({ matches: [] }),
        ) as never,
      );
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      await flushPromises();
      expect(wrapper.find('.photo input').exists()).toBe(false);
      expect(wrapper.text()).toContain('Aucune photo disponible pour ce produit.');
      expectCatalogTexts(wrapper, [DATA]);
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      expect(submitted(wrapper)[0]?.photo).toBeNull();
    });

    it('SummaryView: @error on the image unchecks the box and displays summary.photoLoadFailed', async () => {
      vi.mocked(send).mockImplementation((msg) =>
        Promise.resolve(
          msg.type === 'detect/run'
            ? ok({ purchase: purchase([withPhoto('a')]), warnings: [] })
            : ok({ matches: [] }),
        ) as never,
      );
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      await flushPromises();
      await wrapper.find('.photo img').trigger('error');
      expect(wrapper.text()).toContain("La photo n'a pas pu être affichée : elle ne sera pas envoyée.");
      expect((wrapper.find('.photo input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false);
      expectCatalogTexts(wrapper, [DATA]);
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      // D3: the user unchecked nothing, the photo is unavailable (FR-009), not "not requested".
      expect(submitted(wrapper)[0]?.photo).toBeNull();
    });

    it('SummaryView: without a click on "Ajouter", no import/start or network request (FR-022)', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const wrapper = await mountSummary([withPhoto('a')]);
      vi.mocked(send).mockImplementation((msg) =>
        Promise.resolve(msg.type === 'duplicate/check' ? ok({ matches: [] }) : ok({ purchase: purchase([withPhoto('a')]), warnings: [] })) as never,
      );
      await wrapper.find('.photo img').trigger('error');
      await flushPromises();
      expect(wrapper.emitted('submit')).toBeUndefined();
      // Only the summary reads are sent (detection, location list): no import/start.
      expect(vi.mocked(send).mock.calls.map(([m]) => m.type).sort()).toEqual(['detect/run', 'location/list']);
      expect(fetchSpy).not.toHaveBeenCalled();
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      expect(wrapper.emitted('submit')).toHaveLength(1);
      vi.unstubAllGlobals();
    });

    it('SummaryView: the thumbnail does not send a referrer (referrerpolicy=no-referrer)', async () => {
      const wrapper = await mountSummary([withPhoto('a')]);
      expect(wrapper.find('.photo img').attributes('referrerpolicy')).toBe('no-referrer');
    });

    it('ResultView: "avec sa facture" is separated from the product name (D2)', () => {
      const one = pending({ status: 'success', error: null, draft: draft({ documents: [detectedDoc] }) });
      const many = pending({ id: 'p2', status: 'success', error: null, draft: draft({ documents: [detectedDoc, manualDoc] }) });
      const wrapper = mount(ResultView, { props: { pendings: [one, many], baseUrl: DATA, running: false } });
      const text = wrapper.text();
      expect(text).toContain(`${DATA} avec sa facture —`);
      expect(text).toContain(`${DATA} avec ses documents —`);
    });

    it('SummaryView: several products, one photo per row', async () => {
      const wrapper = await mountSummary([withPhoto('a'), product('b')]);
      expect(wrapper.findAll('.photo img')).toHaveLength(1);
      expect(wrapper.text()).toContain('Aucune photo disponible pour ce produit.');
      expectCatalogTexts(wrapper, [DATA]);
    });

    const withPhotoStep = (photo: PendingImport['steps']['photo'], over: Partial<PendingImport> = {}) =>
      pending({
        status: 'success',
        error: null,
        steps: { create: 'done', update: 'done', attachments: { d1: 'done', m1: 'done' }, photo },
        ...over,
      });

    it('ResultView: result.stepPhoto line during the import', () => {
      const running = pending({
        status: 'running',
        error: null,
        steps: { create: 'done', update: 'done', attachments: {}, photo: 'sending' },
      });
      const wrapper = mount(ResultView, { props: { pendings: [running], baseUrl: DATA, running: true } });
      expect(wrapper.text()).toContain('Photo : en attente');
      expectCatalogTexts(wrapper, [DATA]);
    });

    it.each([
      ['done', 'Photo ajoutée.'],
      ['not_requested', 'Photo non demandée.'],
      ['unavailable', 'Aucune photo disponible.'],
    ] as const)('ResultView : résultat par produit, photo %s (FR-009)', (step, text) => {
      const wrapper = mount(ResultView, { props: { pendings: [withPhotoStep(step)], baseUrl: DATA, running: false } });
      expect(wrapper.text()).toContain(text);
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('ResultView: photo failed → photoFailed, with a resume of the photo alone', () => {
      const failed = withPhotoStep('failed', { status: 'partial', error: 'PHOTO_UPLOAD_FAILED', photoError: 'PHOTO_UPLOAD_FAILED', photoAttempted: true });
      const wrapper = mount(ResultView, { props: { pendings: [failed], baseUrl: DATA, running: false } });
      expect(wrapper.text()).toContain("Échec de l'envoi de la photo.");
      expect(wrapper.text()).toContain("Réessayer l'envoi de la photo");
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('RecoveryView: photoError separate from error, and recovery.retryPhoto when only the photo remains', () => {
      const onlyPhoto = withPhotoStep('failed', {
        status: 'partial',
        error: 'PHOTO_TOO_LARGE',
        photoError: 'PHOTO_TOO_LARGE',
      });
      const wrapper = mount(RecoveryView, { props: { pending: onlyPhoto, baseUrl: DATA } });
      expect(wrapper.findAll('[role="alert"]')).toHaveLength(1); // no error / photoError duplicate
      expect(wrapper.text()).toContain('La photo dépasse 5 Mo : elle n\'a pas été envoyée.');
      expect(wrapper.find('button.primary').text()).toBe("Réessayer l'envoi de la photo");
      expectCatalogTexts(wrapper, [DATA]);

      const both = withPhotoStep('failed', {
        status: 'partial',
        error: 'ATTACHMENT_FAILED',
        photoError: 'PHOTO_UNAVAILABLE',
        steps: { create: 'done', update: 'done', attachments: { d1: 'failed', m1: 'done' }, photo: 'failed' },
      });
      const wrapper2 = mount(RecoveryView, { props: { pending: both, baseUrl: DATA } });
      expect(wrapper2.findAll('[role="alert"]')).toHaveLength(2);
      expect(wrapper2.find('button.primary').text()).toBe('Réessayer');
      expectCatalogTexts(wrapper2, [DATA]);
    });
  });

  describe('resume after a service worker restart (R8)', () => {
    const interrupted = (over: Partial<PendingImport> = {}) =>
      pending({
        status: 'partial',
        error: null,
        orphaned: true,
        steps: { create: 'done', update: 'pending', attachments: { d1: 'pending', m1: 'pending' }, photo: 'pending' },
        ...over,
      });

    it('orphaned partial: interruption message and generic resume', () => {
      const wrapper = mount(ResultView, { props: { pendings: [interrupted()], baseUrl: DATA, running: false } });
      expect(wrapper.text()).toContain("L'import a été interrompu avant la fin.");
      expect(wrapper.find('button.primary').text()).toBe('Réessayer');
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('orphaned failed without object: retry of the full import', () => {
      const failed = interrupted({ status: 'failed', entityId: null });
      const wrapper = mount(ResultView, { props: { pendings: [failed], baseUrl: DATA, running: false } });
      expect(wrapper.text()).toContain("n'a pas été créé.");
      expect(wrapper.find('button.primary').text()).toBe("Réessayer l'import");
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('DUPLICATE_SUSPECTED on resume: the refusal is displayed, no more "Réessayer" (no loop), abandon offered', async () => {
      const orphan = interrupted({
        status: 'failed',
        entityId: null,
        draft: draft({ documents: [detectedDoc] }),
        steps: { create: 'pending', update: 'pending', attachments: { d1: 'pending' }, photo: 'pending' },
      });
      vi.mocked(send).mockResolvedValue(fail('DUPLICATE_SUSPECTED') as never);
      const wrapper = mount(RecoveryView, { props: { pending: orphan, baseUrl: DATA } });
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'import/retry', pendingId: 'p1' }));
      expect(wrapper.text()).toContain('Un objet semblable existe déjà dans HomeBox.');
      expect(wrapper.text()).toContain('un second objet peut être créé sans nouvelle confirmation');
      expect(wrapper.find('button.primary').exists()).toBe(false);
      const abandon = wrapper.findAll('button').find((b) => b.text() === 'Abandonner');
      expect(abandon?.exists()).toBe(true);
      expectCatalogTexts(wrapper, [DATA]);

      vi.mocked(send).mockResolvedValue(ok(undefined) as never);
      await abandon!.trigger('click');
      await flushPromises();
      expect(wrapper.emitted('abandoned')).toEqual([['p1']]);
    });
  });

  describe('popup App', () => {
    it('not configured', async () => {
      vi.mocked(send).mockResolvedValue({ configured: false } as never);
      const wrapper = mount(PopupApp);
      await flushPromises();
      expect(wrapper.text()).toContain('Configurez votre instance HomeBox pour commencer.');
      expect(wrapper.find('button[aria-label="Configuration"]').attributes('title')).toBe('Configuration');
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('migrated key to protect (configuration screen)', async () => {
      vi.mocked(send).mockResolvedValue(config({ needsPassphrase: true, locked: true }) as never);
      const wrapper = mount(PopupApp);
      await flushPromises();
      expect(wrapper.text()).toContain('Votre clé API doit être ressaisie et protégée par une phrase de passe.');
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('locked', async () => {
      vi.mocked(send).mockResolvedValue(config({ locked: true }) as never);
      const wrapper = mount(PopupApp);
      await flushPromises();
      expect(wrapper.text()).toContain('Phrase de passe');
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('unlocked: lock button and unprotected-key notice', async () => {
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

    it('first configuration', async () => {
      const wrapper = await mountOptions({ configured: false });
      expect(wrapper.text()).toContain('Phrase de passe (nouvelle)');
      expect(wrapper.text()).toContain('Au moins 10 caractères.');
      expectCatalogTexts(wrapper, [DATA]);
    });

    it('configured and unlocked', async () => {
      const wrapper = await mountOptions(config({ maskedKey: 'hb_…abcd' }));
      expect(wrapper.text()).toContain('Nécessaire pour déchiffrer la clé actuelle.');
      expect(wrapper.text()).toContain('Supprimer la configuration');
      expectCatalogTexts(wrapper, [DATA, 'hb_…abcd']);
    });

    it('configured and locked, migrated key', async () => {
      const wrapper = await mountOptions(config({ locked: true, needsPassphrase: true }));
      expectCatalogTexts(wrapper, [DATA]);
      expect(wrapper.text()).toContain('Apparence');
    });
  });
});

describe('location choice (US2, US3)', () => {
  const NAMES = ['Maison', 'Garage', 'Atelier'];
  const MAISON: LocationOption = { id: 'm', name: 'Maison', path: ['Maison'] };
  const GARAGE: LocationOption = { id: 'g', name: 'Garage', path: ['Maison', 'Garage'] };
  const ATELIER: LocationOption = { id: 'a', name: 'Atelier', path: ['Atelier'] };
  const LOCATIONS = [ATELIER, MAISON, GARAGE];
  const choice = (o: LocationOption): LocationChoice => ({ id: o.id, path: o.path });
  const PHOTO = 'https://m.media-amazon.com/images/I/test-1._SL1000_.jpg';
  const named = (key: string, name: string, imageUrl?: string): DetectedProduct => ({
    ...product(key),
    name: found(name),
    imageUrl: imageUrl ? found(imageUrl) : { value: null, reason: 'not_found' },
  });

  type ListReply = ReturnType<typeof ok> | ReturnType<typeof fail> | Promise<never>;
  const listOk = (lastUsedId: string | null = null, locations = LOCATIONS): ListReply =>
    ok({ locations, lastUsedId }) as ListReply;

  /** `send` mocked per message type; each call is recorded by `vi.mocked(send)`. */
  function wire(opts: { products?: DetectedProduct[]; list?: ListReply; duplicates?: DetectedProduct[] | 'found' } = {}) {
    const products = opts.products ?? [named('a', 'Clavier'), named('b', 'Souris')];
    vi.mocked(send).mockImplementation((msg) => {
      if (msg.type === 'detect/run') return Promise.resolve(ok({ purchase: purchase(products), warnings: [] })) as never;
      if (msg.type === 'location/list') return Promise.resolve(opts.list ?? listOk()) as never;
      if (msg.type === 'duplicate/check') {
        const matches = opts.duplicates === 'found' ? [{ id: 'x', name: DATA, url: DATA }] : [];
        return Promise.resolve(ok({ matches })) as never;
      }
      return Promise.resolve(ok(undefined)) as never;
    });
  }
  const mountSummary = async () => {
    const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
    await flushPromises();
    return wrapper;
  };
  type PickerWrapper = VueWrapper<InstanceType<typeof LocationPicker>>;
  const orderPicker = (w: VueWrapper) => w.findComponent('.order-location') as unknown as PickerWrapper;
  const pick = async (picker: ReturnType<typeof orderPicker>, o: LocationOption | null) => {
    picker.vm.$emit('update:modelValue', o ? choice(o) : null);
    await flushPromises();
  };
  const editButtons = (w: VueWrapper) => w.findAll('button').filter((b) => b.text() === 'Modifier');
  const confirm = async (w: VueWrapper) => {
    await w.find('button.primary').trigger('click');
    await flushPromises();
    return w.emitted('submit')?.[0]?.[0] as { drafts: ImportDraft[]; orderLocationId: string | null };
  };

  describe('SummaryView', () => {
    it('loads location/list in parallel with detect/run, without blocking the summary ("loading" state)', async () => {
      wire({ list: new Promise<never>(() => undefined) });
      const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
      // Both calls are sent before either is resolved.
      expect(vi.mocked(send).mock.calls.map(([m]) => m.type).sort()).toEqual(['detect/run', 'location/list']);
      await flushPromises();
      expect(wrapper.text()).toContain('Chargement des emplacements…');
      expect(wrapper.find('button.primary').attributes('disabled')).toBeUndefined();
      expectCatalogTexts(wrapper, [DATA, ...NAMES, 'Clavier', 'Souris']);
    });

    it('an order choice applies to all rows; orderLocationId carries it', async () => {
      wire();
      const wrapper = await mountSummary();
      await pick(orderPicker(wrapper), GARAGE);
      const { drafts, orderLocationId } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([choice(GARAGE), choice(GARAGE)]);
      expect(orderLocationId).toBe('g');
    });

    it('no choice: location = null everywhere, orderLocationId = null, import possible (FR-012)', async () => {
      wire();
      const wrapper = await mountSummary();
      const { drafts, orderLocationId } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([null, null]);
      expect(orderLocationId).toBeNull();
    });

    it("several products: without an own choice, each product states that it shares the others' location (FR-015)", async () => {
      wire();
      const wrapper = await mountSummary();
      // Nothing chosen: the mention says so.
      for (const row of wrapper.findAll('.product-location')) expect(row.text()).toContain('Aucun emplacement');
      await pick(orderPicker(wrapper), GARAGE);
      const rows = wrapper.findAll('.product-location');
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        // The mention names the followed location, without repeating the full path of the order field.
        expect(row.text()).toContain('Même emplacement que les autres produits : Garage');
        expect(row.text()).not.toContain('Maison › Garage');
        expect(row.text()).not.toContain('Emplacement de ce produit');
      }
      expectCatalogTexts(wrapper, [DATA, ...NAMES, 'Clavier', 'Souris']);
    });

    it('a single product: a single "Emplacement (facultatif)" picker, no per-product row, no "Modifier"', async () => {
      wire({ products: [named('a', 'Clavier')] });
      const wrapper = await mountSummary();
      expect(wrapper.findAllComponents(LocationPicker)).toHaveLength(1);
      expect(wrapper.findAll('.product-location')).toHaveLength(0);
      expect(editButtons(wrapper)).toHaveLength(0);
      expect(wrapper.text()).not.toContain('Emplacement de ce produit');
      expect(wrapper.text()).not.toContain('Emplacement des produits');
      expect(wrapper.text()).not.toContain('Emplacement pour cette commande');
      expect(orderPicker(wrapper).props('label')).toBe('Emplacement (facultatif)');
      expect(orderPicker(wrapper).get('label').text()).toBe('Emplacement (facultatif)');
      await pick(orderPicker(wrapper), GARAGE);
      const { drafts, orderLocationId } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([choice(GARAGE)]);
      expect(orderLocationId).toBe('g');
    });

    it('manual entry (no product detected): a single picker, last-location preselection kept', async () => {
      wire({ products: [], list: listOk('a') });
      const wrapper = await mountSummary();
      await wrapper.get('input[required]').setValue('Perceuse');
      expect(wrapper.findAllComponents(LocationPicker)).toHaveLength(1);
      expect(wrapper.findAll('.product-location')).toHaveLength(0);
      const { drafts, orderLocationId } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([choice(ATELIER)]);
      expect(orderLocationId).toBe('a');
    });

    it('several products: the order field, labelled and explained, comes before the products', async () => {
      wire();
      const wrapper = await mountSummary();
      const html = wrapper.html();
      const orderAt = html.indexOf('order-location');
      expect(orderAt).toBeGreaterThan(-1);
      expect(orderAt).toBeLessThan(html.indexOf('class="line card"'));
      expect(orderPicker(wrapper).props('label')).toBe('Emplacement des produits');
      expect(wrapper.text()).toContain('Chaque objet est rangé à un seul emplacement. Vous pouvez en choisir un autre pour un produit.');
      // The hint is linked to the field.
      const help = wrapper.get('#' + orderPicker(wrapper).props('describedBy'));
      expect(help.text()).toContain('Chaque objet est rangé à un seul emplacement');
      expectCatalogTexts(wrapper, [DATA, ...NAMES, 'Clavier', 'Souris']);
    });

    it('own choice: "Emplacement de ce produit : X" and "Utiliser celui de la commande" naming the product', async () => {
      wire();
      const wrapper = await mountSummary();
      await pick(orderPicker(wrapper), GARAGE);
      await editButtons(wrapper)[1]!.trigger('click');
      (wrapper.findComponent('.line-location') as unknown as PickerWrapper).vm.$emit('update:modelValue', choice(ATELIER));
      await flushPromises();
      const rows = wrapper.findAll('.product-location');
      expect(rows[0]!.text()).toContain('Même emplacement que les autres produits');
      expect(rows[1]!.text()).toContain('Emplacement de ce produit');
      expect(rows[1]!.text()).toContain('Atelier');
      expect(rows[1]!.text()).not.toContain('Même emplacement');
      const back = wrapper.findAll('button').filter((b) => b.text() === 'Utiliser celui de la commande');
      expect(back).toHaveLength(1);
      expect(back[0]!.attributes('aria-label')).toBe("Utiliser l'emplacement de la commande pour Souris");
      expect(editButtons(wrapper)[1]!.attributes('aria-label')).toBe("Modifier l'emplacement de Souris");
    });

    it(`"Utiliser celui de la commande": back to inheritance, the submitted draft takes the order's location`, async () => {
      wire();
      const wrapper = await mountSummary();
      await pick(orderPicker(wrapper), GARAGE);
      await editButtons(wrapper)[1]!.trigger('click');
      (wrapper.findComponent('.line-location') as unknown as PickerWrapper).vm.$emit('update:modelValue', choice(ATELIER));
      await flushPromises();
      await wrapper.findAll('button').find((b) => b.text() === 'Utiliser celui de la commande')!.trigger('click');
      expect(wrapper.findAll('button').some((b) => b.text() === 'Utiliser celui de la commande')).toBe(false);
      expect(wrapper.findAll('.product-location')[1]!.text()).toContain('Même emplacement que les autres produits');
      // Inheriting again: it follows the order's changes once more.
      await pick(orderPicker(wrapper), MAISON);
      const { drafts, orderLocationId } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([choice(MAISON), choice(MAISON)]);
      expect(orderLocationId).toBe('m');
    });

    it(`back to inheritance after an own "Retirer": the order's location comes back (not null)`, async () => {
      wire();
      const wrapper = await mountSummary();
      await pick(orderPicker(wrapper), GARAGE);
      await editButtons(wrapper)[0]!.trigger('click');
      (wrapper.findComponent('.line-location') as unknown as PickerWrapper).vm.$emit('update:modelValue', null);
      await flushPromises();
      await wrapper.findAll('button').find((b) => b.text() === 'Utiliser celui de la commande')!.trigger('click');
      const { drafts } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([choice(GARAGE), choice(GARAGE)]);
    });

    it('the per-product pickers and buttons carry the product name in their accessible label', async () => {
      wire();
      const wrapper = await mountSummary();
      const buttons = editButtons(wrapper);
      expect(buttons.map((b) => b.attributes('aria-label'))).toEqual([
        "Modifier l'emplacement de Clavier",
        "Modifier l'emplacement de Souris",
      ]);
      await buttons[1]!.trigger('click');
      const picker = wrapper.findComponent('.line-location') as unknown as PickerWrapper;
      expect(picker.props('label')).toBe('Emplacement de Souris');
      expect(picker.get('label').text()).toBe('Emplacement de Souris');
      expectCatalogTexts(wrapper, [DATA, ...NAMES, 'Clavier', 'Souris']);
    });

    it('"Modifier" opens a row-specific picker: the other product keeps the order choice (FR-014)', async () => {
      wire();
      const wrapper = await mountSummary();
      await pick(orderPicker(wrapper), GARAGE);
      await editButtons(wrapper)[1]!.trigger('click');
      const linePickers = wrapper.findAllComponents('.line-location') as unknown as PickerWrapper[];
      expect(linePickers).toHaveLength(1);
      linePickers[0]!.vm.$emit('update:modelValue', choice(ATELIER));
      await flushPromises();
      const { drafts, orderLocationId } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([choice(GARAGE), choice(ATELIER)]);
      // The memory (orderLocationId) follows the order, not a single product's change.
      expect(orderLocationId).toBe('g');
    });

    it('"Retirer" on a row: this product has no location (null), the others follow the order', async () => {
      wire();
      const wrapper = await mountSummary();
      await pick(orderPicker(wrapper), GARAGE);
      await editButtons(wrapper)[0]!.trigger('click');
      (wrapper.findComponent('.line-location') as unknown as PickerWrapper).vm.$emit('update:modelValue', null);
      await flushPromises();
      const { drafts } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([null, choice(GARAGE)]);
    });

    it('a row that follows the order also follows its later changes', async () => {
      wire();
      const wrapper = await mountSummary();
      await pick(orderPicker(wrapper), GARAGE);
      await pick(orderPicker(wrapper), ATELIER);
      const { drafts, orderLocationId } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([choice(ATELIER), choice(ATELIER)]);
      expect(orderLocationId).toBe('a');
    });

    it('an unchecked product is not submitted, but the order choice remains', async () => {
      wire();
      const wrapper = await mountSummary();
      await pick(orderPicker(wrapper), GARAGE);
      await wrapper.findAll('.pick input[type="checkbox"]')[0]!.setValue(false);
      const { drafts } = await confirm(wrapper);
      expect(drafts).toHaveLength(1);
    });

    it('list unavailable: ErrorBanner + hint, no picker, import possible without location (scenario 16, FR-017)', async () => {
      wire({ list: fail('LOCATIONS_UNAVAILABLE') });
      const wrapper = await mountSummary();
      expect(wrapper.text()).toContain("La liste des emplacements n'a pas pu être obtenue.");
      expect(wrapper.text()).toContain('Vous pouvez importer sans emplacement.');
      expect(wrapper.findComponent(LocationPicker).exists()).toBe(false);
      expectCatalogTexts(wrapper, [DATA, 'Clavier', 'Souris']);
      const { drafts, orderLocationId } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([null, null]);
      expect(orderLocationId).toBeNull();
    });

    it.each(['UNAUTHORIZED', 'HOMEBOX_UNREACHABLE'] as const)('%s on the list: same handling, import possible', async (code) => {
      wire({ list: fail(code) });
      const wrapper = await mountSummary();
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('Vous pouvez importer sans emplacement.');
      expect(wrapper.find('button.primary').attributes('disabled')).toBeUndefined();
    });

    it('empty list: invitation to create a location in HomeBox, import possible (scenario 17)', async () => {
      wire({ list: listOk(null, []) });
      const wrapper = await mountSummary();
      expect(wrapper.text()).toContain('Aucun emplacement dans HomeBox. Créez-en un dans HomeBox, ou importez sans emplacement.');
      expect(wrapper.findComponent(LocationPicker).exists()).toBe(false);
      expectCatalogTexts(wrapper, [DATA, 'Clavier', 'Souris']);
      const { drafts } = await confirm(wrapper);
      expect(drafts.map((d) => d.location)).toEqual([null, null]);
    });

    it('purchase not detected (manual entry): the location choice is still offered', async () => {
      vi.mocked(send).mockImplementation((msg) =>
        Promise.resolve(msg.type === 'location/list' ? listOk() : fail('NOT_AN_ORDER_PAGE')) as never,
      );
      const wrapper = await mountSummary();
      expect(orderPicker(wrapper).exists()).toBe(true);
    });

    it('scenario 28: probable duplicate + photo + location → warning unchanged', async () => {
      wire({ products: [named('a', 'Clavier', PHOTO)], duplicates: 'found' });
      const wrapper = await mountSummary();
      await pick(orderPicker(wrapper), GARAGE);
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      expect(wrapper.find('[role="alertdialog"]').text()).toContain('Un objet semblable existe déjà dans HomeBox.');
      // The duplicate check sends neither location nor photo.
      const dup = vi.mocked(send).mock.calls.map(([m]) => m).find((m) => m.type === 'duplicate/check');
      expect(dup).toEqual({ type: 'duplicate/check', orderNumber: DATA, name: 'Clavier' });
      expect(wrapper.emitted('submit')).toBeUndefined();
      const create = wrapper.findAll('.dialog button').find((b) => b.text() === 'Créer quand même');
      await create!.trigger('click');
      const { drafts } = wrapper.emitted('submit')![0]![0] as { drafts: ImportDraft[] };
      expect(drafts[0]).toMatchObject({ location: choice(GARAGE), photo: { include: true } });
    });

    describe('last location used (US3, SC-009)', () => {
      it('preselects lastUsedId when it exists in the list', async () => {
        wire({ list: listOk('g') });
        const wrapper = await mountSummary();
        const { drafts, orderLocationId } = await confirm(wrapper);
        expect(drafts.map((d) => d.location)).toEqual([choice(GARAGE), choice(GARAGE)]);
        expect(orderLocationId).toBe('g');
      });

      it('the path comes from the list (never from a remembered name)', async () => {
        wire({ list: listOk('g') });
        const wrapper = await mountSummary();
        expect(wrapper.text()).toContain('Maison › Garage');
      });

      it('the user can change it', async () => {
        wire({ list: listOk('g') });
        const wrapper = await mountSummary();
        await pick(orderPicker(wrapper), ATELIER);
        const { drafts } = await confirm(wrapper);
        expect(drafts.map((d) => d.location)).toEqual([choice(ATELIER), choice(ATELIER)]);
      });

      it('the user can remove it: draft.location becomes null (US3-4)', async () => {
        wire({ list: listOk('g') });
        const wrapper = await mountSummary();
        await pick(orderPicker(wrapper), null);
        const { drafts, orderLocationId } = await confirm(wrapper);
        expect(drafts.map((d) => d.location)).toEqual([null, null]);
        expect(orderLocationId).toBeNull();
      });

      it('lastUsedId null (other instance or disappeared location): no preselection, no error', async () => {
        wire({ list: listOk(null) });
        const wrapper = await mountSummary();
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
        const { drafts } = await confirm(wrapper);
        expect(drafts.map((d) => d.location)).toEqual([null, null]);
      });

      it('lastUsedId absent from the received list: ignored without error', async () => {
        wire({ list: listOk('disparu') });
        const wrapper = await mountSummary();
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
        const { orderLocationId } = await confirm(wrapper);
        expect(orderLocationId).toBeNull();
      });

      it('a choice made before the list arrives is not overwritten by the preselection', async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        vi.mocked(send).mockImplementation((msg) => {
          if (msg.type === 'detect/run') return Promise.resolve(ok({ purchase: purchase([named('a', 'Clavier')]), warnings: [] })) as never;
          if (msg.type === 'location/list') return gate.then(() => listOk('g')) as never;
          return Promise.resolve(ok({ matches: [] })) as never;
        });
        const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
        await flushPromises();
        release();
        await flushPromises();
        expect(orderPicker(wrapper).props('modelValue')).toEqual(choice(GARAGE));
      });
    });
  });

  describe('LocationPicker : textes', () => {
    it('all rendered text comes from the catalog (open list, chosen value, no result)', async () => {
      const wrapper = mount(LocationPicker, {
        props: { modelValue: choice(GARAGE), options: LOCATIONS, label: 'Emplacement des produits' },
      });
      expectCatalogTexts(wrapper, [DATA, ...NAMES]);
      await wrapper.get('input').setValue('ma');
      expectCatalogTexts(wrapper, [DATA, ...NAMES]);
      await wrapper.get('input').setValue('zzz');
      expectCatalogTexts(wrapper, [DATA, ...NAMES]);
    });
  });

  describe('ResultView', () => {
    it('displays the retained location per product (result.locationAt)', () => {
      const withLoc = pending({ status: 'success', error: null, draft: draft({ location: choice(GARAGE) }) });
      const wrapper = mount(ResultView, { props: { pendings: [withLoc], baseUrl: DATA, running: false } });
      expect(wrapper.text()).toContain('Emplacement : Maison › Garage');
      expectCatalogTexts(wrapper, [DATA, ...NAMES]);
    });

    it('nothing without a location', () => {
      const none = pending({ status: 'success', error: null });
      const wrapper = mount(ResultView, { props: { pendings: [none], baseUrl: DATA, running: false } });
      expect(wrapper.text()).not.toContain('Emplacement');
    });
  });

  describe('RecoveryView on LOCATION_NOT_FOUND (scenario 18, FR-018)', () => {
    const gone = () =>
      pending({
        entityId: null,
        status: 'failed',
        error: 'LOCATION_NOT_FOUND',
        steps: { create: 'failed', update: 'pending', attachments: { d1: 'pending', m1: 'pending' }, photo: 'unavailable' },
        draft: draft({ documents: [detectedDoc], location: choice(GARAGE) }),
      });

    const mountGone = async () => {
      vi.mocked(send).mockImplementation((msg) => {
        if (msg.type === 'location/list') return Promise.resolve(listOk()) as never;
        return Promise.resolve(ok(pending({ status: 'success', error: null }))) as never;
      });
      const wrapper = mount(RecoveryView, { props: { pending: gone(), baseUrl: DATA } });
      await flushPromises();
      return wrapper;
    };

    it('reloads location/list, displays the message, offers a picker and "Importer sans emplacement"', async () => {
      const wrapper = await mountGone();
      expect(send).toHaveBeenCalledWith({ type: 'location/list' });
      expect(wrapper.text()).toContain("Cet emplacement n'existe plus dans HomeBox.");
      expect(wrapper.findComponent(LocationPicker).exists()).toBe(true);
      expect(wrapper.findAll('button').some((b) => b.text() === 'Importer sans emplacement')).toBe(true);
      expectCatalogTexts(wrapper, [DATA, ...NAMES]);
    });

    it('the picker does not offer the old choice: a new one must be made before retrying', async () => {
      const wrapper = await mountGone();
      expect(wrapper.findComponent(LocationPicker).props('modelValue')).toBeNull();
      expect(wrapper.find('button.primary').attributes('disabled')).toBeDefined();
    });

    it('new choice → import/retry passes this choice', async () => {
      const wrapper = await mountGone();
      wrapper.findComponent(LocationPicker).vm.$emit('update:modelValue', choice(ATELIER));
      await flushPromises();
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'import/retry', pendingId: 'p1', location: choice(ATELIER) }));
      expect(wrapper.emitted('updated')).toHaveLength(1);
    });

    it('"Importer sans emplacement" → import/retry with location: null', async () => {
      const wrapper = await mountGone();
      await wrapper.findAll('button').find((b) => b.text() === 'Importer sans emplacement')!.trigger('click');
      await flushPromises();
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'import/retry', location: null }));
    });

    it('list unavailable: import without location remains possible', async () => {
      vi.mocked(send).mockImplementation((msg) =>
        Promise.resolve(msg.type === 'location/list' ? fail('LOCATIONS_UNAVAILABLE') : ok(pending())) as never,
      );
      const wrapper = mount(RecoveryView, { props: { pending: gone(), baseUrl: DATA } });
      await flushPromises();
      expect(wrapper.findComponent(LocationPicker).exists()).toBe(false);
      expect(wrapper.findAll('button').some((b) => b.text() === 'Importer sans emplacement')).toBe(true);
    });

    it('reloads the list on every new LOCATION_NOT_FOUND, not only the first', async () => {
      const wrapper = await mountGone();
      const listCalls = () => vi.mocked(send).mock.calls.filter(([m]) => m.type === 'location/list').length;
      expect(listCalls()).toBe(1);
      await wrapper.setProps({ pending: gone() });
      await flushPromises();
      expect(listCalls()).toBe(2);
    });

    it('a failure other than LOCATION_NOT_FOUND does not load the list', async () => {
      vi.mocked(send).mockResolvedValue(ok(undefined) as never);
      mount(RecoveryView, { props: { pending: pending(), baseUrl: DATA } });
      await flushPromises();
      expect(send).not.toHaveBeenCalled();
    });

    it('an ordinary retry does not send a location (choice unchanged)', async () => {
      vi.mocked(send).mockResolvedValue(ok(pending()) as never);
      const plain = pending({ draft: draft({ documents: [detectedDoc] }) });
      const wrapper = mount(RecoveryView, { props: { pending: plain, baseUrl: DATA } });
      await wrapper.find('button.primary').trigger('click');
      await flushPromises();
      const msg = vi.mocked(send).mock.calls[0]![0] as { location?: unknown };
      expect(msg).not.toHaveProperty('location');
    });
  });

  describe('popup App', () => {
    it('passes orderLocationId to import/start', async () => {
      vi.mocked(send).mockImplementation((msg) => {
        if (msg.type === 'config/get') return Promise.resolve(config({ locked: false })) as never;
        if (msg.type === 'import/pending') return Promise.resolve([]) as never;
        if (msg.type === 'import/start') return Promise.resolve(ok([])) as never;
        return Promise.resolve(fail('NOT_AN_ORDER_PAGE')) as never;
      });
      vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([{ id: 1, url: 'https://www.amazon.fr/x' }] as never);
      const wrapper = mount(PopupApp);
      await flushPromises();
      wrapper.findComponent(SummaryView).vm.$emit('submit', { drafts: [draft()], manualFiles: [], orderLocationId: 'g' });
      await flushPromises();
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'import/start', orderLocationId: 'g' }));
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Step B (T062): same rendering in English. The setup-i18n.ts mock serves en.yml after
// `setTestLanguage('en')` (reset to `fr` before each test).
// ---------------------------------------------------------------------------------------------
describe('English rendering: everything comes from en.yml, nothing French (T062)', () => {
  const en = loadCatalog('en');
  const toPattern = (v: string) =>
    new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\$\d/g, '.*')}$`, 's');
  // Sizes ("15 MB") are stripped from the text rendered by visibleTexts: those of the catalog are stripped too.
  const enPatterns = Object.values(en)
    .flatMap((v) => [v, clean(v.replace(SIZE, ''))])
    .filter((v) => v.replace(/\$\d/g, '').trim().length >= 1)
    .map(toPattern);
  // French texts that must never appear in `en` (apart from deliberately identical values).
  const frOnlyPatterns = Object.entries(catalog)
    .filter(([key, v]) => !IDENTICAL_OK.includes(key) && v.replace(/\$\d/g, '').trim().length >= 3)
    .map(([, v]) => toPattern(v));
  const ACCENTED = /[À-ÖØ-öø-ÿ]/;

  beforeEach(() => setTestLanguage('en'));

  function expectEnglish(wrapper: VueWrapper, data: string[] = []) {
    const texts = visibleTexts(wrapper, data);
    const unknown = texts.filter(
      (s) => !TECHNICAL_EXAMPLES.has(s) && LETTER.test(s.split(DATA).join('')) && !enPatterns.some((p) => p.test(s)),
    );
    expect(unknown, 'textes visibles absents de en.yml').toEqual([]);
    expect(texts.filter((s) => ACCENTED.test(s.split(DATA).join(''))), 'caractères accentués').toEqual([]);
    expect(texts.filter((s) => frOnlyPatterns.some((p) => p.test(s))), 'texte français').toEqual([]);
  }

  it('ErrorBanner: each error code', () => {
    for (const code of ERROR_CODES) expectEnglish(mount(ErrorBanner, { props: { code } }));
  });

  it('InstanceBadge: HTTP warning in English, exactly the catalog value', () => {
    expectEnglish(mount(InstanceBadge, { props: { config: config() } }), [DATA]);
    const wrapper = mount(InstanceBadge, { props: { config: config({ baseUrl: 'http://192.0.2.10:7745' }) } });
    const warning = wrapper.find('.http');
    expect(warning.text()).toBe(en['common.httpWarning']);
    expect(warning.attributes('title')).toBe(en['common.httpWarningHint']);
    expect(warning.text()).toBe('Unencrypted HTTP');
    expectEnglish(wrapper, [DATA, 'http://192.0.2.10:7745']);
  });

  it('ThemeToggle et AppHeader', () => {
    const toggle = mount(ThemeToggle);
    expect(toggle.attributes('title')).toBe('Theme: Automatic (system)');
    expectEnglish(toggle);
    expectEnglish(mount(AppHeader, { props: { subtitle: DATA } }));
  });

  it('FieldEditor: undetected fields, foreign currency and validation errors', () => {
    const wrapper = mount(FieldEditor, {
      props: {
        modelValue: draft({ name: '', currency: 'USD', quantity: 0, purchaseDate: '2999-01-01', purchasePrice: -1 }),
        missing: ['name', 'purchasePrice', 'purchaseDate', 'orderNumber', 'purchaseFrom'],
      },
    });
    expectEnglish(wrapper, ['USD']);
    expect(wrapper.text()).toContain('Detected currency: USD. HomeBox stores the amount without a currency.');
  });

  it('DocumentPicker and UnlockView', () => {
    expectEnglish(mount(DocumentPicker, { props: { allowReplace: true } }));
    expectEnglish(mount(UnlockView, { props: { config: config() } }), [DATA]);
  });

  it('ResultView and RecoveryView', () => {
    const running = pending({ status: 'running', error: null, steps: { create: 'done', update: 'pending', attachments: {}, photo: 'pending' } });
    const done = pending({ id: 'p2', status: 'success', error: null });
    expectEnglish(
      mount(ResultView, { props: { pendings: [running, done, pending({ id: 'p3' })], baseUrl: DATA, running: false } }),
      [DATA],
    );
    expect(mount(ResultView, { props: { pendings: [], baseUrl: '', running: true } }).text()).toBe('Import in progress…');
    const many = mount(ResultView, {
      props: { pendings: [done, { ...done, id: 'p4' }], baseUrl: DATA, running: false },
    });
    expect(many.text()).toContain('2 items added to HomeBox.');
    expectEnglish(many, [DATA]);
    expectEnglish(mount(RecoveryView, { props: { pending: pending(), baseUrl: DATA } }), [DATA]);
    expectEnglish(
      mount(RecoveryView, { props: { pending: pending({ entityId: null, error: 'CREATE_FAILED' }), baseUrl: '' } }),
      [DATA],
    );
  });

  it('SummaryView: purchase detected, "aucune facture" box, then detection impossible', async () => {
    vi.mocked(send).mockResolvedValue(
      ok({ purchase: { ...purchase([product('a'), product('b')]), documents: [] }, warnings: ['INVOICE_MISSING'] }) as never,
    );
    const wrapper = mount(SummaryView, { props: { tabId: 1, config: config() } });
    await flushPromises();
    expectEnglish(wrapper, [DATA]);
    await wrapper.find('button.primary').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('No invoice will be attached. Create the item anyway?');
    expectEnglish(wrapper, [DATA]);

    vi.mocked(send).mockResolvedValue(fail('NOT_AN_ORDER_PAGE') as never);
    const manual = mount(SummaryView, { props: { tabId: 1, config: config() } });
    await flushPromises();
    expectEnglish(manual, [DATA]);
  });

  it('popup App and options App', async () => {
    vi.mocked(send).mockResolvedValue({ configured: false } as never);
    const popup = mount(PopupApp);
    await flushPromises();
    expect(popup.text()).toContain('Set up your HomeBox instance to get started.');
    expectEnglish(popup, [DATA]);

    vi.mocked(send).mockResolvedValue(config({ maskedKey: 'hb_…abcd' }) as never);
    const options = mount(OptionsApp);
    await flushPromises();
    expectEnglish(options, [DATA, 'hb_…abcd']);
  });
});
