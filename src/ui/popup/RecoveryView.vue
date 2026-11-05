<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ErrorCode } from '@/shared/errors';
import { send } from '@/shared/messages';
import type { LocationChoice, LocationOption, ManualFile, PendingImport } from '@/shared/types';
import DocumentPicker from '@/ui/components/DocumentPicker.vue';
import ErrorBanner from '@/ui/components/ErrorBanner.vue';
import LocationPicker from '@/ui/components/LocationPicker.vue';
import { t } from '@/ui/i18n';
import type { PickedDocument } from '@/ui/read-pdf';

const props = defineProps<{ pending: PendingImport; baseUrl: string }>();
const emit = defineEmits<{ updated: [pending: PendingImport]; abandoned: [id: string] }>();

const busy = ref(false);
const error = ref<ErrorCode | null>(null);
const files = ref(new Map<string, ManualFile>());
/** Reprise refusée pour doublon probable : un nouvel essai donnerait le même refus, on ne le propose plus. */
const duplicateBlocked = ref(false);

/** Emplacement disparu (FR-018) : aucun objet n'a été créé, un nouveau choix ou l'import sans emplacement est proposé. */
const locationGone = computed(() => props.pending.error === 'LOCATION_NOT_FOUND' && !props.pending.entityId);
const locations = ref<LocationOption[]>([]);
const locationsError = ref<ErrorCode | null>(null);
const newLocation = ref<LocationChoice | null>(null);

async function loadLocations() {
  locationsError.value = null;
  try {
    const res = await send({ type: 'location/list' });
    if (res.ok && Array.isArray(res.value?.locations)) locations.value = res.value.locations;
    else locationsError.value = res.ok ? 'LOCATIONS_UNAVAILABLE' : res.error;
  } catch {
    locationsError.value = 'LOCATIONS_UNAVAILABLE';
  }
}
watch(locationGone, (gone) => gone && void loadLocations(), { immediate: true });

const link = computed(() => (props.pending.entityId ? `${props.baseUrl}/item/${props.pending.entityId}` : null));
const failedDocs = computed(() =>
  props.pending.draft.documents.filter((d) => props.pending.steps.attachments[d.id] !== 'done'),
);
/** Fichiers locaux à resélectionner : leurs octets ne sont jamais conservés (R11). */
const manualToReselect = computed(() =>
  failedDocs.value.filter((d) => d.origin === 'manual' && !files.value.has(d.id)),
);
/** Photo encore à faire : `pending` (reprise interrompue), `sending` (issue inconnue) ou `failed`. */
const photoRemaining = computed(() => ['pending', 'sending', 'failed'].includes(props.pending.steps.photo ?? 'not_requested'));
/** Erreur de la photo, affichée à part sauf si c'est déjà l'erreur principale. */
const photoError = computed(() => (props.pending.photoError !== props.pending.error ? props.pending.photoError : null));
const retryLabel = computed(() => {
  if (!props.pending.entityId) return t('recovery.retryImport');
  const updateRemaining = props.pending.steps.update !== 'done';
  const docsRemaining = failedDocs.value.length > 0;
  if (photoRemaining.value && !updateRemaining && !docsRemaining) return t('recovery.retryPhoto');
  if (docsRemaining && !updateRemaining && !photoRemaining.value) return t('recovery.retryInvoice');
  return t('recovery.retry');
});

function onPicked({ doc, file }: PickedDocument) {
  files.value.set(doc.id, file);
}

/** `location` absent : choix inchangé ; `null` : sans emplacement ; sinon nouveau choix. */
async function retry(location?: LocationChoice | null) {
  busy.value = true;
  error.value = null;
  try {
    const res = await send({
      type: 'import/retry',
      pendingId: props.pending.id,
      manualFiles: [...files.value.values()],
      ...(location === undefined ? {} : { location }),
    });
    newLocation.value = null;
    if (res.ok) emit('updated', res.value);
    else {
      error.value = res.error;
      duplicateBlocked.value = res.error === 'DUPLICATE_SUSPECTED';
    }
  } finally {
    busy.value = false;
  }
}

async function abandon() {
  await send({ type: 'import/abandon', pendingId: props.pending.id });
  emit('abandoned', props.pending.id);
}
</script>

<template>
  <div class="recovery">
    <p v-if="pending.entityId">
      {{ t('recovery.objectPrefix') }} <strong>{{ pending.draft.name }}</strong> {{ t('recovery.created') }}
      <a v-if="link" :href="link" target="_blank" rel="noopener">{{ t('recovery.openLink') }}</a>{{ t('recovery.incomplete') }}
    </p>
    <p v-else>{{ t('recovery.objectPrefix') }} <strong>{{ pending.draft.name }}</strong> {{ pending.createUncertain || (pending.orphaned && pending.createAttempted) ? t('recovery.maybeCreated') : t('recovery.notCreated') }}</p>

    <p v-if="pending.orphaned" class="muted">{{ t('recovery.interrupted') }}</p>
    <ErrorBanner v-if="pending.error" :code="pending.error" />
    <ErrorBanner v-if="photoError" :code="photoError" />
    <ErrorBanner v-if="error" :code="error" />
    <p v-if="duplicateBlocked" class="muted">{{ t('recovery.duplicateHint') }}</p>

    <div v-for="d in manualToReselect" :key="d.id" class="reselect">
      <p class="muted">{{ t('recovery.reselect', [d.label]) }}</p>
      <DocumentPicker :fixed-doc-id="d.id" @add="onPicked" />
    </div>

    <template v-if="locationGone">
      <LocationPicker v-if="locations.length > 0" v-model="newLocation" :options="locations" :label="t('location.productLabel')" />
      <ErrorBanner v-else-if="locationsError" :code="locationsError" tone="warning" />
    </template>

    <div class="actions">
      <button
        v-if="!duplicateBlocked"
        class="primary"
        type="button"
        :disabled="busy || manualToReselect.length > 0 || (locationGone && !newLocation)"
        @click="retry(locationGone ? newLocation : undefined)"
      >
        {{ busy ? t('recovery.retrying') : retryLabel }}
      </button>
      <button v-if="locationGone && !duplicateBlocked" type="button" :disabled="busy" @click="retry(null)">
        {{ t('recovery.retryWithoutLocation') }}
      </button>
      <button type="button" :disabled="busy" @click="abandon">{{ t('recovery.abandon') }}</button>
    </div>
  </div>
</template>

<style scoped>
.recovery {
  background: var(--bg);
  border-left: 3px solid var(--danger-fg);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin: 8px 0;
}
.recovery p {
  margin: 0 0 6px;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 8px;
}
</style>
