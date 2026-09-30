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
      v-if="degradations.length"
      class="flex flex-col gap-1 py-3 text-xs first:pt-0 last:pb-0"
    >
      <div class="text-warning text-sm">{{ $t('daeDegradations') }}</div>
      <div
        v-for="item in degradations"
        :key="item.component"
        class="break-all"
      >
        <span class="font-medium">{{ item.component }}</span>
        <span class="text-base-content/60"> · {{ item.message }} ({{ item.code }})</span>
        <span class="text-base-content/50"> · {{ fromNow(item.since) }}</span>
      </div>
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
        <label
          v-if="has('log.level')"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('logLevel') }}</span>
          <SelectInput
            v-model="form.logLevel"
            class="select select-sm w-28"
            :options="logLevelOptions"
          />
        </label>
        <label
          v-for="field in numberFields"
          :key="field.key"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t(field.label) }}</span>
          <input
            v-model.number="form[field.key]"
            type="number"
            :min="field.min"
            :max="field.max"
            class="input input-sm w-24"
          />
        </label>
      </div>

      <div
        v-if="settings && recorders.length"
        class="flex flex-col gap-2"
      >
        <div class="flex flex-wrap items-baseline gap-x-2">
          <div class="text-sm">{{ $t('daeRecorders') }}</div>
          <div
            v-if="settings.recording?.grace_remaining_seconds"
            class="text-base-content/50 text-xs"
          >
            {{ $t('daeRecorderGrace', { seconds: settings.recording.grace_remaining_seconds }) }}
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <label
            v-for="recorder in recorders"
            :key="recorder.key"
            class="flex items-center justify-between gap-2 text-xs"
          >
            <span class="text-base-content/70">
              {{ $t(recorder.label) }}
              <span
                class="ml-1"
                :class="recorder.state.active ? 'text-success' : 'text-base-content/40'"
              >
                {{ recorder.state.active ? $t('daeRecorderActive') : $t('daeRecorderIdle') }}
              </span>
            </span>
            <SelectInput
              v-model="form[recorder.key]"
              class="select select-sm w-24"
              :options="recorderModeOptions"
              :disabled="!recorder.state.allowed"
            />
          </label>
        </div>
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
import { daeCapabilities } from '@/assembly/capabilities'
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
import { fromNow, prettyBytesHelper, prettyUptimeHelper } from '@/helper/utils'
import type {
  DaeDatapath,
  DaeEbpfAttachment,
  DaeRecorderMode,
  DaeRecorderState,
  DaeRuntimeSettingField,
  DaeRuntimeSettings,
  DaeRuntimeSettingsPatch,
} from '@/types'
import { computed, onScopeDispose, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const settings = ref<DaeRuntimeSettings | null>(null)
const datapath = ref<DaeDatapath | null>(null)
const saving = ref(false)
const lifecycleBusy = ref(false)
const errorMessage = ref('')

type NumberKey = 'logRecords' | 'dnsLogRecords' | 'maxFlows' | 'flowRetention'
type RecorderKey = 'record_flows' | 'record_logs' | 'record_dns_log'

const form = reactive<
  { logLevel: string } & Record<NumberKey, number> & Record<RecorderKey, DaeRecorderMode>
>({
  logLevel: 'info',
  logRecords: 0,
  dnsLogRecords: 0,
  maxFlows: 0,
  flowRetention: 0,
  record_flows: 'auto',
  record_logs: 'auto',
  record_dns_log: 'auto',
})

const resources = computed(() => daeCapabilities.value?.resources)
const fields = computed(() => resources.value?.runtime_settings?.fields ?? [])
const has = (field: DaeRuntimeSettingField) => fields.value.includes(field)

const logLevelOptions = computed(() =>
  (resources.value?.logs?.levels ?? ['trace', 'debug', 'info', 'warn', 'error']).map((value) => ({
    value,
    label: value,
  })),
)

const recorderModeOptions = (['auto', 'on', 'off'] as DaeRecorderMode[]).map((value) => ({
  value,
  label: t(`daeRecorderMode_${value}`),
}))

const numberFields = computed(() => {
  const res = resources.value
  const list: { key: NumberKey; label: string; min: number; max?: number }[] = []

  if (has('log.buffered_records') && settings.value?.log?.buffered_records != null) {
    list.push({
      key: 'logRecords',
      label: 'daeLogRecords',
      min: res?.logs?.min_buffered_records ?? 1,
      max: res?.logs?.max_buffered_records,
    })
  }
  if (has('dns_log.max_records') && settings.value?.dns_log) {
    list.push({
      key: 'dnsLogRecords',
      label: 'daeDnsLogRecords',
      min: res?.dns_log?.min_records ?? 1,
      max: res?.dns_log?.max_records,
    })
  }
  if (has('flows.max_flows') && settings.value?.flows?.max_flows != null) {
    list.push({
      key: 'maxFlows',
      label: 'daeMaxFlows',
      min: res?.flows?.min_flows ?? 1,
      max: res?.flows?.max_flows,
    })
  }
  if (has('flows.retention_seconds') && settings.value?.flows?.retention_seconds != null) {
    list.push({
      key: 'flowRetention',
      label: 'daeFlowRetention',
      min: 1,
      max: res?.flows?.retention_seconds,
    })
  }

  return list
})

const RECORDERS: { key: RecorderKey; state: 'flows' | 'logs' | 'dns_log'; label: string }[] = [
  { key: 'record_flows', state: 'flows', label: 'daeRecorderFlows' },
  { key: 'record_logs', state: 'logs', label: 'daeRecorderLogs' },
  { key: 'record_dns_log', state: 'dns_log', label: 'daeRecorderDnsLog' },
]

const recorders = computed(() =>
  RECORDERS.flatMap((recorder) => {
    const state = settings.value?.recording?.[recorder.state]

    return has(recorder.key) && state ? [{ ...recorder, state: state as DaeRecorderState }] : []
  }),
)

const degradations = computed(() => daeRuntime.value?.degradations ?? [])

const suspended = computed(() => daeRuntime.value?.lifecycle.state === 'suspended')

const describeAttachment = (attachment: DaeEbpfAttachment) => {
  switch (attachment.kind) {
    case 'cgroup':
      return { label: `${attachment.name} @ cgroup ${attachment.cgroup}`, value: attachment.state }
    case 'other':
      return { label: `${attachment.name} @ ${attachment.hook}`, value: attachment.state }
    default:
      return {
        label: `${attachment.name} @ ${attachment.interface}`,
        value: `${attachment.direction} · ${attachment.state}`,
      }
  }
}

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

  if (runtime.process.cpu_percent != null) {
    rows.push({ label: 'CPU', value: `${runtime.process.cpu_percent.toFixed(1)}%` })
  }

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

    ebpf.attachments?.forEach((attachment) => rows.push(describeAttachment(attachment)))
  }

  return rows
})

const apply = (data: DaeRuntimeSettings) => {
  settings.value = data
  form.logLevel = data.log?.level ?? form.logLevel
  form.logRecords = data.log?.buffered_records ?? form.logRecords
  form.dnsLogRecords = data.dns_log?.max_records ?? form.dnsLogRecords
  form.maxFlows = data.flows?.max_flows ?? form.maxFlows
  form.flowRetention = data.flows?.retention_seconds ?? form.flowRetention
  form.record_flows = data.recording?.flows?.mode ?? form.record_flows
  form.record_logs = data.recording?.logs?.mode ?? form.record_logs
  form.record_dns_log = data.recording?.dns_log?.mode ?? form.record_dns_log
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

const buildPatch = () => {
  const current = settings.value
  const payload: DaeRuntimeSettingsPatch = {}

  if (!current) return payload

  const log: NonNullable<DaeRuntimeSettingsPatch['log']> = {}
  const flows: NonNullable<DaeRuntimeSettingsPatch['flows']> = {}

  if (has('log.level') && form.logLevel !== current.log?.level) log.level = form.logLevel
  if (has('log.buffered_records') && form.logRecords !== current.log?.buffered_records) {
    log.buffered_records = form.logRecords
  }
  if (has('dns_log.max_records') && current.dns_log) {
    if (form.dnsLogRecords !== current.dns_log.max_records) {
      payload.dns_log = { max_records: form.dnsLogRecords }
    }
  }
  if (has('flows.max_flows') && form.maxFlows !== current.flows?.max_flows) {
    flows.max_flows = form.maxFlows
  }
  if (has('flows.retention_seconds') && form.flowRetention !== current.flows?.retention_seconds) {
    flows.retention_seconds = form.flowRetention
  }

  if (Object.keys(log).length) payload.log = log
  if (Object.keys(flows).length) payload.flows = flows

  for (const recorder of recorders.value) {
    if (recorder.state.allowed && form[recorder.key] !== recorder.state.mode) {
      payload[recorder.key] = form[recorder.key]
    }
  }

  return payload
}

const save = async () => {
  if (saving.value) return

  const payload = buildPatch()

  if (!Object.keys(payload).length) return

  saving.value = true
  errorMessage.value = ''

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
