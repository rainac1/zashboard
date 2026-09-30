<template>
  <div class="divide-base-border flex w-full flex-col divide-y py-2">
    <div
      v-if="geodata"
      class="flex flex-col gap-2 py-3 text-xs first:pt-0 last:pb-0"
    >
      <div
        v-for="asset in geodata.assets"
        :key="asset.kind"
        class="flex flex-col gap-0.5"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="bg-base-200 rounded-full px-2 py-0.5">{{ asset.kind }}</span>
          <span>{{ prettyBytesHelper(Number(asset.size_bytes)) }}</span>
          <span
            v-if="asset.modified_at"
            class="text-base-content/50"
          >
            {{ fromNow(asset.modified_at) }}
          </span>
          <span
            v-if="asset.verified != null"
            :class="asset.verified ? 'text-success' : 'text-base-content/50'"
          >
            {{ asset.verified ? $t('daeGeoVerified') : $t('daeGeoUnverified') }}
          </span>
          <span
            v-if="asset.download_route"
            class="text-base-content/50"
          >
            {{ downloadRouteLabel(asset.download_route) }}
          </span>
        </div>
        <div
          class="text-base-content/50 truncate"
          :title="asset.fetched_url_redacted ?? asset.source_redacted ?? undefined"
        >
          {{ asset.fetched_url_redacted ?? asset.source_redacted ?? '-' }}
        </div>
      </div>

      <div
        v-if="geodata.last_checked_at !== undefined"
        class="text-base-content/60 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1"
      >
        <span>{{ $t('daeGeoLastChecked') }}</span>
        <span>{{ geodata.last_checked_at ? fromNow(geodata.last_checked_at) : '-' }}</span>
        <span>{{ $t('daeGeoLastUpdated') }}</span>
        <span>{{ geodata.last_updated_at ? fromNow(geodata.last_updated_at) : '-' }}</span>
        <span>{{ $t('daeGeoNextCheck') }}</span>
        <span>{{ geodata.next_check_at ? fromNow(geodata.next_check_at) : '-' }}</span>
        <template
          v-for="(codes, kind) in geodata.required_codes"
          :key="kind"
        >
          <span>{{ kind }}</span>
          <span class="break-all">{{ codes.join(', ') || '-' }}</span>
        </template>
      </div>

      <div
        v-if="geodata.last_error"
        class="text-error break-all"
      >
        {{ geodata.last_error.message }} ({{ geodata.last_error.code }})
      </div>
    </div>

    <div
      v-if="settings"
      class="flex flex-col gap-3 py-3 first:pt-0 last:pb-0"
    >
      <div class="flex flex-wrap items-baseline gap-x-2">
        <div class="text-sm">{{ $t('daeGeoSources') }}</div>
        <div class="text-base-content/50 text-xs">
          {{ $t(`daeGeoSource_${settings.source}`) }}
        </div>
      </div>

      <label
        v-for="kind in ASSETS"
        :key="kind"
        class="flex flex-col gap-1 text-xs"
      >
        <span class="text-base-content/70">{{ kind }}</span>
        <textarea
          v-model="form[kind]"
          class="textarea textarea-bordered h-20 w-full font-mono text-xs"
          spellcheck="false"
          :placeholder="$t('daeGeoUrlsTip', { max: maxUrls })"
        ></textarea>
      </label>

      <div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <label class="flex items-center justify-between gap-2 text-xs">
          <span class="text-base-content/70">{{ $t('daeGeoAutoUpdate') }}</span>
          <input
            v-model="form.autoUpdate"
            type="checkbox"
            class="toggle toggle-sm"
          />
        </label>
        <label class="flex items-center justify-between gap-2 text-xs">
          <span class="text-base-content/70">{{ $t('daeGeoIntervalHours') }}</span>
          <input
            v-model.number="form.intervalHours"
            type="number"
            :min="intervalBounds?.min"
            :max="intervalBounds?.max"
            class="input input-sm w-24"
            :disabled="!form.autoUpdate"
          />
        </label>
        <label class="flex items-center justify-between gap-2 text-xs">
          <span class="text-base-content/70">{{ $t('daeDownloadRoute') }}</span>
          <SelectInput
            v-model="form.route"
            class="select select-sm w-28"
            :options="routeOptions"
          />
        </label>
        <label
          v-if="form.route === 'group'"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('proxyGroup') }}</span>
          <SelectInput
            v-model="form.groupId"
            class="select select-sm w-40"
            :options="groupOptions"
          />
        </label>
        <label
          v-if="checksumMethod"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('daeGeoVerifyChecksum') }}</span>
          <input
            v-model="form.verifyChecksum"
            type="checkbox"
            class="toggle toggle-sm"
          />
        </label>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0">
      <button
        v-if="settings"
        class="btn btn-sm btn-primary"
        :disabled="busy"
        @click="save"
      >
        {{ $t('apply') }}
      </button>
      <button
        v-if="settings"
        class="btn btn-sm"
        :disabled="busy"
        @click="reset"
      >
        {{ $t('daeGeoReset') }}
      </button>
      <button
        v-if="can('updateGeoDatabase')"
        class="btn btn-sm"
        :disabled="busy"
        @click="update"
      >
        <span
          v-if="busy"
          class="loading loading-spinner h-4 w-4"
        />
        {{ $t('updateGeoDatabase') }}
      </button>
      <button
        class="btn btn-sm btn-ghost"
        :disabled="busy"
        @click="load"
      >
        {{ $t('refresh') }}
      </button>
    </div>

    <div
      v-if="message"
      class="py-3 text-xs break-all first:pt-0 last:pb-0"
      :class="failed ? 'text-error' : 'text-success'"
    >
      {{ message }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { can } from '@/assembly/backend'
import { daeCapabilities } from '@/assembly/capabilities'
import {
  daeGroupDetails,
  downloadRouteLabel,
  fetchDaeGeoData,
  fetchDaeRuntimeSettings,
  patchDaeRuntimeSettings,
  updateDaeGeoData,
} from '@/assembly/dae'
import SelectInput from '@/components/common/SelectInput.vue'
import { showConfirmDialog } from '@/helper/confirm-dialog'
import { getRequestErrorMessage } from '@/helper/request-error'
import { fromNow, prettyBytesHelper } from '@/helper/utils'
import type {
  DaeGeoData,
  DaeGeoDataDownloadRoute,
  DaeGeoDataSettings,
  DaeGeoDataSettingsPatch,
} from '@/types'
import { isEqual } from 'lodash'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const ASSETS = ['geosite', 'geoip'] as const

const { t } = useI18n()

const geodata = ref<DaeGeoData | null>(null)
const settings = ref<DaeGeoDataSettings | null>(null)
const busy = ref(false)
const message = ref('')
const failed = ref(false)

const form = reactive({
  geosite: '',
  geoip: '',
  autoUpdate: true,
  intervalHours: 24,
  route: 'routing' as DaeGeoDataDownloadRoute,
  groupId: '',
  verifyChecksum: true,
})

const capability = computed(() => daeCapabilities.value?.resources.geodata)
const maxUrls = computed(() => capability.value?.max_urls ?? 1)
const intervalBounds = computed(() => capability.value?.interval_hours)
const checksumMethod = computed(() => capability.value?.checksum ?? null)

const routeOptions = (['routing', 'group', 'direct'] as DaeGeoDataDownloadRoute[]).map((value) => ({
  value,
  label: t(`daeRoute_${value}`),
}))
const groupOptions = computed(() =>
  daeGroupDetails.value.map((group) => ({ value: group.id, label: group.name })),
)

const toUrls = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const apply = (data?: DaeGeoDataSettings) => {
  settings.value = data ?? null

  if (!data) return

  form.geosite = data.geosite.urls.join('\n')
  form.geoip = data.geoip.urls.join('\n')
  form.autoUpdate = data.auto_update.enabled
  form.intervalHours = data.auto_update.interval_hours
  form.route = data.download.route
  form.groupId = data.download.group_id ?? ''
  form.verifyChecksum = data.verify_checksum ?? true
}

const run = async (action: () => Promise<void>, success = '') => {
  if (busy.value) return

  busy.value = true
  message.value = ''
  failed.value = false

  try {
    await action()
    message.value = success && t(success)
  } catch (e) {
    failed.value = true
    message.value = getRequestErrorMessage(e)
  } finally {
    busy.value = false
  }
}

const load = () =>
  run(async () => {
    const [status, runtimeSettings] = await Promise.all([
      fetchDaeGeoData(),
      can('geodataSettings') ? fetchDaeRuntimeSettings() : Promise.resolve(null),
    ])

    geodata.value = status
    apply(runtimeSettings?.geodata)
  })

const buildPatch = () => {
  const current = settings.value
  const patch: NonNullable<DaeGeoDataSettingsPatch> = {}

  if (!current) return patch

  for (const kind of ASSETS) {
    const urls = toUrls(form[kind])

    if (urls.length && !isEqual(urls, current[kind].urls)) patch[kind] = { urls }
  }

  if (
    form.autoUpdate !== current.auto_update.enabled ||
    form.intervalHours !== current.auto_update.interval_hours
  ) {
    patch.auto_update = { enabled: form.autoUpdate, interval_hours: form.intervalHours }
  }

  const groupId = form.route === 'group' ? form.groupId : null

  if (form.route !== current.download.route || groupId !== current.download.group_id) {
    patch.download = groupId ? { route: form.route, group_id: groupId } : { route: form.route }
  }

  if (checksumMethod.value && form.verifyChecksum !== (current.verify_checksum ?? true)) {
    patch.verify_checksum = form.verifyChecksum
  }

  return patch
}

const save = () => {
  const patch = buildPatch()

  if (!Object.keys(patch).length) return

  return run(async () => {
    apply((await patchDaeRuntimeSettings({ geodata: patch })).geodata)
  }, 'daeGeoSaved')
}

const reset = async () => {
  const { confirmed } = await showConfirmDialog({
    title: t('daeGeoReset'),
    message: t('daeGeoResetConfirm'),
  })

  if (!confirmed) return

  run(async () => {
    apply((await patchDaeRuntimeSettings({ geodata: null })).geodata)
  }, 'daeGeoSaved')
}

const update = () =>
  run(async () => {
    await updateDaeGeoData()
    geodata.value = await fetchDaeGeoData()
  }, 'daeGeoUpdated')

load()
</script>
