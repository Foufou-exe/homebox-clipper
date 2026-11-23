<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useId } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  CompletionChoice,
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  DocumentRef,
  DuplicateMatch,
  ImportDraft,
  LocationChoice,
  LocationOption,
  ManualFile,
  OrderFieldValue,
  TagOption,
  TemplateCheck,
  DefaultTemplateRef,
  TemplateDetail,
  TemplateOption,
} from '@/shared/types';
import CompletionDialog, { type CompletionItem } from '@/ui/components/CompletionDialog.vue';
import DocumentPicker from '@/ui/components/DocumentPicker.vue';
import EntityTypePicker from '@/ui/components/EntityTypePicker.vue';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import FieldEditor from '@/ui/components/FieldEditor.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';
import InstancePicker from '@/ui/components/InstancePicker.vue';
import { defaultInstance } from '@/ui/instances';
import LocationPicker from '@/ui/components/LocationPicker.vue';
import OrderFieldsSection from '@/ui/components/OrderFieldsSection.vue';
import TagPicker from '@/ui/components/TagPicker.vue';
import TemplatePicker from '@/ui/components/TemplatePicker.vue';
import TemplateSection from '@/ui/components/TemplateSection.vue';
import WarrantyField from '@/ui/components/WarrantyField.vue';
import OrderLocationField from './OrderLocationField.vue';
import { useEntityTypes } from './entity-types';
import { completedDraft, previewDraft, primaryLabel, type LineChoice } from './completion';
import { DOCUMENT_KIND_KEYS, DOCUMENT_KIND_OPTIONS } from '@/ui/document-kind-keys';
import { t } from '@/ui/i18n';
import type { PickedDocument } from '@/ui/read-pdf';
import {
  applyTemplate,
  draftErrors,
  draftFrom,
  emptyDraft,
  emptyLineTemplate,
  formatSize,
  isTemplateDetail,
  mergeChangedDetail,
  missingFields,
  proposalFor,
  removeTemplate,
  tagLinesFor,
  templateBlocks,
  templateChoiceFor,
  type LineTemplate,
} from './drafts';
import {
  initialOrderFields,
  orderFieldRows,
  orderFieldsBlock,
  orderFieldsFor,
  mergedTemplateNames,
  type LineOrderFields,
  type OrderFieldRow,
} from './order-fields';
import { isOrderFieldSettings, type OrderFieldSettings } from '@/shared/order-fields';
import { loadWarrantySettings } from '@/ui/warranty-settings';
import { loadTagSettings } from '@/ui/tag-settings';
import { DEFAULT_TAG_SETTINGS, findExisting, normalizeTagName, tagKey, tagNameError, type TagLine, type TagSettings } from '@/shared/tags';
import { DEFAULT_WARRANTY_SETTINGS, manualWarrantyMonths, type NoDefaultReason, type WarrantySettings } from '@/shared/warranty';
import { MERCHANT_CATALOG } from '@/content/merchants/catalog';

/** Stores where the import works, in the order of the table; "(testing)" after a testing store (FR-012, FR-016). */
const supportedStores = MERCHANT_CATALOG.map((e) =>
  e.status === 'testing' ? t('summary.storeTesting', [e.displayName]) : e.displayName,
).join(', ');

const props = defineProps<{ tabId: number; config: ConfigView }>();
const emit = defineEmits<{
  submit: [
    payload: {
      /** Target instance chosen in the summary (spec 016): every request of the import goes to it only. */
      instanceId: string;
      drafts: ImportDraft[];
      manualFiles: ManualFile[];
      orderLocationId: string | null;
      /** Spec 023: the item type list was read (selector shown): only then may a default-type import erase the memory. */
      entityTypesRead: boolean;
      duplicateCheckFailed: boolean;
    },
  ];
}>();

/**
 * Target instance (spec 016, US3, research R7): the default one (last successful import, else the first). With
 * several instances a native select lets the user change it before confirming; with one, nothing changes on screen.
 * Changing it reloads the locations and tags of the new target, by generation: a late answer for a former target is
 * ignored (US3-8).
 */
const instances = computed(() => props.config.instances ?? []);
const target = ref<string | null>(defaultInstance(props.config)?.id ?? null);
const targetInstance = computed(() => instances.value.find((i) => i.id === target.value) ?? null);
const several = computed(() => instances.value.length > 1);
/** Name shown before an error concerning the target, only when several instances exist. */
const errorInstance = computed(() => (several.value ? targetInstance.value?.name : undefined));
const pickerModel = computed({
  get: () => target.value ?? '',
  set: (id: string) => changeTarget(id),
});
const announce = ref('');
/** Incremented at each change of target: an answer of an older generation is ignored. */
let generation = 0;
/** Error of the confirmation itself (e.g. the target was deleted meanwhile, FR-020): nothing is sent. */
const confirmError = ref<ErrorCode | null>(null);

interface Line {
  key: string;
  product: DetectedProduct | null;
  selected: boolean;
  draft: ImportDraft;
  /** `inherit` follows the order choice; `null` removes the location for this product (FR-014). */
  location: 'inherit' | LocationChoice | null;
  /** Why the warranty section is empty (spec 011): lives next to the draft, never sent nor persisted. */
  warrantyReason: NoDefaultReason | null;
  /** Tags of the product (spec 014): in memory only; only the checked ones are sent at confirmation. */
  tags: TagLine[];
  /** HomeBox template of the product (spec 018): in memory only; sent as `template` only when chosen. */
  template: LineTemplate;
  /**
   * Merchant and URL of the order fields (spec 019): created at opening even with the option off, never reset on a
   * change of target or template (FR-015, FR-018); gone with the popup.
   */
  orderFields: LineOrderFields;
}

const loading = ref(true);
const detectError = ref<ErrorCode | null>(null);
const warnings = ref<ErrorCode[]>([]);
const purchase = ref<DetectedPurchase | null>(null);
const lines = ref<Line[]>([]);
/** Warranty setting, read when the popup opens (spec 011). */
const warrantySettings = ref<WarrantySettings>(DEFAULT_WARRANTY_SETTINGS);
const uid = useId();
const documents = ref<{ doc: DocumentRef; selected: boolean }[]>([]);
const manualFiles = reactive(new Map<string, ManualFile>());
/** Rows whose image could not be displayed: the photo is then not sent. */
const photoErrors = reactive(new Set<string>());

/** Locations: loaded in parallel with detection, never blocking the summary (FR-017). */
const locState = ref<'loading' | 'ready' | 'unavailable'>('loading');
const locError = ref<ErrorCode>('LOCATIONS_UNAVAILABLE');
const locations = ref<LocationOption[]>([]);
const orderLocation = ref<LocationChoice | null>(null);
/** True as soon as the user acts on the order choice: the preselection no longer overwrites it. */
let orderTouched = false;
const orderModel = computed({
  get: () => orderLocation.value,
  set: (v: LocationChoice | null) => {
    orderTouched = true;
    orderLocation.value = v;
  },
});
/** HomeBox tags: loaded in parallel with detection, never blocking the summary (spec 014, FR-011). */
const tagState = ref<'loading' | 'ready' | 'unavailable'>('loading');
const tagOptions = ref<TagOption[]>([]);

/**
 * HomeBox item templates (spec 018, contracts/ui.md §1): loaded in parallel with the locations and tags, by
 * generation (an answer for a former target is ignored), never blocking the summary nor an import without template.
 * Details read are kept in memory for the current generation only; nothing is logged nor persisted.
 */
const templateState = ref<'loading' | 'ready' | 'empty' | 'unavailable'>('loading');
const templateOptions = ref<TemplateOption[]>([]);
const templateError = ref<ErrorCode>('TEMPLATES_UNAVAILABLE');
const defaultTpl = ref<{ ref: DefaultTemplateRef | null; state: 'none' | 'ok' | 'missing' | 'unavailable' }>({ ref: null, state: 'none' });
const details = new Map<string, TemplateDetail>();
const templateAnnounce = ref('');
/** Template whose detail could not be read, per product: shown with « Try again » (US5-5). */
const loadFailed = reactive(new Map<string, { id: string; name: string; code: ErrorCode }>());
/** Messages of the last re-check of the templates at confirmation (US6). */
const templateNotices = ref<string[]>([]);
let linesReady = false;
let defaultApplied = false;

const templateName = (id: string) => templateOptions.value.find((o) => o.id === id)?.name ?? details.get(id)?.name ?? id;

type DetailResult = { detail: TemplateDetail } | { code: ErrorCode };
/** Reads in flight, by template: the default template applied to several products is read once (SC-005). */
const inflight = new Map<string, Promise<DetailResult>>();

/** Detail of a template: from the memory of this generation, otherwise `template/get` on the target instance. */
function fetchDetail(id: string): Promise<DetailResult> {
  const cached = details.get(id);
  if (cached) return Promise.resolve({ detail: cached });
  let pending = inflight.get(id);
  if (!pending) {
    pending = readDetail(id).finally(() => inflight.delete(id));
    inflight.set(id, pending);
  }
  return pending;
}

async function readDetail(id: string): Promise<DetailResult> {
  const instanceId = target.value;
  const gen = generation;
  if (!instanceId) return { code: 'NOT_CONFIGURED' };
  try {
    const res = await send({ type: 'template/get', instanceId, templateId: id });
    if (!res.ok) return { code: res.error };
    if (!isTemplateDetail(res.value?.template)) return { code: 'TEMPLATES_UNAVAILABLE' };
    // An answer for a former target never enters the memory of the new one (US5-2).
    if (gen === generation) details.set(id, res.value.template);
    return { detail: res.value.template };
  } catch {
    return { code: 'TEMPLATES_UNAVAILABLE' };
  }
}

/** Applies a detail on a line (§1.3) and places the proposed location (order field or product). */
function applyOn(line: Line, detail: TemplateDetail) {
  const res = applyTemplate({ draft: line.draft, tags: line.tags, template: line.template }, detail, {
    manual: line.product === null,
    tagState: tagState.value,
    tagOptions: tagOptions.value,
    locations: locState.value === 'ready' ? locations.value : [],
    currentLocation: effectiveLocation(line),
  });
  line.draft = res.line.draft;
  line.tags = res.line.tags;
  line.template = res.line.template;
  if (res.location) {
    if (multi.value) line.location = res.location;
    else if (orderTouched) line.template.applied.location = false;
    else orderLocation.value = res.location;
  }
  templateAnnounce.value = t('templates.applied', [detail.name, String(detail.fields.length)]);
}

/** Removes the template of a line and what it set, keeping what the user changed (FR-003). */
function dropTemplate(line: Line) {
  const proposed = line.template.detail?.locationId ?? null;
  const res = removeTemplate({ draft: line.draft, tags: line.tags, template: line.template });
  line.draft = res.line.draft;
  line.tags = res.line.tags;
  line.template = res.line.template;
  if (!res.removeLocation || !proposed) return;
  if (multi.value) {
    if (line.location !== 'inherit' && line.location?.id === proposed) line.location = 'inherit';
  } else if (!orderTouched && orderLocation.value?.id === proposed) {
    orderLocation.value = null;
  }
}

/** Choice of the picker: `null` = « None ». A late answer (other choice, other target) is ignored. */
async function chooseTemplate(line: Line, id: string | null) {
  loadFailed.delete(line.key);
  templateNotices.value = [];
  if (line.template.id !== null) dropTemplate(line);
  if (id === null) {
    templateAnnounce.value = t('templates.removed');
    return;
  }
  line.template = { ...emptyLineTemplate(), id, state: 'loading' };
  const gen = generation;
  const res = await fetchDetail(id);
  if (gen !== generation || line.template.id !== id || line.template.state !== 'loading') return;
  if ('code' in res) {
    line.template = emptyLineTemplate();
    loadFailed.set(line.key, { id, name: templateName(id), code: res.code });
    return;
  }
  applyOn(line, res.detail);
}

/** Default template of the instance (FR-002): preselected on each product selected when the list arrives. */
function applyDefault() {
  if (defaultApplied || !linesReady || templateState.value !== 'ready' || defaultTpl.value.state !== 'ok') return;
  const ref = defaultTpl.value.ref;
  defaultApplied = true;
  if (!ref || !templateOptions.value.some((o) => o.id === ref.id)) return;
  for (const line of lines.value) if (line.selected && line.template.id === null) void chooseTemplate(line, ref.id);
}

/** Without a template list, a remembered default is only read to say it was not applied (US5-4). No network. */
async function loadDefaultRef(instanceId: string, gen: number) {
  try {
    const res = await send({ type: 'template/get-default', instanceId });
    if (gen !== generation || !res.ok || !res.value?.defaultTemplate) return;
    defaultTpl.value = { ref: res.value.defaultTemplate, state: 'unavailable' };
  } catch {
    // nothing to say
  }
}

async function loadTemplates() {
  const instanceId = target.value;
  const gen = generation;
  if (!instanceId) {
    templateError.value = 'NOT_CONFIGURED';
    templateState.value = 'unavailable';
    return;
  }
  templateState.value = 'loading';
  try {
    const res = await send({ type: 'template/list', instanceId });
    if (gen !== generation) return; // answer for a former target
    if (!res.ok || !Array.isArray(res.value?.templates)) {
      templateError.value = res.ok ? 'TEMPLATES_UNAVAILABLE' : res.error;
      templateState.value = 'unavailable';
      await loadDefaultRef(instanceId, gen);
      return;
    }
    templateOptions.value = res.value.templates;
    templateState.value = res.value.templates.length ? 'ready' : 'empty';
    defaultTpl.value = { ref: res.value.defaultTemplate ?? null, state: res.value.defaultState ?? 'none' };
    applyDefault();
  } catch {
    if (gen !== generation) return;
    templateError.value = 'TEMPLATES_UNAVAILABLE';
    templateState.value = 'unavailable';
  }
}

/**
 * Entity type of each product (spec 023, contracts/ui.md §1): read in parallel with the locations and tags, by
 * generation (an answer for a former target is ignored). No selector and no banner when the instance has no types or a
 * single one, or when the read fails: the screen and the import are then exactly those of before.
 */
const entityTypes = useEntityTypes();
const entityTypeView = entityTypes.view;

function loadEntityTypes(): Promise<void> {
  const instanceId = target.value;
  const gen = generation;
  if (!instanceId) return Promise.resolve();
  return entityTypes.load(() => send({ type: 'entity-type/list', instanceId }), () => gen === generation);
}

/**
 * Order-fields setting of the target instance (spec 019, contracts/ui.md §2.1): a local read, no HomeBox request
 * (FR-014). Absent, failed, thrown or malformed answer ⇒ `null`: no section, the option is considered off.
 */
const orderSettings = ref<OrderFieldSettings | null>(null);
const orderOn = computed(() => orderSettings.value?.enabled === true);

async function loadOrderSettings() {
  const instanceId = target.value;
  const gen = generation;
  if (!instanceId) {
    orderSettings.value = null;
    return;
  }
  try {
    const res = await send({ type: 'order-fields/get', instanceId });
    if (gen !== generation) return; // answer for a former target
    orderSettings.value = res?.ok && isOrderFieldSettings(res.value?.settings) ? res.value.settings : null;
  } catch {
    if (gen === generation) orderSettings.value = null;
  }
}

/** Rows of the order fields of a line, with the settings of the target (only called with the option on). */
const rowsOf = (line: Line): OrderFieldRow[] =>
  orderSettings.value ? orderFieldRows(orderSettings.value, line.draft, line.orderFields, line.template) : [];
/** What the section shows (hidden, or the names it creates): a change at a change of target is announced (FR-037). */
const orderShape = () => (orderOn.value && orderSettings.value ? JSON.stringify(orderSettings.value.names) : null);
function orderNotice(before: string | null): string {
  const after = orderShape();
  if (after === before) return '';
  return after === null ? t('orderFields.hidden') : t('orderFields.shown');
}

/** Template fields merged with an order field (FR-016), option on only; `undefined`: the behavior of spec 018. */
const mergedOf = (line: Line): string[] | undefined => (orderOn.value ? mergedTemplateNames(rowsOf(line)) : undefined);

/** Existing tags take the HomeBox name and identifier (FR-004, US1-5); also when the list arrives late. */
function reconcileTags(target: Line[]) {
  if (tagState.value !== 'ready') return;
  for (const line of target) {
    for (const tag of line.tags) {
      const found = findExisting(tag.id ? { name: tag.name, id: tag.id } : { name: tag.name }, tagOptions.value);
      if (found) {
        // The HomeBox spelling, normalised (spaces, NFC) so that the import message stays valid; an invalid
        // HomeBox name keeps ours. The identifier is enough to match the tag.
        const name = normalizeTagName(found.name);
        if (tagNameError(name) === null) {
          tag.name = name;
          tag.key = tagKey(name);
        }
        tag.id = found.id;
      }
    }
  }
}

async function loadTags() {
  const instanceId = target.value;
  const gen = generation;
  if (!instanceId) {
    tagState.value = 'unavailable';
    return;
  }
  try {
    const res = await send({ type: 'tag/list', instanceId });
    if (gen !== generation) return; // answer for a former target
    if (!res.ok || !Array.isArray(res.value?.tags)) {
      tagState.value = 'unavailable';
      return;
    }
    tagOptions.value = res.value.tags;
    tagState.value = 'ready';
    reconcileTags(lines.value);
  } catch {
    if (gen === generation) tagState.value = 'unavailable';
  }
}

/** Rows whose location picker is open. */
const editingLines = reactive(new Set<string>());

async function loadLocations() {
  // Spec 016: the target instance; without one, nothing is sent (no fallback).
  const instanceId = target.value;
  const gen = generation;
  if (!instanceId) {
    locError.value = 'NOT_CONFIGURED';
    locState.value = 'unavailable';
    return;
  }
  try {
    const res = await send({ type: 'location/list', instanceId });
    if (gen !== generation) return; // answer for a former target
    if (!res.ok || !Array.isArray(res.value?.locations)) {
      locError.value = res.ok ? 'LOCATIONS_UNAVAILABLE' : res.error;
      locState.value = 'unavailable';
      return;
    }
    locations.value = res.value.locations;
    locState.value = 'ready';
    // Last location used (FR-020): preselected if it is in the list, without overwriting a choice already made.
    const last = res.value.lastUsedId ? locations.value.find((l) => l.id === res.value.lastUsedId) : undefined;
    if (last && !orderTouched) orderLocation.value = { id: last.id, path: [...last.path] };
  } catch {
    if (gen !== generation) return;
    locError.value = 'LOCATIONS_UNAVAILABLE';
    locState.value = 'unavailable';
  }
}

/**
 * New target (R7): locations and per-product choices reset, then the last location of the new instance; tag
 * identifiers dropped (they belong to one instance) and « new » recomputed against the new list; fields, selection,
 * documents, photo and warranty kept. The target never changes by itself (no automatic switch after an error).
 */
async function changeTarget(id: string) {
  if (submitting.value || dialog.value.kind !== 'none' || id === target.value || !instances.value.some((i) => i.id === id)) return;
  // Spec 018 (US5-1): the template of each product and what it set are removed; templates belong to one instance.
  for (const line of lines.value) if (line.template.id !== null) dropTemplate(line);
  // Spec 019: the section follows the settings of the new target; the values typed are kept (FR-015).
  const orderBefore = orderShape();
  orderSettings.value = null;
  target.value = id;
  const gen = ++generation;
  details.clear();
  inflight.clear();
  loadFailed.clear();
  templateNotices.value = [];
  templateOptions.value = [];
  templateState.value = 'loading';
  defaultTpl.value = { ref: null, state: 'none' };
  defaultApplied = false;
  announce.value = '';
  confirmError.value = null;
  orderLocation.value = null;
  orderTouched = false;
  locations.value = [];
  locState.value = 'loading';
  editingLines.clear();
  tagOptions.value = [];
  tagState.value = 'loading';
  // Spec 023: a type belongs to one instance; the choices are reset and the types of the new target are read.
  entityTypes.reset();
  for (const line of lines.value) {
    line.location = 'inherit';
    for (const tag of line.tags) tag.id = null;
  }
  await Promise.all([loadLocations(), loadTags(), loadTemplates(), loadEntityTypes(), loadOrderSettings()]);
  if (gen === generation && targetInstance.value) {
    announce.value = [t('summary.instanceLoaded', [targetInstance.value.name]), orderNotice(orderBefore)].filter(Boolean).join(' ');
  }
}

const effectiveLocation = (line: Line): LocationChoice | null =>
  line.location === 'inherit' ? orderLocation.value : line.location;
const locationText = (loc: LocationChoice | null) => (loc ? loc.path.join(t('location.pathSeparator')) : t('location.none'));
function setLineLocation(line: Line, v: LocationChoice | null) {
  line.location = v;
  editingLines.delete(line.key);
}
/** Back to inheritance: the product follows the order choice again (the object still has only one parent). */
function useOrderLocation(line: Line) {
  line.location = 'inherit';
  editingLines.delete(line.key);
}
function toggleEdit(line: Line) {
  if (!editingLines.delete(line.key)) editingLines.add(line.key);
}

function onPhotoError(line: Line) {
  photoErrors.add(line.key);
  if (line.draft.photo) line.draft.photo.include = false;
}

/** Products concerned by the duplicate check (spec 015): a group only exists with at least one item. */
interface DuplicateGroup {
  key: string;
  /** Name of the draft at confirmation time. */
  product: string;
  /** Certain duplicates (same order number and same name). */
  matches: DuplicateMatch[];
  /** Similar items (close name, at most 5). */
  similar: DuplicateMatch[];
  moreSimilar: boolean;
}

type Dialog =
  | { kind: 'none' }
  | { kind: 'no-invoice' }
  | { kind: 'checking' }
  | { kind: 'duplicates'; groups: DuplicateGroup[]; unchecked: string[] }
  // Spec 021: confirmation of the completions; keeps the duplicate dialog to go back to it, choices intact.
  | { kind: 'completion'; groups: DuplicateGroup[]; unchecked: string[]; items: CompletionItem[] };
const dialog = ref<Dialog>({ kind: 'none' });
/** Set at the first `submit()`: the screen is replaced by the result, a second click must emit nothing. */
const submitting = ref(false);
const duplicateCheckFailed = ref(false);
const cancelDuplicates = ref<HTMLButtonElement | null>(null);

/**
 * Spec 021 (contracts/ui-completion.md §1): choice of each product of the duplicate dialog, by line key; `create` when
 * absent (FR-001). Reset at each duplicate check; kept when coming back from the confirmation (FR-006).
 */
const lineChoices = reactive(new Map<string, LineChoice>());
const choiceOf = (key: string): LineChoice => lineChoices.get(key) ?? { kind: 'create' };
const chosenValue = (key: string): string => {
  const choice = choiceOf(key);
  return choice.kind === 'complete' ? choice.entityId : 'create';
};
function setChoice(key: string, match: DuplicateMatch | null) {
  lineChoices.set(key, match ? { kind: 'complete', entityId: match.id, itemName: match.name, url: match.url } : { kind: 'create' });
}
/** Identifier of the radio of one item of one group (the same item may be listed under several products). */
const radioId = (group: number, list: 'm' | 's', index: number) => `${uid}-complete-${group}-${list}-${index}`;
const duplicatesLabel = (groups: DuplicateGroup[]) => primaryLabel(groups.map((g) => choiceOf(g.key)));
/** Previews in flight: the primary button is disabled, a second click does nothing. */
const previewing = ref(false);
const addButton = ref<HTMLButtonElement | null>(null);

onMounted(async () => {
  void loadLocations();
  void loadTags();
  void loadTemplates();
  void loadEntityTypes();
  void loadOrderSettings();
  // Read at each opening (never cached); an unreadable storage gives the defaults, never a blocked popup.
  const [res, settings, tagSettings] = await Promise.all([
    send({ type: 'detect/run', tabId: props.tabId }),
    loadWarrantySettings(),
    loadTagSettings().catch((): TagSettings => ({ ...DEFAULT_TAG_SETTINGS, rules: [] })),
  ]);
  warrantySettings.value = settings;
  loading.value = false;
  if (!res.ok) {
    detectError.value = res.error;
    // Manual entry: no store and no detected name, so no tag is proposed (E3).
    lines.value = [
      {
        key: 'manual',
        product: null,
        selected: true,
        draft: emptyDraft(),
        location: 'inherit',
        warrantyReason: null,
        tags: [],
        template: emptyLineTemplate(),
        orderFields: initialOrderFields(emptyDraft()),
      },
    ];
    linesReady = true;
    applyDefault();
    return;
  }
  const store = MERCHANT_CATALOG.find((e) => e.id === res.value.purchase.source);
  purchase.value = res.value.purchase;
  warnings.value = res.value.warnings;
  const products = res.value.purchase.products.filter((p) => p.name.value !== null);
  const lineFor = (key: string, p: DetectedProduct | null): Line => {
    const ctx = { settings: warrantySettings.value };
    const draft = draftFrom(res.value.purchase, p, ctx);
    return {
      key,
      product: p,
      selected: true,
      draft,
      location: 'inherit',
      warrantyReason: proposalFor(res.value.purchase, p, ctx).reason,
      // Evaluated once, on the detected name (E3): editing the name does not recompute them.
      tags: tagLinesFor(store?.tagName ?? null, p?.name.value ?? null, tagSettings),
      template: emptyLineTemplate(),
      orderFields: initialOrderFields(draft),
    };
  };
  const built = products.length ? products.map((p) => lineFor(p.key, p)) : [lineFor('manual', null)];
  reconcileTags(built);
  lines.value = built;
  documents.value = res.value.purchase.documents.map((doc) => ({ doc, selected: true }));
  linesReady = true;
  applyDefault();
});

/** A single product: a single "Location" field. Several: an order field, then one mention per product. */
const multi = computed(() => lines.value.length > 1);
const productName = (line: Line) => line.draft.name || t('summary.unnamedProduct');
/** Duration proposed by "Add a warranty": the setting, else the legal duration of the store's country. */
const manualMonths = computed(() =>
  manualWarrantyMonths(warrantySettings.value, MERCHANT_CATALOG.find((e) => e.id === purchase.value?.source)?.country ?? null),
);

const selectedLines = computed(() => lines.value.filter((l) => l.selected));
const selectedDocs = computed(() => documents.value.filter((d) => d.selected).map((d) => d.doc));
/** Spec 018 (FR-005): a product with a template needs an effective location. */
const needsLocation = (line: Line) => line.selected && line.template.id !== null && effectiveLocation(line) === null;
const locationRequiredMessage = computed(() =>
  locState.value === 'unavailable' ? t('templates.locationRequiredUnavailable') : t('templates.locationRequired'),
);
const canSubmit = computed(
  () =>
    selectedLines.value.length > 0 &&
    selectedLines.value.every((l) => draftErrors(l.draft).length === 0) &&
    // Spec 018: template loaded, fields valid, location chosen (contracts/ui.md §1.6).
    selectedLines.value.every((l) => !templateBlocks(l.template, mergedOf(l)) && !needsLocation(l)) &&
    // Spec 019 (FR-013): an order field to create with an invalid value blocks; an empty one never does.
    selectedLines.value.every((l) => !orderOn.value || !orderFieldsBlock(rowsOf(l))) &&
    dialog.value.kind === 'none',
);

function onPicked({ doc, file, replaceDetected }: PickedDocument) {
  if (replaceDetected) {
    for (const d of documents.value) if (d.doc.origin === 'detected') d.selected = false;
  }
  documents.value.push({ doc, selected: true });
  manualFiles.set(doc.id, file);
}

function removeManual(id: string) {
  documents.value = documents.value.filter((d) => d.doc.id !== id);
  manualFiles.delete(id);
}

function cancel() {
  // Cancel: nothing is sent, the detected data is forgotten.
  purchase.value = null;
  lines.value = [];
  documents.value = [];
  manualFiles.clear();
  window.close();
}

async function onAdd() {
  if (!canSubmit.value) return;
  if (selectedDocs.value.length === 0) {
    dialog.value = { kind: 'no-invoice' };
    return;
  }
  await checkDuplicates();
}

/**
 * Spec 015: every checked product is checked, one after the other (certain duplicates and similar items). A failure,
 * total or partial, never blocks the import and stays visible (FR-013); nothing is created without a choice (FR-012).
 */
async function checkDuplicates() {
  dialog.value = { kind: 'checking' };
  duplicateCheckFailed.value = false;
  confirmError.value = null;
  lineChoices.clear();
  const groups: DuplicateGroup[] = [];
  const unchecked: string[] = [];
  for (const line of selectedLines.value) {
    let res;
    const instanceId = target.value;
    try {
      // Without an order number (manual entry, not detected): checked by close name only (FR-003). Without a target
      // instance nothing is sent and the product stays "not checked".
      res = instanceId
        ? await send({ type: 'duplicate/check', instanceId, orderNumber: line.draft.orderNumber ?? '', name: line.draft.name })
        : null;
    } catch {
      res = null; // unexpected rejection = not checked, never silent
    }
    // The target no longer exists (deleted meanwhile, FR-020): shown, nothing is sent.
    if (res && !res.ok && res.error === 'INSTANCE_NOT_FOUND') {
      confirmError.value = 'INSTANCE_NOT_FOUND';
      dialog.value = { kind: 'none' };
      return;
    }
    if (!res || !res.ok || res.value.incomplete) unchecked.push(productName(line));
    if (res?.ok && (res.value.matches.length || res.value.similar.length)) {
      groups.push({
        key: line.key,
        product: productName(line),
        matches: res.value.matches,
        similar: res.value.similar,
        moreSimilar: res.value.moreSimilar,
      });
    }
  }
  duplicateCheckFailed.value = unchecked.length > 0;
  if (groups.length) {
    // Stable sort: the groups with a certain duplicate first, then the others, each in summary order (US3-1).
    groups.sort((a, b) => Number(b.matches.length > 0) - Number(a.matches.length > 0));
    dialog.value = { kind: 'duplicates', groups, unchecked };
    await nextTick();
    cancelDuplicates.value?.focus(); // FR-020: focus on the action without effect
    return;
  }
  await submit();
}

/** "Cancel": back to the summary, every choice intact (US1-3). */
async function cancelDuplicateDialog() {
  if (previewing.value) return; // spec 021: the previews in flight would reopen a dialog
  dialog.value = { kind: 'none' };
  await nextTick();
  addButton.value?.focus();
}

/** Primary button of the duplicate dialog: "Create anyway", or the preview of the completions (spec 021, FR-003). */
async function onDuplicatesPrimary() {
  if (dialog.value.kind !== 'duplicates') return;
  if (dialog.value.groups.some((g) => choiceOf(g.key).kind === 'complete')) await previewCompletions();
  else await submit();
}

/** One `import/complete-preview` on the target instance; a failure is shown in the confirmation (FR-003, FR-004). */
async function previewItem(instanceId: string, line: Line, choice: Extract<LineChoice, { kind: 'complete' }>, docs: DocumentRef[]): Promise<CompletionItem> {
  const draft = previewDraft(draftOf(line, docs));
  const item = {
    key: line.key,
    product: productName(line),
    entityId: choice.entityId,
    itemName: choice.itemName,
    url: choice.url,
    draft,
    hasTemplate: line.template.id !== null,
    hasLocation: effectiveLocation(line) !== null,
  };
  try {
    const res = await send({ type: 'import/complete-preview', instanceId, entityId: choice.entityId, draft });
    if (res?.ok) return { ...item, preview: res.value, error: null };
    return { ...item, preview: null, error: res?.error ?? 'HOMEBOX_UNREACHABLE' };
  } catch {
    return { ...item, preview: null, error: 'HOMEBOX_UNREACHABLE' };
  }
}

/** "Review the changes": reads each chosen item again, then opens the confirmation (spec 021, US1-2). */
async function previewCompletions() {
  const current = dialog.value;
  if (submitting.value || previewing.value || current.kind !== 'duplicates') return;
  const instanceId = target.value;
  if (!instanceId) {
    confirmError.value = 'NOT_CONFIGURED';
    dialog.value = { kind: 'none' };
    return;
  }
  previewing.value = true;
  const docs = selectedDocs.value;
  const items: CompletionItem[] = [];
  for (const line of selectedLines.value) {
    const choice = choiceOf(line.key);
    if (choice.kind === 'complete') items.push(await previewItem(instanceId, line, choice, docs)); // NOSONAR: sequential on purpose (one instance)
  }
  previewing.value = false;
  // The dialog changed meanwhile (closed, target changed): the answers are dropped, nothing is opened.
  if (dialog.value !== current) return;
  dialog.value = { kind: 'completion', groups: current.groups, unchecked: current.unchecked, items };
}

/** "Back": the duplicate dialog again, every choice intact; nothing is sent (FR-006). */
async function backToDuplicates() {
  const current = dialog.value;
  if (current.kind !== 'completion') return;
  dialog.value = { kind: 'duplicates', groups: current.groups, unchecked: current.unchecked };
  await nextTick();
  cancelDuplicates.value?.focus();
}

async function confirmCompletions(choices: Record<string, CompletionChoice>) {
  await submit(new Map(Object.entries(choices)));
}

const copyOf = (loc: LocationChoice | null): LocationChoice | null => (loc ? { id: loc.id, path: [...loc.path] } : null);

function checkedTags(line: Line): { tags?: { name: string; id?: string; noCreate?: true }[] } {
  const tags = line.tags
    .filter((t) => t.checked)
    .map((t) => ({
      name: t.name,
      ...(t.id ? { id: t.id } : {}),
      // Spec 018 (FR-015): a default tag of a template is never created.
      ...(t.origin === 'template' ? { noCreate: true as const } : {}),
    }));
  return tags.length ? { tags } : {};
}

/** Spec 018: `template` only for a product with a template; no key at all otherwise (invariant 1). */
function templateOf(line: Line) {
  // Spec 019: the fields merged with an order field are not sent (never two fields of the same name, invariant 3).
  const choice = templateChoiceFor(line.template, mergedOf(line));
  return choice ? { template: choice } : {};
}

/** Spec 019: `orderFields` only with the option on and a field to create; no key at all otherwise (FR-025). */
function orderFieldsOf(line: Line): { orderFields?: OrderFieldValue[] } {
  if (!orderOn.value) return {};
  const fields = orderFieldsFor(rowsOf(line));
  return fields ? { orderFields: fields } : {};
}

/** Distinct templates (by id) of the lines, with the fingerprint known to the screen. */
function templateRefs(withTemplate: Line[]): { id: string; fingerprint: string }[] {
  const refs: { id: string; fingerprint: string }[] = [];
  for (const l of withTemplate) {
    const d = l.template.detail;
    if (d && !refs.some((r) => r.id === d.id)) refs.push({ id: d.id, fingerprint: d.fingerprint });
  }
  return refs;
}

/** Applies one re-check result to the lines concerned; returns the notice to show, if the template is gone or changed. */
function noticeFor(r: TemplateCheck, withTemplate: Line[]): string | null {
  const concerned = withTemplate.filter((l) => l.template.id === r.id);
  const name = concerned[0]?.template.detail?.name ?? templateName(r.id);
  if (r.state === 'missing') {
    for (const l of concerned) l.template = { ...l.template, state: 'error' };
    return t('templates.goneBeforeImport', [name, concerned.map(productName).join(', ')]);
  }
  if (r.state !== 'changed') return null;
  details.set(r.id, r.template);
  let changes: string[] = [];
  for (const l of concerned) {
    const merged = mergeChangedDetail(l.template, r.template);
    l.template = merged.template;
    changes = merged.changes;
  }
  return t('templates.changedList', [name, changes.length ? changes.join(', ') : '—']);
}

/**
 * Re-check of the chosen templates just before the import (FR-020, contracts/ui.md §1.6): deleted → the choice is
 * kept, marked in error; changed → the new detail replaces the old one, the values entered are kept, the changes are
 * listed. In both cases nothing is sent and a new confirmation is required (FR-021). `true`: every template is the same.
 */
async function checkTemplates(instanceId: string, withTemplate: Line[]): Promise<boolean> {
  const refs = templateRefs(withTemplate);
  let res;
  try {
    res = await send({ type: 'template/check', instanceId, refs });
  } catch {
    res = null;
  }
  if (!res?.ok) {
    confirmError.value = res ? res.error : 'TEMPLATES_UNAVAILABLE';
    return false;
  }
  const notices: string[] = [];
  for (const r of res.value.results) {
    const notice = noticeFor(r, withTemplate);
    if (notice) notices.push(notice);
  }
  templateNotices.value = notices;
  return notices.length === 0;
}

/** Draft of a line as the import sends it (specs 014, 018, 019: unchanged). */
function draftOf(l: Line, docs: DocumentRef[]): ImportDraft {
  return {
    ...l.draft,
    documents: docs,
    // Preview failed: the photo is "unavailable" (FR-009), not "not requested".
    photo: l.draft.photo && !photoErrors.has(l.key) ? { ...l.draft.photo } : null,
    location: copyOf(effectiveLocation(l)),
    // Deep copy: the reactive object of the screen is never shared with the message.
    // A lifetime warranty carries no date (the remembered one only serves to uncheck the box).
    warranty: l.draft.warranty ? { ...l.draft.warranty, expires: l.draft.warranty.lifetime ? null : l.draft.warranty.expires } : null,
    // Only the checked tags, as plain copies; no key at all without a checked tag (sequence unchanged).
    ...checkedTags(l),
    // Spec 023: `entityTypeId` only for a type other than the server default; no key at all otherwise.
    ...entityTypes.draftFor(l.key),
    ...templateOf(l),
    ...orderFieldsOf(l),
  };
}

/**
 * `completions` (spec 021): the confirmed choice of each product completed instead of created, by line key. Without
 * it, or for the other lines, the drafts are exactly those of before (FR-025).
 */
async function submit(completions?: ReadonlyMap<string, CompletionChoice>) {
  if (submitting.value) return; // a second click must not start a second import
  const instanceId = target.value;
  if (!instanceId) {
    // No target known: nothing is sent (no fallback to another instance).
    confirmError.value = 'NOT_CONFIGURED';
    dialog.value = { kind: 'none' };
    return;
  }
  // Spec 021: a completed product never uses its template; it is not checked again.
  const withTemplate = selectedLines.value.filter((l) => l.template.id !== null && !completions?.has(l.key));
  if (withTemplate.length) {
    dialog.value = { kind: 'checking' };
    templateNotices.value = [];
    const same = await checkTemplates(instanceId, withTemplate);
    if (!same) {
      dialog.value = { kind: 'none' };
      return;
    }
  }
  submitting.value = true;
  dialog.value = { kind: 'none' };
  const docs = selectedDocs.value;
  emit('submit', {
    instanceId,
    drafts: selectedLines.value.map((l) => {
      const draft = draftOf(l, docs);
      const choice = completions?.get(l.key);
      return choice ? completedDraft(draft, choice) : draft;
    }),
    manualFiles: docs.flatMap((d) => {
      const f = manualFiles.get(d.id);
      return f ? [f] : [];
    }),
    // Order choice alone: the service worker uses it to remember the last location (R10).
    orderLocationId: orderLocation.value?.id ?? null,
    entityTypesRead: entityTypeView.value !== null,
    duplicateCheckFailed: duplicateCheckFailed.value,
  });
}
</script>

<template>
  <section class="summary">
    <!-- Locked from the duplicate check on: the confirmation concerns this target only (US3-7). -->
    <InstancePicker
      v-if="several"
      v-model="pickerModel"
      :instances="instances"
      :submitting="submitting || dialog.kind !== 'none'"
      :announce="announce"
    />
    <InstanceBadge v-else-if="targetInstance" :instance="targetInstance" />

    <p v-if="loading" class="muted" role="status">{{ t('summary.detecting') }}</p>

    <template v-else>
      <ErrorBanner v-if="detectError" :code="detectError" tone="warning" />
      <ErrorBanner v-for="w in warnings" :key="w" :code="w" tone="warning" />
      <template v-if="tagState === 'unavailable'">
        <ErrorBanner code="TAGS_UNAVAILABLE" tone="warning" :instance="errorInstance" />
        <p class="muted">{{ t('tags.unavailableHelp') }}</p>
      </template>
      <!-- Spec 018: a template list that cannot be read never blocks an import without template (US5-3). -->
      <ErrorBanner v-if="templateState === 'unavailable'" :code="templateError" tone="warning" :instance="errorInstance">
        <button type="button" :disabled="submitting || dialog.kind !== 'none'" @click="loadTemplates">{{ t('templates.retry') }}</button>
      </ErrorBanner>
      <output v-if="defaultTpl.state === 'unavailable'" class="muted">{{ t('templates.defaultNotApplied') }}</output>
      <output v-if="defaultTpl.state === 'missing'" class="muted">{{ t('templates.defaultMissing') }}</output>
      <p class="visually-hidden" aria-live="polite">{{ templateAnnounce }}</p>
      <template v-if="detectError === 'NOT_AN_ORDER_PAGE'">
        <p class="muted">{{ t('summary.supportedStores', [supportedStores]) }}</p>
        <p class="muted">{{ t('summary.reportHint') }}</p>
      </template>
      <p v-if="detectError" class="muted">{{ t('summary.manualHint') }}</p>

      <OrderLocationField
        v-if="multi"
        v-model="orderModel"
        :state="locState"
        :error="locError"
        :options="locations"
        :multi="true"
        :instance="errorInstance"
        :invalid="lines.some((l) => l.location === 'inherit' && needsLocation(l))"
      />

      <h2 v-if="purchase && multi" class="section-title">{{ t('summary.detectedProducts') }}</h2>
      <div v-for="line in lines" :key="line.key" class="line card">
        <label v-if="lines.length > 1" class="pick">
          <input v-model="line.selected" type="checkbox" />
          <span>{{ line.draft.name || t('summary.unnamedProduct') }}</span>
        </label>
        <div v-if="line.selected && line.draft.photo" class="photo">
          <img :src="line.draft.photo.url" alt="" referrerpolicy="no-referrer" width="64" height="64" @error="onPhotoError(line)" />
          <div>
            <label class="pick">
              <input v-model="line.draft.photo.include" type="checkbox" :disabled="photoErrors.has(line.key)" />
              <span>{{ t('summary.photoInclude') }}</span>
            </label>
            <p v-if="photoErrors.has(line.key)" class="muted" role="status">{{ t('summary.photoLoadFailed') }}</p>
          </div>
        </div>
        <p v-else-if="line.selected && line.product" class="photo muted">{{ t('summary.photoNone') }}</p>
        <FieldEditor v-if="line.selected" v-model="line.draft" :missing="missingFields(purchase, line.product)" />
        <EntityTypePicker
          v-if="line.selected && entityTypeView"
          :options="entityTypeView.types"
          :model-value="entityTypes.selectedFor(line.key)"
          :default-id="entityTypeView.defaultId"
          :product-name="productName(line)"
          :disabled="submitting || dialog.kind !== 'none'"
          @update:model-value="entityTypes.choose(line.key, $event)"
        />
        <template v-if="line.selected && templateState === 'ready'">
          <TemplatePicker
            :options="templateOptions"
            :model-value="line.template.id"
            :product-name="productName(line)"
            :disabled="submitting || dialog.kind !== 'none'"
            @update:model-value="chooseTemplate(line, $event)"
          />
          <output v-if="line.template.state === 'loading'" class="muted">{{ t('templates.loading') }}</output>
          <ErrorBanner v-if="line.template.state === 'error'" code="TEMPLATE_NOT_FOUND" />
          <TemplateSection
            v-if="line.template.state === 'ready'"
            v-model="line.template"
            :product-name="productName(line)"
            :merged-names="mergedOf(line)"
          />
        </template>
        <OrderFieldsSection
          v-if="line.selected && orderOn"
          v-model="line.orderFields"
          :rows="rowsOf(line)"
          :id-prefix="`${uid}-${line.key}-orderfields`"
        />
        <ErrorBanner v-if="line.selected && loadFailed.has(line.key)" :code="loadFailed.get(line.key)!.code" tone="warning">
          <p class="failed-name">{{ t('templates.loadFailed', [loadFailed.get(line.key)!.name]) }}</p>
          <button type="button" :disabled="submitting || dialog.kind !== 'none'" @click="chooseTemplate(line, loadFailed.get(line.key)!.id)">
            {{ t('templates.retry') }}
          </button>
        </ErrorBanner>
        <p v-if="multi && needsLocation(line)" class="required" role="alert">
          {{ locationRequiredMessage }}
        </p>
        <WarrantyField
          v-if="line.selected"
          v-model="line.draft.warranty"
          :reason="line.warrantyReason"
          :purchase-date="line.draft.purchaseDate"
          :multi="multi"
          :product-name="productName(line)"
          :manual-months="manualMonths"
        />
        <TagPicker
          v-if="line.selected"
          v-model:lines="line.tags"
          :options="tagOptions"
          :state="tagState"
          :product-name="productName(line)"
        />
        <div v-if="multi && line.selected && locState === 'ready' && locations.length > 0" class="product-location">
          <template v-if="line.location === 'inherit'">
            <span class="muted">{{ effectiveLocation(line) ? t('location.inherited', [effectiveLocation(line)!.path.at(-1) ?? '']) : t('location.none') }}</span>
          </template>
          <template v-else>
            <span class="muted">{{ t('location.productLabel') }} :</span>
            <strong>{{ locationText(line.location) }}</strong>
            <button
              class="link"
              type="button"
              :aria-label="t('location.useOrderFor', [productName(line)])"
              @click="useOrderLocation(line)"
            >
              {{ t('location.useOrder') }}
            </button>
          </template>
          <button
            class="link"
            type="button"
            :aria-label="t('location.editFor', [productName(line)])"
            :aria-expanded="editingLines.has(line.key) ? 'true' : 'false'"
            @click="toggleEdit(line)"
          >
            {{ t('location.edit') }}
          </button>
          <LocationPicker
            v-if="editingLines.has(line.key)"
            class="line-location"
            :model-value="effectiveLocation(line)"
            :options="locations"
            :label="t('location.productLabelFor', [productName(line)])"
            @update:model-value="setLineLocation(line, $event)"
          />
        </div>
      </div>

      <OrderLocationField
        v-if="!multi"
        v-model="orderModel"
        :state="locState"
        :error="locError"
        :options="locations"
        :multi="false"
        :instance="errorInstance"
        :required-message="lines[0] && needsLocation(lines[0]) ? locationRequiredMessage : undefined"
      />

      <h2 class="section-title">{{ t('summary.documentsTitle') }}</h2>
      <div class="card">
        <ul class="docs">
          <li v-for="d in documents" :key="d.doc.id">
            <label class="pick">
              <input v-model="d.selected" type="checkbox" />
              <span>
                {{ d.doc.label }}
                <small class="muted">
                  {{ d.doc.origin === 'detected' ? t('summary.originDetected') : t('summary.originLocal') }}
                  {{ formatSize(d.doc.size) }}
                </small>
              </span>
            </label>
            <button v-if="d.doc.origin === 'manual'" class="link" type="button" @click="removeManual(d.doc.id)">
              {{ t('summary.remove') }}
            </button>
            <div class="kind-row">
              <label :for="`${uid}-kind-${d.doc.id}`" class="kind-label">{{ t('documents.kindShort') }}</label>
              <select
                :id="`${uid}-kind-${d.doc.id}`"
                v-model="d.doc.kind"
                class="kind"
                :aria-label="t('documents.kindFor', [d.doc.label])"
              >
                <option v-for="k in DOCUMENT_KIND_OPTIONS" :key="k" :value="k">{{ t(DOCUMENT_KIND_KEYS[k].label) }}</option>
              </select>
            </div>
          </li>
          <li v-if="documents.length === 0" class="muted">{{ t('summary.noDocuments') }}</li>
        </ul>
        <DocumentPicker :allow-replace="documents.some((d) => d.doc.origin === 'detected')" @add="onPicked" />
      </div>

      <div v-if="dialog.kind === 'no-invoice'" class="dialog" role="alertdialog" aria-labelledby="noinv">
        <p id="noinv">{{ t('summary.noInvoicePrompt') }}</p>
        <div class="actions">
          <button class="primary" type="button" @click="checkDuplicates">{{ t('summary.createAnyway') }}</button>
          <button type="button" @click="dialog = { kind: 'none' }">{{ t('summary.back') }}</button>
        </div>
      </div>

      <div
        v-if="dialog.kind === 'duplicates'"
        class="dialog"
        role="alertdialog"
        aria-labelledby="dup"
        aria-describedby="dup-help"
      >
        <ErrorBanner id="dup" code="DUPLICATE_SUSPECTED" tone="warning" />
        <p id="dup-help">{{ t('duplicates.help') }}</p>
        <section v-for="(g, gi) in dialog.groups" :key="g.key" class="dup-group">
          <h3>{{ g.product }}</h3>
          <!-- Spec 021: native radios, « Create a new item » checked by default; no link nor button added. -->
          <fieldset class="dup-choice">
            <legend>{{ t('completion.choiceLegend', [g.product]) }}</legend>
            <label class="pick">
              <input
                type="radio"
                :name="`${uid}-choice-${gi}`"
                value="create"
                :checked="chosenValue(g.key) === 'create'"
                :disabled="previewing"
                @change="setChoice(g.key, null)"
              />
              <span>{{ t('completion.createNew') }}</span>
            </label>
            <template v-if="g.matches.length">
              <h4>{{ t('duplicates.safeTitle') }}</h4>
              <p class="muted">{{ t('duplicates.safeHelp') }}</p>
              <ul>
                <li v-for="(m, mi) in g.matches" :key="m.id">
                  <input
                    :id="radioId(gi, 'm', mi)"
                    type="radio"
                    :name="`${uid}-choice-${gi}`"
                    :value="m.id"
                    :checked="chosenValue(g.key) === m.id"
                    :disabled="previewing"
                    :aria-labelledby="`${radioId(gi, 'm', mi)}-txt ${radioId(gi, 'm', mi)}-link`"
                    @change="setChoice(g.key, m)"
                  />
                  <span :id="`${radioId(gi, 'm', mi)}-txt`" class="complete-text">{{ t('completion.completeItem') }}</span>
                  <a :id="`${radioId(gi, 'm', mi)}-link`" :href="m.url" target="_blank" rel="noopener">{{ m.name }}</a>
                </li>
              </ul>
            </template>
            <template v-if="g.similar.length">
              <h4>{{ t('duplicates.similarTitle') }}</h4>
              <p class="muted">{{ t('duplicates.similarHelp') }}</p>
              <ul>
                <li v-for="(m, mi) in g.similar" :key="m.id">
                  <input
                    :id="radioId(gi, 's', mi)"
                    type="radio"
                    :name="`${uid}-choice-${gi}`"
                    :value="m.id"
                    :checked="chosenValue(g.key) === m.id"
                    :disabled="previewing"
                    :aria-labelledby="`${radioId(gi, 's', mi)}-txt ${radioId(gi, 's', mi)}-link`"
                    @change="setChoice(g.key, m)"
                  />
                  <span :id="`${radioId(gi, 's', mi)}-txt`" class="complete-text">{{ t('completion.completeItem') }}</span>
                  <a :id="`${radioId(gi, 's', mi)}-link`" :href="m.url" target="_blank" rel="noopener">{{ m.name }}</a>
                </li>
              </ul>
              <p v-if="g.moreSimilar" class="muted">{{ t('duplicates.moreSimilar') }}</p>
            </template>
          </fieldset>
        </section>
        <template v-if="dialog.unchecked.length">
          <p>{{ t('duplicates.unchecked') }}</p>
          <ul>
            <li v-for="(name, i) in dialog.unchecked" :key="i">{{ name }}</li>
          </ul>
        </template>
        <div class="actions">
          <button ref="cancelDuplicates" type="button" :disabled="previewing" @click="cancelDuplicateDialog">{{ t('summary.cancel') }}</button>
          <button class="primary" type="button" :disabled="submitting || previewing" @click="onDuplicatesPrimary">
            {{ duplicatesLabel(dialog.groups) }}
          </button>
        </div>
      </div>
      <CompletionDialog
        v-if="dialog.kind === 'completion'"
        :items="dialog.items"
        :instance-name="errorInstance"
        :busy="submitting"
        @back="backToDuplicates"
        @confirm="confirmCompletions"
      />
      <ErrorBanner v-if="duplicateCheckFailed" code="DUPLICATE_CHECK_FAILED" tone="warning" />
      <p v-for="(notice, i) in templateNotices" :key="i" class="required" role="alert">{{ notice }}</p>
      <ErrorBanner v-if="confirmError" :code="confirmError" :instance="errorInstance" />

      <div class="actions footer">
        <button ref="addButton" class="primary" type="button" :disabled="!canSubmit" @click="onAdd">
          {{ dialog.kind === 'checking' ? t('summary.checking') : t('summary.add') }}
        </button>
        <button type="button" @click="cancel">{{ t('summary.cancel') }}</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.line :deep(.editor) {
  margin: 0;
}
.muted {
  color: var(--muted);
}
output.muted {
  display: block;
  margin: 1em 0;
}
.product-location {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 8px 0 2px;
  font-size: 13px;
}
.product-location .line-location {
  flex-basis: 100%;
}
.pick {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  font-size: 13px;
}
.pick input {
  width: auto;
}
.photo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}
.photo img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}
.photo p {
  margin: 0;
  font-size: 12px;
}
.docs {
  list-style: none;
  padding: 0;
  margin: 0 0 6px;
}
.docs li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.kind-row {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 22px;
}
.kind-label {
  font-size: 12px;
  color: var(--muted);
}
.kind {
  font: inherit;
  font-size: 12px;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 3px;
  max-width: 100%;
}
.link {
  border: none;
  color: var(--accent-text);
  padding: 2px 4px;
}
.dialog {
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin: 10px 0;
}
.dialog p {
  margin: 0 0 6px;
}
.dup-group {
  margin: 8px 0;
}
.dup-group h3,
.dup-group h4 {
  margin: 6px 0 4px;
  font-size: 13px;
}
.dup-group ul {
  margin: 0 0 6px;
}
.dup-choice {
  border: none;
  margin: 0;
  padding: 0;
}
.dup-choice legend {
  padding: 0;
  font-size: 13px;
}
.dup-choice li input {
  width: auto;
  margin: 0 4px 0 0;
}
.complete-text {
  margin-right: 4px;
}
.actions {
  display: flex;
  gap: 8px;
}
.footer {
  margin-top: 12px;
}
.required {
  margin: 6px 0;
  color: var(--danger-fg);
  font-size: 13px;
}
.failed-name {
  flex-basis: 100%;
  margin: 0;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
