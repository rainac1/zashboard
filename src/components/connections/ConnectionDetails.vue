<template>
  <DialogWrapper
    v-model="connectionDetailModalShow"
    :title="$t('connectionDetails')"
    :no-padding="true"
    box-class="max-w-160"
  >
    <template #title-right>
      <button
        v-if="sourceIP"
        type="button"
        class="btn btn-ghost btn-xs absolute top-2 right-10"
        :title="$t('sourceIPLabels')"
        @click="sourceIPDialogVisible = true"
      >
        <PencilSquareIcon class="h-4 w-4" />
        <span>{{ $t('sourceIPLabels') }}</span>
      </button>
    </template>

    <div class="flex h-[70dvh] max-h-[70dvh] flex-col overflow-hidden">
      <div class="m-2 mb-0 shrink-0">
        <SegmentedControl
          block
          :model-value="activeTab"
          :options="tabOptions"
          @update:model-value="activeTab = $event as TabType"
        />
      </div>

      <div
        v-if="activeTab === 'overview'"
        class="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      >
        <template
          v-for="section in sections"
          :key="section.id"
        >
          <div class="border-base-content/8 bg-base-200/40 rounded-lg border p-3">
            <div class="text-primary mb-2 text-sm font-semibold">{{ section.title }}</div>
            <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <template
                v-for="row in section.rows"
                :key="row.label"
              >
                <div class="text-base-content/60">{{ row.label }}</div>
                <div class="min-w-0 break-all">{{ row.value }}</div>
              </template>
            </div>
          </div>

          <div
            v-if="section.id === 'sourceAndDestination' && showGeoInfo"
            class="border-base-content/8 bg-base-200/40 rounded-lg border p-3 text-sm"
          >
            <div class="text-primary mb-2 font-semibold">{{ $t('geoInfo') }}</div>
            <div class="flex flex-wrap items-center gap-1">
              <ArrowRightCircleIcon class="h-4 w-4 shrink-0" />
              <div>{{ details?.ip }}</div>
              <div>( AS{{ details?.asn }} )</div>
            </div>
            <div class="mt-1 flex flex-wrap">
              <div
                class="mr-3 flex items-center gap-1"
                v-if="details?.country"
              >
                <MapPinIcon class="h-4 w-4 shrink-0" />
                <template v-if="details?.city && details?.city !== details?.country">
                  {{ details?.city }},
                </template>
                <template v-else-if="details?.region && details?.region !== details?.country">
                  {{ details?.region }},
                </template>
                {{ details?.country }}
              </div>
              <div class="flex items-center gap-1">
                <ServerIcon class="h-4 w-4 shrink-0" />
                {{ details?.organization }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <div
        v-if="activeTab === 'raw'"
        class="flex-1 overflow-y-auto p-4"
      >
        <VueJsonPretty :data="infoConn">
          <template #renderNodeValue="{ node, defaultValue }">
            <template
              v-if="
                (node.path.startsWith('root.chains') || node.path.startsWith('root.chainList')) &&
                proxyMap[node.content]?.icon
              "
            >
              <span
                >"<ProxyIcon
                  :icon="proxyMap[node.content].icon"
                  class="inline-block"
                  :margin="0"
                />
                {{ node.content }}"
              </span>
            </template>
            <template v-else>
              {{ defaultValue }}
            </template>
          </template>
        </VueJsonPretty>
      </div>

      <div
        v-if="activeTab === 'flow'"
        class="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
      >
        <div
          v-if="flowError"
          class="text-error text-xs break-all"
        >
          {{ flowError }}
        </div>
        <div
          v-for="step in flowSteps"
          :key="step.seq"
          class="border-base-content/8 bg-base-200/40 rounded-lg border p-2 text-xs"
        >
          <div class="flex items-center gap-2">
            <span class="bg-base-200 rounded-full px-2 py-0.5">{{ step.stage }}</span>
            <span class="text-base-content/50">{{ step.evidence }}</span>
            <span
              v-if="step.elapsed_us != null"
              class="text-base-content/50 ml-auto"
            >
              {{ (step.elapsed_us / 1000).toFixed(1) }} ms
            </span>
          </div>
          <div class="text-base-content/70 mt-1 break-all">{{ stepSummary(step) }}</div>
        </div>
        <div
          v-if="!flowSteps.length && !flowError"
          class="text-base-content/50 p-3 text-center text-xs"
        >
          {{ $t('noData') }}
        </div>
      </div>

      <div
        v-if="proxyChainStart && activeTab === 'proxies'"
        class="flex flex-1 flex-col overflow-y-auto"
        :class="PROXIES_PARENT_CLASS"
      >
        <div class="shrink-0 p-3 pb-0">
          <ProxyChainPath
            :proxy="proxyChainStart"
            :selected="selectedProxy"
            :show-now-node="true"
            :show-latency="true"
            @update:selected="selectedProxy = $event"
          />
        </div>
        <ProxyGroupPanel :name="selectedProxy || proxyChainStart" />
      </div>
    </div>
  </DialogWrapper>

  <SourceIPLabels
    v-model="sourceIPDialogVisible"
    :show-trigger="false"
    :default-key="sourceIP"
  />
</template>

<script setup lang="ts">
import { getIPInfo, type IPInfo } from '@/api/geoip'
import { can } from '@/assembly/backend'
import { getConnectionDisplayValue } from '@/assembly/connections'
import { fetchDaeFlow } from '@/assembly/dae'
import { proxyMap } from '@/assembly/proxies'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import ProxyChainPath from '@/components/common/ProxyChainPath.vue'
import SegmentedControl, { type SegmentOption } from '@/components/common/SegmentedControl.vue'
import ProxyGroupPanel from '@/components/proxies/ProxyGroupPanel.vue'
import SourceIPLabels from '@/components/settings/connections/SourceIPLabels.vue'
import { useConnections } from '@/composables/use-connections'
import { CONNECTIONS_TABLE_ACCESSOR_KEY } from '@/constant'
import { getConnectionChains, getConnectionSourceIP, getDestinationFromConnection } from '@/helper'
import { getRequestErrorMessage } from '@/helper/request-error'
import { PROXIES_PARENT_CLASS } from '@/helper/utils'
import { proxyChainDirection } from '@/store/settings'
import {
  ArrowRightCircleIcon,
  MapPinIcon,
  PencilSquareIcon,
  ServerIcon,
} from '@heroicons/vue/24/outline'
import type { DaeConnectionRawMessage, DaeFlowStep } from '@/types'
import * as ipaddr from 'ipaddr.js'
import { last } from 'lodash'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VueJsonPretty from 'vue-json-pretty'
import 'vue-json-pretty/lib/styles.css'
import ProxyIcon from '../proxies/ProxyIcon.vue'

const KEY = CONNECTIONS_TABLE_ACCESSOR_KEY

const { infoConn, connectionDetailModalShow } = useConnections()
const { t } = useI18n()
const details = ref<IPInfo | null>(null)
const selectedProxy = ref('')
const sourceIPDialogVisible = ref(false)
const flowSteps = ref<DaeFlowStep[]>([])
const flowError = ref('')

const stepSummary = (step: DaeFlowStep) => {
  const data = step.data as Record<string, unknown> | undefined

  if (!data) return ''

  return Object.entries(data)
    .filter(([, value]) => value !== null && typeof value !== 'object')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
}

const loadFlow = async () => {
  flowError.value = ''
  flowSteps.value = []

  if (!flowId.value) return

  try {
    const flow = await fetchDaeFlow(flowId.value)

    flowSteps.value = flow.trace?.steps ?? []
  } catch (e) {
    flowError.value = getRequestErrorMessage(e)
  }
}

type TabType = 'overview' | 'raw' | 'proxies' | 'flow'
const tabLabel: Record<TabType, string> = {
  overview: 'overview',
  raw: 'rawData',
  proxies: 'proxies',
  flow: 'daeFlowTrace',
}
const activeTab = ref<TabType>('overview')

const destinationIP = computed(() =>
  infoConn.value ? getDestinationFromConnection(infoConn.value) : undefined,
)
const sourceIP = computed(() => (infoConn.value ? getConnectionSourceIP(infoConn.value) : ''))
const isValidDestinationIP = computed(
  () => !!destinationIP.value && ipaddr.isValid(destinationIP.value),
)
const isPrivateIP = computed(() => {
  if (!isValidDestinationIP.value) {
    return false
  }

  const addr = ipaddr.parse(destinationIP.value!)
  const range = addr.range()

  return ['private', 'uniqueLocal', 'loopback', 'linkLocal'].includes(range)
})
const showGeoInfo = computed(
  () => isValidDestinationIP.value && !isPrivateIP.value && !!details.value,
)

const proxyChainStart = computed(() => {
  if (!infoConn.value || !getConnectionChains(infoConn.value).length) {
    return null
  }

  return last(getConnectionChains(infoConn.value))
})

const flowId = computed(() => {
  const connection = infoConn.value as DaeConnectionRawMessage | undefined

  return connection?.daeRaw?.flow_id ?? ''
})

const availableTabs = computed<TabType[]>(() => {
  const tabs: TabType[] = ['overview', 'raw']

  if (proxyChainStart.value) tabs.push('proxies')
  if (can('flows') && flowId.value) tabs.push('flow')

  return tabs
})
const tabOptions = computed<SegmentOption[]>(() =>
  availableTabs.value.map((tab) => ({
    value: tab,
    label: t(tabLabel[tab]),
  })),
)

const sectionDefs: { id: string; keys: CONNECTIONS_TABLE_ACCESSOR_KEY[] }[] = [
  {
    id: 'basic',
    keys: [KEY.Type, KEY.ConnectTime, KEY.Rule, KEY.Process, KEY.InboundUser, KEY.Protocol],
  },
  {
    id: 'sourceAndDestination',
    keys: [
      KEY.SourceIP,
      KEY.SourcePort,
      KEY.Host,
      KEY.SniffHost,
      KEY.Destination,
      KEY.DestinationType,
      KEY.RemoteAddress,
    ],
  },
  { id: 'traffic', keys: [KEY.Download, KEY.Upload, KEY.DlSpeed, KEY.UlSpeed] },
  { id: 'outbound', keys: [KEY.Chains, KEY.Outbound, KEY.OutboundType, KEY.FromOutbound] },
]

const sections = computed(() => {
  const conn = infoConn.value
  if (!conn) return []

  const options = {
    mode: 'table' as const,
    proxyChainDirection: proxyChainDirection.value,
    showFullProxyChain: true,
  }
  const rowsOf = (keys: CONNECTIONS_TABLE_ACCESSOR_KEY[]) =>
    keys
      .map((key) => ({
        label: t(key),
        value: String(getConnectionDisplayValue(conn, key, options) ?? ''),
      }))
      .filter((row) => row.value && row.value !== '-')

  return sectionDefs
    .map((def) => {
      const rows = rowsOf(def.keys)
      if (def.id === 'basic') {
        rows.unshift({ label: 'ID', value: conn.id })
      }
      return { id: def.id, title: t(def.id), rows }
    })
    .filter((section) => section.rows.length)
})

watch(
  () => proxyChainStart.value,
  (name) => {
    selectedProxy.value = name || ''
    if (!name && activeTab.value === 'proxies') {
      activeTab.value = 'overview'
    }
  },
  { immediate: true },
)

watch(
  () => connectionDetailModalShow.value,
  (show) => {
    if (show) {
      activeTab.value = 'overview'
    }
  },
)

watch(
  () => [activeTab.value, flowId.value] as const,
  ([tab]) => {
    if (tab === 'flow') loadFlow()
  },
)

watch(
  () => destinationIP.value,
  (newIP) => {
    if (!newIP || !isValidDestinationIP.value || isPrivateIP.value) {
      details.value = null
      return
    }

    if (details.value?.ip === newIP) {
      return
    }

    details.value = null
    getIPInfo(newIP).then((res) => {
      details.value = res
    })
  },
)
</script>
