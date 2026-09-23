import type { VirtualRowShift } from '@/helper/virtual-row-shift'
import { inject, provide, type InjectionKey } from 'vue'

const virtualRowShiftKey: InjectionKey<VirtualRowShift> = Symbol('virtual-row-shift')

export const provideVirtualRowShift = (shift: VirtualRowShift) => {
  provide(virtualRowShiftKey, shift)
}

export const useVirtualRowShift = () => inject(virtualRowShiftKey, null)
