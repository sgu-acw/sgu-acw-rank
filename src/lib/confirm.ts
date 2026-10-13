import { shallowRef } from 'vue'

export const confirmation = shallowRef<{
  title: string; message: string; informational: boolean
  resolve: (accepted: boolean) => void
} | null>(null)

export function confirmAction(message: string, title = '确认操作', informational = false): Promise<boolean> {
  if (confirmation.value) return Promise.resolve(false)
  return new Promise(resolve => { confirmation.value = { title, message, informational, resolve } })
}

export function closeConfirmation(accepted = false) {
  const current = confirmation.value
  confirmation.value = null
  current?.resolve(accepted)
}
