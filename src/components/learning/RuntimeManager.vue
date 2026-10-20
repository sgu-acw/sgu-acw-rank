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
async function install(id: RuntimeId) {
  if (busy.value || !engine) return
  busy.value = id; error.value = ''; notice.value = ''; controller = new AbortController()
  try {
    await engine.install(id, controller.signal, p => { if (alive) progress.value = p })
    await reload(); notice.value = '运行包已校验并安装。其他语言包保持原样。'
  } catch (e) { if ((e as Error).name !== 'AbortError') error.value = String(e); else notice.value = '下载已取消，可以稍后重试。' }
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
    <div v-if="busy" class="space-y-3 rounded-lg border p-4" role="status">
      <p class="text-sm">{{ progress?.phase || '处理中…' }}<span v-if="progress?.total"> · {{ size(progress.done || 0) }} / {{ size(progress.total) }}</span></p>
      <progress v-if="progress?.total" class="h-2 w-full" :value="progress.done" :max="progress.total" aria-label="运行包安装进度" />
      <Button v-if="controller" variant="outline" @click="controller?.abort()">取消下载</Button>
    </div>
    <div class="grid min-w-0 gap-4 sm:grid-cols-2">
      <section v-for="runtime in catalog?.runtimes" :key="runtime.id" class="min-w-0 space-y-4 rounded-xl border p-5">
        <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="font-semibold">{{ runtime.label }}</h2><span class="text-xs text-muted-foreground">{{ state(runtime.id)?.ready ? '已安装' : runtime.available ? '未安装' : '待验证' }}</span></div>
        <template v-if="runtime.available">
          <p class="text-sm text-muted-foreground">Brotli 下载约 {{ size(runtime.assets.reduce((n, a) => n + a.transferBytes, 0)) }} · 资源约 {{ size(runtime.assets.reduce((n, a) => n + a.bytes, 0)) }}</p>
          <p class="break-all text-xs text-muted-foreground">{{ state(runtime.id)?.version || runtime.version }}</p>
          <div class="flex flex-wrap gap-2">
            <Button v-if="!state(runtime.id)?.ready || state(runtime.id)?.version !== runtime.version" :disabled="!!busy" @click="install(runtime.id)"><Download class="mr-2 h-4 w-4" />{{ state(runtime.id)?.ready ? '更新此环境' : '下载此环境' }}</Button>
            <Button v-if="state(runtime.id)?.ready" variant="outline" :disabled="!!busy" @click="remove(runtime.id)"><Trash2 class="mr-2 h-4 w-4" />移除运行包</Button>
          </div>
        </template>
        <p v-else class="text-sm text-muted-foreground">{{ runtime.reason }}</p>
      </section>
    </div>
  </div>
</template>
