/**
 * Web Push 订阅管理。
 *
 * 用户在自己账号页开一次就行——订阅存在浏览器里，页面关着也能收到。
 * 后端按 endpoint 存订阅，一个成员多台设备各自一条。
 */
import { api } from './api'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js')
}

export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await registration()
    return !!(await reg.pushManager.getSubscription())
  } catch {
    return false
  }
}

export async function subscribe(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: '当前浏览器不支持推送' }
  const key = await api.get<{ key: string; configured: boolean }>('/push/vapid-key')
  if (!key.configured) return { ok: false, reason: '服务端未配置推送' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: permission === 'denied' ? '通知被浏览器拒绝了，去浏览器设置里开启' : '已取消' }
  }

  const reg = await registration()
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key.key),
  })
  const json = sub.toJSON()
  await api.post('/push/subscribe', {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  })
  return { ok: true }
}

export async function unsubscribe(): Promise<void> {
  const reg = await registration()
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    try {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint })
    } catch {
      // 后端删不掉没关系，本地还是要清——不然用户以为退了其实没退。
    }
    await sub.unsubscribe()
  }
}
