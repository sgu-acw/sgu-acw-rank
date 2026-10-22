/**
 * 运行器与语言服务的共享状态机。
 *
 * 做题页和云端 IDE 都需要同一套东西：连接独立 origin 的评测运行器、读语言包
 * 清单、按当前语言启动 clangd/pyright、把补全和诊断接到编辑器。之前这套逻辑
 * 长在 ProblemWorkbench 里，多加一个页面就要复制一遍，所以抽出来。
 *
 * 页面只负责：选语言、写代码、决定什么时候提交。
 */
import { computed, onUnmounted, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import { LearningEngine } from './engine'
import { lspExtension, serviceFor } from './lsp'
import type { Environment, LspId, Manifest, PackageState } from './types'

export interface LearningRuntime {
  /** 运行器句柄；连接完成前为 undefined。 */
  engine: ShallowRef<LearningEngine | undefined>
  catalog: Ref<Manifest | null>
  packages: Ref<PackageState[]>
  /** 语言包是否已就绪，决定能不能运行代码。 */
  ready: Ref<boolean>
  error: Ref<string>
  /** 语言服务状态：off 未装、starting 启动中、ready 可用、failed 起不来。 */
  lspPhase: Ref<'off' | 'starting' | 'ready' | 'failed'>
  lspReason: Ref<string>
  completion: Ref<((context: never) => Promise<unknown>) | undefined>
  diagnostics: Ref<unknown>
  connect: () => Promise<void>
  refreshPackages: () => Promise<void>
  /** 语言服务失败后的手动重试。 */
  retryLsp: () => Promise<void>
  /** 语言切换后调用：换语言服务、清掉旧会话。 */
  switchEnvironment: () => Promise<void>
  dispose: () => void
}

export function useLearningRuntime(options: {
  environment: Ref<Environment>
  code: Ref<string>
}): LearningRuntime {
  const engine = shallowRef<LearningEngine | undefined>(undefined)
  const catalog = ref<Manifest | null>(null)
  const packages = ref<PackageState[]>([])
  const error = ref('')
  const lspPhase = ref<'off' | 'starting' | 'ready' | 'failed'>('off')
  const lspReason = ref('')
  const lspClientActive = ref(false)
  const lspState = ref<Record<LspId, string | null>>({ clangd: null, pyright: null })
  let lastService: LspId | null = null
  let alive = true, lspSerial = 0, connecting = false

  const activeService = computed(() => serviceFor(options.environment.value))
  const lspInstalled = computed(() => !!activeService.value && !!lspState.value[activeService.value])

  async function refreshPackages() {
    const active = engine.value
    if (!active) return
    const [m, s] = await Promise.all([active.manifest(), active.status()])
    if (alive && active === engine.value) { catalog.value = m; packages.value = s }
  }
  async function refreshLsp() {
    const active = engine.value
    if (!active) return
    try { const state = await active.lspStatus(); if (alive && active === engine.value) lspState.value = state } catch { /* 忽略 */ }
  }

  /**
   * 启动语言服务器；换语言先停旧的。clangd 首次要加载 26 MB wasm，比较慢，
   * 但挂起不能永远转圈——90 秒还不行就标失败，用户能点状态重试。
   */
  async function startLsp() {
    const request = ++lspSerial, active = engine.value
    const environment = options.environment.value, code = options.code.value
    const current = () => alive && request === lspSerial && active === engine.value
    lspClientActive.value = false
    lspReason.value = ''
    const service = activeService.value
    if (!service || !active || !lspInstalled.value) { lspPhase.value = 'off'; return }
    lspPhase.value = 'starting'
    try {
      if (lastService && lastService !== service) await active.lspStop(lastService).catch(() => undefined)
      if (!current()) return
      lastService = service
      let timeout: ReturnType<typeof setTimeout> | undefined
      const started = active.lspStart(service, environment, code)
      await Promise.race([
        started,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('语言服务启动超时，点这条重试')), 90000)
        }),
      ]).finally(() => clearTimeout(timeout))
      if (!current()) return
      lspClientActive.value = true
      lspPhase.value = 'ready'
    } catch (e) {
      if (!current()) return
      lspReason.value = String(e)
      lspPhase.value = 'failed'
    }
  }
  /** 失败后手动重试（点状态文字触发）。 */
  async function retryLsp() {
    if (lspPhase.value === 'failed') await startLsp()
  }

  // 引用必须随状态变化，否则 CodeEditor 的 watch 看不到更新、Compartment 不重配。
  const binding = computed(() => lspExtension(() =>
    lspClientActive.value && engine.value && activeService.value
      ? { engine: engine.value, service: activeService.value } : null))
  const completion = computed(() => lspPhase.value === 'ready'
    ? (context: never) => binding.value.completionSource(context) : undefined)
  const diagnostics = computed(() => binding.value.extension)

  async function connect() {
    if (connecting || !alive) return
    connecting = true; error.value = ''
    try {
      lspSerial++; engine.value?.dispose(); lastService = null
      engine.value = new LearningEngine()
      await refreshPackages()
      await refreshLsp()
      await startLsp()
    } catch (e) { if (alive) error.value = String(e) }
    finally { connecting = false }
  }

  /** 切语言后重启语言服务。文档内容由下一次补全请求带上，这里不用推。 */
  async function switchEnvironment() {
    await startLsp()
  }
  const dispose = () => {
    alive = false; lspSerial++
    if (lastService && engine.value) void engine.value.lspStop(lastService).catch(() => undefined)
    engine.value?.dispose()
    engine.value = undefined
  }
  onUnmounted(dispose)

  return {
    engine, catalog, packages,
    ready: computed(() => packages.value.find(p => p.id === runtimeIdOf(options.environment.value))?.ready === true),
    error, lspPhase, lspReason,
    completion: completion as LearningRuntime['completion'],
    diagnostics: diagnostics as LearningRuntime['diagnostics'],
    connect, refreshPackages, retryLsp, switchEnvironment, dispose,
  }
}

/** 语言 → 需要的运行包。C 和 C++ 共用一个包。 */
export function runtimeIdOf(environment: Environment) {
  return environment === 'c' || environment === 'cpp' ? 'c-cpp' : environment === 'python' ? 'python' : environment
}
