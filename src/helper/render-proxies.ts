import { proxyMap, proxyProviederList } from '@/assembly/proxies'

export type ProxiesProviderSection = {
  providerName: string
  proxies: string[]
}

export const groupProxiesByProviderName = (proxies: string[]): ProxiesProviderSection[] => {
  const proxiesOfProvider: Record<string, string[]> = {}
  const providerKeys: string[] = []

  for (const proxy of proxies) {
    const proxyNode = proxyMap.value[proxy]
    const providerName =
      proxyNode['provider-name'] ||
      (proxyProviederList.value.find((group) => group.proxies.find((node) => node.name === proxy))
        ?.name ??
        '')

    if (proxiesOfProvider[providerName]) {
      proxiesOfProvider[providerName].push(proxy)
    } else {
      if (providerName === '') {
        providerKeys.unshift('')
      } else {
        providerKeys.push(providerName)
      }

      proxiesOfProvider[providerName] = [proxy]
    }
  }

  return providerKeys.map((providerName) => ({
    providerName,
    proxies: proxiesOfProvider[providerName],
  }))
}
