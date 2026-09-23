import { driver } from '@/assembly/driver'
import type { NodeRank } from '@/types'
import { ref } from 'vue'

export const smartWeightsMap = ref<Record<string, Record<string, string>>>({})
export const smartOrderMap = ref<Record<string, Record<string, number>>>({})

const restructWeights = (proxyName: string, weights: NodeRank[]) => {
  const smartWeights: Record<string, string> = {}
  const smartOrder: Record<string, number> = {}

  weights.forEach((weight, index) => {
    smartWeights[weight.Name] = weight.Rank
    smartOrder[weight.Name] = index
  })

  smartWeightsMap.value[proxyName] = smartWeights
  smartOrderMap.value[proxyName] = smartOrder
}

export const initSmartWeights = async () => {
  let smartWeights: Record<string, NodeRank[]> | null = null

  try {
    smartWeights = await driver().proxies.fetchSmartWeights()
  } catch {
    smartWeights = null
  }

  smartWeightsMap.value = {}
  smartOrderMap.value = {}

  if (!smartWeights) return

  for (const [group, weights] of Object.entries(smartWeights)) {
    if (!weights?.length) continue

    restructWeights(group, weights)
  }
}
