/**
 * clangd 会话入口。
 *
 * 必须由打包器处理：`@algoproclub/clangd-wasm` 用 `new URL(..., import.meta.url)`
 * 定位 SharedWorker 和 wasm，直接 new Worker 会拿不到资产。所以这里被 Vite
 * 单独打成一个 chunk，运行器再按需 import 它。
 *
 * 该包要求 SharedWorker + Web Locks + JSPI，缺一个就拒绝启动。
 */
import { openClangdSession } from '@algoproclub/clangd-wasm'

interface Session {
  port: MessagePort
  dispose(): void
}

/** 探测当前浏览器是否支持 clangd 运行时。 */
export async function clangdSupported(): Promise<boolean> {
  try {
    const { isClangdWasmSupported } = await import('@algoproclub/clangd-wasm/support')
    return isClangdWasmSupported()
  } catch { return false }
}

/**
 * 打开一个 clangd 文档会话。返回的 port 直接收发 LSP JSON-RPC。
 */
export async function openSession(options: { uri: string; compilerArguments?: string }): Promise<Session> {
  const session = await openClangdSession({
    uri: options.uri,
    compilerArguments: options.compilerArguments ?? '-std=c++17',
  }) as unknown as Session
  return session
}
