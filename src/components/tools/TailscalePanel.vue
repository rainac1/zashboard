<template>
  <div class="mx-auto flex max-w-2xl flex-col p-2 sm:p-4">
    <template
      v-for="endpoint in endpoints"
      :key="endpoint.endpointTag"
    >
      <!-- Endpoint header -->
      <div class="settings-section-label flex items-center justify-between gap-2 normal-case">
        <span class="flex items-center gap-2 tracking-normal">
          <span class="text-base-content/90 text-sm font-semibold">
            {{ endpoint.endpointTag || 'Tailscale' }}
          </span>
          <span
            class="rounded-full px-2 py-0.5 text-[0.65rem] tracking-normal"
            :class="statePill(endpoint.backendState)"
          >
            {{ endpoint.stateText || endpoint.backendState || $t('unknown') }}
          </span>
        </span>
        <button
          v-if="!endpoint.keyAuth"
          class="text-error/90 hover:text-error flex items-center gap-1 text-xs tracking-normal"
          @click="logout(endpoint.endpointTag)"
        >
          <ArrowRightOnRectangleIcon class="h-4 w-4" />
          {{ $t('logout') }}
        </button>
      </div>

      <!-- Status group -->
      <div class="settings-grid">
        <button
          v-if="endpoint.self"
          class="setting-item hover:bg-base-content/3 active:bg-base-content/5 w-full text-left transition-colors"
          @click="openPeerDetail(endpoint, endpoint.self, true)"
        >
          <span class="setting-item-label">{{ $t('thisDevice') }}</span>
          <span class="text-base-content/50 truncate text-sm">{{
            peerDisplayName(endpoint.self)
          }}</span>
          <ChevronRightIcon class="text-base-content/25 h-4 w-4 shrink-0" />
        </button>
        <button
          v-if="exitCandidates(endpoint).length > 0"
          class="setting-item hover:bg-base-content/3 active:bg-base-content/5 w-full text-left transition-colors"
          @click="openExitPicker(endpoint)"
        >
          <span class="setting-item-label">{{ $t('exitNode') }}</span>
          <span class="text-base-content/50 truncate text-sm">
            {{ endpoint.exitNode ? peerDisplayName(endpoint.exitNode) : $t('disabledLabel') }}
          </span>
          <ChevronRightIcon class="text-base-content/25 h-4 w-4 shrink-0" />
        </button>
        <button
          v-if="taildropVisible(endpoint)"
          class="setting-item hover:bg-base-content/3 active:bg-base-content/5 w-full text-left transition-colors"
          @click="openTaildrop(endpoint)"
        >
          <span class="setting-item-label">Taildrop</span>
          <span
            v-if="endpoint.unreadFileCount > 0"
            class="bg-primary text-primary-content shrink-0 rounded-full px-2 py-0.5 text-[0.65rem]"
            >{{ endpoint.unreadFileCount }}</span
          >
          <span class="text-base-content/50 truncate text-sm">{{ taildropSummary(endpoint) }}</span>
          <ChevronRightIcon class="text-base-content/25 h-4 w-4 shrink-0" />
        </button>
        <div
          v-if="endpoint.networkName"
          class="setting-item"
        >
          <span class="setting-item-label">{{ $t('networkLabel') }}</span>
          <span class="text-base-content/50 truncate text-sm">{{ endpoint.networkName }}</span>
        </div>
        <div
          v-if="endpoint.authURL"
          class="setting-item"
        >
          <span class="setting-item-label shrink-0">{{ $t('authURL') }}</span>
          <a
            :href="endpoint.authURL"
            target="_blank"
            class="link link-primary truncate text-sm"
            >{{ endpoint.authURL }}</a
          >
          <button
            class="text-base-content/40 hover:text-base-content/70 shrink-0 transition-colors"
            :title="$t('showAuthQR')"
            @click="openAuthQR(endpoint)"
          >
            <QrCodeIcon class="h-5 w-5" />
          </button>
        </div>
      </div>

      <!-- Peers grouped by user -->
      <template
        v-for="group in groupsOf(endpoint)"
        :key="group.userID.toString()"
      >
        <div class="settings-section-label">
          {{ group.displayName || group.loginName || $t('peers') }}
        </div>
        <div class="settings-grid">
          <div
            v-for="peer in group.peers"
            :key="peer.stableID"
            class="setting-item"
            :class="dropTarget === peer.stableID && 'bg-primary/10'"
            @dragover="onPeerDragOver($event, endpoint, peer)"
            @dragleave="onPeerDragLeave($event, peer)"
            @drop="onPeerDrop($event, endpoint, peer)"
          >
            <button
              class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              @click="openPeerDetail(endpoint, peer, false)"
            >
              <span
                class="inline-block h-2 w-2 shrink-0 rounded-full"
                :class="peer.online ? 'bg-success' : 'bg-base-content/20'"
              ></span>
              <span class="truncate text-sm">{{ peerDisplayName(peer) }}</span>
              <span class="text-base-content/40 truncate text-xs">{{ peer.tailscaleIPs[0] }}</span>
            </button>
            <span
              v-if="peer.exitNode || peer.exitNodeOption"
              class="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem]"
              :class="peer.exitNode ? 'bg-primary/15 text-primary' : 'bg-info/15 text-info'"
              >{{ $t('exitNode') }}</span
            >
            <span
              v-if="peer.shareeNode"
              class="bg-base-content/8 text-base-content/60 shrink-0 rounded-full px-2 py-0.5 text-[0.65rem]"
              >{{ $t('sharedIn') }}</span
            >
            <span
              v-if="peer.expired"
              class="bg-error/15 text-error shrink-0 rounded-full px-2 py-0.5 text-[0.65rem]"
              >{{ $t('expired') }}</span
            >
            <button
              v-if="canSendFiles(endpoint, peer)"
              class="text-primary hover:bg-primary/10 shrink-0 rounded-md p-1 transition-colors"
              :title="$t('taildropSendFiles')"
              @click="pickFiles(endpoint, peer)"
            >
              <PaperAirplaneIcon class="h-4 w-4" />
            </button>
            <button
              v-if="peerSSHAvailable(peer)"
              class="text-primary hover:bg-primary/10 shrink-0 rounded-md p-1 transition-colors"
              :title="$t('connectViaSSH')"
              @click="connectSSH(endpoint, peer)"
            >
              <CommandLineIcon class="h-4 w-4" />
            </button>
            <ChevronRightIcon
              class="text-base-content/25 h-4 w-4 shrink-0 cursor-pointer"
              @click="openPeerDetail(endpoint, peer, false)"
            />
          </div>
        </div>
      </template>
    </template>

    <!-- Dialogs -->
    <TailscalePeerDialog
      v-if="peerDetail"
      v-model="peerDetailOpen"
      :endpoint="peerDetail.endpoint"
      :peer="peerDetail.peer"
      :is-self="peerDetail.isSelf"
      :can-send-files="canSendFiles(peerDetail.endpoint, peerDetail.peer)"
      @connect-ssh="onPeerDetailConnectSSH"
      @edit-ssh="onPeerDetailEditSSH"
      @pick-files="onPeerDetailPickFiles"
      @send-files="onPeerDetailSendFiles"
    />
    <TailscaleExitNodeDialog
      v-if="exitPicker"
      v-model="exitPickerOpen"
      :endpoint="exitPicker.endpoint"
      :candidates="exitPicker.candidates"
    />
    <TailscaleSSHDialog
      v-if="sshPrompt"
      v-model="sshPromptOpen"
      :peer="sshPrompt.peer"
      @connect="onSSHPromptConnect"
    />
    <TaildropDialog
      v-if="taildropEndpoint"
      v-model="taildropOpen"
      :endpoint="taildropEndpoint"
    />
    <input
      ref="fileInput"
      type="file"
      multiple
      class="hidden"
      @change="onFilesPicked"
    />
    <DialogWrapper
      v-model="authQROpen"
      :title="$t('authURL')"
    >
      <div
        v-if="authQR"
        class="flex flex-col items-center gap-3"
      >
        <QRCodeView :value="authQR.authURL" />
        <a
          :href="authQR.authURL"
          target="_blank"
          class="link link-primary text-xs break-all"
          >{{ authQR.authURL }}</a
        >
      </div>
    </DialogWrapper>
  </div>
</template>

<script setup lang="ts">
import { can } from '@/assembly/backend'
import { getSingboxClient } from '@/assembly/tools'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import QRCodeView from '@/components/tools/QRCodeView.vue'
import TaildropDialog from '@/components/tools/TaildropDialog.vue'
import TailscaleExitNodeDialog from '@/components/tools/TailscaleExitNodeDialog.vue'
import TailscalePeerDialog from '@/components/tools/TailscalePeerDialog.vue'
import TailscaleSSHDialog from '@/components/tools/TailscaleSSHDialog.vue'
import {
  buildSSHSession,
  peerDisplayName,
  peerSSHAvailable,
  saveSSHPrefs,
  sshPrefs,
  type SSHSessionOptions,
} from '@/composables/tailscaleSSH'
import {
  type TailscaleEndpointStatus,
  type TailscalePeer,
  type TailscaleUserGroup,
} from '@/gen/daemon/started_service_pb'
import { startTaildropSend, taildropSendSessions } from '@/composables/taildropSend'
import {
  ArrowRightOnRectangleIcon,
  ChevronRightIcon,
  CommandLineIcon,
  PaperAirplaneIcon,
  QrCodeIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ endpoints: TailscaleEndpointStatus[] }>()

const emit = defineEmits<{ ssh: [session: SSHSessionOptions] }>()

const { t } = useI18n()

const groupsOf = (endpoint: TailscaleEndpointStatus): TailscaleUserGroup[] =>
  endpoint.userGroups.filter((g) => g.peers.length > 0)

const exitCandidates = (endpoint: TailscaleEndpointStatus): TailscalePeer[] =>
  endpoint.backendState === 'Running'
    ? endpoint.userGroups.flatMap((g) => g.peers).filter((p) => p.exitNodeOption)
    : []

const statePill = (state: string): string => {
  switch (state) {
    case 'Running':
      return 'bg-success/15 text-success'
    case 'NeedsLogin':
    case 'NeedsMachineAuth':
      return 'bg-error/15 text-error'
    case 'Starting':
      return 'bg-warning/15 text-warning'
    default:
      return 'bg-base-content/10 text-base-content/60'
  }
}

const logout = (endpointTag: string) => {
  getSingboxClient()?.client.tailscaleLogout({ endpointTag })
}

// --- Dialog state ---
const peerDetail = ref<{
  endpoint: TailscaleEndpointStatus
  peer: TailscalePeer
  isSelf: boolean
}>()
const peerDetailOpen = ref(false)
const openPeerDetail = (
  endpoint: TailscaleEndpointStatus,
  peer: TailscalePeer,
  isSelf: boolean,
) => {
  peerDetail.value = { endpoint, peer, isSelf }
  peerDetailOpen.value = true
}

const exitPicker = ref<{ endpoint: TailscaleEndpointStatus; candidates: TailscalePeer[] }>()
const exitPickerOpen = ref(false)
const openExitPicker = (endpoint: TailscaleEndpointStatus) => {
  exitPicker.value = { endpoint, candidates: exitCandidates(endpoint) }
  exitPickerOpen.value = true
}

const authQR = ref<TailscaleEndpointStatus>()
const authQROpen = ref(false)
const openAuthQR = (endpoint: TailscaleEndpointStatus) => {
  authQR.value = endpoint
  authQROpen.value = true
}

const sshPrompt = ref<{ endpoint: TailscaleEndpointStatus; peer: TailscalePeer }>()
const sshPromptOpen = ref(false)
const openSSHPrompt = (endpoint: TailscaleEndpointStatus, peer: TailscalePeer) => {
  sshPrompt.value = { endpoint, peer }
  sshPromptOpen.value = true
}

// --- SSH launch ---
const launchSSH = (
  endpoint: TailscaleEndpointStatus,
  peer: TailscalePeer,
  username: string,
  terminalType: string,
) => {
  emit('ssh', buildSSHSession(endpoint.endpointTag, peer, username, terminalType))
  peerDetailOpen.value = false
}

const connectSSH = (endpoint: TailscaleEndpointStatus, peer: TailscalePeer) => {
  const prefs = sshPrefs.value[peer.stableID]
  if (prefs?.remember) {
    launchSSH(endpoint, peer, prefs.username, prefs.terminalType)
  } else {
    openSSHPrompt(endpoint, peer)
  }
}

// Triggered from inside the peer detail dialog: close it first so the SSH
// prompt / terminal isn't hidden behind it (both dialogs share one layer).
const onPeerDetailConnectSSH = () => {
  const ctx = peerDetail.value
  if (!ctx) return
  peerDetailOpen.value = false
  connectSSH(ctx.endpoint, ctx.peer)
}

const onPeerDetailEditSSH = () => {
  const ctx = peerDetail.value
  if (!ctx) return
  peerDetailOpen.value = false
  openSSHPrompt(ctx.endpoint, ctx.peer)
}

const onSSHPromptConnect = (username: string, terminalType: string, remember: boolean) => {
  const ctx = sshPrompt.value
  if (!ctx) return
  if (remember) {
    saveSSHPrefs(ctx.peer.stableID, { username, terminalType, remember })
  }
  launchSSH(ctx.endpoint, ctx.peer, username, terminalType)
}

// --- Taildrop ---
// 服务端自己就报了两侧的资格:endpoint.canShareFiles 表示本机能发,
// peer.canReceiveFiles 表示对端愿意收,不必在前端猜。
const taildropSupported = computed(() => can('taildrop'))

const canSendFiles = (endpoint: TailscaleEndpointStatus, peer: TailscalePeer): boolean =>
  taildropSupported.value && endpoint.canShareFiles && peer.online && peer.canReceiveFiles

const sendingCount = (endpoint: TailscaleEndpointStatus) =>
  taildropSendSessions(endpoint.endpointTag).length

// 入口只在有内容可看(收件箱有文件 / 正在收发)或本机具备发送资格时出现。
const taildropVisible = (endpoint: TailscaleEndpointStatus): boolean =>
  taildropSupported.value &&
  endpoint.backendState === 'Running' &&
  (endpoint.canShareFiles ||
    endpoint.waitingFileCount > 0 ||
    endpoint.receivingFileCount > 0 ||
    sendingCount(endpoint) > 0)

const taildropSummary = (endpoint: TailscaleEndpointStatus): string => {
  if (endpoint.receivingFileCount > 0) return t('taildropReceiving')
  if (sendingCount(endpoint) > 0) return t('taildropSending')
  if (endpoint.waitingFileCount > 0)
    return t('taildropFileCount', { count: endpoint.waitingFileCount }, endpoint.waitingFileCount)
  return ''
}

const taildropEndpoint = ref<TailscaleEndpointStatus>()
const taildropOpen = ref(false)
const openTaildrop = (endpoint: TailscaleEndpointStatus) => {
  taildropEndpoint.value = endpoint
  taildropOpen.value = true
}

const sendFiles = (endpoint: TailscaleEndpointStatus, peer: TailscalePeer, files: File[]) => {
  if (files.length === 0) return
  startTaildropSend(endpoint.endpointTag, peer.stableID, peerDisplayName(peer), files)
  openTaildrop(endpoint)
}

// 隐藏的 file input 由整个面板共用,pickTarget 记住这次点的是哪个 peer。
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const pickTarget = ref<{ endpoint: TailscaleEndpointStatus; peer: TailscalePeer }>()

const pickFiles = (endpoint: TailscaleEndpointStatus, peer: TailscalePeer) => {
  const input = fileInput.value
  if (!input) return
  pickTarget.value = { endpoint, peer }
  input.value = ''
  input.click()
}

const onFilesPicked = (event: Event) => {
  const target = pickTarget.value
  pickTarget.value = undefined
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  if (target) sendFiles(target.endpoint, target.peer, files)
}

// --- 拖拽发送 ---
const dropTarget = ref('')

const onPeerDragOver = (
  event: DragEvent,
  endpoint: TailscaleEndpointStatus,
  peer: TailscalePeer,
) => {
  if (!canSendFiles(endpoint, peer) || !event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  dropTarget.value = peer.stableID
}

// 拖过子元素时也会冒出 dragleave,只有真的离开整行才灭高亮。
const onPeerDragLeave = (event: DragEvent, peer: TailscalePeer) => {
  const related = event.relatedTarget
  if (related instanceof Node && (event.currentTarget as HTMLElement).contains(related)) return
  if (dropTarget.value === peer.stableID) dropTarget.value = ''
}

const onPeerDrop = (event: DragEvent, endpoint: TailscaleEndpointStatus, peer: TailscalePeer) => {
  if (!canSendFiles(endpoint, peer)) return
  event.preventDefault()
  dropTarget.value = ''
  sendFiles(endpoint, peer, Array.from(event.dataTransfer?.files ?? []))
}

// 与 SSH 同理:详情弹层和 Taildrop 弹层共用一层,先关掉再发起。
const onPeerDetailPickFiles = () => {
  const ctx = peerDetail.value
  if (!ctx) return
  peerDetailOpen.value = false
  pickFiles(ctx.endpoint, ctx.peer)
}

const onPeerDetailSendFiles = (files: File[]) => {
  const ctx = peerDetail.value
  if (!ctx) return
  peerDetailOpen.value = false
  sendFiles(ctx.endpoint, ctx.peer, files)
}
</script>
