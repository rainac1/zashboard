<template>
  <div
    class="relative flex size-full overflow-hidden"
    :class="[disableProxiesPageTextSelect ? 'select-none' : '']"
  >
    <FolderManagerPanel v-if="foldersUiVisible && folderManagerOpen" />
    <div
      class="max-md:scrollbar-hidden relative h-full min-w-0 flex-1"
      :class="disableProxiesPageScroll ? 'overflow-y-hidden' : 'overflow-y-scroll'"
      :style="padding"
      ref="proxiesRef"
      @scroll.passive="handleScroll"
    >
      <ProxiesCtrl />
      <FolderTopBar v-if="foldersUiVisible" />
      <div
        ref="columnsRef"
        class="flex gap-3 p-3 md:pr-2"
      >
        <VirtualColumn
          v-for="(items, idx) in columns"
          :key="`${cardVariant}-${idx}`"
          ref="columnRefs"
          class="min-w-0 flex-1"
          :data="items"
          :scroll-element="proxiesRef"
          :scroll-margin="scrollMargin"
          :estimate-size="estimatedCardHeight"
          :size-cache-key="cardVariant"
        >
          <template v-slot="{ item }: { item: string }">
            <component
              :is="renderComponent"
              :name="item"
            />
          </template>
        </VirtualColumn>
      </div>
    </div>
    <ProxyGroupChainModal />
  </div>
</template>

<script setup lang="ts">
import { proxiesTabShow } from '@/store/proxies'
import VirtualColumn from '@/components/common/VirtualColumn.vue'
import ProxiesCtrl from '@/components/controls/ProxiesCtrl'
import FolderManagerPanel from '@/components/proxies/folders/FolderManagerPanel.vue'
import FolderTopBar from '@/components/proxies/folders/FolderTopBar.vue'
import ProxyGroup from '@/components/proxies/ProxyGroup.vue'
import ProxyGroupForMobile from '@/components/proxies/ProxyGroupForMobile.vue'
import ProxyProvider from '@/components/proxies/ProxyProvider.vue'
import ProxyGroupChainModal from '@/components/proxies/ProxyGroupChainModal.vue'
import { usePaddingForViews } from '@/composables/use-padding-for-views'
import { disableProxiesPageScroll, renderProxiesPageItems } from '@/helper/proxies'
import { PROXY_TAB_TYPE } from '@/constant'
import { isMiddleScreen } from '@/helper/utils'
import { fetchProxies } from '@/assembly/proxies'
import { disableProxiesPageTextSelect, twoColumnProxyGroup } from '@/store/settings'
import { folderManagerOpen, isProxyFolderModeActive } from '@/store/proxy-folders'
import { useResizeObserver, useSessionStorage } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const { padding } = usePaddingForViews({
  offsetTop: 0,
  offsetBottom: 0,
})
const renderPageItems = renderProxiesPageItems
const proxiesRef = ref<HTMLElement | null>(null)

type ScrollAnchor = {
  item: string
  offset: number
  scrollTop: number
}
type SavedScrollPosition = ScrollAnchor | number
type VirtualColumnRef = {
  scrollToItem: (name: string) => boolean
  correctScrollBy: (delta: number) => void
}

const scrollStatus = useSessionStorage<Record<PROXY_TAB_TYPE, SavedScrollPosition>>(
  'cache/proxies-scroll-status',
  {
    [PROXY_TAB_TYPE.PROVIDER]: 0,
    [PROXY_TAB_TYPE.PROXIES]: 0,
  },
)
const columnRefs = ref<VirtualColumnRef[]>([])
let saveFrame = 0

const handleScroll = () => {
  if (!proxiesRef.value) return

  if (!restoringScroll && !saveFrame) {
    const tab = proxiesTabShow.value

    saveFrame = requestAnimationFrame(() => {
      saveFrame = 0
      saveScrollPosition(tab)
    })
  }
  syncScrollMargin()
}

const columnsRef = ref<HTMLElement | null>(null)
const scrollMargin = ref(0)
const syncScrollMargin = () => {
  scrollMargin.value = columnsRef.value?.offsetTop ?? 0
}

const SCROLL_RESTORE_TIMEOUT = 1000
let restoreFrame = 0
let restoreToken = 0
let restoringScroll = false

const findAnchorElement = (item?: string) => {
  const renderedItems = columnsRef.value?.querySelectorAll<HTMLElement>('[data-proxy-page-item]')

  if (!renderedItems) return null

  if (item !== undefined) {
    return [...renderedItems].find((element) => element.dataset.proxyPageItem === item) ?? null
  }

  const viewportTop = proxiesRef.value?.getBoundingClientRect().top ?? 0
  let anchor: HTMLElement | null = null
  let anchorTop = Infinity

  for (const element of renderedItems) {
    const rect = element.getBoundingClientRect()

    if (rect.bottom <= viewportTop || rect.top >= anchorTop) continue

    anchor = element
    anchorTop = rect.top
  }

  return anchor
}

const saveScrollPosition = (tab = proxiesTabShow.value) => {
  if (!proxiesRef.value || restoringScroll) return

  const anchor = findAnchorElement()

  scrollStatus.value[tab] = anchor
    ? {
        item: anchor.dataset.proxyPageItem!,
        offset: anchor.getBoundingClientRect().top - proxiesRef.value.getBoundingClientRect().top,
        scrollTop: proxiesRef.value.scrollTop,
      }
    : proxiesRef.value.scrollTop
}

const restoreScrollPosition = (tab = proxiesTabShow.value) => {
  const token = ++restoreToken
  const saved = scrollStatus.value[tab]
  const fallbackTop = Math.max(0, Number(typeof saved === 'number' ? saved : saved?.scrollTop) || 0)
  const startTime = performance.now()
  let stableFrames = 0
  let anchorColumn: VirtualColumnRef | undefined

  cancelAnimationFrame(restoreFrame)
  restoringScroll = true

  const restoreWhenReady = () => {
    if (token !== restoreToken) return

    const proxiesEl = proxiesRef.value

    if (!proxiesEl) return

    const isTimedOut = performance.now() - startTime >= SCROLL_RESTORE_TIMEOUT

    if (typeof saved !== 'number' && saved?.item) {
      anchorColumn ??= columnRefs.value.find((column) => column.scrollToItem(saved.item))

      const anchor = findAnchorElement(saved.item)

      if (anchor) {
        const currentOffset =
          anchor.getBoundingClientRect().top - proxiesEl.getBoundingClientRect().top
        const delta = currentOffset - saved.offset

        if (Math.abs(delta) > 1) {
          anchorColumn?.correctScrollBy(delta)
          stableFrames = 0
        } else {
          stableFrames++
        }

        if (stableFrames >= 3 || isTimedOut) {
          finishRestore()

          return
        }
      }

      if (!isTimedOut) {
        restoreFrame = requestAnimationFrame(restoreWhenReady)

        return
      }
    }

    proxiesEl.scrollTop = Math.min(
      fallbackTop,
      Math.max(0, proxiesEl.scrollHeight - proxiesEl.clientHeight),
    )
    finishRestore()
  }

  const finishRestore = () => {
    restoreFrame = 0
    restoringScroll = false
    syncScrollMargin()
  }

  restoreFrame = requestAnimationFrame(restoreWhenReady)
}

watch(proxiesTabShow, (tab, previousTab) => {
  cancelAnimationFrame(saveFrame)
  saveFrame = 0
  saveScrollPosition(previousTab)

  nextTick(() => restoreScrollPosition(tab))
})

onMounted(() => {
  nextTick(() => {
    syncScrollMargin()
    restoreScrollPosition()
  })
  setTimeout(() => {
    fetchProxies()
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(saveFrame)
  saveFrame = 0
  saveScrollPosition()
  restoreToken++
  cancelAnimationFrame(restoreFrame)
})

const cardType = computed(() => {
  if (proxiesTabShow.value === PROXY_TAB_TYPE.PROVIDER) {
    return 'provider' as const
  }

  if (isMiddleScreen.value && displayTwoColumns.value) {
    return 'mobile' as const
  }

  return 'group' as const
})

const renderComponent = computed(() => {
  if (cardType.value === 'provider') {
    return ProxyProvider
  }

  if (cardType.value === 'mobile') {
    return ProxyGroupForMobile
  }

  return ProxyGroup
})

const cardVariant = computed(() => `${cardType.value}:${displayTwoColumns.value ? 2 : 1}`)
const estimatedCardHeight = computed(() => (cardType.value === 'mobile' ? 88 : 112))

const foldersUiVisible = computed(
  () => isProxyFolderModeActive.value && proxiesTabShow.value === PROXY_TAB_TYPE.PROXIES,
)

const displayTwoColumns = computed(() => {
  if (proxiesTabShow.value === PROXY_TAB_TYPE.PROVIDER && isMiddleScreen.value) {
    return false
  }
  return twoColumnProxyGroup.value && renderPageItems.value.length > 1
})

const filterContent: <T>(all: T[], target: number) => T[] = (all, target) => {
  return all.filter((_, index: number) => index % 2 === target)
}

const columns = computed(() =>
  displayTwoColumns.value
    ? [filterContent(renderPageItems.value, 0), filterContent(renderPageItems.value, 1)]
    : [renderPageItems.value],
)

useResizeObserver(proxiesRef, syncScrollMargin)
watch([foldersUiVisible, displayTwoColumns, isMiddleScreen], () => nextTick(syncScrollMargin))
</script>
