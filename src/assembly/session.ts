// 组装层 · 后端会话。
//
// 一次会话 = 面板为某个后端建立起来的整套运行时状态:内核探测 + 首屏数据 +
// 三条常驻流(connections / logs / traffic)。切后端、改当前后端的连接参数、
// 用户手动重连,本质都是「结束旧会话、开一条新的」,所以共用 startBackendSession——
// 重连不需要额外的响应式开关,再调一次就是了。
//
// 世代号只在模块内部用:startBackendSession 中途有 await,快速连切后端时
// 旧会话醒来必须让位给新会话,不能抢着建流。

import { PROXY_TAB_TYPE, RULE_TAB_TYPE } from '@/constant'
import { initConnections, stopConnections } from '@/store/connections'
import { initSatistic, stopSatistic } from '@/store/overview'
import { activeBackend } from '@/store/setup'
import { watch } from 'vue'
import { fetchConfigs } from './config'
import { initLogs, stopLogs } from './logs'
import { fetchProxies, proxiesTabShow, resetProxies } from './proxies'
import { fetchRules, rulesTabShow } from './rules'
import { probeActiveBackend } from './version'

let generation = 0

export const startBackendSession = async () => {
  const current = ++generation

  // 探测不 await:连通性提示要的正是「正在连接」这个中间态,数据流也不必等它。
  probeActiveBackend()
  // 三条常驻流连同各自的数据在这里同步丢掉,不能留到下面重建时再清:本函数是 pre 型
  // watcher,它一让出执行权(await),组件就会带着「新后端 + 旧后端的数据」重绘一帧。
  // 连接尤其致命 —— 字段访问器按当前后端路由,形状对不上会直接把渲染打崩
  // (详见 store/connections 的注释);日志与统计则是安静地冒充新后端的数据。
  stopConnections()
  stopLogs()
  stopSatistic()
  await resetProxies()

  if (current !== generation) return

  // 后端被清空(登出 / 401 / 新增后端)时就停在这:常驻流上面已经关掉,
  // 否则它们会以无主状态留在 Setup 页继续运行并无限重连。
  if (!activeBackend.value) return

  rulesTabShow.value = RULE_TAB_TYPE.RULES
  proxiesTabShow.value = PROXY_TAB_TYPE.PROXIES
  fetchConfigs()
  fetchProxies()
  fetchRules()
  initConnections()
  initLogs()
  initSatistic()
}

// 会话跟着 activeBackend 走:换后端要重建,把当前后端的地址 / 密码改掉同样要重建。
watch(activeBackend, startBackendSession, { immediate: true })
