import tippy, { type Instance, type Props } from 'tippy.js'

tippy([])

let appContent: HTMLElement
let tippyInstance: Instance | null = null
let currentTarget: HTMLElement | null = null

export const useTooltip = () => {
  if (!appContent) {
    appContent = document.getElementById('app-content')!
  }

  const showTip = (event: Event, content: string | HTMLElement, config: Partial<Props> = {}) => {
    if (currentTarget === event.currentTarget) {
      return
    }

    tippyInstance?.destroy()
    tippyInstance = tippy(event.currentTarget as HTMLElement, {
      content,
      placement: 'top',
      animation: 'scale',
      appendTo: appContent,
      allowHTML: true,
      showOnCreate: true,
      onHidden: () => {
        tippyInstance?.destroy()
        tippyInstance = null
        currentTarget = null
      },
      popperOptions: {
        modifiers: [
          {
            name: 'preventOverflow',
            options: {
              boundary: 'clippingParents',
              padding: 8,
            },
          },
          {
            name: 'flip',
            options: {
              fallbackPlacements: ['top', 'bottom', 'right', 'left'],
            },
          },
        ],
      },
      ...config,
    })

    currentTarget = event.currentTarget as HTMLElement
  }

  const hideTip = () => {
    tippyInstance?.hide()
  }

  const updateTip = (content: string | HTMLElement) => {
    tippyInstance?.setContent(content)
  }

  return {
    showTip,
    hideTip,
    updateTip,
  }
}
