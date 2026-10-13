/**
 * WebAuthn 通行密钥的浏览器端助手。
 *
 * 服务端给的是 JSON 形式的 PublicKeyCredentialOptions（challenge、
 * credential id 都是 base64url 字符串），浏览器 API 要 ArrayBuffer——
 * 这两个函数负责来回转换，别把转换逻辑撒进组件里。
 */

function b64ToBytes(b64: string): ArrayBuffer {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function bytesToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 检查这台浏览器支持不支持通行密钥。不支持时调用方要降级出提示。 */
export function passkeySupported(): boolean {
  return typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && !!navigator.credentials?.create
}

/** navigator.credentials.create 的服务端 options → 浏览器结构 → 返回给服务端的 JSON。 */
export async function createPasskey(options: Record<string, unknown>): Promise<Record<string, unknown>> {
  const o = options as {
    challenge: string
    user: { id: string }
    excludeCredentials?: { id: string }[]
    pubKeyCredParams?: unknown
    [k: string]: unknown
  }
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...o,
    challenge: b64ToBytes(o.challenge),
    user: { ...(o.user as object), id: b64ToBytes(o.user.id) } as PublicKeyCredentialUserEntity,
    excludeCredentials: (o.excludeCredentials ?? []).map((c) => ({
      ...(c as object),
      id: b64ToBytes(c.id),
    })) as PublicKeyCredentialDescriptor[],
  } as PublicKeyCredentialCreationOptions

  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null
  if (!cred) throw new Error('浏览器取消了通行密钥创建')
  const attestation = cred.response as AuthenticatorAttestationResponse
  return {
    id: cred.id,
    rawId: bytesToB64(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bytesToB64(attestation.clientDataJSON),
      attestationObject: bytesToB64(attestation.attestationObject),
      transports: attestation.getTransports?.() ?? [],
    },
    authenticatorAttachment: cred.authenticatorAttachment,
  }
}

/** navigator.credentials.get 的服务端 options → 浏览器结构 → 返回给服务端的 JSON。 */
export async function getPasskey(options: Record<string, unknown>): Promise<Record<string, unknown>> {
  const o = options as { challenge: string; allowCredentials?: { id: string }[]; [k: string]: unknown }
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...o,
    challenge: b64ToBytes(o.challenge),
    allowCredentials: (o.allowCredentials ?? []).map((c) => ({
      ...(c as object),
      id: b64ToBytes(c.id),
    })) as PublicKeyCredentialDescriptor[],
  } as PublicKeyCredentialRequestOptions

  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null
  if (!cred) throw new Error('浏览器取消了通行密钥')
  const assertion = cred.response as AuthenticatorAssertionResponse
  return {
    id: cred.id,
    rawId: bytesToB64(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bytesToB64(assertion.clientDataJSON),
      authenticatorData: bytesToB64(assertion.authenticatorData),
      signature: bytesToB64(assertion.signature),
      userHandle: assertion.userHandle ? bytesToB64(assertion.userHandle) : null,
    },
    authenticatorAttachment: cred.authenticatorAttachment,
  }
}
