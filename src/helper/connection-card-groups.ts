import { computed, ref } from 'vue'

const groupIds = ref<string[]>([])
const expandedGroupIds = ref(new Set<string>())

export const expandedConnectionCardGroupIds = computed(() => expandedGroupIds.value)

export const hasExpandedConnectionCardGroups = computed(() =>
  groupIds.value.some((id) => expandedGroupIds.value.has(id)),
)

export const hasConnectionCardGroups = computed(() => groupIds.value.length > 0)

export const toggleConnectionCardGroup = (id: string) => {
  const next = new Set(expandedGroupIds.value)

  if (next.has(id)) next.delete(id)
  else next.add(id)

  expandedGroupIds.value = next
}

export const toggleAllConnectionCardGroups = () => {
  expandedGroupIds.value = hasExpandedConnectionCardGroups.value
    ? new Set()
    : new Set(groupIds.value)
}

export const resetConnectionCardGroups = () => {
  expandedGroupIds.value = new Set()
}

export const syncConnectionCardGroupIds = (ids: string[]) => {
  groupIds.value = ids

  const liveIds = new Set(ids)
  const retained = [...expandedGroupIds.value].filter((id) => liveIds.has(id))

  if (retained.length !== expandedGroupIds.value.size) {
    expandedGroupIds.value = new Set(retained)
  }
}
