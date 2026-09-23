<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
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
} from '@/assembly/dae'
import TextInput from '@/components/common/TextInput.vue'
import { getRequestErrorMessage } from '@/helper/request-error'
import { fromNow } from '@/helper/utils'
import type { DaeDnsCacheEntry, DaeDnsLogRecord } from '@/types'
import { TrashIcon } from '@heroicons/vue/24/outline'
import { computed, reactive, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ view?: 'cache' | 'log' }>(), { view: 'cache' })

const PAGE_SIZE = 200

const view = computed(() => props.view)
const entries = ref<DaeDnsCacheEntry[]>([])
const records = ref<DaeDnsLogRecord[]>([])
const loading = ref(false)
const errorMessage = ref('')

const filter = reactive({ name: '', type: '' })

const isEmpty = computed(() =>
  view.value === 'cache' ? !entries.value.length : !records.value.length,
)

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

    if (view.value === 'cache') {
      entries.value = (await fetchDaeDnsCache(params)).entries
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
    entries.value = (
      await fetchDaeDnsCache({ limit: PAGE_SIZE, name: filter.name || undefined })
    ).entries
  })

watch(view, reload)

reload()
</script>
