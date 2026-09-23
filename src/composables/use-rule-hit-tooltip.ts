import { useTooltip } from '@/composables/use-tooltip'
import type { Rule } from '@/types'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'

export const useRuleHitTooltip = () => {
  const { t } = useI18n()
  const { showTip } = useTooltip()

  const buildLine = (text: string) => {
    const line = document.createElement('div')

    line.textContent = text

    return line
  }

  const formatHitTime = (count: number, at: string) => {
    if (!count || !at) return t('unknown')

    const time = dayjs(at)

    return time.isValid() && time.year() > 1 ? time.format('YYYY-MM-DD HH:mm:ss') : t('unknown')
  }

  const buildSection = (countText: string, count: number, at: string, lastTextKey: string) => {
    const section = document.createElement('div')

    section.className = 'flex flex-col gap-1'
    section.append(buildLine(countText))
    section.append(buildLine(t(lastTextKey, { time: formatHitTime(count, at) })))

    return section
  }

  const showRuleHitTip = (event: Event, rule: Rule) => {
    const extra = rule.extra

    if (!extra) return

    const content = document.createElement('div')

    content.className = 'flex flex-col gap-2 text-sm'
    content.append(
      buildSection(
        t('ruleHitCount', { count: extra.hitCount }),
        extra.hitCount,
        extra.hitAt,
        'ruleLastHit',
      ),
      buildSection(
        t('ruleMissCount', { count: extra.missCount }),
        extra.missCount,
        extra.missAt,
        'ruleLastMiss',
      ),
    )

    showTip(event, content, {
      delay: [500, 0],
      trigger: 'mouseenter',
    })
  }

  return { showRuleHitTip }
}
