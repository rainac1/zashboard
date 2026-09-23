import { can } from '@/assembly/backend'
import { fetchRules, ruleProviderList, rules, updateRuleProvider } from '@/assembly/rules'
import { useCtrlsBar } from '@/composables/use-ctrls-bar'
import { LIST_DISPLAY_STYLE, RULE_TAB_TYPE } from '@/constant'
import { showNotification } from '@/helper/notification'
import { rulesFilter, rulesTabShow } from '@/store/rules'
import {
  disconnectOnRuleDisable,
  displayLatencyInRule,
  displayNowNodeInRule,
  ruleDisplayStyle,
} from '@/store/settings'
import { ArrowPathIcon, WrenchScrewdriverIcon } from '@heroicons/vue/24/outline'
import { computed, defineComponent, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CtrlsBar from '../common/CtrlsBar.vue'
import DialogWrapper from '../common/DialogWrapper.vue'
import SegmentedControl from '../common/SegmentedControl.vue'
import SelectInput from '../common/SelectInput.vue'
import TextInput from '../common/TextInput.vue'

export default defineComponent({
  name: 'RulesCtrl',
  setup() {
    const { t } = useI18n()
    const settingsModel = ref(false)
    const isUpgrading = ref(false)
    const { isLargeCtrlsBar } = useCtrlsBar()
    const hasProviders = computed(() => {
      return can('ruleProviders') && ruleProviderList.value.length > 0
    })
    const showTabs = computed(() => hasProviders.value || can('routingTrace'))

    const handlerClickUpgradeAllProviders = async () => {
      if (isUpgrading.value) return
      isUpgrading.value = true
      try {
        let updateCount = 0

        await Promise.all(
          ruleProviderList.value.map((provider) =>
            updateRuleProvider(provider.name).then(() => {
              updateCount++

              const isFinished = updateCount === ruleProviderList.value.length

              showNotification({
                key: 'updateFinishedTip',
                content: 'updateFinishedTip',
                params: {
                  number: `${updateCount}/${ruleProviderList.value.length}`,
                },
                type: isFinished ? 'alert-success' : 'alert-info',
                timeout: isFinished ? 2000 : 0,
              })
            }),
          ),
        )
        await fetchRules()
        isUpgrading.value = false
      } catch {
        await fetchRules()
        isUpgrading.value = false
      }
    }

    const counts: Partial<Record<RULE_TAB_TYPE, () => number>> = {
      [RULE_TAB_TYPE.RULES]: () => rules.value.length,
      [RULE_TAB_TYPE.PROVIDER]: () => ruleProviderList.value.length,
    }

    const tabsWithNumbers = computed(() =>
      Object.values(RULE_TAB_TYPE)
        .filter((type) => type !== RULE_TAB_TYPE.TRACE || can('routingTrace'))
        .map((type) => ({ type, count: counts[type]?.() })),
    )

    return () => {
      const tabs = (
        <SegmentedControl
          modelValue={rulesTabShow.value}
          onUpdate:modelValue={(value) => (rulesTabShow.value = value as RULE_TAB_TYPE)}
          options={tabsWithNumbers.value.map(({ type, count }) => ({
            value: type,
            label: t(type),
            count,
          }))}
        />
      )
      const upgradeAllIcon = rulesTabShow.value === RULE_TAB_TYPE.PROVIDER && (
        <button
          class="btn btn-circle btn-sm"
          onClick={handlerClickUpgradeAllProviders}
        >
          <ArrowPathIcon class={['h-4 w-4', isUpgrading.value && 'animate-spin']} />
        </button>
      )

      const isTrace = rulesTabShow.value === RULE_TAB_TYPE.TRACE
      const searchInput = !isTrace && (
        <TextInput
          class={isLargeCtrlsBar.value ? 'w-80' : 'w-32 flex-1'}
          v-model={rulesFilter.value}
          placeholder={`${t('search')} | Regex`}
          clearable={true}
        />
      )

      const settingsModal = (
        <>
          <button
            class={'btn btn-circle btn-sm'}
            onClick={() => (settingsModel.value = true)}
          >
            <WrenchScrewdriverIcon class="h-4 w-4" />
          </button>
          <DialogWrapper
            v-model={settingsModel.value}
            title={t('ruleSettings')}
          >
            <div class="flex flex-col gap-3 text-sm">
              <div class="settings-grid">
                <div class="setting-item">
                  <div class="setting-item-label">{t('ruleStyle')}</div>
                  <SelectInput
                    class="select select-sm min-w-24"
                    modelValue={ruleDisplayStyle.value}
                    onUpdate:modelValue={(value) =>
                      (ruleDisplayStyle.value = value as LIST_DISPLAY_STYLE)
                    }
                    options={Object.values(LIST_DISPLAY_STYLE).map((value) => ({
                      value,
                      label: t(value),
                    }))}
                  />
                </div>
                <div class="setting-item">
                  <div class="setting-item-label">{t('displaySelectedNode')}</div>
                  <input
                    class="toggle"
                    type="checkbox"
                    v-model={displayNowNodeInRule.value}
                  />
                </div>
                <div class="setting-item">
                  <div class="setting-item-label">{t('displayLatencyNumber')}</div>
                  <input
                    class="toggle"
                    type="checkbox"
                    v-model={displayLatencyInRule.value}
                  />
                </div>
                <div class="setting-item">
                  <div class="setting-item-label">{t('disconnectOnRuleDisable')}</div>
                  <input
                    class="toggle"
                    type="checkbox"
                    v-model={disconnectOnRuleDisable.value}
                  />
                </div>
              </div>
            </div>
          </DialogWrapper>
        </>
      )

      const content = !isLargeCtrlsBar.value ? (
        <div class="flex flex-col gap-2 p-2">
          {showTabs.value && (
            <div class="flex items-center gap-2">
              {tabs}
              {upgradeAllIcon}
            </div>
          )}
          <div class="flex w-full items-center gap-2">
            {searchInput}
            {settingsModal}
          </div>
        </div>
      ) : (
        <div class="flex flex-wrap items-center gap-2 p-2">
          {showTabs.value && tabs}
          {searchInput}
          <div class="flex-1"></div>
          {upgradeAllIcon}
          {settingsModal}
        </div>
      )

      return <CtrlsBar>{content}</CtrlsBar>
    }
  },
})
