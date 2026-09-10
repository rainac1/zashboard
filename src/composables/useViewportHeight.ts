import { onBeforeUnmount, onMounted } from 'vue'

// Keep a layer sized to the *visual* viewport (the area not covered by the
// on-screen keyboard) by publishing its height as a CSS var.
//
// iOS Safari never resizes the layout viewport (nor `dvh`/`100vh`) when the
// keyboard opens — it only shrinks the visual viewport and scrolls the page
// under the keyboard, so `position: fixed`/full-height layouts get covered and
// the user has to scroll to reach the bottom. Mirroring `visualViewport.height`
// into a CSS var (the approach Telegram and most "100vh on iOS" fixes use), plus
// pinning the page scroll, makes the layout shrink to the visible region so
// normal flex layout keeps everything above the keyboard. On Android/Chromium
// `visualViewport` behaves the same, so this is a single cross-platform path.
//
// The var name is a parameter because consumers must not share one: the terminal
// shrinks `#app-content` (`--app-height`) while dialogs shrink only their own
// overlay (`--dialog-viewport-height`, see composables/dialog.ts). Pointing both
// at `--app-height` would resize the whole app the moment any dialog opened.

type Tracker = { count: number; update: () => void }

const trackers = new Map<string, Tracker>()

// Refcounted so overlapping consumers of the same var (nested dialogs) don't
// tear down each other's listeners.
export const acquireViewportHeight = (varName: string) => {
  const tracker = trackers.get(varName)

  if (tracker) {
    tracker.count++
    return
  }

  const update = () => {
    const viewport = window.visualViewport
    const height = viewport ? viewport.height : window.innerHeight
    document.documentElement.style.setProperty(varName, `${Math.round(height)}px`)
    // iOS scrolls the layout viewport to reveal the focused field (offsetTop > 0);
    // the layer is already shrunk to fit, so undo that scroll to keep it aligned
    // with the visible region instead of letting content drift below the fold.
    if (viewport && viewport.offsetTop !== 0) window.scrollTo(0, 0)
  }

  trackers.set(varName, { count: 1, update })
  update()

  const viewport = window.visualViewport
  viewport?.addEventListener('resize', update)
  viewport?.addEventListener('scroll', update)
  window.addEventListener('resize', update)
}

export const releaseViewportHeight = (varName: string) => {
  const tracker = trackers.get(varName)

  if (!tracker) return

  tracker.count--
  if (tracker.count > 0) return

  trackers.delete(varName)

  const viewport = window.visualViewport
  viewport?.removeEventListener('resize', tracker.update)
  viewport?.removeEventListener('scroll', tracker.update)
  window.removeEventListener('resize', tracker.update)
  // Stop pinning the height so the consumer falls back to its `100dvh` default.
  document.documentElement.style.removeProperty(varName)
}

export const useViewportHeight = (varName = '--app-height') => {
  onMounted(() => acquireViewportHeight(varName))
  onBeforeUnmount(() => releaseViewportHeight(varName))
}
