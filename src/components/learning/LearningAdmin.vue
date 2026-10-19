<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Plus, Trash2, ArrowLeft, Upload } from 'lucide-vue-next'
import { useAuth } from '../../lib/auth'
import { learningApi } from '../../lib/learning/api'
import { LearningEngine } from '../../lib/learning/engine'
import { confirmAction } from '../../lib/confirm'
import { pairTests, readZip, type UploadFile } from '../../lib/learning/testdata'
import { difficulties, environments, starter, verdictLabels, type Draft, type Environment, type PointResult, type ProblemContent, type Progress } from '../../lib/learning/types'
import Button from '../ui/button/Button.vue'
import Input from '../ui/input/Input.vue'
import IconButton from '../ui/IconButton.vue'
import RefreshButton from '../ui/RefreshButton.vue'
import ActionNotice from '../ui/ActionNotice.vue'
import AdminWorkspaceNav from '../AdminWorkspaceNav.vue'

const { isAdmin, ready: authReady, ensureLoaded } = useAuth()
const rows = ref<Draft[]>([]), selected = ref<Draft | null>(null), showing = ref(false), creating = ref(false)
const form = ref<ProblemContent | null>(null), baseline = ref('')
const busy = ref(''), loading = ref(false), error = ref(''), notice = ref(''), progress = ref<Progress | null>(null)
let engine: LearningEngine | undefined, controller: AbortController | undefined, serial = 0, alive = true, creationRequest = ''
const tagsText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

// 参考解可以一次配多种语言；只有全部通过才允许发布。
const refLanguages = ref<Environment[]>(['cpp'])
const refSources = ref<Partial<Record<Environment, string>>>({ cpp: starter.cpp })
const validation = ref<{ key: string; results: Partial<Record<Environment, string>>; points: Partial<Record<Environment, PointResult[]>> } | null>(null)
const validationPoints = (env: Environment) => validation.value?.points[env] ?? []

const signature = () => form.value ? JSON.stringify([form.value.title, form.value.chapter, form.value.difficulty, form.value.tags, form.value.statement, form.value.environments,
  form.value.checker, form.value.time_ms, form.value.tests.map(t => [t.name, t.input, t.output, t.sample])]) : ''
const dirty = computed(() => !!form.value && signature() !== baseline.value)
const validationKey = () => signature() + refLanguages.value.map(e => `${e}:${refSources.value[e] ?? ''}`).join('|')
const validationFresh = computed(() => !!validation.value && validation.value.key === validationKey())
const allPassed = computed(() => validationFresh.value && refLanguages.value.every(e => validation.value?.results[e] === 'AC'))
const canPublish = computed(() => allPassed.value)

function setForm(draft: Draft | null) {
  selected.value = draft; creating.value = !draft; showing.value = true; creationRequest = window.crypto.randomUUID()
  form.value = draft ? JSON.parse(JSON.stringify(draft.content)) : { title: '', chapter: '输入输出', difficulty: '入门', tags: [], statement: '', environments: ['c', 'cpp', 'python'],
    checker: 'tokens', time_ms: 3000, tests: [{ name: '样例 1', input: '', output: '', sample: true }] }
  form.value.difficulty ??= '入门'; form.value.tags ??= []
  tagsText.value = form.value.tags.join('、')
  const first = form.value.environments.includes('cpp') ? 'cpp' : form.value.environments[0] ?? 'cpp'
  refLanguages.value = [first]
  refSources.value = { [first]: refSources.value[first] ?? starter[first] }
  validation.value = null
  baseline.value = signature(); error.value = ''; notice.value = ''
}
async function leave() {
  if (busy.value) return false
  const target = selected.value?.id
  if (dirty.value && !await confirmAction('当前草稿尚未保存，是否放弃这些修改？', '放弃修改')) return false
  return !busy.value && selected.value?.id === target
}
async function choose(draft: Draft | null) { if (await leave()) setForm(draft) }
async function back() { if (await leave()) { showing.value = false; creating.value = false; form.value = null; selected.value = null } }
async function refresh() {
  if (busy.value) return
  const request = ++serial; loading.value = true
  try { const data = await learningApi.adminList(); if (request === serial) rows.value = data }
  catch (e) { if (request === serial) error.value = String(e) }
  finally { if (request === serial) loading.value = false }
}
function applyTags() {
  if (!form.value) return
  const seen = new Set<string>()
  form.value.tags = tagsText.value.split(/[、,，;；\s]+/).map(t => t.trim()).filter(t => t && !seen.has(t) && !!seen.add(t)).slice(0, 8)
  tagsText.value = form.value.tags.join('、')
}
function toggle(env: Environment) { if (!form.value || busy.value) return; form.value.environments = form.value.environments.includes(env) ? form.value.environments.filter(e => e !== env) : [...form.value.environments, env] }
function toggleLanguage(env: Environment) {
  if (busy.value) return
  refLanguages.value = refLanguages.value.includes(env) ? refLanguages.value.filter(e => e !== env) : [...refLanguages.value, env]
  if (!refSources.value[env]) refSources.value[env] = starter[env]
  if (!refLanguages.value.length) refLanguages.value = [env]
}
function renumber(tests: ProblemContent['tests']) { tests.forEach((t, i) => { t.name = `测试点 ${i + 1}` }) }

async function importFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!form.value || !files.length) return
  try {
    const read: UploadFile[] = []
    for (const file of files) {
      if (/\.zip$/i.test(file.name)) read.push(...await readZip(await file.arrayBuffer()))
      else read.push({ name: file.name, text: await file.text() })
    }
    const { tests, skipped } = pairTests(read)
    if (!tests.length) throw new Error('没有找到成对的 .in/.out（或 .ans）文件')
    form.value.tests = [...form.value.tests.filter(t => t.input || t.output), ...tests.map(t => ({ ...t, sample: false }))]
    renumber(form.value.tests)
    notice.value = `导入 ${tests.length} 个测试点。${skipped.length ? `跳过 ${skipped.length} 个无法配对的文件。` : ''}`
  } catch (e) { error.value = String(e) }
}

async function save() {
  if (busy.value || !form.value) return
  applyTags()
  busy.value = 'save'; error.value = ''; notice.value = ''
  try {
    const saved = selected.value ? await learningApi.save(selected.value.id, selected.value.revision, form.value) : await learningApi.create(creationRequest, form.value)
    if (!alive) return
    selected.value = saved; creating.value = false; baseline.value = signature()
    const index = rows.value.findIndex(r => r.id === saved.id)
    if (index >= 0) rows.value[index] = saved; else rows.value.push(saved)
    notice.value = '草稿已保存，发布版本保持原样。'
  } catch (e) { error.value = String(e) }
  finally { busy.value = '' }
}

async function validate() {
  if (busy.value || !form.value || !engine) return
  busy.value = 'validate'; error.value = ''; notice.value = ''; validation.value = null; controller = new AbortController()
  const key = validationKey(), results: Partial<Record<Environment, string>> = {}, points: Partial<Record<Environment, PointResult[]>> = {}
  try {
    for (const env of refLanguages.value) {
      const result = await engine.run({ environment: env, source: refSources.value[env] ?? starter[env],
        cases: JSON.parse(JSON.stringify(form.value.tests)), checker: form.value.checker, timeMs: form.value.time_ms },
        controller.signal, p => { progress.value = p })
      results[env] = result.verdict
      points[env] = result.points
      if (result.verdict !== 'AC') {
        validation.value = { key, results, points }
        const label = environments.find(e => e.id === env)?.label ?? env
        throw new Error(`${label} 未通过：${verdictLabels[result.verdict]}。${result.points.find(p => p.verdict !== 'AC')?.stderr || ''}`)
      }
    }
    if (key === validationKey()) {
      validation.value = { key, results, points }
      notice.value = `${refLanguages.value.length} 个参考解全部通过。`
    }
  } catch (e) { if ((e as Error).name !== 'AbortError') error.value = String(e) }
  finally { busy.value = ''; progress.value = null; controller = undefined }
}

async function publish() {
  if (busy.value || !selected.value || dirty.value || !canPublish.value) return
  const id = selected.value.id, revision = selected.value.revision
  if (!await confirmAction('发布当前版本？以后修改题面或测试点将产生新版本。', '发布题目')) return
  if (busy.value || selected.value?.id !== id || selected.value.revision !== revision || dirty.value || !canPublish.value) return
  busy.value = 'publish'; error.value = ''
  try {
    await learningApi.publish(id, revision)
    if (selected.value?.id === id) { selected.value.published_revision = revision; notice.value = '此版本已发布。' }
  } catch (e) { error.value = String(e) }
  finally { busy.value = '' }
}
function restore() { if (!busy.value && selected.value) setForm(selected.value) }
function start() { if (isAdmin.value && !engine) { engine = new LearningEngine(); void refresh() } }
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
watch(isAdmin, () => start())
onMounted(async () => { window.addEventListener('beforeunload', beforeUnload); await ensureLoaded(); if (alive) start() })
onUnmounted(() => { alive = false; serial++; controller?.abort(); engine?.dispose(); window.removeEventListener('beforeunload', beforeUnload) })
</script>
<template>
  <div class="mx-auto w-full max-w-6xl space-y-5">
    <AdminWorkspaceNav active="learn">
      <RefreshButton :busy="loading" :disabled="!!busy" @click="refresh" />
    </AdminWorkspaceNav>
    <p v-if="authReady && !isAdmin" class="text-sm text-muted-foreground">请先登录本地测试管理员。</p>
    <template v-else-if="isAdmin">
      <ActionNotice :message="error" variant="error" /><ActionNotice :message="notice" variant="info" />
      <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-medium">题目 {{ rows.length }} 道</h2><Button :disabled="!!busy" @click="choose(null)"><Plus class="mr-2 h-4 w-4" />新建题目</Button></div>
      <div class="grid min-w-0 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside class="min-w-0" :class="showing && 'hidden lg:block'"><div class="divide-y rounded-lg border"><button v-for="draft in rows" :key="draft.id" type="button" class="block min-h-11 w-full px-4 py-3 text-left hover:bg-muted/50" :class="selected?.id === draft.id && 'bg-muted'" :disabled="!!busy" @click="choose(draft)"><span class="block break-words text-sm font-medium">{{ draft.content.title }}</span><span class="text-xs text-muted-foreground">草稿 {{ draft.revision }} · {{ draft.published_revision ? `已发布 ${draft.published_revision}` : '未发布' }}</span></button></div></aside>
        <section v-if="showing && form" class="min-w-0 space-y-4">
          <Button variant="outline" :disabled="!!busy" @click="back"><ArrowLeft class="mr-2 h-4 w-4" />返回题目列表</Button>
          <form class="space-y-5 rounded-xl border p-4 sm:p-6" @submit.prevent="save">
            <h2 class="font-semibold">{{ creating ? '新建题目' : '编辑草稿' }}</h2>
            <div class="grid gap-4 sm:grid-cols-2"><div><label for="learn-title" class="text-sm">标题</label><Input id="learn-title" v-model="form.title" class="mt-2" required :disabled="!!busy" /></div><div><label for="learn-chapter" class="text-sm">章节</label><Input id="learn-chapter" v-model="form.chapter" class="mt-2" required :disabled="!!busy" /></div></div>
            <div class="grid gap-4 sm:grid-cols-2"><div><label for="learn-difficulty" class="text-sm">难度</label><select id="learn-difficulty" v-model="form.difficulty" class="form-select mt-2 w-full" :disabled="!!busy"><option v-for="d in difficulties" :key="d" :value="d">{{ d }}</option></select></div><div><label for="learn-tags" class="text-sm">标签（顿号或逗号分隔，最多 8 个）</label><Input id="learn-tags" v-model="tagsText" class="mt-2" :disabled="!!busy" placeholder="如：循环、数组" @blur="applyTags()" /></div></div>
            <div><label for="learn-statement" class="text-sm">题面</label><textarea id="learn-statement" v-model="form.statement" class="form-textarea mt-2 min-h-36 w-full" required :disabled="!!busy" /></div>
            <fieldset><legend class="text-sm">可选语言</legend><div class="mt-2 flex flex-wrap gap-2"><button v-for="e in environments" :key="e.id" type="button" class="choice-button" :aria-pressed="form.environments.includes(e.id)" :disabled="!!busy" @click="toggle(e.id)">{{ e.label }}</button></div></fieldset>
            <div class="grid gap-4 sm:grid-cols-2"><div><label for="learn-checker" class="text-sm">答案比较</label><select id="learn-checker" v-model="form.checker" class="form-select mt-2 w-full" :disabled="!!busy"><option value="tokens">忽略空白</option><option value="exact">逐字比较</option></select></div><div><label for="learn-time" class="text-sm">单点时限（ms）</label><Input id="learn-time" v-model.number="form.time_ms" type="number" min="100" max="30000" class="mt-2" :disabled="!!busy" /></div></div>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h3 class="font-medium">测试数据</h3>
              <div class="flex flex-wrap gap-2">
                <input ref="fileInput" type="file" multiple class="sr-only" accept=".zip,.in,.out,.ans,.txt" aria-label="导入测试数据文件" @change="importFiles" />
                <Button variant="outline" :disabled="!!busy" @click="fileInput?.click()"><Upload class="mr-2 h-4 w-4" />批量导入</Button>
                <Button variant="outline" :disabled="!!busy || form.tests.length >= 100" @click="form.tests.push({ name: `测试点 ${form.tests.length + 1}`, input: '', output: '', sample: false })"><Plus class="mr-2 h-4 w-4" />添加测试点</Button>
              </div>
            </div>
            <p class="text-xs text-muted-foreground">支持洛谷、casetool/FPS 的测试数据：选择 zip 或全选 <code>.in</code> / <code>.out</code>（<code>.ans</code>）文件，按同名自动配对。</p>
            <div v-for="(test, i) in form.tests" :key="i" class="space-y-3 rounded-lg border p-3">
              <div class="flex items-center gap-2"><label :for="`test-${i}-name`" class="sr-only">测试点 {{ i + 1 }} 名称</label><Input :id="`test-${i}-name`" v-model="test.name" class="flex-1" :disabled="!!busy" required /><IconButton :label="`删除测试点 ${i + 1}`" destructive :disabled="!!busy || form.tests.length <= 1" @click="form.tests.splice(i, 1)"><Trash2 class="h-4 w-4" /></IconButton></div>
              <div class="grid gap-3 sm:grid-cols-2"><div><label :for="`test-${i}-input`" class="text-sm">输入</label><textarea :id="`test-${i}-input`" v-model="test.input" class="form-textarea mt-2 w-full font-mono text-xs" :disabled="!!busy" /></div><div><label :for="`test-${i}-output`" class="text-sm">期望输出</label><textarea :id="`test-${i}-output`" v-model="test.output" class="form-textarea mt-2 w-full font-mono text-xs" :disabled="!!busy" /></div></div>
              <label class="flex min-h-11 items-center gap-2 text-sm"><input v-model="test.sample" type="checkbox" :disabled="!!busy" />公开样例</label>
            </div>
            <div class="flex flex-wrap gap-2"><Button type="submit" :disabled="!!busy">保存草稿</Button><Button variant="outline" :disabled="!!busy" @click="creating ? back() : restore()">取消{{ creating ? '新建' : '修改' }}</Button></div>
          </form>

          <form class="space-y-4 rounded-xl border p-5" @submit.prevent="validate">
            <h2 class="font-semibold">发布前验证</h2>
            <p class="text-sm text-muted-foreground">验证会在浏览器里真实编译运行参考解，需要先在「语言包」安装对应环境。</p>
            <fieldset>
              <legend class="text-sm">参考解语言</legend>
              <div class="mt-2 flex flex-wrap gap-2">
                <button v-for="e in environments.filter(e => form.environments.includes(e.id))" :key="e.id" type="button" class="choice-button" :aria-pressed="refLanguages.includes(e.id)" :disabled="!!busy" @click="toggleLanguage(e.id)">{{ e.label }}</button>
              </div>
            </fieldset>
            <div v-for="env in refLanguages" :key="env" class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <label :for="`reference-${env}`" class="text-sm">{{ environments.find(e => e.id === env)?.label }} 参考解</label>
                <span v-if="validationFresh" class="text-xs" :class="validation?.results[env] === 'AC' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'">{{ validation?.results[env] === 'AC' ? '通过' : (validation?.results[env] ? verdictLabels[validation.results[env]!] : '未验证') }}</span>
              </div>
              <textarea :id="`reference-${env}`" v-model="refSources[env]" class="form-textarea min-h-40 w-full font-mono text-sm" :disabled="!!busy" />
            </div>
            <div class="flex flex-wrap gap-2"><Button type="submit" variant="outline" :disabled="!!busy">验证全部测试点</Button><Button v-if="busy === 'validate'" variant="outline" @click="controller?.abort()">取消验证</Button><Button :disabled="!!busy || dirty || !canPublish || !selected" @click="publish">发布已保存版本</Button></div>
            <p v-if="progress" class="text-sm text-muted-foreground" role="status">{{ progress.phase }} · {{ progress.point }}/{{ progress.points }}</p>
            <div v-if="validationFresh" class="space-y-3">
              <div v-for="env in refLanguages" :key="env" class="space-y-2">
                <h3 class="text-sm font-medium">{{ environments.find(e => e.id === env)?.label }}<span class="ml-2 text-xs font-normal" :class="validation?.results[env] === 'AC' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'">{{ validation?.results[env] === 'AC' ? '全部通过' : verdictLabels[validation?.results[env] ?? 'OK'] }}</span></h3>
                <details v-for="(point, i) in validationPoints(env)" :key="i" :open="point.verdict !== 'AC'" class="min-w-0 rounded-lg border p-3">
                  <summary class="cursor-pointer text-sm">{{ point.name }} · {{ verdictLabels[point.verdict] }}<span v-if="point.elapsedMs !== undefined" class="ml-2 text-xs text-muted-foreground">{{ Math.round(point.elapsedMs) }} ms</span></summary>
                  <p v-if="point.error" class="mt-3 break-words text-sm text-destructive">{{ point.error }}</p>
                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    <div><p class="text-xs text-muted-foreground">输入</p><pre class="mt-1 max-h-48 overflow-auto whitespace-pre rounded-md bg-muted p-3 text-xs">{{ form.tests[i]?.input || '（空）' }}</pre></div>
                    <div><p class="text-xs text-muted-foreground">期望输出</p><pre class="mt-1 max-h-48 overflow-auto whitespace-pre rounded-md bg-muted p-3 text-xs">{{ form.tests[i]?.output || '（空）' }}</pre></div>
                  </div>
                  <p class="mt-3 text-xs text-muted-foreground">实际输出</p><pre class="mt-1 max-h-48 overflow-auto whitespace-pre rounded-md bg-muted p-3 text-xs">{{ point.stdout || '（空）' }}</pre>
                  <pre v-if="point.stderr" class="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{{ point.stderr }}</pre>
                </details>
              </div>
            </div>
            <p class="text-xs text-muted-foreground">修改草稿或参考解后需要重新验证；配置多个参考解时全部通过才可发布。</p>
          </form>
        </section>
        <p v-else class="hidden text-sm text-muted-foreground lg:block">选择题目，或新建一道题。</p>
      </div>
    </template>
  </div>
</template>
