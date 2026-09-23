import type { Rule } from '@/types'

export type RuleCountType = 'hit' | 'miss'

export interface RuleCountItem {
  name: string
  value: number
}

export const buildRuleCountData = (
  rules: readonly Rule[],
  type: RuleCountType,
  maxItems: number,
): RuleCountItem[] => {
  const getCount = (rule: Rule) =>
    type === 'hit' ? rule.extra?.hitCount || 0 : rule.extra?.missCount || 0

  return rules
    .filter((rule) => rule.extra)
    .sort((a, b) => getCount(b) - getCount(a))
    .slice(0, maxItems)
    .map((rule) => ({
      name: `${rule.type}\n${rule.payload}`,
      value: getCount(rule),
    }))
}
