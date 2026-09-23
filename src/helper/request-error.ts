import axios from 'axios'
import { showNotification } from './notification'

type BackendErrorBody = {
  message?: string
  error?: { code?: string; message?: string }
}

export const getRequestErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<BackendErrorBody>(error)) {
    const data = error.response?.data
    const nested = data?.error

    if (nested?.message) {
      return nested.code ? `${nested.message} (${nested.code})` : nested.message
    }

    return data?.message || error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export const notifyRequestError = (error: unknown, key?: string) => {
  const message = getRequestErrorMessage(error)
  const url = axios.isAxiosError(error) ? decodeURIComponent(error.config?.url || '') : ''

  showNotification({
    key: key || message,
    content: url ? `${url} \n${message}` : message,
    type: 'alert-error',
  })
}
