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
import { t } from '@/ui/i18n';
import type { PickedDocument } from '@/ui/read-pdf';
import { draftErrors, draftFrom, emptyDraft, formatSize, missingFields } from './drafts';

const props = defineProps<{ tabId: number; config: ConfigView }>();
const emit = defineEmits<{
  submit: [payload: { drafts: ImportDraft[]; manualFiles: ManualFile[]; orderLocationId: string | null }];
}>();

interface Line {
  key: string;
  product: DetectedProduct | null;
  selected: boolean;
  draft: ImportDraft;
  /** `inherit` suit le choix de commande ; `null` retire l'emplacement pour ce produit (FR-014). */
  location: 'inherit' | LocationChoice | null;
}

const loading = ref(true);
const detectError = ref<ErrorCode | null>(null);
const warnings = ref<ErrorCode[]>([]);
const purchase = ref<DetectedPurchase | null>(null);
const lines = ref<Line[]>([]);
const documents = ref<{ doc: DocumentRef; selected: boolean }[]>([]);
const manualFiles = reactive(new Map<string, ManualFile>());
/** Lignes dont l'image n'a pas pu être affichée : la photo n'est alors pas envoyée. */
const photoErrors = reactive(new Set<string>());

/** Emplacements : chargés en parallèle de la détection, sans jamais bloquer le résumé (FR-017). */
const locState = ref<'loading' | 'ready' | 'unavailable'>('loading');
const locError = ref<ErrorCode>('LOCATIONS_UNAVAILABLE');
const locations = ref<LocationOption[]>([]);
const orderLocation = ref<LocationChoice | null>(null);
/** Vrai dès que l'utilisateur agit sur le choix de commande : la présélection ne l'écrase plus. */
let orderTouched = false;
const orderModel = computed({
  get: () => orderLocation.value,
  set: (v: LocationChoice | null) => {
    orderTouched = true;
    orderLocation.value = v;
  },
});
/** Lignes dont le sélecteur d'emplacement est ouvert. */
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
    // Dernier emplacement utilisé (FR-020) : présélectionné s'il est dans la liste, sans écraser un choix déjà fait.
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
  // Annuler : rien n'est envoyé, les données détectées sont oubliées.
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
      // Aperçu en échec : la photo est « indisponible » (FR-009), pas « non demandée ».
      photo: l.draft.photo && !photoErrors.has(l.key) ? { ...l.draft.photo } : null,
      location: copyOf(effectiveLocation(l)),
    })),
    manualFiles: docs.flatMap((d) => {
      const f = manualFiles.get(d.id);
      return f ? [f] : [];
    }),
    // Choix de commande seul : le service worker s'en sert pour mémoriser le dernier emplacement (R10).
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
      <p v-if="detectError" class="muted">{{ t('summary.manualHint') }}</p>

      <h2 v-if="purchase && lines.length > 1" class="section-title">{{ t('summary.detectedProducts') }}</h2>
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
        <div v-if="line.selected && locState === 'ready' && locations.length > 0" class="product-location">
          <span class="muted">{{ t('location.productLabel') }}</span>
          <strong>{{ locationText(effectiveLocation(line)) }}</strong>
          <button
            class="link"
            type="button"
            :aria-label="t('location.editFor', [line.draft.name || t('summary.unnamedProduct')])"
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
            :label="t('location.productLabelFor', [line.draft.name || t('summary.unnamedProduct')])"
            @update:model-value="setLineLocation(line, $event)"
          />
        </div>
      </div>

      <div class="card location-section">
        <p v-if="locState === 'loading'" class="muted" role="status">{{ t('location.loading') }}</p>
        <template v-else-if="locState === 'unavailable'">
          <ErrorBanner :code="locError" tone="warning" />
          <p class="muted">{{ t('location.unavailableHint') }}</p>
        </template>
        <p v-else-if="locations.length === 0" class="muted">{{ t('location.empty') }}</p>
        <LocationPicker v-else v-model="orderModel" class="order-location" :options="locations" :label="t('location.orderLabel')" />
      </div>

      <h2 class="section-title">{{ t('summary.documentsTitle') }}</h2>
      <div class="card">
        <ul class="docs">
          <li v-for="d in documents" :key="d.doc.id">
            <label class="pick">
              <input v-model="d.selected" type="checkbox" />
              <span>
                {{ d.doc.label }}
                <small class="muted">
                  <span class="chip">{{ d.doc.kind === 'order_document' ? t('documents.orderDocument') : t('documents.invoice') }}</span>
                  {{ d.doc.origin === 'detected' ? t('summary.originDetected') : t('summary.originLocal') }}
                  {{ formatSize(d.doc.size) }}
                </small>
              </span>
            </label>
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
