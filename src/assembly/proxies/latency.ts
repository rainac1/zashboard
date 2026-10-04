import { can } from '@/assembly/backend'
import { driver } from '@/assembly/driver'
import { IPV6_TEST_URL, NOT_CONNECTED, PROXY_TYPE, SPEEDTEST_MODE } from '@/constant'
import { isProxyGroup } from '@/helper'
import { showNotification } from '@/helper/notification'
import { notifyRequestError } from '@/helper/request-error'
import { i18n } from '@/i18n'
import { independentLatencyTest, IPv6test, speedtestMode, speedtestTimeout } from '@/store/settings'
import pLimit from 'p-limit'
import { fetchProxies } from './actions'
import {
  getHistoryByName,
  getLatencyByName,
  getNowProxyNodeName,
  getProviderNameByProxy,
  getTestUrl,
  IPv6Map,
  isLatencyTestable,
  proxyGroupList,
  proxyMap,
  speedtestUrlWithDefault,
} from './state'

const testNodeLatency = (proxyName: string, url: string, timeout: number) => {
  const providerName = getProviderNameByProxy(proxyName)

  if (providerName) {
    return driver().proxies.testProviderNode(providerName, proxyName, url, timeout)
  }

  return driver().proxies.testNode(proxyName, url, timeout)
}

const latencyTestForSingle = async (proxyName: string, url: string, timeout: number) => {
  const now = getNowProxyNodeName(proxyName)

  if (IPv6test.value) {
    try {
      IPv6Map.value[now] = (await testNodeLatency(now, IPV6_TEST_URL, 2000)) > NOT_CONNECTED
    } catch {
      IPv6Map.value[now] = false
    }
  }

  return await testNodeLatency(independentLatencyTest.value ? proxyName : now, url, timeout)
}

const getNameForNotification = (name: string, url: string) => {
  if (independentLatencyTest.value) {
    return `${name}\n@${url}`
  }

  return name
}

export const proxyLatencyTest = async (
  proxyName: string,
  url = speedtestUrlWithDefault.value,
  timeout = speedtestTimeout.value,
) => {
  if (!can('latencyTest')) return

  try {
    await latencyTestForSingle(proxyName, url, timeout)
  } catch {
    showNotification({
      content: 'testFailedTip',
      params: {
        name: getNameForNotification(proxyName, url),
      },
      type: 'alert-error',
    })
  } finally {
    await fetchProxies()
  }
}

const setHistory = (proxyName: string, delay: number, groupName?: string) => {
  const history = getHistoryByName(proxyName, groupName)

  history.push({
    time: new Date().toISOString(),
    delay,
  })
}

const TIP_KEY = 'testLatencyOneByOneWithTip'
const limiter = pLimit(5)

const testLatencyOneByOneWithTip = async (
  tipName: string,
  nodes: string[],
  url = speedtestUrlWithDefault.value,
  groupName?: string,
) => {
  const total = nodes.length
  let testDone = 0
  let testFailed = 0

  await Promise.allSettled(
    nodes.map((name) =>
      limiter(async () => {
        let delay = NOT_CONNECTED

        try {
          delay = await latencyTestForSingle(name, url, Math.min(2000, speedtestTimeout.value))
        } catch {
          // 请求失败 / 后端拒绝:按未连通处理
          delay = NOT_CONNECTED
        }

        try {
          // 节点自身失败在内核侧表现为「没有结果」,驱动以 delay=0 返回(clash 亦然),
          // 所以成败要看结果值,而不能只看有没有抛异常,否则失败节点会被算成成功。
          if (delay === NOT_CONNECTED) testFailed++
          setHistory(name, delay, groupName)
        } finally {
          testDone++
          showNotification({
            content: 'testFinishedTip',
            key: TIP_KEY + tipName,
            params: {
              name: getNameForNotification(tipName, url),
              total: total.toString(),
              number: testDone.toString(),
            },
            type: 'alert-info',
            timeout: 0,
          })
        }
      }),
    ),
  )

  await fetchProxies().catch(() => {})

  showNotification({
    content: 'testFinishedResultTip',
    key: TIP_KEY + tipName,
    params: {
      name: getNameForNotification(tipName, url),
      total: total.toString(),
      success: `${total - testFailed}`,
      failed: `${testFailed}`,
    },
    type: testFailed ? 'alert-warning' : 'alert-success',
    timeout: 3000,
  })
}

export const proxyGroupLatencyTest = async (proxyGroupName: string) => {
  if (!can('latencyTest')) return

  const proxyNode = proxyMap.value[proxyGroupName]
  const all = (proxyNode.all ?? []).filter(isLatencyTestable)
  const url = getTestUrl(proxyGroupName)
  const groupType = proxyNode.type.toLowerCase() as PROXY_TYPE

  // Selector 实际只用当前选中的那个出口,把整组丢给内核测会连子 Selector 里没被选中的
  // 节点一起测(内核 URLTestOutbounds 会递归展开)。所以 Selector 一律走面板路径:逐个
  // 成员发测速请求,成员若是嵌套 Selector,latencyTestForSingle 会先递归解析
  // (getNowProxyNodeName)到它当前实际使用的出口,只请求测那个出口 —— 内核控制模式下
  // 也一样。LoadBalance / Smart 的成员都在被使用,仍按测速方式决定面板控制还是内核控制。
  const usePanelControl =
    can('nodeLatencyTest') &&
    [PROXY_TYPE.Selector, PROXY_TYPE.LoadBalance, PROXY_TYPE.Smart].includes(groupType) &&
    (groupType === PROXY_TYPE.Selector || speedtestMode.value === SPEEDTEST_MODE.DASHBOARD)

  if (usePanelControl) {
    if (proxyNode.fixed) {
      driver()
        .proxies.clearFixed(proxyGroupName)
        .catch(() => {})
    }
    return testLatencyOneByOneWithTip(proxyGroupName, all, url, proxyGroupName)
  }

  const timeout = Math.max(5000, speedtestTimeout.value)

  if (IPv6test.value) {
    try {
      const ipv6LatencyResult = await driver().proxies.testGroup(
        proxyGroupName,
        IPV6_TEST_URL,
        timeout,
      )

      all?.forEach((name) => {
        IPv6Map.value[getNowProxyNodeName(name)] = ipv6LatencyResult[name] > NOT_CONNECTED
      })
    } catch {
      all?.forEach((name) => {
        IPv6Map.value[getNowProxyNodeName(name)] = false
      })
    }
  }
  try {
    await driver().proxies.testGroup(proxyGroupName, url, timeout)
  } catch (e) {
    notifyRequestError(e)
    return
  } finally {
    await fetchProxies()
  }

  const total = all.length
  const testFailed = all.filter(
    (name) => getLatencyByName(name, proxyGroupName) === NOT_CONNECTED,
  ).length

  showNotification({
    content: 'testFinishedResultTip',
    key: TIP_KEY + proxyGroupName,
    params: {
      name: getNameForNotification(proxyGroupName, url),
      total: total.toString(),
      success: `${total - testFailed}`,
      failed: `${testFailed}`,
    },
    type: testFailed ? 'alert-warning' : 'alert-success',
    timeout: 3000,
  })
}

export const allProxiesLatencyTest = async () => {
  if (!can('latencyTest')) return

  if (independentLatencyTest.value || !can('nodeLatencyTest')) {
    const limit = pLimit(3)

    return await Promise.all(
      proxyGroupList.value.map((proxyGroupName) =>
        limit(async () => {
          await proxyGroupLatencyTest(proxyGroupName)
        }),
      ),
    )
  }

  const proxyNode = Object.keys(proxyMap.value).filter(
    (proxy) => !isProxyGroup(proxy) && isLatencyTestable(proxy),
  )

  return testLatencyOneByOneWithTip(i18n.global.t('all'), proxyNode)
}
