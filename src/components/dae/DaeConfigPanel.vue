<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <SelectInput
        v-model="activeSourceId"
        class="select select-sm min-w-56 flex-1"
        :options="sourceOptions"
      />
      <button
        class="btn btn-sm"
        :disabled="busy"
        @click="load"
      >
        {{ $t('refresh') }}
      </button>
    </div>

    <div
      v-if="activeSource"
      class="text-base-content/50 flex flex-wrap gap-x-4 gap-y-1 text-xs"
    >
      <span>{{ activeSource.kind }}</span>
      <span>{{ activeSource.line_count }} {{ $t('daeLines') }}</span>
      <span>{{ activeSource.bytes }} B</span>
      <span class="break-all">{{ activeSource.content_sha256.slice(0, 16) }}</span>
      <span v-if="!activeSource.writable">{{ $t('daeReadOnly') }}</span>
    </div>

    <textarea
      v-model="content"
      class="textarea textarea-bordered h-96 w-full font-mono text-xs"
      spellcheck="false"
      :readonly="!editable"
    ></textarea>

    <div
      v-if="diagnostics.length"
      class="bg-base-200/40 max-h-40 overflow-y-auto rounded-sm p-2 text-xs"
    >
      <div
        v-for="(item, index) in diagnostics"
        :key="index"
        :class="item.level === 'error' ? 'text-error' : 'text-warning'"
        class="break-all"
      >
        <template v-if="item.line">[{{ item.line }}:{{ item.column ?? 0 }}]</template>
        {{ item.message }}
      </div>
    </div>

    <div
      v-if="message"
      class="text-xs break-all"
      :class="failed ? 'text-error' : 'text-success'"
    >
      {{ message }}
    </div>

    <div class="flex items-center justify-end gap-2">
      <button
        class="btn btn-sm"
        :disabled="busy || !content"
        @click="validate('syntax')"
      >
        {{ $t('daeValidateSyntax') }}
      </button>
      <button
        class="btn btn-sm"
        :disabled="busy || !content"
        @click="validate('full')"
      >
        {{ $t('daeValidateFull') }}
      </button>
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || !editable || !dirty"
        @click="save"
      >
        <span
          v-if="busy"
          class="loading loading-spinner h-4 w-4"
        />
        {{ $t('daeSaveAndReload') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { can } from '@/assembly/backend'
import {
  fetchDaeConfig,
  fetchDaeConfigSource,
  saveDaeConfigSource,
  validateDaeConfig,
} from '@/assembly/dae'
import { fetchProxies } from '@/assembly/proxies'
import { fetchRules } from '@/assembly/rules'
import SelectInput from '@/components/common/SelectInput.vue'
import { getRequestErrorMessage } from '@/helper/request-error'
import type { DaeConfigSource, DaeDiagnostic } from '@/types'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const sources = ref<DaeConfigSource[]>([])
const activeSourceId = ref('')
const content = ref('')
const original = ref('')
const diagnostics = ref<DaeDiagnostic[]>([])
const message = ref('')
const failed = ref(false)
const busy = ref(false)

const activeSource = computed(() => sources.value.find((item) => item.id === activeSourceId.value))
const sourceOptions = computed(() =>
  sources.value.map((source) => ({
    value: source.id,
    label: `${source.kind} · ${source.id}`,
  })),
)
const editable = computed(
  () => can('configEdit') && !!activeSource.value?.writable && activeSource.value.content != null,
)
const dirty = computed(() => content.value !== original.value)

const load = async () => {
  busy.value = true
  message.value = ''
  failed.value = false

  try {
    const snapshot = await fetchDaeConfig()

    sources.value = snapshot.sources
    diagnostics.value = snapshot.diagnostics ?? []

    if (!sources.value.some((source) => source.id === activeSourceId.value)) {
      activeSourceId.value = sources.value[0]?.id ?? ''
    } else {
      await applySource()
    }
  } catch (e) {
    failed.value = true
    message.value = getRequestErrorMessage(e)
  } finally {
    busy.value = false
  }
}

const applySource = async () => {
  const source = activeSource.value

  if (!source) {
    content.value = ''
    original.value = ''
    return
  }

  if (source.content == null) {
    try {
      const detail = await fetchDaeConfigSource(source.id)

      sources.value = sources.value.map((item) => (item.id === detail.id ? detail : item))
    } catch {}
  }

  content.value = activeSource.value?.content ?? ''
  original.value = content.value
}

const validate = async (mode: 'syntax' | 'full') => {
  const source = activeSource.value

  if (!source) return

  busy.value = true
  message.value = ''
  failed.value = false

  try {
    const result = await validateDaeConfig(mode, [
      { id: 'candidate', path: source.path, content: content.value },
    ])

    diagnostics.value = result.diagnostics ?? []
    failed.value = !result.valid
    message.value = result.valid ? t('daeConfigValid') : t('daeConfigInvalid')
  } catch (e) {
    failed.value = true
    message.value = getRequestErrorMessage(e)
  } finally {
    busy.value = false
  }
}

const save = async () => {
  const source = activeSource.value

  if (!source) return

  busy.value = true
  message.value = ''
  failed.value = false

  try {
    await saveDaeConfigSource(source.id, source.content_sha256, content.value)
    message.value = t('daeConfigSaved')
    await load()
    await Promise.all([fetchProxies(), fetchRules()])
  } catch (e) {
    failed.value = true
    message.value = getRequestErrorMessage(e)
  } finally {
    busy.value = false
  }
}

watch(activeSourceId, applySource)

load()
</script>
