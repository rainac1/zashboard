import { activeConnections, disconnectById } from '@/assembly/connections'
import { fetchRules, ruleProviderList, toggleRuleDisabled } from '@/assembly/rules'
import { getConnectionRulePayload } from '@/helper'
import { disconnectOnRuleDisable } from '@/store/settings'
import type { Rule } from '@/types'

export const isRuleDisabled = (rule: Rule) => {
  if (rule.extra) {
    return rule.extra.disabled
  }

  return rule.disabled
}

export const getRuleSize = (rule: Rule) => {
  if (rule.type === 'RuleSet') {
    return ruleProviderList.value.find((provider) => provider.name === rule.payload)?.ruleCount
  }

  return rule.size
}

export const isUpdateableRuleSet = (rule: Rule) => {
  if (rule.type !== 'RuleSet') {
    return false
  }

  const provider = ruleProviderList.value.find((provider) => provider.name === rule.payload)

  if (!provider) {
    return false
  }

  return provider.vehicleType !== 'Inline'
}

export const toggleRuleDisabledWithSideEffects = async (rule: Rule) => {
  const willBeDisabled = !isRuleDisabled(rule)

  await toggleRuleDisabled(rule, willBeDisabled)

  if (willBeDisabled && disconnectOnRuleDisable.value) {
    const matchingConnections = activeConnections.value.filter((conn) => {
      const ruleTypeMatches = conn.rule === rule.type
      const rulePayloadMatches = getConnectionRulePayload(conn) === (rule.payload || '')

      return ruleTypeMatches && rulePayloadMatches
    })

    matchingConnections.forEach((conn) => disconnectById(conn.id).catch(() => {}))
  }

  await fetchRules()
}

export const EMPTY_CELL = '—'

export const formatRuleHitCount = (count: number | undefined) =>
  count ? count.toLocaleString() : EMPTY_CELL
