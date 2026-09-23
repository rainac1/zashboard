import type { Rule, RuleProvider } from '@/types'
import { ref } from 'vue'
import { driver } from './driver'

export const rules = ref<Rule[]>([])
export const ruleProviderList = ref<RuleProvider[]>([])

export const fetchRules = async () => {
  const payload = await driver().rules.fetch()

  rules.value = payload.rules
  ruleProviderList.value = payload.providers
}

export const toggleRuleDisabled = (rule: Rule, disabled: boolean) =>
  driver().rules.toggleDisabled(rule, disabled)

export const updateRuleProvider = (name: string) => driver().rules.updateProvider(name)
