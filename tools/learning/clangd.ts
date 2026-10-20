/**
 * clangd 会话入口。
 *
 * 不能用 `import '@algoproclub/clangd-wasm'`：那个包内部用
 * `new URL('../assets/clangd.wasm', import.meta.url)` 定位资源，Vite 会把
 * 这些引用改写成带 hash 的 `/engine/assets/*`，但 worker 里的相对路径和
 * Emscripten 的 locateFile("clangd-runtime.wasm") 对不上，运行时 404。
 *
 * 所以 clangd 的整棵目录被原样复制到 `/engine/clangd/`（见 prepare.cjs），
 * 文件名保持包内原名，这里用动态 import 按运行时 URL 加载。
 */
interface Session {
  port: MessagePort
  dispose(): void
}

/** 探测浏览器是否支持 clangd 运行时（SharedWorker + Web Locks + JSPI）。 */
export async function clangdSupported(): Promise<boolean> {
  if (typeof SharedWorker !== 'function' || typeof WebAssembly === 'undefined') return false
  if (typeof navigator === 'undefined' || typeof navigator.locks?.request !== 'function') return false
  // JSPI 还没进 TypeScript 的标准库定义。
  const wasm = WebAssembly as unknown as { Suspending?: unknown; promising?: unknown }
  return typeof wasm.Suspending === 'function' && typeof wasm.promising === 'function'
}

/**
 * 打开一个 clangd 文档会话。返回的 port 直接收发 LSP JSON-RPC。
 * 目录由 prepare.cjs 复制，入口固定在 /engine/clangd/lib/browser.js。
 */
export async function openSession(options: { uri: string; compilerArguments?: string }): Promise<Session> {
  // 用变量拼路径，Rollup 才不会在构建期尝试解析这个只在运行时存在的模块。
  const entry = `${location.origin}/engine/clangd/lib/browser.js`
  const { openClangdSession } = await import(/* @vite-ignore */ entry) as {
    openClangdSession: (o: { uri: string; compilerArguments?: string }) => Promise<Session>
  }
  return openClangdSession({
    uri: options.uri,
    compilerArguments: options.compilerArguments ?? '-std=c++17',
  })
}
