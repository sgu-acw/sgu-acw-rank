import type { Environment, JudgeRequest, JudgeResult, LspId, Manifest, PackageState, Progress, RuntimeId } from './types'

type Pending = { resolve: (data: unknown) => void; reject: (error: Error) => void; progress?: (p: Progress) => void; tty?: (e: TtyEvent) => void; cleanup: () => void }

/** 终端会话事件：status 阶段提示，ready 程序开始等输入，out/err 输出块，exit 程序结束。 */
export interface TtyEvent { event: 'status' | 'ready' | 'out' | 'err' | 'exit' | 'error'; data?: string; verdict?: string; error?: string; elapsedMs?: number }
export interface TtySession { send(data: string): void; eof(): void; close(): void; done: Promise<void> }

/** The untrusted runner has its own origin, cookies and storage. */
export class LearningEngine {
  private frame: HTMLIFrameElement
  private origin: string
  private token = crypto.randomUUID()
  /** iframe 完成导航前是 about:blank，用运行器 origin 发消息会被浏览器拒绝。 */
  private navigated = false
  private pending = new Map<string, Pending>()
  private ready: Promise<void>
  private disposed = false
  constructor() {
    // 生产指向 judge.zh314.xyz；本地 learning:dev 会注入 localhost:4334。
    // 必须和主站不同 hostname：运行器里跑的是用户代码，同域就能读到登录 Cookie。
    const configured = import.meta.env.PUBLIC_LEARN_RUNNER_ORIGIN || 'https://judge.zh314.xyz'
    this.origin = new URL(configured).origin
    if (this.origin === location.origin || new URL(configured).hostname === location.hostname) throw new Error('运行器必须使用独立域名')
    this.frame = document.createElement('iframe')
    this.frame.title = '本地代码评测环境'
    this.frame.hidden = true
    this.frame.sandbox.add('allow-scripts', 'allow-same-origin')
    this.frame.addEventListener('load', () => { this.navigated = true }, { once: true })
    this.frame.src = `${this.origin}/engine/?parent=${encodeURIComponent(location.origin)}`
    window.addEventListener('message', this.receive)
    // 不能只等 iframe 的 load：它可能在 host.js 注册 message 监听之前就触发，
    // 那时发 connect 没人应答。改成 load 之后持续重试，直到握手成功或超时。
    this.ready = new Promise((resolve, reject) => {
      let done = false
      const finish = (error?: Error) => {
        if (done) return
        done = true
        clearTimeout(timer); clearInterval(poll)
        if (error) reject(error)
        else resolve()
      }
      const attempt = () => {
        if (this.disposed || done) return
        void this.callRaw('connect', {}).then(() => finish(), () => undefined)
      }
      const timer = window.setTimeout(() => finish(new Error('无法连接评测运行器，请稍后重试')), 15000)
      const poll = window.setInterval(attempt, 250)
      this.frame.addEventListener('load', attempt)
    })
    document.body.appendChild(this.frame)
    // Keep constructor rejection handled until the first UI request awaits it.
    void this.ready.catch(() => undefined)
  }
  private receive = (event: MessageEvent) => {
    if (event.origin !== this.origin || event.source !== this.frame.contentWindow || event.data?.token !== this.token) return
    const entry = this.pending.get(event.data.id)
    if (!entry) return
    if (event.data.progress) { entry.progress?.(event.data.progress); return }
    if (event.data.tty) { entry.tty?.(event.data.tty); return }
    this.pending.delete(event.data.id); entry.cleanup()
    if (event.data.error) entry.reject(new Error(String(event.data.error)))
    else entry.resolve(event.data.result)
  }
  private callRaw<T>(method: string, payload: unknown, signal?: AbortSignal, progress?: (p: Progress) => void, tty?: (e: TtyEvent) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.disposed || signal?.aborted) { reject(new DOMException('已取消', 'AbortError')); return }
      const id = crypto.randomUUID()
      const abort = () => {
        this.post({ token: this.token, id, method: 'cancel' })
        this.pending.delete(id); signal?.removeEventListener('abort', abort)
        reject(new DOMException('已取消', 'AbortError'))
      }
      this.pending.set(id, { resolve: data => resolve(data as T), reject, progress, tty, cleanup: () => signal?.removeEventListener('abort', abort) })
      signal?.addEventListener('abort', abort, { once: true })
      try {
        this.post({ token: this.token, id, method, payload: JSON.parse(JSON.stringify(payload)) })
      } catch (error) {
        this.pending.get(id)?.cleanup(); this.pending.delete(id); reject(error)
      }
    })
  }
  /**
   * 往运行器发消息。iframe 还没导航完时 targetOrigin 会不匹配，直接跳过——
   * 握手阶段本来就会轮询重试，跳过不会丢请求。
   */
  private post(message: Record<string, unknown>) {
    if (this.disposed || !this.navigated) return
    this.frame.contentWindow?.postMessage(message, this.origin)
  }

  private async call<T>(method: string, payload: unknown = {}, signal?: AbortSignal, progress?: (p: Progress) => void, tty?: (e: TtyEvent) => void) {
    await this.ready
    return this.callRaw<T>(method, payload, signal, progress, tty)
  }
  manifest() { return this.call<Manifest>('manifest') }
  status() { return this.call<PackageState[]>('status') }
  install(runtime: RuntimeId, signal: AbortSignal, progress: (p: Progress) => void) { return this.call<void>('install', { runtime }, signal, progress) }
  remove(runtime: RuntimeId) { return this.call<void>('remove', { runtime }) }
  run(request: JudgeRequest, signal: AbortSignal, progress: (p: Progress) => void) { return this.call<JudgeResult>('run', request, signal, progress) }
  lspStatus() { return this.call<Record<LspId, string | null>>('lspStatus') }
  lspStart(service: LspId, environment: Environment, code: string) {
    return this.call<void>('lspStart', { service, environment, code })
  }
  lspStop(service: LspId) { return this.call<void>('lspStop', { service }) }
  lspComplete(service: LspId, code: string, line: number, character: number) {
    return this.call<unknown[]>('lspComplete', { service, code, line, character })
  }
  lspDiagnostics(service: LspId) { return this.call<unknown[]>('lspDiagnostics', { service }) }
  /**
   * 开一个交互终端会话。返回的对象可以 send 一行输入、发 EOF、或直接 close 杀掉。
   * 会话生命周期跟着 'tty' 调用走：程序退出或会话被掐掉时 done 落定。
   */
  terminal(environment: Environment, source: string, onEvent: (e: TtyEvent) => void): TtySession {
    const controller = new AbortController()
    let ended = false, started = false
    const queued: string[] = []
    const fire = (e: TtyEvent) => {
      if (e.event === 'ready') {
        started = true
        for (const data of queued.splice(0)) void this.callRaw('ttyInput', { data }).catch(() => undefined)
      }
      if (e.event === 'exit') ended = true
      onEvent(e)
    }
    const done = this.call<unknown>('tty', { environment, source }, controller.signal, undefined, fire)
      .then(() => { ended = true }, error => {
        ended = true
        if (!controller.signal.aborted) {
          fire({ event: 'error', data: String(error instanceof Error ? error.message : error) })
          fire({ event: 'exit', verdict: 'ENVIRONMENT_ERROR' })
        }
      })
    return {
      send: (data: string) => {
        if (ended) return
        // ready 之前输入先本地排队，免得 postMessage 次序把输入丢到还没起好的会话上。
        if (!started) { queued.push(data); return }
        void this.callRaw('ttyInput', { data }).catch(() => undefined)
      },
      eof: () => { if (!ended) void this.callRaw('ttyEof', {}).catch(() => undefined) },
      close: () => { controller.abort() },
      done,
    }
  }
  dispose() {
    this.disposed = true
    // 就绪轮询在 ready 的 finish 里停；这里只需标记 disposed，attempt 会自行跳过。
    for (const [id, pending] of this.pending) {
      this.frame.contentWindow?.postMessage({ token: this.token, id, method: 'cancel' }, this.origin)
      pending.cleanup(); pending.reject(new DOMException('页面已关闭', 'AbortError'))
    }
    this.pending.clear(); window.removeEventListener('message', this.receive); this.frame.remove()
  }
}
