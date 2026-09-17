import { onUnmounted, ref, watch, type Ref } from 'vue'

// How many dialogs are currently visible. Page-level gestures read this instead
// of querying the DOM — DialogWrapper renders a plain <div>, not a native
// <dialog> — and dialogs nest (ConnectionDetails opens SourceIPLabels), so a
// boolean flag would be cleared by the inner one closing while the outer is up.
export const openDialogCount = ref(0)

// How many full-screen dimming overlays are up. Dialogs are the main source, but
// not the only one (the mobile proxy group card dims the page the same way), and
// App.vue has to darken the iOS PWA status bar to match — that strip is browser
// chrome painted from <meta name="theme-color">, so no in-page overlay covers it.
export const dimmedOverlayCount = ref(0)

const useCount = (count: Ref<number>, active: Ref<boolean | undefined>) => {
  let held = false

  const acquire = () => {
    if (held) return
    held = true
    count.value++
  }

  const release = () => {
    if (!held) return
    held = false
    count.value--
  }

  watch(active, (val) => (val ? acquire() : release()), { immediate: true })
  // A dialog can be unmounted by `v-if` while still open; hand the count back so
  // it never leaks and permanently disables page swiping.
  onUnmounted(release)
}

export const useDialogOpenState = (isOpen: Ref<boolean | undefined>) => {
  useCount(openDialogCount, isOpen)
  useCount(dimmedOverlayCount, isOpen)
}

export const useOverlayDimState = (isDimmed: Ref<boolean | undefined>) => {
  useCount(dimmedOverlayCount, isDimmed)
}
