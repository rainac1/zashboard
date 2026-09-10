<template>
  <DialogWrapper
    v-model="isOpen"
    title="Taildrop"
  >
    <template #title-right>
      <button
        v-if="inboxFiles.length > 0"
        class="text-error/90 hover:text-error absolute top-2 right-9 flex items-center gap-1 text-xs font-normal"
        @click="deleteAll"
      >
        <TrashIcon class="h-4 w-4" />
        {{ $t('deleteAll') }}
      </button>
    </template>

    <div class="flex flex-col gap-4 text-sm">
      <!-- Outgoing transfers -->
      <section
        v-if="sessions.length > 0"
        class="flex flex-col gap-1"
      >
        <div class="text-base-content/45 px-1 text-xs">{{ $t('taildropSending') }}</div>
        <div class="divide-base-content/8 bg-base-200/40 divide-y overflow-hidden rounded-xl">
          <template
            v-for="session in sessions"
            :key="session.id"
          >
            <TransferRow
              v-for="(file, index) in session.files"
              :key="`${session.id}:${index}`"
              :name="file.name"
              :peer="$t('taildropTo', { name: session.peerName })"
              :transferred="file.completed ? file.size : file.sentBytes"
              :size="file.size"
              :error="session.error"
              :finished="session.finished"
              @cancel="dismissTaildropSend(session.id)"
            />
          </template>
        </div>
      </section>

      <!-- Incoming transfers -->
      <section
        v-if="receiving.length > 0"
        class="flex flex-col gap-1"
      >
        <div class="text-base-content/45 px-1 text-xs">{{ $t('taildropReceiving') }}</div>
        <div class="divide-base-content/8 bg-base-200/40 divide-y overflow-hidden rounded-xl">
          <TransferRow
            v-for="file in receiving"
            :key="`${file.senderID}:${file.name}`"
            :name="file.name"
            :peer="file.senderName ? $t('taildropFrom', { name: file.senderName }) : ''"
            :transferred="Number(file.receivedBytes)"
            :size="Number(file.size)"
            @cancel="cancelReceiving(file)"
          />
        </div>
      </section>

      <!-- Received files -->
      <section
        v-if="inboxFiles.length > 0"
        class="flex flex-col gap-1"
      >
        <div class="text-base-content/45 px-1 text-xs">{{ $t('taildropFiles') }}</div>
        <div class="divide-base-content/8 bg-base-200/40 divide-y overflow-hidden rounded-xl">
          <div
            v-for="file in inboxFiles"
            :key="file.name"
            class="flex min-h-14 items-center gap-3 px-4 py-2"
          >
            <button
              class="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
              :disabled="!!downloads[file.name]"
              @click="download(file)"
            >
              <span class="w-full truncate">{{ file.name }}</span>
              <span class="text-base-content/45 w-full truncate text-xs">
                {{ inboxMeta(file) }}
              </span>
              <ProgressBar
                v-if="downloads[file.name] && downloads[file.name]!.size > 0"
                :value="downloads[file.name]!.transferred / downloads[file.name]!.size"
              />
            </button>
            <span
              v-if="downloads[file.name]"
              class="loading loading-spinner loading-xs shrink-0"
            ></span>
            <button
              v-else
              class="text-base-content/40 hover:text-primary shrink-0 transition-colors"
              :title="$t('download')"
              @click="download(file)"
            >
              <ArrowDownTrayIcon class="h-5 w-5" />
            </button>
            <button
              class="text-base-content/40 hover:text-error shrink-0 transition-colors"
              :title="$t('delete')"
              @click="deleteFile(file.name)"
            >
              <TrashIcon class="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      <div
        v-if="isEmpty"
        class="text-base-content/50 py-8 text-center"
      >
        {{ $t('taildropEmpty') }}
      </div>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import { getSingboxClient, runStream, serverStream } from '@/assembly/tools'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import { dismissTaildropSend, taildropSendSessions } from '@/composables/taildropSend'
import {
  StartedService,
  type TaildropFile,
  type TaildropReceivingFile,
  type TailscaleEndpointStatus,
} from '@/gen/daemon/started_service_pb'
import { showNotification } from '@/helper/notification'
import { fromNow, prettyBytesHelper } from '@/helper/utils'
import { ArrowDownTrayIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, defineComponent, h, onBeforeUnmount, ref, watch, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ endpoint: TailscaleEndpointStatus }>()
const isOpen = defineModel<boolean>()

const { t } = useI18n()

const endpointTag = computed(() => props.endpoint.endpointTag)
const sessions = computed(() => taildropSendSessions(endpointTag.value))

const inboxFiles = ref<TaildropFile[]>([])
const receiving = ref<TaildropReceivingFile[]>([])
const isEmpty = computed(
  () =>
    sessions.value.length === 0 && inboxFiles.value.length === 0 && receiving.value.length === 0,
)

const ProgressBar = defineComponent({
  props: { value: { type: Number, required: true } },
  setup: (barProps) => () =>
    h('div', { class: 'bg-base-content/10 mt-1 h-1 w-full overflow-hidden rounded-full' }, [
      h('div', {
        class: 'bg-primary h-full rounded-full transition-[width] duration-200',
        style: { width: `${Math.round(Math.min(1, Math.max(0, barProps.value)) * 100)}%` },
      }),
    ]),
})

// 收发两侧共用的一行:名字 + 「已传/总量 · 对端」+ 进度条 + 取消。
const TransferRow = defineComponent({
  props: {
    name: { type: String, required: true },
    peer: { type: String, default: '' },
    transferred: { type: Number, required: true },
    size: { type: Number, required: true },
    error: { type: String, default: '' },
    finished: { type: Boolean, default: false },
    onCancel: { type: Function as PropType<() => void>, required: true },
  },
  setup: (rowProps) => () => {
    const done = rowProps.finished && rowProps.transferred >= rowProps.size
    const meta = [
      done
        ? prettyBytesHelper(rowProps.size)
        : `${prettyBytesHelper(rowProps.transferred)} / ${prettyBytesHelper(rowProps.size)}`,
      rowProps.peer,
    ].filter(Boolean)
    return h('div', { class: 'flex min-h-14 items-center gap-3 px-4 py-2' }, [
      h('div', { class: 'flex min-w-0 flex-1 flex-col gap-0.5' }, [
        h('span', { class: 'truncate' }, rowProps.name),
        h(
          'span',
          { class: `truncate text-xs ${rowProps.error ? 'text-error' : 'text-base-content/45'}` },
          rowProps.error || meta.join(' · '),
        ),
        !rowProps.finished && rowProps.size > 0
          ? h(ProgressBar, { value: rowProps.transferred / rowProps.size })
          : null,
      ]),
      h(
        'button',
        {
          class: `shrink-0 transition-colors ${
            rowProps.finished
              ? 'text-base-content/40 hover:text-base-content/70'
              : 'text-base-content/40 hover:text-error'
          }`,
          title: rowProps.finished ? t('close') : t('cancel'),
          onClick: rowProps.onCancel,
        },
        h(XMarkIcon, { class: 'h-5 w-5' }),
      ),
    ])
  },
})

const inboxMeta = (file: TaildropFile) =>
  [
    prettyBytesHelper(Number(file.size)),
    file.senderName ? t('taildropFrom', { name: file.senderName }) : '',
    file.modifiedAt > 0n ? fromNow(Number(file.modifiedAt) * 1000) : '',
  ]
    .filter(Boolean)
    .join(' · ')

// --- 收件箱订阅:仅在弹层打开期间保持 ---
let inboxHandle: { close: () => void } | null = null

const stopInbox = () => {
  inboxHandle?.close()
  inboxHandle = null
}

watch(
  [isOpen, endpointTag],
  ([open, tag]) => {
    stopInbox()
    inboxFiles.value = []
    receiving.value = []
    if (!open || !getSingboxClient()) return

    inboxHandle = runStream(
      (signal) =>
        serverStream(StartedService.method.subscribeTaildropInbox, { endpointTag: tag }, signal),
      (message) => {
        inboxFiles.value = message.files
        receiving.value = message.receiving
      },
    )
    // 打开即视为已读:未读数只用来在 Tailscale 面板上提醒有新文件。
    getSingboxClient()?.client.markTaildropInboxRead({ endpointTag: tag }).catch(reportError)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopInbox()
  for (const controller of Object.values(downloadControllers)) controller.abort()
})

const reportError = (error: unknown) =>
  showNotification({ content: String(error), type: 'alert-error' })

const deleteFile = (name: string) => {
  getSingboxClient()
    ?.client.deleteTaildropFile({ endpointTag: endpointTag.value, name })
    .catch(reportError)
}

const deleteAll = () => {
  for (const file of inboxFiles.value) deleteFile(file.name)
}

const cancelReceiving = (file: TaildropReceivingFile) => {
  getSingboxClient()
    ?.client.cancelTaildropReceiving({
      endpointTag: endpointTag.value,
      senderID: file.senderID,
      name: file.name,
    })
    .catch(reportError)
}

// --- 下载:DownloadTaildropFile 是 server-streaming,按块攒成 Blob 后交给浏览器保存 ---
// 攒够 8MiB 才合并一次 Blob:每块都 new Blob 会把大文件的拷贝次数拉成 O(n²)。
const BLOB_FLUSH_THRESHOLD = 8 * 1024 * 1024

const downloads = ref<Record<string, { transferred: number; size: number }>>({})
const downloadControllers: Record<string, AbortController> = {}

const download = async (file: TaildropFile) => {
  const client = getSingboxClient()
  const name = file.name
  if (!client || downloads.value[name]) return

  const controller = new AbortController()
  downloadControllers[name] = controller
  downloads.value = { ...downloads.value, [name]: { transferred: 0, size: Number(file.size) } }

  let content = new Blob([])
  let pending: BlobPart[] = []
  let pendingBytes = 0
  let transferred = 0
  let size = -1
  const flush = () => {
    if (pendingBytes === 0) return
    content = new Blob([content, ...pending])
    pending = []
    pendingBytes = 0
  }

  try {
    for await (const chunk of client.client.downloadTaildropFile(
      { endpointTag: endpointTag.value, name },
      { signal: controller.signal },
    )) {
      if (size < 0) size = Number(chunk.size)
      if (chunk.data.length === 0) continue
      // 解码出来的 bytes 是读缓冲区上的视图,攒到 flush 才拷贝就可能读到被复用的内容,
      // 所以这里先复制一份再入队。
      pending.push(new Uint8Array(chunk.data).buffer)
      pendingBytes += chunk.data.length
      transferred += chunk.data.length
      downloads.value = { ...downloads.value, [name]: { transferred, size } }
      if (pendingBytes >= BLOB_FLUSH_THRESHOLD) flush()
    }
    flush()
    if (transferred !== size) {
      throw new Error(`incomplete download: ${transferred} of ${size} bytes`)
    }
    saveBlob(name, content)
  } catch (error) {
    if (!controller.signal.aborted) reportError(error)
  } finally {
    delete downloadControllers[name]
    const next = { ...downloads.value }
    delete next[name]
    downloads.value = next
  }
}

const saveBlob = (name: string, content: Blob) => {
  const url = URL.createObjectURL(content)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>
