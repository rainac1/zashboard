import { i18n } from '@/i18n'

export const displayFolderName = (name: string) => {
  if (name.startsWith('folder_builtin_')) {
    return i18n.global.t(name)
  }
  return name
}
