import { nextTick } from 'vue'

export type VirtualRowShift = {
  begin: (
    row: HTMLElement,
    offset: number,
    timing: KeyframeAnimationOptions,
    release: () => void,
  ) => void
  end: (row: HTMLElement) => Promise<void>
  cancel: (row: HTMLElement) => void
  destroy: () => void
}

type RowShiftState = {
  offset: number
  finished: boolean
  release: () => void
  settled?: Promise<void>
  resolve?: () => void
}

const ROW_CLASS = 'virtual-row-shift-row'
const SHIFT_VAR = '--virtual-row-shift'

export const createVirtualRowShift = (
  getColumn: () => HTMLElement | undefined,
  measureRow: (row: HTMLElement) => void,
): VirtualRowShift => {
  const shifts = new Map<HTMLElement, RowShiftState>()
  const rowAnimations = new Map<HTMLElement, { offset: number; animation?: Animation }>()
  let observer: MutationObserver | undefined
  let observedColumn: HTMLElement | undefined
  let settling = false

  const clearRowStyle = (row: HTMLElement) => {
    rowAnimations.get(row)?.animation?.cancel()
    rowAnimations.delete(row)
    row.classList.remove(ROW_CLASS)
    row.style.removeProperty(SHIFT_VAR)
  }

  const applyOffsets = (timing?: KeyframeAnimationOptions) => {
    const column = getColumn()

    if (!column) return

    let offset = 0
    let followsOrigin = false
    const changes: { row: HTMLElement; offset?: number; from?: string }[] = []

    for (const child of column.children) {
      const row = child as HTMLElement

      if (followsOrigin) {
        if (rowAnimations.get(row)?.offset !== offset) {
          changes.push({ row, offset, from: timing ? getComputedStyle(row).transform : undefined })
        }
      } else if (rowAnimations.has(row)) {
        changes.push({ row })
      }

      const state = shifts.get(row)

      if (state) {
        followsOrigin = true
        offset += state.offset
      }
    }

    for (const { row, offset, from } of changes) {
      clearRowStyle(row)
      if (offset === undefined) continue

      row.classList.add(ROW_CLASS)
      row.style.setProperty(SHIFT_VAR, `${offset}px`)
      const animation = timing
        ? row.animate({ transform: [from!, `translateY(${offset}px)`] }, timing)
        : undefined

      animation?.finished.catch(() => {})
      rowAnimations.set(row, { offset, animation })
    }

    for (const row of rowAnimations.keys()) {
      if (row.parentElement !== column) clearRowStyle(row)
    }
  }

  const observeColumn = () => {
    const column = getColumn()

    if (!column || column === observedColumn) return

    observer?.disconnect()
    observedColumn = column
    observer = new MutationObserver(() => applyOffsets())
    observer.observe(column, { childList: true })
  }

  const stopObservingColumn = () => {
    observer?.disconnect()
    observer = undefined
    observedColumn = undefined
  }

  const releaseAll = () => {
    if (!shifts.size || settling) return

    settling = true

    for (const state of shifts.values()) {
      state.release()
    }

    for (const row of shifts.keys()) {
      if (row.isConnected) {
        measureRow(row)
      }
    }

    nextTick(() => {
      const callbacks = [...shifts.values()].map((state) => state.resolve)

      shifts.clear()
      applyOffsets()
      stopObservingColumn()
      settling = false

      for (const callback of callbacks) {
        callback?.()
      }
    })
  }

  const shift: VirtualRowShift = {
    begin: (row, offset, timing, release) => {
      observeColumn()

      const state = shifts.get(row)

      if (state) {
        state.offset = offset
        state.finished = false
        state.release = release
      } else {
        shifts.set(row, { offset, finished: false, release })
      }

      applyOffsets(timing)
    },
    end: (row) => {
      const state = shifts.get(row)

      if (!state) return Promise.resolve()

      state.finished = true
      state.settled ??= new Promise<void>((resolve) => {
        state.resolve = resolve
      })

      if ([...shifts.values()].every((item) => item.finished)) {
        releaseAll()
      }

      return state.settled
    },
    cancel: (row) => {
      const state = shifts.get(row)

      if (!state) return

      releaseAll()
    },
    destroy: () => {
      stopObservingColumn()

      for (const state of shifts.values()) {
        state.release()
        state.resolve?.()
      }

      shifts.clear()

      for (const row of rowAnimations.keys()) clearRowStyle(row)
    },
  }

  return shift
}
