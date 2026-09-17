<template>
  <div
    ref="scrollContainerRef"
    class="relative h-full overflow-y-scroll"
    :class="settingsPaneTransition && 'overflow-x-hidden'"
    :style="padding"
  >
    <!-- 移动端与窄内容区共用顶部控制栏；宽屏改用页内左侧导航。 -->
    <CtrlsBar v-if="!showSideNavigation">
      <div class="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 p-2">
        <button
          v-if="!showMobileIndex"
          type="button"
          class="btn btn-circle btn-ghost btn-sm shrink-0"
          :aria-label="$t('back')"
          @click="backToCategories"
        >
          <ChevronLeftIcon class="h-5 w-5" />
        </button>

        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span
            v-if="showMobileIndex || !activeCategory"
            class="min-w-0 shrink truncate text-base font-semibold"
          >
            {{ $t('settings') }}
          </span>
          <SelectInput
            v-else
            v-model="mobileCategoryKey"
            class="select-sm max-w-48 min-w-0 shrink font-semibold"
            :aria-label="$t('settingsCategory')"
            :options="categorySelectOptions"
          />
          <template v-if="activeBackend">
            <span class="text-base-content/30 shrink-0">|</span>
            <span class="text-base-content/55 flex min-w-0 shrink items-center gap-1.5 text-xs">
              <BackendStatusDot
                :status="connectionStatus"
                :show-latency="false"
              />
              <span class="min-w-0 truncate">{{ connectedBackendLabel }}</span>
            </span>
          </template>
        </div>

        <SettingsSearch
          v-if="showMobileIndex || mobileSearchOpen"
          :class="[
            'min-w-0 flex-1',
            showMobileIndex && 'order-last w-full flex-none',
            !showMobileIndex && 'absolute! top-full right-2 left-2 mt-1',
          ]"
          @select="openSetting"
          @customize="customizationOpen = true"
        />

        <button
          v-if="!showMobileIndex"
          type="button"
          class="btn btn-circle btn-ghost btn-sm shrink-0"
          :class="mobileSearchOpen && 'btn-active'"
          :aria-label="$t('searchSettings')"
          @click="mobileSearchOpen = !mobileSearchOpen"
        >
          <MagnifyingGlassIcon class="h-4 w-4" />
        </button>
        <button
          v-if="isPWA"
          type="button"
          class="btn btn-circle btn-ghost btn-sm shrink-0"
          :title="$t('refresh')"
          @click="refreshPages"
        >
          <ArrowPathIcon class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="btn btn-circle btn-ghost btn-sm shrink-0"
          :title="$t('customizeSettingsPage')"
          @click="customizationOpen = true"
        >
          <AdjustmentsHorizontalIcon class="h-4 w-4" />
        </button>
      </div>
    </CtrlsBar>

    <!-- 移动端先展示分类首页，组件仍在下方挂载以维护准确的可搜索项目索引。 -->
    <main
      v-if="showMobileIndex"
      class="mx-auto w-full max-w-2xl p-3 pb-6"
      :class="settingsPaneTransition === 'pop' && 'settings-pane-pop'"
      @animationend.self="clearPaneAnimation"
    >
      <div class="mb-4 px-1 pt-2">
        <h1 class="text-xl font-semibold tracking-tight">{{ $t('settings') }}</h1>
      </div>

      <div class="settings-grid">
        <button
          v-for="category in menuItems"
          :key="category.key"
          type="button"
          class="setting-item hover:bg-base-200/60 w-full text-left transition-colors"
          @click="selectSection(category.key)"
        >
          <span class="bg-base-200 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <component
              :is="category.icon"
              class="h-5 w-5"
            />
          </span>
          <span class="min-w-0 flex-1 py-2">
            <span class="block text-sm font-medium">
              {{ $t(SETTINGS_MENU_LABELS[category.key]) }}
            </span>
            <span class="text-base-content/50 mt-0.5 block text-xs leading-5">
              {{ $t(category.description) }}
            </span>
          </span>
          <ChevronRightIcon class="h-4 w-4 shrink-0 opacity-35" />
        </button>
      </div>

      <div
        v-if="!menuItems.length"
        class="text-base-content/50 p-8 text-center text-sm"
      >
        {{ $t('noVisibleSettingsCategories') }}
      </div>
    </main>

    <div
      v-show="!showMobileIndex"
      class="mx-auto w-full"
      :class="[
        showSideNavigation
          ? 'grid max-w-5xl grid-cols-[14rem_minmax(0,48rem)] gap-8 p-6'
          : 'max-w-3xl p-3 md:p-6',
        settingsPaneTransition === 'push' && 'settings-pane-push',
      ]"
      @animationend.self="clearPaneAnimation"
    >
      <aside
        v-if="showSideNavigation"
        class="bg-base-200 sticky top-6 flex h-[calc(100dvh-3rem)] min-h-0 flex-col rounded-xl p-2"
      >
        <div class="mb-4 px-2">
          <h1 class="text-xl font-semibold tracking-tight">{{ $t('settings') }}</h1>
          <div
            v-if="activeBackend"
            class="text-base-content/55 mt-1 flex min-w-0 items-center gap-1.5 text-sm"
          >
            <BackendStatusDot
              :status="connectionStatus"
              :show-latency="false"
            />
            <span class="min-w-0 truncate">{{ connectedBackendLabel }}</span>
          </div>
        </div>

        <SettingsSearch
          class="mb-3"
          @select="openSetting"
          @customize="customizationOpen = true"
        />

        <NavMenu
          class="min-h-0 flex-1 overflow-y-auto"
          :items="navItems"
          :active-key="activeCategory?.key"
          :aria-label="$t('settingsCategory')"
          @select="selectNavCategory"
        />

        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="btn btn-sm flex-1"
            @click="customizationOpen = true"
          >
            <AdjustmentsHorizontalIcon class="h-4 w-4" />
            {{ $t('customize') }}
          </button>
          <button
            v-if="isPWA"
            type="button"
            class="btn btn-circle btn-sm"
            :title="$t('refresh')"
            @click="refreshPages"
          >
            <ArrowPathIcon class="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main class="bg-base-200 min-w-0 rounded-2xl p-4">
        <header
          v-if="activeCategory"
          class="mb-5"
        >
          <div class="flex items-center gap-3">
            <span
              class="bg-base-100 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-xs"
            >
              <component
                :is="activeCategory.icon"
                class="h-6 w-6"
              />
            </span>
            <div class="min-w-0">
              <h2 class="text-xl font-semibold tracking-tight">
                {{ $t(SETTINGS_MENU_LABELS[activeCategory.key]) }}
              </h2>
              <p class="text-base-content/50 mt-0.5 text-sm">
                {{ $t(activeCategory.description) }}
              </p>
            </div>
          </div>
        </header>

        <div
          v-if="!activeCategory"
          class="text-base-content/50 p-8 text-center text-sm"
        >
          {{ $t('noVisibleSettingsCategories') }}
        </div>

        <div
          v-for="category in allCategoryComponents"
          v-show="activeCategory?.key === category.key"
          :key="category.key"
          :data-category-key="category.key"
        >
          <component :is="category.component" />
        </div>
      </main>
    </div>

    <SettingsCustomizationDialog v-model="customizationOpen" />
  </div>
</template>

<script setup lang="ts">
import { backendProbe } from '@/assembly/version'
import BackendStatusDot from '@/components/common/BackendStatusDot.vue'
import CtrlsBar from '@/components/common/CtrlsBar.vue'
import SelectInput from '@/components/common/SelectInput.vue'
import BackendSettings from '@/components/settings/backend/BackendSettings.vue'
import ConnectionsSettings from '@/components/settings/connections/ConnectionsSettings.vue'
import ZashboardSettings from '@/components/settings/general/ZashboardSettings.vue'
import OverviewSettings from '@/components/settings/overview/OverviewSettings.vue'
import ProxiesSettings from '@/components/settings/proxies/ProxiesSettings.vue'
import SettingsCustomizationDialog from '@/components/settings/SettingsCustomizationDialog.vue'
import SettingsSearch from '@/components/settings/SettingsSearch.vue'
import type { ReachabilityStatus } from '@/composables/backendReachability'
import NavMenu, { type NavMenuItem } from '@/components/common/NavMenu.vue'
import { usePaddingForViews } from '@/composables/paddingViews'
import { settingsPaneTransition } from '@/composables/pageTransition'
import { useSettingsSection, visibleSectionKeys } from '@/composables/settingsSection'
import { SETTINGS_CATEGORIES, SETTINGS_MENU_LABELS } from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import { getLabelFromBackend, isMiddleScreen, isPWA } from '@/helper/utils'
import { activeBackend, activeUuid } from '@/store/setup'
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/vue/24/outline'
import { useElementSize } from '@vueuse/core'
import type { Component } from 'vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

type CategoryView = {
  key: SETTINGS_MENU_KEY
  label: string
  description: string
  icon: Component
  component: Component
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const scrollContainerRef = ref<HTMLDivElement>()
const { width } = useElementSize(scrollContainerRef)
const { padding } = usePaddingForViews({ offsetTop: 0, offsetBottom: 8 })

const connectedBackendLabel = computed(() =>
  activeBackend.value ? getLabelFromBackend(activeBackend.value) : '',
)
const connectionStatus = computed<ReachabilityStatus>(() => {
  const probe = backendProbe.value
  if (probe?.uuid !== activeUuid.value) return 'idle'
  if (probe.status === 'connected') return 'online'
  if (probe.status === 'failed') return 'offline'
  return 'checking'
})

const customizationOpen = ref(false)
const mobileSearchOpen = ref(false)
const showSideNavigation = computed(() => !isMiddleScreen.value && width.value >= 900)
const {
  sectionKey: routeSection,
  enterSection,
  exitSection,
  enteredFromMobileIndex,
} = useSettingsSection()

const clearPaneAnimation = () => {
  settingsPaneTransition.value = ''
}

const categoryComponents: Record<SETTINGS_MENU_KEY, Component> = {
  [SETTINGS_MENU_KEY.general]: ZashboardSettings,
  [SETTINGS_MENU_KEY.overview]: OverviewSettings,
  [SETTINGS_MENU_KEY.backend]: BackendSettings,
  [SETTINGS_MENU_KEY.proxies]: ProxiesSettings,
  [SETTINGS_MENU_KEY.connections]: ConnectionsSettings,
}
const allCategoryComponents: CategoryView[] = SETTINGS_CATEGORIES.map((category) => ({
  ...category,
  component: categoryComponents[category.key],
}))

const menuItems = computed(() => {
  return visibleSectionKeys.value.flatMap((key) => {
    const category = allCategoryComponents.find((item) => item.key === key)
    return category ? [category] : []
  })
})

const activeCategory = computed(() => {
  const key = routeSection.value ?? (showSideNavigation.value ? menuItems.value[0]?.key : undefined)
  return menuItems.value.find((item) => item.key === key)
})

const showMobileIndex = computed(() => !showSideNavigation.value && !routeSection.value)
const navItems = computed<NavMenuItem[]>(() =>
  menuItems.value.map((category) => ({
    key: category.key,
    label: t(SETTINGS_MENU_LABELS[category.key]),
    icon: category.icon,
  })),
)
const categorySelectOptions = computed(() =>
  menuItems.value.map((item) => ({
    value: item.key,
    label: t(SETTINGS_MENU_LABELS[item.key]),
  })),
)
const mobileCategoryKey = computed({
  get: () => activeCategory.value?.key ?? menuItems.value[0]?.key ?? SETTINGS_MENU_KEY.general,
  set: (key: SETTINGS_MENU_KEY) => selectSection(key),
})

const normalizeQuery = async () => {
  const legacy = route.query.scrollTo
  if (typeof legacy !== 'string') return
  if (!SETTINGS_CATEGORIES.some((category) => category.key === legacy)) return

  const query: Record<string, string | string[] | null | undefined> = {
    ...route.query,
    section: legacy,
  }
  delete query.scrollTo
  await router.replace({ query })
}

const selectSection = async (key: SETTINGS_MENU_KEY, settingKey?: string) => {
  await enterSection(key, settingKey)
  if (!settingKey) scrollContainerRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

const selectNavCategory = (key: string) => selectSection(key as SETTINGS_MENU_KEY)

const backToCategories = async () => {
  mobileSearchOpen.value = false
  await exitSection()
  scrollContainerRef.value?.scrollTo({ top: 0 })
}

const revealSetting = async (settingKey: string) => {
  await nextTick()
  requestAnimationFrame(() => {
    const element = document.getElementById(`setting-${settingKey}`)
    if (!element || !scrollContainerRef.value) return

    const containerRect = scrollContainerRef.value.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const top = scrollContainerRef.value.scrollTop + elementRect.top - containerRect.top - 20
    scrollContainerRef.value.scrollTo({ top, behavior: 'smooth' })
    element.classList.remove('highlight-flash')
    element.classList.add('highlight-flash')
    element.addEventListener('animationend', () => element.classList.remove('highlight-flash'), {
      once: true,
    })
    element.focus({ preventScroll: true })
  })
}

const openSetting = async (category: SETTINGS_MENU_KEY, settingKey: string) => {
  await selectSection(category, settingKey)
  await revealSetting(settingKey)
}

const refreshPages = async () => {
  const registrations = await navigator.serviceWorker.getRegistrations()
  for (const registration of registrations) registration.unregister()
  window.location.reload()
}

watch(
  () => [route.query.section, route.query.setting, route.query.scrollTo, menuItems.value],
  async () => {
    if (route.query.scrollTo) {
      await normalizeQuery()
      return
    }
    const settingKey = route.query.setting
    if (typeof settingKey === 'string' && routeSection.value) await revealSetting(settingKey)
  },
  { deep: true },
)

watch(routeSection, () => {
  mobileSearchOpen.value = false
  if (!routeSection.value) enteredFromMobileIndex.value = false
})

watch(
  () => [showSideNavigation.value, routeSection.value, route.query.scrollTo, menuItems.value],
  async () => {
    if (!showSideNavigation.value || routeSection.value || route.query.scrollTo) return
    const firstCategory = menuItems.value[0]
    if (!firstCategory) return
    await router.replace({
      query: { ...route.query, section: firstCategory.key },
    })
  },
  { deep: true, immediate: true },
)

onMounted(normalizeQuery)
</script>
