<template>
  <div class="flex flex-col gap-3">
    <div
      v-if="view !== 'rules'"
      class="flex flex-wrap items-center gap-2"
    >
      <TextInput
        v-model="filter.name"
        class="w-56"
        placeholder="Domain Name"
        :clearable="true"
      />
      <TextInput
        v-model="filter.type"
        class="w-24"
        placeholder="Type"
        :menus="['A', 'AAAA', 'HTTPS']"
      />
      <button
        class="btn btn-sm"
        :disabled="loading"
        @click="reload"
      >
        <span
          v-if="loading"
          class="loading loading-spinner h-4 w-4"
        />
        {{ $t('search') }}
      </button>
      <button
        v-if="view === 'cache' && can('dnsCache') && filter.name"
        class="btn btn-sm btn-ghost"
        @click="dropByName"
      >
        {{ $t('daeDropCacheName') }}
      </button>
      <span
        v-if="view === 'cache' && usage"
        class="text-base-content/50 ml-auto text-xs"
      >
        {{ $t('daeDnsCacheUsage') }}: {{ usage.entries }}
        <template v-if="usage.entry_capacity">/ {{ usage.entry_capacity }}</template>
      </span>
    </div>

    <div
      v-if="errorMessage"
      class="text-error text-xs break-all"
    >
      {{ errorMessage }}
    </div>

    <div
      v-if="view === 'cache'"
      class="flex flex-col gap-2"
    >
      <div
        v-for="entry in entries"
        :key="entry.entry_id"
        class="base-container flex items-center gap-2 p-3 text-xs"
      >
        <span class="bg-base-200 rounded-full px-2 py-0.5">{{ entry.type }}</span>
        <span class="min-w-0 flex-1 truncate">{{ entry.domain }}</span>
        <span class="text-base-content/60">{{ entry.status }}</span>
        <span class="text-base-content/50">
          {{ entry.expires_at ? fromNow(entry.expires_at) : '-' }}
        </span>
        <button
          class="btn btn-ghost btn-xs"
          :aria-label="$t('delete')"
          @click="dropEntry(entry.entry_id)"
        >
          <TrashIcon class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div
      v-else-if="view === 'rules'"
      class="flex flex-col gap-3"
    >
      <div
        v-for="list in ruleLists"
        :key="list.key"
        class="flex flex-col gap-1"
      >
        <div class="text-base-content/70 text-xs">{{ $t(list.label) }}</div>
        <div
          v-for="rule in list.rules"
          :key="rule.rule_id"
          class="base-container flex items-center gap-2 p-2 text-xs"
        >
          <span class="text-base-content/50 w-6 flex-none text-right">{{ rule.index }}</span>
          <span
            class="min-w-0 flex-1 font-mono break-all"
            :title="rule.source ? `${rule.source.file}:${rule.source.line}` : undefined"
          >
            {{ rule.expression }}
          </span>
          <span class="bg-base-200 rounded-full px-2 py-0.5">
            {{ rule.upstream ? `${rule.action} · ${rule.upstream}` : rule.action }}
          </span>
        </div>
      </div>
    </div>

    <div
      v-else
      class="flex flex-col gap-2"
    >
      <div
        v-for="record in records"
        :key="record.id"
        class="base-container p-3 text-xs"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="bg-base-200 rounded-full px-2 py-0.5">{{ record.question.type }}</span>
          <span class="min-w-0 flex-1 truncate">{{ record.question.name }}</span>
          <span class="text-base-content/60">{{ record.status }}</span>
          <span class="text-base-content/50">{{ record.elapsed_ms }} ms</span>
        </div>
        <div class="text-base-content/50 mt-1 break-all">
          {{ record.src || '-' }} · {{ record.cached ? $t('daeCached') : record.upstream || '-' }} ·
          {{ record.route.rule || record.route.source }}
        </div>
      </div>
    </div>

    <div
      v-if="isEmpty && !loading"
      class="text-base-content/50 p-6 text-center text-xs"
    >
      {{ $t('noData') }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { can } from '@/assembly/backend'
import {
  deleteDaeDnsCacheEntry,
  deleteDaeDnsCacheName,
  fetchDaeDnsCache,
  fetchDaeDnsLog,
  fetchDaeDnsRules,
} from '@/assembly/dae'
import TextInput from '@/components/common/TextInput.vue'
import { getRequestErrorMessage } from '@/helper/request-error'
import { fromNow } from '@/helper/utils'
import type { DaeDnsCacheList, DaeDnsCacheEntry, DaeDnsLogRecord, DaeDnsRuleList } from '@/types'
import { TrashIcon } from '@heroicons/vue/24/outline'
import { computed, reactive, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ view?: 'cache' | 'log' | 'rules' }>(), {
  view: 'cache',
})

const PAGE_SIZE = 200

const view = computed(() => props.view)
const entries = ref<DaeDnsCacheEntry[]>([])
const records = ref<DaeDnsLogRecord[]>([])
const usage = ref<DaeDnsCacheList['usage']>()
const dnsRules = ref<DaeDnsRuleList | null>(null)

const ruleLists = computed(() =>
  dnsRules.value
    ? [
        { key: 'request', label: 'daeDnsRequestRules', rules: dnsRules.value.request },
        { key: 'response', label: 'daeDnsResponseRules', rules: dnsRules.value.response },
      ]
    : [],
)
const loading = ref(false)
const errorMessage = ref('')

const filter = reactive({ name: '', type: '' })

const isEmpty = computed(() => {
  if (view.value === 'rules') return !ruleLists.value.length
  if (view.value === 'cache') return !entries.value.length

  return !records.value.length
})

const run = async (action: () => Promise<void>) => {
  if (loading.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    await action()
  } catch (e) {
    errorMessage.value = getRequestErrorMessage(e)
  } finally {
    loading.value = false
  }
}

const reload = () =>
  run(async () => {
    const params = {
      limit: PAGE_SIZE,
      name: filter.name || undefined,
      type: filter.type || undefined,
    }

    if (view.value === 'rules') {
      dnsRules.value = await fetchDaeDnsRules()
      return
    }

    if (view.value === 'cache') {
      const list = await fetchDaeDnsCache(params)

      entries.value = list.entries
      usage.value = list.usage
      return
    }

    records.value = (await fetchDaeDnsLog(params)).records
  })

const dropEntry = (entryId: string) =>
  run(async () => {
    await deleteDaeDnsCacheEntry(entryId)
    entries.value = entries.value.filter((entry) => entry.entry_id !== entryId)
  })

const dropByName = () =>
  run(async () => {
    await deleteDaeDnsCacheName(filter.name, filter.type || undefined)
    const list = await fetchDaeDnsCache({ limit: PAGE_SIZE, name: filter.name || undefined })

    entries.value = list.entries
    usage.value = list.usage
  })

watch(view, reload)

reload()
</script>
