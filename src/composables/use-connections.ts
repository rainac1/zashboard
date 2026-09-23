import { activeBackend } from '@/store/setup'
import type { Connection } from '@/types'
import { nextTick, ref, watch } from 'vue'

const infoConn = ref<Connection | null>(null)
const connectionDetailModalShow = ref(false)

watch(activeBackend, () => {
  connectionDetailModalShow.value = false
  infoConn.value = null
})

export const useConnections = () => {
  const handlerInfo = async (conn: Connection) => {
    infoConn.value = null
    await nextTick()
    infoConn.value = conn
    connectionDetailModalShow.value = true
  }

  return {
    infoConn,
    connectionDetailModalShow,
    handlerInfo,
  }
}
