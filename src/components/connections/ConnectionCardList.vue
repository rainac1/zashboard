<template>
  <VirtualScroller
    :data="listItems"
    :size="size"
    :get-item-key="getItemKey"
  >
    <template #before>
      <ConnectionCtrl />
    </template>
    <template #default="{ item }: { item: ConnectionCardListItem }">
      <button
        v-if="item.type === 'group'"
        type="button"
        class="flex w-full items-center gap-3 px-3 py-2 text-left"
        :aria-expanded="item.expanded"
        @click="toggleConnectionCardGroup(item.id)"
      >
        <div class="min-w-0 flex-1">
          <div class="text-base-content/50 text-xs">
            {{ t(item.groupKey) }}
          </div>
          <div
            class="truncate text-sm font-medium"
            :title="item.value"
          >
            {{ item.value }}
          </div>
        </div>
        <span class="badge badge-sm shrink-0">{{ item.count }}</span>
        <ChevronRightIcon
          class="h-4 w-4 shrink-0 transition-transform"
          :class="item.expanded && 'rotate-90'"
        />
      </button>
      <ConnectionCard
        v-else
        :conn="item.connection"
      />
    </template>
  </VirtualScroller>
</template>

<script setup lang="ts">
import { getConnectionDisplayValue } from '@/assembly/connections'
import {
  expandedConnectionCardGroupIds,
  resetConnectionCardGroups,
  syncConnectionCardGroupIds,
  toggleConnectionCardGroup,
} from '@/helper/connection-card-groups'
import type { ConnectionGroupableKey } from '@/constant'
import { connectionCardGroupKey, connectionTabShow, renderConnections } from '@/store/connections'
import { connectionCardLines, proxyChainDirection, showFullProxyChain } from '@/store/settings'
import { activeUuid } from '@/store/setup'
import type { Connection } from '@/types'
import { ChevronRightIcon } from '@heroicons/vue/24/outline'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VirtualScroller from '../common/VirtualScroller.vue'
import ConnectionCtrl from '../controls/ConnectionCtrl.tsx'
import ConnectionCard from './ConnectionCard'

type ConnectionCardGroupItem = {
  type: 'group'
  id: string
  groupKey: ConnectionGroupableKey
  value: string
  count: number
  expanded: boolean
}

type ConnectionCardConnectionItem = {
  type: 'connection'
  id: string
  connection: Connection
}

type ConnectionCardListItem = ConnectionCardGroupItem | ConnectionCardConnectionItem
type ConnectionGroup = Omit<ConnectionCardGroupItem, 'type' | 'count' | 'expanded'> & {
  connections: Connection[]
}

const { t } = useI18n()

const displayOptions = computed(() => ({
  mode: 'table' as const,
  proxyChainDirection: proxyChainDirection.value,
  showFullProxyChain: showFullProxyChain.value,
}))

const groups = computed<ConnectionGroup[]>(() => {
  const groupKey = connectionCardGroupKey.value

  if (groupKey === null) return []

  const byValue = new Map<string, ConnectionGroup>()

  for (const connection of renderConnections.value) {
    const displayValue = getConnectionDisplayValue(connection, groupKey, displayOptions.value)
    const value = String(displayValue || '').trim() || t('unknown')
    const id = `group:${JSON.stringify([groupKey, value])}`
    const existing = byValue.get(id)

    if (existing) {
      existing.connections.push(connection)
    } else {
      byValue.set(id, { id, groupKey, value, connections: [connection] })
    }
  }

  return [...byValue.values()]
})

const listItems = computed<ConnectionCardListItem[]>(() => {
  if (connectionCardGroupKey.value === null) {
    return renderConnections.value.map((connection) => ({
      type: 'connection',
      id: `connection:${connection.id}`,
      connection,
    }))
  }

  return groups.value.flatMap((group): ConnectionCardListItem[] => {
    const expanded = expandedConnectionCardGroupIds.value.has(group.id)
    const header: ConnectionCardGroupItem = {
      type: 'group',
      id: group.id,
      groupKey: group.groupKey,
      value: group.value,
      count: group.connections.length,
      expanded,
    }

    if (!expanded) return [header]

    return [
      header,
      ...group.connections.map((connection): ConnectionCardConnectionItem => ({
        type: 'connection',
        id: `connection:${connection.id}`,
        connection,
      })),
    ]
  })
})

watch([connectionCardGroupKey, connectionTabShow, activeUuid], resetConnectionCardGroups, {
  flush: 'sync',
})
watch(groups, (nextGroups) => syncConnectionCardGroupIds(nextGroups.map((group) => group.id)), {
  immediate: true,
})

const getItemKey = (item: unknown) => (item as ConnectionCardListItem).id
const size = computed(() => {
  return connectionCardLines.value.length * 28 + 12
})
</script>
