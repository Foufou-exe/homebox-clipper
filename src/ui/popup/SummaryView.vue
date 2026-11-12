<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type {
  ConfigView,
  DetectedProduct,
  DetectedPurchase,
  DocumentRef,
  DuplicateMatch,
  ImportDraft,
  LocationChoice,
  LocationOption,
  ManualFile,
} from '@/shared/types';
import DocumentPicker from '@/ui/components/DocumentPicker.vue';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import FieldEditor from '@/ui/components/FieldEditor.vue';
import InstanceBadge from '@/ui/components/InstanceBadge.vue';
import LocationPicker from '@/ui/components/LocationPicker.vue';
import OrderLocationField from './OrderLocationField.vue';
import { DOCUMENT_KIND_KEYS, DOCUMENT_KIND_OPTIONS } from '@/ui/document-kind-keys';
import { t } from '@/ui/i18n';
import type { PickedDocument } from '@/ui/read-pdf';
import { draftErrors, draftFrom, emptyDraft, formatSize, missingFields } from './drafts';
import { MERCHANT_CATALOG } from '@/content/merchants/catalog';

/** Stores where the import works, in the order of the table; "(testing)" after a testing store (FR-012, FR-016). */
const supportedStores = MERCHANT_CATALOG.map((e) =>
  e.status === 'testing' ? t('summary.storeTesting', [e.displayName]) : e.displayName,
).join(', ');

const props = defineProps<{ tabId: number; config: ConfigView }>();
const emit = defineEmits<{
  submit: [payload: { drafts: ImportDraft[]; manualFiles: ManualFile[]; orderLocationId: string | null }];
}>();

interface Line {
  key: string;
  product: DetectedProduct | null;
  selected: boolean;
  draft: ImportDraft;
  /** `inherit` follows the order choice; `null` removes the location for this product (FR-014). */
  location: 'inherit' | LocationChoice | null;
}

const loading = ref(true);
const detectError = ref<ErrorCode | null>(null);
const warnings = ref<ErrorCode[]>([]);
const purchase = ref<DetectedPurchase | null>(null);
const lines = ref<Line[]>([]);
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
/** Rows whose location picker is open. */
const editingLines = reactive(new Set<string>());

async function loadLocations() {
  try {
    const res = await send({ type: 'location/list' });
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
    locError.value = 'LOCATIONS_UNAVAILABLE';
    locState.value = 'unavailable';
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

type Dialog =
  | { kind: 'none' }
  | { kind: 'no-invoice' }
  | { kind: 'checking' }
  | { kind: 'duplicates'; matches: DuplicateMatch[] };
const dialog = ref<Dialog>({ kind: 'none' });
const duplicateCheckFailed = ref(false);

onMounted(async () => {
  void loadLocations();
  const res = await send({ type: 'detect/run', tabId: props.tabId });
  loading.value = false;
  if (!res.ok) {
    detectError.value = res.error;
    lines.value = [{ key: 'manual', product: null, selected: true, draft: emptyDraft(), location: 'inherit' }];
    return;
  }
  purchase.value = res.value.purchase;
  warnings.value = res.value.warnings;
  const products = res.value.purchase.products.filter((p) => p.name.value !== null);
  lines.value = products.length
    ? products.map((p) => ({ key: p.key, product: p, selected: true, draft: draftFrom(res.value.purchase, p), location: 'inherit' as const }))
    : [{ key: 'manual', product: null, selected: true, draft: draftFrom(res.value.purchase, null), location: 'inherit' as const }];
  documents.value = res.value.purchase.documents.map((doc) => ({ doc, selected: true }));
});

/** A single product: a single "Location" field. Several: an order field, then one mention per product. */
const multi = computed(() => lines.value.length > 1);
const productName = (line: Line) => line.draft.name || t('summary.unnamedProduct');

const selectedLines = computed(() => lines.value.filter((l) => l.selected));
const selectedDocs = computed(() => documents.value.filter((d) => d.selected).map((d) => d.doc));
const canSubmit = computed(
  () =>
    selectedLines.value.length > 0 &&
    selectedLines.value.every((l) => draftErrors(l.draft).length === 0) &&
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

async function checkDuplicates() {
  dialog.value = { kind: 'checking' };
  duplicateCheckFailed.value = false;
  const matches: DuplicateMatch[] = [];
  for (const line of selectedLines.value) {
    if (!line.draft.orderNumber) continue;
    const res = await send({ type: 'duplicate/check', orderNumber: line.draft.orderNumber, name: line.draft.name });
    if (res.ok) matches.push(...res.value.matches);
    else duplicateCheckFailed.value = true;
  }
  if (matches.length) {
    dialog.value = { kind: 'duplicates', matches };
    return;
  }
  submit();
}

const copyOf = (loc: LocationChoice | null): LocationChoice | null => (loc ? { id: loc.id, path: [...loc.path] } : null);

function submit() {
  dialog.value = { kind: 'none' };
  const docs = selectedDocs.value;
  emit('submit', {
    drafts: selectedLines.value.map((l) => ({
      ...l.draft,
      documents: docs,
      // Preview failed: the photo is "unavailable" (FR-009), not "not requested".
      photo: l.draft.photo && !photoErrors.has(l.key) ? { ...l.draft.photo } : null,
      location: copyOf(effectiveLocation(l)),
    })),
    manualFiles: docs.flatMap((d) => {
      const f = manualFiles.get(d.id);
      return f ? [f] : [];
    }),
    // Order choice alone: the service worker uses it to remember the last location (R10).
    orderLocationId: orderLocation.value?.id ?? null,
  });
}
</script>

<template>
  <section class="summary">
    <InstanceBadge :config="config" />

    <p v-if="loading" class="muted" role="status">{{ t('summary.detecting') }}</p>

    <template v-else>
      <ErrorBanner v-if="detectError" :code="detectError" tone="warning" />
      <ErrorBanner v-for="w in warnings" :key="w" :code="w" tone="warning" />
      <template v-if="detectError === 'NOT_AN_ORDER_PAGE'">
        <p class="muted">{{ t('summary.supportedStores', [supportedStores]) }}</p>
        <p class="muted">{{ t('summary.reportHint') }}</p>
      </template>
      <p v-if="detectError" class="muted">{{ t('summary.manualHint') }}</p>

      <OrderLocationField v-if="multi" v-model="orderModel" :state="locState" :error="locError" :options="locations" :multi="true" />

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
            <select v-model="d.doc.kind" class="kind" :aria-label="t('documents.kindFor', [d.doc.label])">
              <option v-for="k in DOCUMENT_KIND_OPTIONS" :key="k" :value="k">{{ t(DOCUMENT_KIND_KEYS[k].label) }}</option>
            </select>
            <button v-if="d.doc.origin === 'manual'" class="link" type="button" @click="removeManual(d.doc.id)">
              {{ t('summary.remove') }}
            </button>
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

      <div v-if="dialog.kind === 'duplicates'" class="dialog" role="alertdialog" aria-labelledby="dup">
        <ErrorBanner id="dup" code="DUPLICATE_SUSPECTED" tone="warning" />
        <ul>
          <li v-for="m in dialog.matches" :key="m.id">
            <a :href="m.url" target="_blank" rel="noopener">{{ m.name }}</a>
          </li>
        </ul>
        <div class="actions">
          <button type="button" @click="dialog = { kind: 'none' }">{{ t('summary.cancel') }}</button>
          <button class="primary" type="button" @click="submit">{{ t('summary.createAnyway') }}</button>
        </div>
      </div>
      <ErrorBanner v-if="duplicateCheckFailed" code="DUPLICATE_CHECK_FAILED" tone="warning" />

      <div class="actions footer">
        <button class="primary" type="button" :disabled="!canSubmit" @click="onAdd">
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
.actions {
  display: flex;
  gap: 8px;
}
.footer {
  margin-top: 12px;
}
</style>
