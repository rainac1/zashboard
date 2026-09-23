import { inject, provide, type InjectionKey, type Ref } from 'vue'

const collapseTransitionKey: InjectionKey<Ref<boolean>> = Symbol('collapse-transition')

export const provideCollapseTransition = (transitioning: Ref<boolean>) => {
  provide(collapseTransitionKey, transitioning)
}

export const useCollapseTransition = () => inject(collapseTransitionKey, null)
