import { renderRoutes } from '@/helper'
import {
  getDefaultShortcutKey,
  KEYBOARD_SHORTCUT_ACTION,
  KEYBOARD_SHORTCUTS,
  normalizeShortcut,
  PAGE_SHORTCUT_ACTION_INDEX_MAP,
  serializeShortcutEvent,
} from '@/helper/keyboard'
import { isSidebarCollapsed, keyboardShortcuts, manageHiddenGroup } from '@/store/settings'
import { activeBackend, switchActiveBackend } from '@/store/setup'
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

export const useKeyboardShortcuts = () => {
  const normalizedCustomShortcuts = computed(() => {
    return Object.fromEntries(
      Object.entries(keyboardShortcuts.value).map(([action, shortcut]) => [
        action,
        normalizeShortcut(shortcut),
      ]),
    )
  })

  const getShortcutKey = (action: string) => {
    if (action in normalizedCustomShortcuts.value) {
      return normalizedCustomShortcuts.value[action]
    }

    return normalizeShortcut(getDefaultShortcutKey(action))
  }

  return {
    getShortcutKey,
  }
}

export const useKeyboard = () => {
  const router = useRouter()
  const { getShortcutKey } = useKeyboardShortcuts()

  const shortcutActionMap = computed(() => {
    const entries = new Map<string, string>()
    const actions = Object.keys(KEYBOARD_SHORTCUTS)

    for (const action of actions) {
      const key = getShortcutKey(action)
      if (!key || entries.has(key)) {
        continue
      }

      entries.set(key, action)
    }

    return entries
  })

  const handleKeydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable
    ) {
      return
    }

    const key = serializeShortcutEvent(event)
    const action = shortcutActionMap.value.get(key)
    if (!action) {
      return
    }

    if (action === KEYBOARD_SHORTCUT_ACTION.TOGGLE_SIDEBAR) {
      event.preventDefault()
      isSidebarCollapsed.value = !isSidebarCollapsed.value
      return
    }

    if (action === KEYBOARD_SHORTCUT_ACTION.TOGGLE_MANAGE_HIDDEN_GROUP) {
      event.preventDefault()
      manageHiddenGroup.value = !manageHiddenGroup.value
      return
    }

    if (
      action === KEYBOARD_SHORTCUT_ACTION.BACKEND_PREVIOUS ||
      action === KEYBOARD_SHORTCUT_ACTION.BACKEND_NEXT
    ) {
      if (!activeBackend.value) {
        return
      }

      event.preventDefault()
      const direction = action === KEYBOARD_SHORTCUT_ACTION.BACKEND_NEXT ? 1 : -1
      switchActiveBackend(direction)
      return
    }

    if (!activeBackend.value) {
      return
    }

    const pageIndex = PAGE_SHORTCUT_ACTION_INDEX_MAP[action as KEYBOARD_SHORTCUT_ACTION]
    if (typeof pageIndex !== 'number') {
      return
    }

    const route = renderRoutes.value[pageIndex]
    if (!route) {
      return
    }

    event.preventDefault()
    router.push({ name: route })
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  return {
    getShortcutKey,
  }
}
