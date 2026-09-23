import { ROUTE_NAME } from '@/constant'
import { renderRoutes } from '@/helper'
import { isMiddleScreen } from '@/helper/utils'
import { computed, ref } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'

export type SlideDirection = 'slide-left' | 'slide-right' | ''

export type SettingsPaneTransition = 'push' | 'pop' | ''

const navigationLevel = (route: RouteLocationNormalized) => {
  return route.name === ROUTE_NAME.settings && route.query.section ? 1 : 0
}

const slideDirection = ref<SlideDirection>('')

let pendingSwipeDirection: SlideDirection = ''

export const setPendingSwipeDirection = (direction: SlideDirection) => {
  pendingSwipeDirection = direction
}

export const settingsPaneTransition = ref<SettingsPaneTransition>('')

export const pageTransitionName = computed(() =>
  isMiddleScreen.value ? slideDirection.value : 'page',
)

export const pageTransitionMode = computed(() =>
  isMiddleScreen.value ? undefined : ('out-in' as const),
)

const resolveSlideDirection = (
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
): SlideDirection => {
  const routes = renderRoutes.value
  const toIndex = routes.findIndex((item) => item === to.name)
  const fromIndex = routes.findIndex((item) => item === from.name)

  if (toIndex === -1 || fromIndex === -1) return ''

  const lastIndex = routes.length - 1

  if (toIndex === 0 && fromIndex === lastIndex) return 'slide-left'
  if (toIndex === lastIndex && fromIndex === 0) return 'slide-right'

  return toIndex < fromIndex ? 'slide-right' : 'slide-left'
}

export const resolvePageTransition = (
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
) => {
  const swipeDirection = pendingSwipeDirection
  pendingSwipeDirection = ''

  if (to.name !== from.name) {
    slideDirection.value = swipeDirection || resolveSlideDirection(to, from)
    settingsPaneTransition.value = ''
    return
  }

  const levelDelta = isMiddleScreen.value ? navigationLevel(to) - navigationLevel(from) : 0

  slideDirection.value = ''
  settingsPaneTransition.value = levelDelta > 0 ? 'push' : levelDelta < 0 ? 'pop' : ''
}
