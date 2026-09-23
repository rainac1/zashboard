import { useStorage } from '@/composables/use-storage'
import type { Backend } from '@/types'
import { isEqual, omit } from 'lodash'
import { v4 as uuid } from 'uuid'
import { computed, ref } from 'vue'
import { sourceIPLabelList } from './settings'

// 旧版本的后端结构:没有 `type` 字段,且 sing-box 以附属通道 `singboxChannel` 存在。
type LegacySingboxChannel = {
  protocol?: string
  host?: string
  port?: string
  secret?: string
}
type LegacyBackend = Omit<Partial<Backend>, 'type'> & {
  type?: string
  singboxChannel?: LegacySingboxChannel
}

// 一次性迁移:补全 `type`;把旧的 singboxChannel 拆分为独立的 sing-box 后端。
const migrateBackendList = (list: LegacyBackend[]): Backend[] => {
  const migrated: Backend[] = []

  for (const item of list) {
    const channel = item.singboxChannel
    const base = omit(item, 'singboxChannel') as Backend

    migrated.push({
      ...base,
      type: (base.type as Backend['type']) ?? 'clash',
    })

    if (channel?.host) {
      migrated.push({
        type: 'singbox',
        protocol: channel.protocol || 'http',
        host: channel.host,
        port: channel.port || '9090',
        secondaryPath: '',
        password: channel.secret || '',
        uuid: uuid(),
        label: base.label ? `${base.label} (sing-box)` : undefined,
      })
    }
  }

  return migrated
}

export const backendList = useStorage<Backend[]>('setup/api-list', [])

if (backendList.value.some((item) => !item.type || 'singboxChannel' in item)) {
  backendList.value = migrateBackendList(backendList.value as LegacyBackend[])
}

export const activeUuid = useStorage<string>('setup/active-uuid', '')

if (activeUuid.value && !backendList.value.some((item) => item.uuid === activeUuid.value)) {
  activeUuid.value = ''
}
export const activeBackend = computed(() =>
  backendList.value.find((backend) => backend.uuid === activeUuid.value),
)

export const setActiveBackend = (uuid: string) => {
  activeUuid.value = uuid
}

export type BackendManagerView =
  { mode: 'list' } | { mode: 'create' } | { mode: 'edit'; uuid: string }

export const backendManagerView = ref<BackendManagerView | null>(null)

export const openBackendManager = (view: BackendManagerView = { mode: 'list' }) => {
  backendManagerView.value = view
}

export const closeBackendManager = () => {
  backendManagerView.value = null
}

export const switchActiveBackend = (direction: 1 | -1) => {
  if (backendList.value.length < 2) {
    return null
  }

  const currentIndex = backendList.value.findIndex((backend) => backend.uuid === activeUuid.value)
  const startIndex = currentIndex >= 0 ? currentIndex : 0
  const nextIndex = (startIndex + direction + backendList.value.length) % backendList.value.length

  const nextBackend = backendList.value[nextIndex]

  if (!nextBackend) {
    return null
  }

  setActiveBackend(nextBackend.uuid)
  return nextBackend
}

export const addBackend = (backend: Omit<Backend, 'uuid'>) => {
  const currentEnd = backendList.value.find((end) => {
    return isEqual(omit(end, 'uuid'), backend)
  })

  if (currentEnd) {
    setActiveBackend(currentEnd.uuid)
    return currentEnd.uuid
  }

  const id = uuid()

  backendList.value.push({
    ...backend,
    uuid: id,
  })
  setActiveBackend(id)
  return id
}

export const updateBackend = (uuid: string, backend: Omit<Backend, 'uuid'>) => {
  const index = backendList.value.findIndex((end) => end.uuid === uuid)
  if (index !== -1) {
    backendList.value[index] = {
      ...backend,
      uuid,
    }
  }
}

export const removeBackend = (uuid: string) => {
  const wasActive = activeUuid.value === uuid

  backendList.value = backendList.value.filter((end) => end.uuid !== uuid)

  if (wasActive) {
    setActiveBackend(backendList.value[0]?.uuid ?? '')
  }

  sourceIPLabelList.value.forEach((label) => {
    if (label.scope && label.scope.includes(uuid)) {
      label.scope = label.scope.filter((scope) => scope !== uuid)
      if (!label.scope.length) {
        delete label.scope
      }
    }
  })
}
