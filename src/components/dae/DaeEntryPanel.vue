<template>
  <div class="flex flex-col gap-3">
    <SegmentedControl
      block
      :model-value="activeTab"
      :options="tabOptions"
      @update:model-value="activeTab = $event as TabType"
    />

    <div
      v-if="message"
      class="text-xs break-all"
      :class="failed ? 'text-error' : 'text-success'"
    >
      {{ message }}
    </div>

    <template v-if="activeTab === 'providers'">
      <form
        v-if="canManageProviders"
        class="flex flex-wrap items-center gap-2"
        @submit.prevent="addProvider"
      >
        <TextInput
          v-model="providerForm.name"
          class="w-40"
          :placeholder="$t('name')"
          :clearable="true"
        />
        <TextInput
          v-model="providerForm.url"
          class="min-w-0 flex-1"
          placeholder="https://example.com/sub"
          :clearable="true"
        />
        <button
          type="submit"
          class="btn btn-sm btn-primary"
          :disabled="busy || !providerForm.name || !providerForm.url"
        >
          {{ $t('daeAddSubscription') }}
        </button>
      </form>

      <div class="bg-base-200/30 max-h-80 overflow-y-auto rounded-sm">
        <div
          v-for="provider in providers"
          :key="provider.id"
          class="border-base-300/30 flex items-center gap-2 p-2 text-xs not-last:border-b"
        >
          <span class="bg-base-200 rounded-full px-2 py-0.5">{{ provider.kind }}</span>
          <span class="min-w-0 flex-1 truncate">{{ provider.name }}</span>
          <span class="text-base-content/50">{{ provider.node_count }}</span>
          <span
            class="text-base-content/60"
            :class="provider.status === 'error' && 'text-error'"
          >
            {{ provider.status }}
          </span>
          <button
            v-if="canManageProviders && provider.kind === 'subscription'"
            class="btn btn-ghost btn-xs"
            :aria-label="$t('delete')"
            :disabled="busy"
            @click="removeProvider(provider.id, provider.name)"
          >
            <TrashIcon class="h-4 w-4" />
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="activeTab === 'nodes'">
      <form
        v-if="canManageNodes"
        class="flex flex-wrap items-center gap-2"
        @submit.prevent="addNode"
      >
        <TextInput
          v-model="nodeForm.name"
          class="w-40"
          :placeholder="$t('name')"
          :clearable="true"
        />
        <TextInput
          v-model="nodeForm.link"
          class="min-w-0 flex-1"
          placeholder="vless://..."
          :clearable="true"
        />
        <button
          type="submit"
          class="btn btn-sm btn-primary"
          :disabled="busy || !nodeForm.name || !nodeForm.link"
        >
          {{ $t('daeAddNode') }}
        </button>
      </form>

      <div class="bg-base-200/30 max-h-80 overflow-y-auto rounded-sm">
        <div
          v-for="node in inlineNodes"
          :key="node.id"
          class="border-base-300/30 flex items-center gap-2 p-2 text-xs not-last:border-b"
        >
          <span class="bg-base-200 rounded-full px-2 py-0.5">{{ node.protocol || '-' }}</span>
          <span class="min-w-0 flex-1 truncate">{{ node.name }}</span>
          <button
            v-if="canManageNodes"
            class="btn btn-ghost btn-xs"
            :aria-label="$t('delete')"
            :disabled="busy"
            @click="removeNode(node.id, node.name)"
          >
            <TrashIcon class="h-4 w-4" />
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <SelectInput
        v-model="activeGroupId"
        class="select select-sm w-full"
        :options="groupOptions"
      />

      <div
        v-if="activeGroup"
        class="grid grid-cols-2 gap-3 max-sm:grid-cols-1"
      >
        <label
          v-if="mutable('policy')"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('daeGroupPolicy') }}</span>
          <SelectInput
            v-model="groupForm.policy"
            class="select select-sm w-32"
            :options="policyOptions"
          />
        </label>
        <label
          v-if="mutable('default_member_id')"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('daeDefaultMember') }}</span>
          <SelectInput
            v-model="groupForm.defaultMemberId"
            class="select select-sm w-40"
            :options="memberOptions"
          />
        </label>
        <label
          v-if="mutable('final_outbound')"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('daeFinalOutbound') }}</span>
          <TextInput
            v-model="groupForm.finalOutbound"
            class="w-40"
            :clearable="true"
          />
        </label>
        <label
          v-if="mutable('tolerance')"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('daeTolerance') }}</span>
          <input
            v-model="groupForm.tolerance"
            type="number"
            min="0"
            class="input input-sm w-24"
          />
        </label>
        <label
          v-if="mutable('idle_timeout')"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('daeIdleTimeout') }}</span>
          <input
            v-model="groupForm.idleTimeout"
            type="number"
            min="0"
            class="input input-sm w-24"
          />
        </label>
        <label
          v-if="mutable('interrupt_connections')"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <span class="text-base-content/70">{{ $t('daeInterruptConnections') }}</span>
          <input
            v-model="groupForm.interruptConnections"
            type="checkbox"
            class="toggle toggle-sm"
          />
        </label>
      </div>

      <div
        v-if="activeGroup && !activeGroup.capabilities.mutable_config.length"
        class="text-base-content/50 text-xs"
      >
        {{ $t('daeGroupReadOnly') }}
      </div>

      <div class="flex justify-end">
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy || !activeGroup?.capabilities.mutable_config.length"
          @click="saveGroup"
        >
          <span
            v-if="busy"
            class="loading loading-spinner h-4 w-4"
          />
          {{ $t('apply') }}
        </button>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { daeCapabilities } from '@/assembly/capabilities'
import {
  createDaeNode,
  createDaeProvider,
  daeGroupDetails,
  daeNodeList,
  daeProviderList,
  deleteDaeNode,
  deleteDaeProvider,
  patchDaeGroup,
} from '@/assembly/dae'
import SegmentedControl, { type SegmentOption } from '@/components/common/SegmentedControl.vue'
import SelectInput from '@/components/common/SelectInput.vue'
import TextInput from '@/components/common/TextInput.vue'
import { showConfirmDialog } from '@/helper/confirm-dialog'
import { getRequestErrorMessage } from '@/helper/request-error'
import type { DaeJsonPatchOperation } from '@/types'
import { TrashIcon } from '@heroicons/vue/24/outline'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

type TabType = 'providers' | 'nodes' | 'groups'

const { t } = useI18n()

const activeTab = ref<TabType>('providers')
const activeGroupId = ref('')
const busy = ref(false)
const message = ref('')
const failed = ref(false)

const providerForm = reactive({ name: '', url: '' })
const nodeForm = reactive({ name: '', link: '' })
const groupForm = reactive({
  policy: 'selector',
  defaultMemberId: '',
  finalOutbound: '',
  tolerance: '' as string | number,
  idleTimeout: '' as string | number,
  interruptConnections: false,
})

const providers = computed(() => daeProviderList.value)
const inlineNodes = computed(() =>
  daeNodeList.value.filter((node) => node.provider_id === 'inline' || !node.provider_id),
)
const canManageProviders = computed(
  () => daeCapabilities.value?.resources.providers.can_manage === true,
)
const canManageNodes = computed(() => daeCapabilities.value?.resources.nodes.can_manage === true)

const tabOptions = computed<SegmentOption[]>(() => [
  { value: 'providers', label: t('daeSubscriptions') },
  { value: 'nodes', label: t('daeNodes') },
  { value: 'groups', label: t('proxyGroup') },
])

const activeGroup = computed(() =>
  daeGroupDetails.value.find((group) => group.id === activeGroupId.value),
)
const groupOptions = computed(() =>
  daeGroupDetails.value.map((group) => ({ value: group.id, label: group.name })),
)
const memberOptions = computed(() => [
  { value: '', label: '-' },
  ...(activeGroup.value?.members ?? []).map((member) => ({
    value: member.id,
    label: member.name,
  })),
])
const policyOptions = ['selector', 'urltest', 'fallback', 'loadbalance', 'random', 'score'].map(
  (value) => ({ value, label: value }),
)

const mutable = (field: string) =>
  activeGroup.value?.capabilities.mutable_config.includes(field) === true

const applyGroup = () => {
  const group = activeGroup.value

  if (!group) return

  groupForm.policy = group.policy.kind
  groupForm.defaultMemberId = group.config.default_member_id ?? ''
  groupForm.finalOutbound = group.config.final_outbound ?? ''
  groupForm.tolerance = group.config.tolerance == null ? '' : String(group.config.tolerance)
  groupForm.idleTimeout = group.config.idle_timeout == null ? '' : String(group.config.idle_timeout)
  groupForm.interruptConnections = group.config.interrupt_connections
}

const run = async (action: () => Promise<void>, success: string) => {
  if (busy.value) return

  busy.value = true
  message.value = ''
  failed.value = false

  try {
    await action()
    message.value = t(success)
  } catch (e) {
    failed.value = true
    message.value = getRequestErrorMessage(e)
  } finally {
    busy.value = false
  }
}

const confirmDelete = async (name: string) => {
  const { confirmed } = await showConfirmDialog({
    title: t('delete'),
    message: t('daeDeleteConfirm', { name }),
  })

  return confirmed
}

const addProvider = () =>
  run(async () => {
    await createDaeProvider(providerForm.name.trim(), providerForm.url.trim())
    providerForm.name = ''
    providerForm.url = ''
  }, 'daeEntryCreated')

const removeProvider = async (id: string, name: string) => {
  if (!(await confirmDelete(name))) return

  run(() => deleteDaeProvider(id).then(() => undefined), 'daeEntryDeleted')
}

const addNode = () =>
  run(async () => {
    await createDaeNode(nodeForm.name.trim(), nodeForm.link.trim())
    nodeForm.name = ''
    nodeForm.link = ''
  }, 'daeEntryCreated')

const removeNode = async (id: string, name: string) => {
  if (!(await confirmDelete(name))) return

  run(() => deleteDaeNode(id).then(() => undefined), 'daeEntryDeleted')
}

const numberOrNull = (value: string | number) => {
  if (value === '' || value == null) return null

  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const buildOperations = (): DaeJsonPatchOperation[] => {
  const group = activeGroup.value

  if (!group) return []

  const operations: DaeJsonPatchOperation[] = []
  const set = (field: string, path: string, value: unknown) => {
    if (!mutable(field)) return
    if (value === null) {
      operations.push({ op: 'remove', path })
      return
    }
    operations.push({ op: 'replace', path, value })
  }

  if (mutable('policy') && groupForm.policy !== group.policy.kind) {
    operations.push({
      op: 'replace',
      path: '/policy',
      value: { kind: groupForm.policy, native: groupForm.policy },
    })
  }

  const defaultMemberId = groupForm.defaultMemberId || null
  const finalOutbound = groupForm.finalOutbound.trim() || null
  const tolerance = numberOrNull(groupForm.tolerance)
  const idleTimeout = numberOrNull(groupForm.idleTimeout)

  if (defaultMemberId !== (group.config.default_member_id ?? null)) {
    set('default_member_id', '/config/default_member_id', defaultMemberId)
  }
  if (finalOutbound !== (group.config.final_outbound ?? null)) {
    set('final_outbound', '/config/final_outbound', finalOutbound)
  }
  if (tolerance !== (group.config.tolerance ?? null)) {
    set('tolerance', '/config/tolerance', tolerance)
  }
  if (idleTimeout !== (group.config.idle_timeout ?? null)) {
    set('idle_timeout', '/config/idle_timeout', idleTimeout)
  }
  if (groupForm.interruptConnections !== group.config.interrupt_connections) {
    set('interrupt_connections', '/config/interrupt_connections', groupForm.interruptConnections)
  }

  return operations
}

const saveGroup = () => {
  const group = activeGroup.value
  const operations = buildOperations()

  if (!group || !operations.length) return

  return run(() => patchDaeGroup(group.id, group.config_revision, operations), 'daeGroupUpdated')
}

watch(activeGroupId, applyGroup)
watch(
  daeGroupDetails,
  () => {
    if (!daeGroupDetails.value.some((group) => group.id === activeGroupId.value)) {
      activeGroupId.value = daeGroupDetails.value[0]?.id ?? ''
    }

    applyGroup()
  },
  { immediate: true },
)
</script>
