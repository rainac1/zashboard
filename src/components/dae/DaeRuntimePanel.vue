<template>
  <div class="divide-base-border flex w-full flex-col divide-y py-2">
    <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 py-3 text-xs first:pt-0 last:pb-0">
      <template
        v-for="row in runtimeRows"
        :key="row.label"
      >
        <div class="text-base-content/60">{{ row.label }}</div>
        <div class="break-all">{{ row.value }}</div>
      </template>
    </div>

    <div
      v-if="can('lifecycleControl')"
      class="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0"
    >
      <div class="text-sm">{{ $t('daeLifecycle') }}</div>
      <button
        class="btn btn-sm ml-auto"
        :disabled="lifecycleBusy"
        @click="toggleLifecycle"
      >
        <span
          v-if="lifecycleBusy"
          class="loading loading-spinner h-4 w-4"
        />
        {{ suspended ? $t('daeResume') : $t('daeSuspend') }}
      </button>
    </div>

    <div
      v-if="can('runtimeSettings')"
      class="flex flex-col gap-3 py-3 first:pt-0 last:pb-0"
    >
      <div class="flex flex-wrap items-baseline gap-x-2">
        <div class="text-sm">{{ $t('daeRuntimeSettings') }}</div>
        <div class="text-base-content/50 text-xs">
          {{ settings ? $t(`daeSettingsSource_${settings.source}`) : '' }}
        </div>
      </div>

      <div
        v-if="settings"
        class="grid grid-cols-2 gap-3 max-sm:grid-cols-1"
      >
        <label class="flex items-center justify-between gap-2 text-xs">
          <span class="text-base-content/70">{{ $t('logLevel') }}</span>
          <SelectInput
            v-model="form.logLevel"
            class="select select-sm w-28"
            :options="logLevelOptions"
          />
        </label>
        <label class="flex items-center justify-between gap-2 text-xs">
          <span class="text-base-content/70">{{ $t('daeLogRecords') }}</span>
          <input
            v-model.number="form.logRecords"
            type="number"
            min="64"
            max="512"
            class="input input-sm w-24"
          />
        </label>
        <label
          v-if="settings.dns_log"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('daeDnsLogRecords') }}</span>
          <input
            v-model.number="form.dnsLogRecords"
            type="number"
            min="64"
            max="512"
            class="input input-sm w-24"
          />
        </label>
        <label
          v-if="settings.flows"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('daeMaxFlows') }}</span>
          <input
            v-model.number="form.maxFlows"
            type="number"
            min="64"
            max="1024"
            class="input input-sm w-24"
          />
        </label>
        <label
          v-if="settings.flows"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('daeFlowRetention') }}</span>
          <input
            v-model.number="form.flowRetention"
            type="number"
            min="1"
            max="300"
            class="input input-sm w-24"
          />
        </label>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="btn btn-sm btn-primary"
          :disabled="saving || !settings"
          @click="save"
        >
          <span
            v-if="saving"
            class="loading loading-spinner h-4 w-4"
          />
          {{ $t('apply') }}
        </button>
        <button
          class="btn btn-sm btn-ghost"
          :disabled="saving"
          @click="load"
        >
          {{ $t('refresh') }}
        </button>
      </div>
    </div>

    <div
      v-if="errorMessage"
      class="text-error py-3 text-xs break-all first:pt-0 last:pb-0"
    >
      {{ errorMessage }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { can } from '@/assembly/backend'
import {
  daeRuntime,
  fetchDaeDatapath,
  fetchDaeRuntime,
  fetchDaeRuntimeSettings,
  patchDaeRuntimeSettings,
  resumeDae,
  subscribeDaeRuntime,
  suspendDae,
} from '@/assembly/dae'
import SelectInput from '@/components/common/SelectInput.vue'
import { showConfirmDialog } from '@/helper/confirm-dialog'
import { getRequestErrorMessage } from '@/helper/request-error'
import { prettyBytesHelper, prettyUptimeHelper } from '@/helper/utils'
import type { DaeDatapath, DaeRuntimeSettings } from '@/types'
import { computed, onScopeDispose, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const settings = ref<DaeRuntimeSettings | null>(null)
const datapath = ref<DaeDatapath | null>(null)
const saving = ref(false)
const lifecycleBusy = ref(false)
const errorMessage = ref('')

const form = reactive({
  logLevel: 'info',
  logRecords: 512,
  dnsLogRecords: 512,
  maxFlows: 1024,
  flowRetention: 300,
})

const logLevelOptions = ['trace', 'debug', 'info', 'warn', 'error'].map((value) => ({
  value,
  label: value,
}))

const suspended = computed(() => daeRuntime.value?.lifecycle.state === 'suspended')

const runtimeRows = computed(() => {
  const runtime = daeRuntime.value

  if (!runtime) return []

  const bytes = (value: string | null) => prettyBytesHelper(Number(value ?? 0))

  const rows = [
    { label: t('statusLabel'), value: runtime.lifecycle.state },
    { label: t('daeUptime'), value: prettyUptimeHelper(Number(runtime.lifecycle.uptime_seconds)) },
    { label: t('daeGeneration'), value: runtime.generation.active_id },
    { label: t('daeConfigRevision'), value: runtime.generation.config_revision ?? '-' },
    { label: t('daeDatapath'), value: `${runtime.datapath.kind} · ${runtime.datapath.state}` },
    {
      label: t('connections'),
      value: `${runtime.traffic.connections.tcp ?? 0} TCP / ${runtime.traffic.connections.udp ?? 0} UDP`,
    },
    {
      label: t('download'),
      value: bytes(runtime.traffic.bytes.download),
    },
    {
      label: t('upload'),
      value: bytes(runtime.traffic.bytes.upload),
    },
  ]

  const ebpf = datapath.value?.ebpf

  if (ebpf) {
    rows.push(
      { label: 'eBPF', value: `${ebpf.backend} · ${ebpf.programs} · ${ebpf.hooks}` },
      { label: t('daeHealth'), value: ebpf.health },
    )

    const occupancy = ebpf.maps?.conn_state

    if (occupancy) {
      rows.push({
        label: t('daeConnStateMap'),
        value: `${occupancy.occupancy_known ? occupancy.occupancy : '?'} / ${occupancy.capacity}`,
      })
    }

    ebpf.attachments?.forEach((attachment) => {
      rows.push({
        label: `${attachment.name} @ ${attachment.interface}`,
        value: `${attachment.direction} · ${attachment.state}`,
      })
    })
  }

  return rows
})

const apply = (data: DaeRuntimeSettings) => {
  settings.value = data
  form.logLevel = data.log.level
  form.logRecords = data.log.buffered_records
  form.dnsLogRecords = data.dns_log?.max_records ?? form.dnsLogRecords
  form.maxFlows = data.flows?.max_flows ?? form.maxFlows
  form.flowRetention = data.flows?.retention_seconds ?? form.flowRetention
}

const load = async () => {
  errorMessage.value = ''

  try {
    await fetchDaeRuntime()

    if (can('datapath')) datapath.value = await fetchDaeDatapath()
    if (can('runtimeSettings')) apply(await fetchDaeRuntimeSettings())
  } catch (e) {
    errorMessage.value = getRequestErrorMessage(e)
  }
}

const DATAPATH_INTERVAL = 5000

let datapathTimer: ReturnType<typeof setTimeout> | undefined

const pollDatapath = async () => {
  if (can('datapath')) {
    try {
      datapath.value = await fetchDaeDatapath()
    } catch {}
  }

  datapathTimer = setTimeout(pollDatapath, DATAPATH_INTERVAL)
}

const save = async () => {
  if (saving.value) return

  saving.value = true
  errorMessage.value = ''

  const payload: Record<string, unknown> = {
    log: { level: form.logLevel, buffered_records: form.logRecords },
  }

  if (settings.value?.dns_log) payload.dns_log = { max_records: form.dnsLogRecords }
  if (settings.value?.flows) {
    payload.flows = { max_flows: form.maxFlows, retention_seconds: form.flowRetention }
  }

  try {
    apply(await patchDaeRuntimeSettings(payload))
  } catch (e) {
    errorMessage.value = getRequestErrorMessage(e)
  } finally {
    saving.value = false
  }
}

const toggleLifecycle = async () => {
  if (lifecycleBusy.value) return

  if (!suspended.value) {
    const { confirmed } = await showConfirmDialog({
      title: t('daeSuspend'),
      message: t('daeSuspendConfirm'),
    })

    if (!confirmed) return
  }

  lifecycleBusy.value = true
  errorMessage.value = ''

  try {
    await (suspended.value ? resumeDae() : suspendDae())
  } catch (e) {
    errorMessage.value = getRequestErrorMessage(e)
  } finally {
    lifecycleBusy.value = false
  }
}

const releaseRuntime = subscribeDaeRuntime()

onScopeDispose(() => {
  releaseRuntime()
  clearTimeout(datapathTimer)
})

load()
datapathTimer = setTimeout(pollDatapath, DATAPATH_INTERVAL)
</script>
