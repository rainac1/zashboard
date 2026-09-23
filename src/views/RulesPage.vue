<template>
  <div
    v-if="isTrace"
    class="relative size-full overflow-x-hidden"
  >
    <RulesCtrl />
    <div
      class="p-3"
      :style="tracePadding"
    >
      <DaeRoutingPanel />
    </div>
  </div>
  <div
    v-else
    :class="
      isRuleTable
        ? 'relative flex size-full flex-col overflow-hidden'
        : 'relative size-full overflow-x-hidden'
    "
    :style="isRuleTable ? padding : undefined"
  >
    <template v-if="isRuleTable">
      <RulesCtrl />
      <RulesTable />
    </template>
    <template v-else-if="!isVirtualScroller">
      <RulesCtrl />
      <div
        class="p-3"
        :style="padding"
      >
        <template v-if="rulesTabShow === RULE_TAB_TYPE.PROVIDER">
          <div class="flex flex-col gap-2">
            <div
              v-for="(ruleProvider, index) in renderRulesProvider"
              :key="ruleProvider.name"
              class="base-container"
            >
              <RuleProvider
                :ruleProvider="ruleProvider"
                :index="index + 1"
              />
            </div>
          </div>
        </template>
        <template v-else>
          <div class="flex flex-col gap-2">
            <div
              v-for="rule in renderRules"
              :key="rule.payload"
              class="base-container"
            >
              <RuleCard
                :rule="rule"
                :index="rules.indexOf(rule) + 1"
              />
            </div>
          </div>
        </template>
      </div>
    </template>
    <VirtualScroller
      v-else
      :data="renderRules"
      :size="44"
    >
      <template v-slot:before>
        <RulesCtrl />
      </template>
      <template v-slot="{ item: rule }: { item: Rule }">
        <RuleCard
          :key="rule.payload"
          :rule="rule"
          :index="rules.indexOf(rule) + 1"
        />
      </template>
    </VirtualScroller>
  </div>
</template>

<script setup lang="ts">
import { renderRules, renderRulesProvider, rulesTabShow } from '@/store/rules'
import VirtualScroller from '@/components/common/VirtualScroller.vue'
import RulesCtrl from '@/components/controls/RulesCtrl'
import RuleCard from '@/components/rules/RuleCard.vue'
import RuleProvider from '@/components/rules/RuleProvider.vue'
import DaeRoutingPanel from '@/components/dae/DaeRoutingPanel.vue'
import RulesTable from '@/components/rules/RulesTable.vue'
import { usePaddingForViews } from '@/composables/use-padding-for-views'
import { LIST_DISPLAY_STYLE, RULE_TAB_TYPE } from '@/constant'
import { can } from '@/assembly/backend'
import { fetchRules, rules } from '@/assembly/rules'
import { ruleDisplayStyle } from '@/store/settings'
import type { Rule } from '@/types'
import { computed, provide, ref } from 'vue'

fetchRules()

const expandedRule = ref<string | null>(null)
provide('expandedRule', expandedRule)

const isTrace = computed(() => rulesTabShow.value === RULE_TAB_TYPE.TRACE && can('routingTrace'))
const isRuleTable = computed(() => ruleDisplayStyle.value === LIST_DISPLAY_STYLE.TABLE)
const cardPadding = usePaddingForViews({
  offsetTop: 12,
  offsetBottom: 8,
})
const tablePadding = usePaddingForViews({
  offsetTop: 0,
  offsetBottom: 0,
})
const tracePadding = computed(() => cardPadding.padding.value)
const padding = computed(() =>
  isRuleTable.value ? tablePadding.padding.value : cardPadding.padding.value,
)
const isVirtualScroller = computed(() => {
  return rulesTabShow.value === RULE_TAB_TYPE.RULES && renderRules.value.length > 200
})
</script>
