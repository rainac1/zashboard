import { activeConnections } from '@/assembly/connections'
import { getConnectionChains } from '@/helper'
import { computed } from 'vue'

export const downloadSpeedByProxyGroup = computed(() => {
  const speedMap = new Map<string, number>()

  for (const connection of activeConnections.value) {
    const speed = connection.downloadSpeed

    if (!speed) continue

    const chains = getConnectionChains(connection)

    for (let i = 0; i < chains.length; i++) {
      const name = chains[i]

      if (chains.indexOf(name) !== i) continue

      speedMap.set(name, (speedMap.get(name) ?? 0) + speed)
    }
  }

  return speedMap
})

export const getDownloadSpeedByProxyGroup = (name: string) =>
  downloadSpeedByProxyGroup.value.get(name) ?? 0
