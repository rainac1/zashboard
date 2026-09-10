// Taildrop 发送会话池。
//
// SendTaildropFiles 是双向流:客户端先发 start(目标 peer + 文件清单),再把文件
// 内容切成 chunk 推上去,每个文件末尾补一条 fileDone;服务端回 progress(已发送
// 字节)与 receivedBytes(已落盘字节)。后者用于流控 —— WebSocket 的 bufferedAmount
// 涨得再高浏览器也不会拦,不看 receivedBytes 就会把整个文件读进内存排队。
//
// 会话是跨组件的:发起于 Tailscale 面板的 peer 行,进度看板在 Taildrop 弹层里,
// 弹层关掉传输也得继续,所以状态放在模块级而不是某个组件里。
import { GrpcWebSocketStream } from '@/assembly/tools'
import {
  TaildropSendClientMessageSchema,
  TaildropSendServerMessageSchema,
} from '@/gen/daemon/started_service_pb'
import { getSingboxSecret, getSingboxUrlFromBackend } from '@/helper/utils'
import { activeBackend } from '@/store/setup'
import { ref } from 'vue'

// gRPC-Web 的 WebSocket 承载按帧转发,单帧过大在部分反代上会被截断;
// 16KiB 留出帧头余量,与 sing-box 客户端取值一致。
const CHUNK_SIZE = 16 * 1024 - 64
// 允许「已推送 - 服务端已收」之间存在的最大在途字节数。
const SEND_WINDOW = 4 * 1024 * 1024
// receivedBytes 长时间不来时(旧服务端不回执)也别把发送卡死。
const SEND_WAIT_TIMEOUT = 1000

export interface TaildropSendFile {
  name: string
  size: number
  sentBytes: number
  completed: boolean
}

export interface TaildropSendSession {
  id: number
  backendUuid: string
  endpointTag: string
  peerName: string
  files: TaildropSendFile[]
  finished: boolean
  error: string
}

interface SessionEntry {
  state: TaildropSendSession
  cancel: () => void
}

const entries = ref<SessionEntry[]>([])
let sequence = 0

const find = (id: number) => entries.value.find((entry) => entry.state.id === id)

// 当前后端下某个 endpoint 的会话(切后端后旧会话不再显示,但仍在后台跑完/失败)。
// 读的都是响应式源,直接在 computed / 模板里调用即可。
export const taildropSendSessions = (endpointTag: string): TaildropSendSession[] =>
  entries.value
    .filter(
      (entry) =>
        entry.state.backendUuid === activeBackend.value?.uuid &&
        entry.state.endpointTag === endpointTag,
    )
    .map((entry) => entry.state)

export const dismissTaildropSend = (id: number) => {
  const entry = find(id)
  if (!entry) return
  entry.cancel()
  entries.value = entries.value.filter((item) => item.state.id !== id)
}

const finishSession = (id: number, error: string) => {
  const state = find(id)?.state
  if (!state) return
  state.finished = true
  if (error) state.error = error
}

const applyProgress = (
  id: number,
  fileIndex: number,
  sentBytes: number,
  fileCompleted: boolean,
) => {
  const file = find(id)?.state.files[fileIndex]
  if (!file) return
  file.sentBytes = fileCompleted ? file.size : sentBytes
  file.completed = file.completed || fileCompleted
}

const failureMessage = (code: number, message: string) =>
  code === 0 ? '' : message || `grpc-status ${code}`

export const startTaildropSend = (
  endpointTag: string,
  peerStableID: string,
  peerName: string,
  files: File[],
): number | undefined => {
  const backend = activeBackend.value
  const baseUrl = backend ? getSingboxUrlFromBackend(backend) : ''
  if (files.length === 0 || !backend || !baseUrl) return

  sequence += 1
  const id = sequence
  const entry: SessionEntry = {
    state: {
      id,
      backendUuid: backend.uuid,
      endpointTag,
      peerName,
      files: files.map((file) => ({
        name: file.name,
        size: file.size,
        sentBytes: 0,
        completed: false,
      })),
      finished: false,
      error: '',
    },
    cancel: () => {},
  }
  entries.value = [...entries.value, entry]

  let stopped = false
  let received = 0
  let pushed = 0
  // 等待窗口打开:receivedBytes 到达时立刻唤醒,否则超时后无条件继续。
  let resume: (() => void) | null = null
  const wake = () => {
    const pending = resume
    resume = null
    pending?.()
  }
  const waitForWindow = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        resume = null
        resolve()
      }, SEND_WAIT_TIMEOUT)
      resume = () => {
        clearTimeout(timer)
        resolve()
      }
    })

  const stream = new GrpcWebSocketStream({
    baseUrl,
    secret: getSingboxSecret(backend),
    service: 'daemon.StartedService',
    method: 'SendTaildropFiles',
    requestSchema: TaildropSendClientMessageSchema,
    responseSchema: TaildropSendServerMessageSchema,
    onMessage: (msg) => {
      if (stopped) return
      const message = msg.message
      if (message.case === 'receivedBytes') {
        received = Number(message.value)
        wake()
        return
      }
      if (message.case !== 'progress') return
      const progress = message.value
      applyProgress(id, progress.fileIndex, Number(progress.sentBytes), progress.fileCompleted)
    },
    onEnd: (status, error) => {
      if (stopped) return
      stopped = true
      wake()
      finishSession(id, error || (status ? failureMessage(status.code, status.message) : ''))
    },
  })

  entry.cancel = () => {
    if (stopped) return
    stopped = true
    wake()
    stream.close()
  }

  stream.send({
    message: {
      case: 'start',
      value: {
        endpointTag,
        peerStableID,
        files: files.map((file) => ({ name: file.name, size: BigInt(file.size) })),
      },
    },
  })

  void (async () => {
    try {
      for (const file of files) {
        let offset = 0
        while (offset < file.size) {
          while (!stopped && pushed - received >= SEND_WINDOW) {
            await waitForWindow()
          }
          if (stopped) return
          const end = Math.min(offset + CHUNK_SIZE, file.size)
          const data = new Uint8Array(await file.slice(offset, end).arrayBuffer())
          if (stopped) return
          stream.send({ message: { case: 'chunk', value: { data } } })
          offset = end
          pushed += data.length
        }
        if (stopped) return
        stream.send({ message: { case: 'fileDone', value: {} } })
      }
    } catch (readError) {
      if (stopped) return
      stopped = true
      wake()
      stream.close()
      finishSession(id, String(readError))
    }
  })()

  return id
}
