// sing-box 后端不支持 Clash 形状的 rules 列表,产出空集。
import type { RulesDriver } from '../driver/types'

export const rulesDriver: RulesDriver = {
  fetch: async () => ({ rules: [], providers: [] }),
  updateProvider: async () => {},
  toggleDisabled: async () => {},
}
