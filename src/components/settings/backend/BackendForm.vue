<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1">
      <label class="text-sm">{{ $t('backendType') }}</label>
      <SegmentedControl
        block
        :model-value="model.type"
        :options="backendTypeOptions"
        @update:model-value="setBackendType($event as BackendType)"
      />
    </div>

    <div class="flex gap-2">
      <div class="flex w-24 flex-none flex-col gap-1">
        <label class="text-sm">{{ $t('protocol') }}</label>
        <SelectInput
          class="select select-sm w-full"
          v-model="model.protocol"
          :options="[
            { value: 'http', label: 'HTTP' },
            { value: 'https', label: 'HTTPS' },
          ]"
        />
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <label class="text-sm">{{ $t('host') }}</label>
        <TextInput
          class="w-full"
          name="username"
          autocomplete="username"
          v-model="model.host"
          placeholder="127.0.0.1"
        />
      </div>
      <div class="flex w-20 flex-none flex-col gap-1">
        <label class="text-sm">{{ $t('port') }}</label>
        <TextInput
          class="w-full"
          v-model="model.port"
          placeholder="9090"
        />
      </div>
    </div>

    <div
      v-if="model.type === 'clash'"
      class="flex flex-col gap-1"
    >
      <label class="flex items-center gap-1 text-sm">
        <span>{{ $t('secondaryPath') }} ({{ $t('optional') }})</span>
        <span
          class="tooltip flex-none"
          :data-tip="$t('secondaryPathTip')"
        >
          <QuestionMarkCircleIcon class="h-4 w-4" />
        </span>
      </label>
      <TextInput
        class="w-full"
        v-model="model.secondaryPath"
      />
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-sm">{{ $t('label') }}</label>
      <TextInput
        class="w-full"
        v-model="model.label"
      />
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-sm">{{ isDae ? $t('token') : $t('password') }}</label>
      <input
        type="password"
        class="input input-sm w-full"
        autocomplete="current-password"
        v-model="model.password"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import SelectInput from '@/components/common/SelectInput.vue'
import TextInput from '@/components/common/TextInput.vue'
import type { Backend, BackendType } from '@/types'
import { QuestionMarkCircleIcon } from '@heroicons/vue/24/outline'
import { computed } from 'vue'

const model = defineModel<Omit<Backend, 'uuid'>>({ required: true })

const backendTypeOptions = [
  { value: 'clash' as BackendType, label: 'Clash' },
  { value: 'dae' as BackendType, label: 'dae' },
  { value: 'singbox' as BackendType, label: 'sing-box' },
]

const isDae = computed(() => model.value.type === 'dae')

const setBackendType = (type: BackendType) => {
  model.value = { ...model.value, type }
}
</script>
