import { keyboardShortcuts } from '@/store/settings'

export enum KEYBOARD_SHORTCUT_ACTION {
  TOGGLE_SIDEBAR = 'sidebar:toggle',
  TOGGLE_MANAGE_HIDDEN_GROUP = 'proxies:toggle-manage-hidden-group',
  BACKEND_PREVIOUS = 'backend:previous',
  BACKEND_NEXT = 'backend:next',
  PAGE_1 = 'page:1',
  PAGE_2 = 'page:2',
  PAGE_3 = 'page:3',
  PAGE_4 = 'page:4',
  PAGE_5 = 'page:5',
  PAGE_6 = 'page:6',
}

const pruneOrphanedShortcuts = () => {
  const known = new Set<string>(Object.values(KEYBOARD_SHORTCUT_ACTION))
  const entries = Object.entries(keyboardShortcuts.value)
  const kept = entries.filter(([action]) => known.has(action))

  if (kept.length !== entries.length) {
    keyboardShortcuts.value = Object.fromEntries(kept)
  }
}

pruneOrphanedShortcuts()

export const PAGE_SHORTCUT_ACTIONS = [
  KEYBOARD_SHORTCUT_ACTION.PAGE_1,
  KEYBOARD_SHORTCUT_ACTION.PAGE_2,
  KEYBOARD_SHORTCUT_ACTION.PAGE_3,
  KEYBOARD_SHORTCUT_ACTION.PAGE_4,
  KEYBOARD_SHORTCUT_ACTION.PAGE_5,
  KEYBOARD_SHORTCUT_ACTION.PAGE_6,
] as const

export const PAGE_SHORTCUT_ACTION_INDEX_MAP: Partial<
  Record<KEYBOARD_SHORTCUT_ACTION, number | null>
> = {
  [KEYBOARD_SHORTCUT_ACTION.PAGE_1]: 0,
  [KEYBOARD_SHORTCUT_ACTION.PAGE_2]: 1,
  [KEYBOARD_SHORTCUT_ACTION.PAGE_3]: 2,
  [KEYBOARD_SHORTCUT_ACTION.PAGE_4]: 3,
  [KEYBOARD_SHORTCUT_ACTION.PAGE_5]: 4,
  [KEYBOARD_SHORTCUT_ACTION.PAGE_6]: 5,
}

export const KEYBOARD_SHORTCUTS = {
  [KEYBOARD_SHORTCUT_ACTION.TOGGLE_SIDEBAR]: {
    defaultKey: 'B',
    label: 'toggleSidebar',
  },
  [KEYBOARD_SHORTCUT_ACTION.TOGGLE_MANAGE_HIDDEN_GROUP]: {
    defaultKey: 'H',
    label: 'manageHiddenGroup',
  },
  [KEYBOARD_SHORTCUT_ACTION.BACKEND_PREVIOUS]: {
    defaultKey: 'P',
    label: 'switchToPreviousBackend',
  },
  [KEYBOARD_SHORTCUT_ACTION.BACKEND_NEXT]: {
    defaultKey: 'N',
    label: 'switchToNextBackend',
  },
  [KEYBOARD_SHORTCUT_ACTION.PAGE_1]: {
    defaultKey: '1',
    label: 'keyboardShortcutPageName',
  },
  [KEYBOARD_SHORTCUT_ACTION.PAGE_2]: {
    defaultKey: '2',
    label: 'keyboardShortcutPageName',
  },
  [KEYBOARD_SHORTCUT_ACTION.PAGE_3]: {
    defaultKey: '3',
    label: 'keyboardShortcutPageName',
  },
  [KEYBOARD_SHORTCUT_ACTION.PAGE_4]: {
    defaultKey: '4',
    label: 'keyboardShortcutPageName',
  },
  [KEYBOARD_SHORTCUT_ACTION.PAGE_5]: {
    defaultKey: '5',
    label: 'keyboardShortcutPageName',
  },
  [KEYBOARD_SHORTCUT_ACTION.PAGE_6]: {
    defaultKey: '6',
    label: 'keyboardShortcutPageName',
  },
} as const

export const normalizeShortcutKey = (key: string) => {
  if (key === ' ') {
    return 'Space'
  }

  const normalizedKey = key.trim()

  if (!normalizedKey) {
    return ''
  }

  if (normalizedKey.length === 1) {
    return normalizedKey.toUpperCase()
  }

  return normalizedKey
}

export const isModifierOnlyKey = (key: string) => {
  return ['Control', 'Meta', 'Alt', 'Shift'].includes(key)
}

export const normalizeShortcut = (shortcut: string) => {
  if (!shortcut) {
    return ''
  }

  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)

  if (!parts.length) {
    return ''
  }

  const modifierSet = new Set(parts)
  const modifiers = ['Ctrl', 'Meta', 'Alt', 'Shift'].filter((modifier) => modifierSet.has(modifier))
  const mainKey = parts.find((part) => !['Ctrl', 'Meta', 'Alt', 'Shift'].includes(part)) || ''

  if (!mainKey) {
    return ''
  }

  return [...modifiers, normalizeShortcutKey(mainKey)].join('+')
}

export const serializeShortcutEvent = (event: KeyboardEvent) => {
  if (isModifierOnlyKey(event.key)) {
    return ''
  }

  const modifiers = [
    event.ctrlKey ? 'Ctrl' : '',
    event.metaKey ? 'Meta' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
  ].filter(Boolean)

  return [...modifiers, normalizeShortcutKey(event.key)].join('+')
}

export const getDefaultShortcutKey = (action: string) => {
  return KEYBOARD_SHORTCUTS[action as KEYBOARD_SHORTCUT_ACTION]?.defaultKey ?? ''
}
