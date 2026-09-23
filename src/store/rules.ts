import { ruleProviderList, rules } from '@/assembly/rules'
import { RULE_TAB_TYPE } from '@/constant'
import { toSearchRegex } from '@/helper/search'
import { computed, ref, watch } from 'vue'
import { activeBackend } from './setup'

export const rulesFilter = ref('')
export const rulesTabShow = ref(RULE_TAB_TYPE.RULES)

watch(activeBackend, (backend) => {
  if (backend) rulesTabShow.value = RULE_TAB_TYPE.RULES
})

export const renderRules = computed(() => {
  const searchRegex = toSearchRegex(rulesFilter.value)

  if (!searchRegex) {
    return rules.value
  }

  return rules.value.filter((rule) => {
    return searchRegex.testAny([rule.type, rule.payload, rule.proxy])
  })
})

export const renderRulesProvider = computed(() => {
  const searchRegex = toSearchRegex(rulesFilter.value)

  if (!searchRegex) {
    return ruleProviderList.value
  }

  return ruleProviderList.value.filter((ruleProvider) => {
    return searchRegex.testAny([ruleProvider.name, ruleProvider.behavior, ruleProvider.vehicleType])
  })
})
