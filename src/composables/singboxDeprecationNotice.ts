import { can } from '@/assembly/backend'
import { showConfirmDialog } from '@/helper/confirmDialog'
import { useStorage } from '@/helper/storage'
import { i18n } from '@/i18n'
import { watchEffect } from 'vue'

const dismissed = useStorage('cache/singbox-deprecation-notice-dismissed', false)
const deprecationDetailsUrl =
  'https://github.com/Zephyruso/zashboard/blob/main/docs/sing-box-deprecation.md'

export const useSingboxDeprecationNotice = () => {
  let shownInCurrentSession = false

  watchEffect(async () => {
    if (!can('singboxDeprecationNotice') || dismissed.value || shownInCurrentSession) return

    shownInCurrentSession = true

    const { action } = await showConfirmDialog({
      title: i18n.global.t('singboxSupportEndingTitle'),
      message: i18n.global.t('singboxSupportEndingMessage'),
      link: {
        text: i18n.global.t('moreDetails'),
        url: deprecationDetailsUrl,
      },
      cancelText: i18n.global.t('dontShowAgain'),
    })

    // 关闭按钮、Esc 和遮罩都只关闭本次公告；必须明确点击“不再提示”才永久静默。
    if (action === 'cancel') {
      dismissed.value = true
    }
  })
}
