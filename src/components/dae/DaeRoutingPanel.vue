<template>
  <div class="flex flex-col gap-3">
    <form
      v-if="can('routingTrace')"
      class="base-container flex flex-wrap items-center gap-2 p-3"
      @submit.prevent="runTrace"
    >
      <SelectInput
        v-model="form.network"
        class="select select-sm w-24"
        :options="[
          { value: 'tcp', label: 'TCP' },
          { value: 'udp', label: 'UDP' },
        ]"
      />
      <TextInput
        v-model="form.domain"
        class="w-56"
        placeholder="example.com"
        :clearable="true"
      />
      <TextInput
        v-model="form.dstIP"
        class="w-40"
        placeholder="1.1.1.1"
        :clearable="true"
      />
      <input
        v-model.number="form.port"
        type="number"
        class="input input-sm w-20"
        :placeholder="$t('port')"
      />
      <TextInput
        v-model="form.pname"
        class="w-32"
        :placeholder="$t('process')"
        :clearable="true"
      />
      <button
        type="submit"
        class="btn btn-sm btn-primary"
        :disabled="loading"
      >
        <span
          v-if="loading"
          class="loading loading-spinner h-4 w-4"
        />
        {{ $t('daeTraceRun') }}
      </button>
    </form>

    <div
      v-if="errorMessage"
      class="text-error text-xs break-all"
    >
      {{ errorMessage }}
    </div>

    <div
      v-for="(evaluation, index) in trace?.evaluations ?? []"
      :key="index"
      class="base-container flex flex-col gap-1 p-3 text-xs"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="bg-base-200 rounded-full px-2 py-0.5">{{ evaluation.decision }}</span>
        <span class="font-medium">{{ evaluation.outbound || '-' }}</span>
        <span class="text-base-content/50">{{ evaluation.dst_ip || '' }}</span>
        <span
          v-if="evaluation.missing_inputs.length"
          class="text-warning ml-auto"
        >
          {{ $t('daeMissingInputs') }}: {{ evaluation.missing_inputs.join(', ') }}
        </span>
      </div>
      <div
        v-for="rule in matchedRules(evaluation)"
        :key="rule.rule_id"
        class="text-base-content/70 break-all"
        :class="rule.result === 'true' && 'text-success'"
      >
        [{{ rule.result }}] {{ rule.expression }}
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { can } from '@/assembly/backend'
import { traceDaeRouting } from '@/assembly/dae'
import SelectInput from '@/components/common/SelectInput.vue'
import TextInput from '@/components/common/TextInput.vue'
import { getRequestErrorMessage } from '@/helper/request-error'
import type { DaeRoutingTrace, DaeTraceEvaluation } from '@/types'
import { reactive, ref } from 'vue'

const trace = ref<DaeRoutingTrace | null>(null)
const loading = ref(false)
const errorMessage = ref('')

const form = reactive({
  network: 'tcp' as 'tcp' | 'udp',
  domain: 'www.google.com',
  dstIP: '',
  port: 443,
  pname: '',
})

const matchedRules = (evaluation: DaeTraceEvaluation) =>
  evaluation.rules.filter((rule) => rule.result !== 'false').slice(0, 10)

const runTrace = async () => {
  if (loading.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    trace.value = await traceDaeRouting({
      network: form.network,
      dst_port: form.port,
      domain: form.domain || undefined,
      dst_ip: form.dstIP || undefined,
      pname: form.pname || undefined,
    })
  } catch (e) {
    errorMessage.value = getRequestErrorMessage(e)
  } finally {
    loading.value = false
  }
}
</script>
