import { showNotification } from '@/helper/notification'
import { getUrlFromBackend } from '@/helper/utils'
import { activeBackend, activeUuid, backendManagerView, openBackendManager } from '@/store/setup'
import axios, { AxiosError } from 'axios'
import { nextTick } from 'vue'

axios.interceptors.request.use((config) => {
  if (activeBackend.value) {
    config.baseURL = getUrlFromBackend(activeBackend.value)

    if (activeBackend.value.password) {
      config.headers['Authorization'] = 'Bearer ' + activeBackend.value.password
    } else {
      delete config.headers['Authorization']
    }
  }
  return config
})

axios.interceptors.response.use(
  null,
  (
    error: AxiosError<{
      message: string
    }>,
  ) => {
    if (error.status === 401 && activeUuid.value) {
      const uuid = activeUuid.value
      const alreadyEditing =
        backendManagerView.value?.mode === 'edit' && backendManagerView.value.uuid === uuid

      if (!alreadyEditing) {
        openBackendManager({ mode: 'edit', uuid })
        nextTick(() => {
          showNotification({ content: 'unauthorizedTip' })
        })
      }
    }

    return Promise.reject(error)
  },
)
