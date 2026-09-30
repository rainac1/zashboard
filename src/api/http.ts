import { showNotification } from '@/helper/notification'
import { getUrlFromBackend } from '@/helper/utils'
import { activeBackend, activeUuid, backendManagerView, openBackendManager } from '@/store/setup'
import axios, { AxiosError } from 'axios'
import { nextTick } from 'vue'
import { daeBearer, dropDaeSession, ensureDaeSession, isDaePasswordMode } from './dae-auth'

declare module 'axios' {
  interface AxiosRequestConfig {
    daeReauth?: boolean
  }
}

axios.interceptors.request.use(async (config) => {
  const backend = activeBackend.value

  if (backend) {
    config.baseURL = getUrlFromBackend(backend)

    const token = isDaePasswordMode(backend)
      ? await ensureDaeSession(backend).catch(() => '')
      : backend.password

    if (token) {
      config.headers['Authorization'] = 'Bearer ' + token
    } else {
      delete config.headers['Authorization']
    }
  }
  return config
})

axios.interceptors.response.use(
  null,
  async (
    error: AxiosError<{
      message: string
    }>,
  ) => {
    const backend = activeBackend.value
    const config = error.config

    if (
      error.status === 401 &&
      backend &&
      isDaePasswordMode(backend) &&
      config &&
      !config.daeReauth
    ) {
      const current = daeBearer(backend)

      if (!current || config.headers?.Authorization === `Bearer ${current}`) {
        dropDaeSession(backend)
      }

      try {
        await ensureDaeSession(backend)

        return await axios.request({ ...config, daeReauth: true })
      } catch (retryError) {
        if (axios.isAxiosError(retryError)) throw retryError
      }
    }

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
