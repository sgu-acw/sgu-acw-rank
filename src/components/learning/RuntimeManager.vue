<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Download, Trash2 } from 'lucide-vue-next'
import { LearningEngine } from '../../lib/learning/engine'
import { size, type Manifest, type PackageState, type Progress, type RuntimeId } from '../../lib/learning/types'
import Button from '../ui/button/Button.vue'
import ActionNotice from '../ui/ActionNotice.vue'
const catalog = ref<Manifest | null>(null), states = ref<PackageState[]>([]), error = ref(''), notice = ref('')
const busy = ref<RuntimeId | null>(null), progress = ref<Progress | null>(null)
let engine: LearningEngine | undefined, controller: AbortController | undefined, alive = true
async function reload() {
  if (!engine) return
  const [m, s] = await Promise.all([engine.manifest(), engine.status()])
  if (alive) { catalog.value = m; states.value = s }
}
onMounted(async () => { try { engine = new LearningEngine(); await reload() } catch (e) { error.value = String(e) } })
onUnmounted(() => { alive = false; controller?.abort(); engine?.dispose() })
const state = (id: RuntimeId) => states.value.find(s => s.id === id)
const ready = (id: RuntimeId) => !!state(id)?.ready
/** 断点续传里已存下的字节数；没有中断过就是 0。 */
const resumeOf = (id: RuntimeId) => state(id)?.downloaded || 0
const badge = (id: RuntimeId, available: boolean) =>
  ready(id) ? '已安装' : !available ? '暂不可用' : resumeOf(id) ? '待续传' : '未安装'
const badgeClass = (id: RuntimeId) =>
  ready(id) ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
    : resumeOf(id) ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
      : 'bg-muted text-muted-foreground'
async function install(id: RuntimeId) {
  if (busy.value || !engine) return
  busy.value = id; error.value = ''; notice.value = ''; controller = new AbortController()
  try {
    await engine.install(id, controller.signal, p => { if (alive) progress.value = p })
    await reload(); notice.value = '运行包已校验并安装。其他语言包保持原样。'
  } catch (e) {
    if ((e as Error).name !== 'AbortError') error.value = String(e)
    else notice.value = '已暂停。已下载的部分保留着，随时可以继续。'
    // 重新读一次状态，让「继续下载」和断点进度立刻反映出来。
    await reload()
  }
  finally { busy.value = null; progress.value = null; controller = undefined }
}
async function remove(id: RuntimeId) {
  if (busy.value || !engine) return
  busy.value = id; error.value = ''; notice.value = ''
  try { await engine.remove(id); await reload(); notice.value = '已移除所选运行包。' }
  catch (e) { error.value = String(e) }
  finally { busy.value = null }
}
</script>
<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">语言包</h1>
    <ActionNotice :message="error" variant="error" /><ActionNotice :message="notice" variant="info" />
    <div v-if="busy" class="space-y-3 rounded-lg border p-4" role="status" aria-live="polite">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-sm font-medium">{{ progress?.phase || '处理中…' }}</p>
        <p v-if="progress?.total" class="text-xs text-muted-foreground tabular-nums">{{ size(progress.done || 0) }} / {{ size(progress.total) }} · {{ Math.floor((progress.done || 0) / progress.total * 100) }}%</p>
      </div>
      <progress v-if="progress?.total" class="h-2 w-full" :value="progress.done" :max="progress.total" aria-label="运行包安装进度" />
      <p class="text-xs text-muted-foreground">中断后已下载的部分会保留，下次从这里继续。</p>
      <Button v-if="controller" variant="outline" @click="controller?.abort()">暂停下载</Button>
    </div>
    <div class="grid min-w-0 gap-4 sm:grid-cols-2">
      <section v-for="runtime in catalog?.runtimes" :key="runtime.id" class="min-w-0 space-y-4 rounded-xl border p-5">
        <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="font-semibold">{{ runtime.label }}</h2><span class="rounded-full px-2 py-0.5 text-xs" :class="badgeClass(runtime.id)">{{ badge(runtime.id, runtime.available) }}</span></div>
        <template v-if="runtime.available">
          <p class="text-sm text-muted-foreground">下载约 {{ size(runtime.assets.reduce((n, a) => n + a.transferBytes, 0)) }} · 占用约 {{ size(runtime.assets.reduce((n, a) => n + a.bytes, 0)) }}</p>
          <!-- 上次中断过就明说已存了多少，避免用户以为要从头再来。 -->
          <div v-if="resumeOf(runtime.id)" class="space-y-2 rounded-lg bg-muted p-3">
            <p class="text-sm">已下载 {{ size(resumeOf(runtime.id)!) }}，继续下载会从断点接着来。</p>
            <progress class="h-1.5 w-full" :value="resumeOf(runtime.id)!" :max="runtime.assets.reduce((n, a) => n + a.bytes, 0)" aria-label="断点进度" />
          </div>
          <div class="flex flex-wrap gap-2">
            <Button v-if="!ready(runtime.id) || state(runtime.id)?.version !== runtime.version" :disabled="!!busy" @click="install(runtime.id)">
              <Download class="mr-2 h-4 w-4" />{{ resumeOf(runtime.id) ? '继续下载' : state(runtime.id)?.ready ? '更新此环境' : '下载此环境' }}
            </Button>
            <Button v-if="state(runtime.id)?.ready" variant="outline" :disabled="!!busy" @click="remove(runtime.id)"><Trash2 class="mr-2 h-4 w-4" />移除运行包</Button>
          </div>
        </template>
        <p v-else class="text-sm text-muted-foreground">{{ runtime.reason }}</p>
      </section>
    </div>
  </div>
</template>
