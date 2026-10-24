<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Download, GripVertical, Loader2, Plus, Search, Trash2, Trophy, X } from 'lucide-vue-next'
import Sortable from 'sortablejs'
import ActionNotice from './ui/ActionNotice.vue'
import IconButton from './ui/IconButton.vue'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import RefreshButton from './ui/RefreshButton.vue'
import CampLeaderboard from './CampLeaderboard.vue'
import CampResultNotice from './CampResultNotice.vue'
import CampTimingField from './CampTimingField.vue'
import { adminApi, ApiError, campAdminApi, LEARN_LOCAL, LEARN_PLATFORM, PLATFORM_META, platformLabel, problemListApi, type AdminUser, type CampAdminDetail, type CampSummary, type Platform } from '../lib/api'
import { learningApi } from '../lib/learning/api'
import type { ProblemSummary } from '../lib/learning/types'
import { useAuth } from '../lib/auth'
import { confirmAction } from '../lib/confirm'
import { useNow } from '../lib/useNow'
const now = useNow()

const { user, isAdmin, ensureLoaded } = useAuth()
const camps = ref<CampSummary[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const query = ref('')
const activeId = ref<number | null>(null)
const detail = ref<CampAdminDetail | null>(null)
const detailLoading = ref(false)
const busy = ref(false)
const creating = ref(false)
const newName = ref('')
const newDesc = ref('')
const newStart = ref('')
const newEnd = ref('')
// 开放报名 / 开始显示：relative = 开始前 N 天（默认 3），absolute = 指定时间
const newRegMode = ref<'relative' | 'absolute'>('relative')
const newRegDays = ref(3)
const newRegAt = ref('')
const newVisMode = ref<'relative' | 'absolute'>('relative')
const newVisDays = ref(3)
const newVisAt = ref('')
const editName = ref('')
const editDesc = ref('')
const editStart = ref('')
const editEnd = ref('')
const editRegMode = ref<'relative' | 'absolute'>('relative')
const editRegDays = ref(3)
const editRegAt = ref('')
const editVisMode = ref<'relative' | 'absolute'>('relative')
const editVisDays = ref(3)
const editVisAt = ref('')
const newPlatform = ref<Platform | 'learn'>('luogu')
const learnProblems = ref<ProblemSummary[]>([])
const learnProblemId = ref<number | null>(null)
const learnProblemsLoading = ref(false)
let learnRequestId = 0
async function loadLearnProblems() {
  const token = ++learnRequestId
  learnProblemsLoading.value = true
  try {
    const data = await learningApi.list()
    if (disposed || token !== learnRequestId) return
    learnProblems.value = data
    if (!data.some(p => p.id === learnProblemId.value)) learnProblemId.value = data[0]?.id ?? null
  } catch (e) { if (!disposed && token === learnRequestId) error.value = message(e) }
  finally { if (!disposed && token === learnRequestId) learnProblemsLoading.value = false }
}
watch(newPlatform, v => { if (v === LEARN_PLATFORM) void loadLearnProblems() })
const newKey = ref('')
const lookup = ref('')
const memberQuery = ref('')
const memberResults = ref<AdminUser[]>([])
const problemsEl = ref<HTMLElement | null>(null)
const PLATFORMS = Object.keys(PLATFORM_META) as Platform[]
let sortable: Sortable | null = null
let requestId = 0
let disposed = false
const filtered = computed(() => camps.value.filter(c => c.name.toLowerCase().includes(query.value.toLowerCase())))
const locked = computed(() => !!detail.value?.ended || (!!detail.value && now.value >= Date.parse(detail.value.end_at)))
/** 开始后：开放报名/开始显示已经生效，改它们只会把集训藏起来。 */
const timingLocked = computed(() => locked.value || (!!detail.value && now.value >= Date.parse(detail.value.start_at)))
const registeredIds = computed(() => new Set(detail.value?.registrations.map(r => r.user_id) ?? []))
const dirty = computed(() => {
  const d = detail.value
  if (!d) return false
  if (editName.value !== d.name || editDesc.value !== d.description) return true
  if (editStart.value !== toLocal(d.start_at) || editEnd.value !== toLocal(d.end_at)) return true
  const regMode = d.register_open_at ? 'absolute' : 'relative'
  if (editRegMode.value !== regMode) return true
  if (regMode === 'absolute' ? editRegAt.value !== toLocal(d.register_open_at!) : editRegDays.value !== (d.register_open_days ?? 3)) return true
  const visMode = d.visible_at ? 'absolute' : 'relative'
  if (editVisMode.value !== visMode) return true
  if (visMode === 'absolute' ? editVisAt.value !== toLocal(d.visible_at!) : editVisDays.value !== (d.visible_days ?? 3)) return true
  return false
})

const newFormSnapshot = computed(() => JSON.stringify([
  newName.value, newDesc.value, newStart.value, newEnd.value,
  newRegMode.value, newRegDays.value, newRegAt.value, newVisMode.value, newVisDays.value, newVisAt.value,
]))
const newFormBaseline = ref('')
const hasUnsavedChanges = computed(() => dirty.value || (creating.value && newFormSnapshot.value !== newFormBaseline.value))

function toLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function validTimes(start: string, end: string) {
  return Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) && Date.parse(end) > Date.parse(start)
}
function message(err: unknown) { return err instanceof Error ? err.message : '操作失败，请稍后重试' }
function updateUrl() {
  const url = new URL(location.href)
  if (activeId.value) url.searchParams.set('id', String(activeId.value))
  else url.searchParams.delete('id')
  history.replaceState(history.state, '', url)
}
async function loadList() { camps.value = await campAdminApi.list() }
/**
 * 导入的题名由后端后台任务逐题抓取，接口返回时通常还没写完。
 * 轮询到标题补齐为止，避免用户以为导入丢了标题、或者列表一直是空名。
 */
const namesLoading = ref(false)
async function refreshNames(id: number) {
  namesLoading.value = true
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      if (disposed || activeId.value !== id) return
      if (!detail.value?.problems.some(p => !p.name)) return
      const data = await campAdminApi.detail(id).catch(() => null)
      if (!data || disposed || activeId.value !== id) return
      detail.value = data
      if (!data.problems.some(p => !p.name)) return
    }
  } finally { namesLoading.value = false }
}

async function loadDetail(id: number, resetForm = true) {
  const token = ++requestId
  detailLoading.value = !detail.value || detail.value.id !== id
  try {
    const data = await campAdminApi.detail(id)
    if (disposed || token !== requestId || activeId.value !== id) return
    detail.value = data
    if (resetForm) {
      editName.value = data.name; editDesc.value = data.description
      editStart.value = toLocal(data.start_at); editEnd.value = toLocal(data.end_at)
      editRegMode.value = data.register_open_at ? 'absolute' : 'relative'
      editRegDays.value = data.register_open_days ?? 3
      editRegAt.value = data.register_open_at ? toLocal(data.register_open_at) : ''
      editVisMode.value = data.visible_at ? 'absolute' : 'relative'
      editVisDays.value = data.visible_days ?? 3
      editVisAt.value = data.visible_at ? toLocal(data.visible_at) : ''
    }
  } catch (err) {
    if (token === requestId) error.value = message(err)
  } finally { if (token === requestId) detailLoading.value = false }
}
async function leaveDetail() {
  return !hasUnsavedChanges.value || await confirmAction('还有未保存的集训信息，离开后会丢失这些修改。', '放弃修改？')
}
async function select(id: number) {
  if (busy.value || !await leaveDetail()) return
  activeId.value = id; detail.value = null; creating.value = false
  resetImport(); exportCollege.value = ''; exportYear.value = null
  error.value = ''; notice.value = ''; memberResults.value = []; memberQuery.value = ''; newKey.value = ''; lookup.value = ''
  updateUrl()
  await loadDetail(id)
}
async function back() {
  if (busy.value || !await leaveDetail()) return
  ++requestId; activeId.value = null; detail.value = null; detailLoading.value = false; creating.value = false
  error.value = ''; updateUrl()
}
async function refresh() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    await loadList()
    if (newPlatform.value === LEARN_PLATFORM) await loadLearnProblems()
    if (activeId.value) await loadDetail(activeId.value, !dirty.value)
  } catch (err) { error.value = message(err) }
  finally { loading.value = false; busy.value = false }
}
async function mutate(task: () => Promise<unknown>, success: string, resetForm = false) {
  if (busy.value) return false
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await task()
    notice.value = success
    await loadList()
    if (activeId.value) await loadDetail(activeId.value, resetForm)
    return true
  } catch (err) { error.value = message(err); return false }
  finally { busy.value = false }
}
async function startCreate() {
  if (busy.value || !await leaveDetail()) return
  ++requestId; activeId.value = null; detail.value = null; creating.value = true; updateUrl()
  newName.value = ''; newDesc.value = ''
  newStart.value = toLocal(new Date().toISOString())
  newEnd.value = toLocal(new Date(Date.now() + 7200000).toISOString())
  newRegMode.value = 'relative'; newRegDays.value = 3; newRegAt.value = ''
  newVisMode.value = 'relative'; newVisDays.value = 3; newVisAt.value = ''
  resetImport(); error.value = ''; notice.value = ''
  newFormBaseline.value = newFormSnapshot.value
}

function timingPayload(mode: 'relative' | 'absolute', days: number, at: string, key: 'register_open' | 'visible'): Record<string, string | number | null> {
  if (mode === 'absolute') {
    if (!at) return {}
    return { [`${key}_at`]: new Date(at).toISOString() }
  }
  return { [`${key}_days`]: days }
}
async function create() {
  if (!newName.value.trim() || !validTimes(newStart.value, newEnd.value)) return
  await mutate(async () => {
    const created = await campAdminApi.create({
      name: newName.value.trim(),
      description: newDesc.value.trim(),
      start_at: new Date(newStart.value).toISOString(),
      end_at: new Date(newEnd.value).toISOString(),
      ...timingPayload(newRegMode.value, newRegDays.value, newRegAt.value, 'register_open'),
      ...timingPayload(newVisMode.value, newVisDays.value, newVisAt.value, 'visible'),
    })
    activeId.value = created.id; creating.value = false; updateUrl()
  }, '集训已创建', true)
}
async function save() {
  const d = detail.value
  if (!d || !editName.value.trim() || (!locked.value && !validTimes(editStart.value, editEnd.value))) return
  const payload: Parameters<typeof campAdminApi.update>[1] = {
    name: editName.value.trim(), description: editDesc.value.trim(),
  }
  // datetime-local 只有分钟精度；未改时间时不能把服务器的秒数截掉再保存。
  if (!locked.value && editEnd.value !== toLocal(d.end_at)) payload.end_at = new Date(editEnd.value).toISOString()
  if (!timingLocked.value) {
    if (editStart.value !== toLocal(d.start_at)) payload.start_at = new Date(editStart.value).toISOString()
    const regChanged = editRegMode.value !== (d.register_open_at ? 'absolute' : 'relative')
      || (editRegMode.value === 'absolute' ? editRegAt.value !== (d.register_open_at ? toLocal(d.register_open_at) : '') : editRegDays.value !== (d.register_open_days ?? 3))
    const visChanged = editVisMode.value !== (d.visible_at ? 'absolute' : 'relative')
      || (editVisMode.value === 'absolute' ? editVisAt.value !== (d.visible_at ? toLocal(d.visible_at) : '') : editVisDays.value !== (d.visible_days ?? 3))
    if (regChanged) Object.assign(payload, timingPayload(editRegMode.value, editRegDays.value, editRegAt.value, 'register_open'))
    if (visChanged) Object.assign(payload, timingPayload(editVisMode.value, editVisDays.value, editVisAt.value, 'visible'))
  }
  await mutate(() => campAdminApi.update(d.id, payload), '集训信息已保存', true)
}
async function removeCamp() {
  if (!detail.value || busy.value) return
  const id = detail.value.id
  if (!await confirmAction(`删除「${detail.value.name}」及其题目、报名记录和最终成绩？此操作不可恢复。`, '删除集训')) return
  await mutate(async () => { await campAdminApi.remove(id); activeId.value = null; detail.value = null; updateUrl() }, '集训已删除')
}
async function addProblem() {
  if (!detail.value || locked.value || busy.value || (newPlatform.value === LEARN_PLATFORM && learnProblemsLoading.value)) return
  const id = detail.value.id
  const platform = newPlatform.value
  if (platform === LEARN_PLATFORM) {
    const picked = learnProblems.value.find(p => p.id === learnProblemId.value)
    if (!picked) return
    await mutate(async () => {
      await campAdminApi.addProblem(id, LEARN_PLATFORM, String(picked.id))
      lookup.value = `题库：${picked.title}`
    }, '题目已添加')
    return
  }
  if (!newKey.value.trim()) return
  const key = newKey.value.trim()
  if (platform === 'luogu' && /^[UT][0-9]+$/i.test(key)) {
    error.value = '集训不支持添加洛谷 U/T 题'
    return
  }
  await mutate(async () => {
    const info = await problemListApi.lookup(platform, key)
    if (info.missing_reason) throw new ApiError(400, info.missing_reason)
    await campAdminApi.addProblem(id, platform, key)
    newKey.value = ''; lookup.value = info.name
  }, '题目已添加')
}

// ------------------------------------------------------------------ 批量导入
//
// 两条路：整张题单拉过来，或者把「平台:题号」文本粘进来解析。
// 重复的后端跳过，别一条报错把整个导入打死。

const importOpen = ref(false)
const importLists = ref<{ id: number; label: string }[]>([])
const importListId = ref<number | null>(null)
const importText = ref('')
const importDefaultPlatform = ref<Platform>('luogu')
const importResult = ref('')
const importHasWarnings = ref(false)
const importListsLoading = ref(false)
function resetImport() {
  importOpen.value = false; importListId.value = null; importText.value = ''
  importResult.value = ''; importHasWarnings.value = false
}

const PLATFORM_PREFIXES: Record<string, Platform | 'learn'> = {
  luogu: 'luogu',
  codeforces: 'codeforces',
  cf: 'codeforces',
  atcoder: 'atcoder',
  ac: 'atcoder',
  nowcoder: 'nowcoder',
  nc: 'nowcoder',
  '\u6d1b\u8c37': 'luogu',   // 洛谷
  '\u725b\u5ba2': 'nowcoder', // 牛客
  ...(LEARN_LOCAL ? { learn: LEARN_PLATFORM, '\u7ec3\u4e60': LEARN_PLATFORM } : {}),
}

function parseImportText(): { items: { platform: Platform | 'learn'; key: string }[]; failed: string[] } {
  const items: { platform: Platform | 'learn'; key: string }[] = []
  const failed: string[] = []
  for (const raw of importText.value.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    // 「平台:题号」「平台 题号」「题号」（走默认平台）三种写法。
    const m = line.match(/^([A-Za-z\u4e00-\u9fff]+)[\s:：]+(.+)$/)
    const prefix = m ? PLATFORM_PREFIXES[m[1].toLowerCase()] : undefined
    if (m && prefix) {
      items.push({ platform: prefix, key: m[2].trim() })
    } else if (/[:：\s]/.test(line)) {
      // 看起来想写平台前缀但不认识，进 failed 而不是悄悄按默认平台。
      failed.push(line)
    } else {
      items.push({ platform: importDefaultPlatform.value, key: line })
    }
  }
  return { items, failed }
}

async function runImport(source: 'list' | 'text') {
  if (!detail.value || busy.value || locked.value) return
  const id = detail.value.id
  busy.value = true
  error.value = ''; notice.value = ''; importResult.value = ''; importHasWarnings.value = false
  try {
    const payload: Parameters<typeof campAdminApi.importProblems>[1] = {}
    let rejected: string[] = []
    if (source === 'list') {
      if (!importListId.value) { error.value = '请选择题单'; return }
      payload.problem_list_id = importListId.value
    } else {
      const { items, failed } = parseImportText()
      rejected = failed
      if (!items.length) {
        importHasWarnings.value = true
        importResult.value = failed.length ? `没有可导入的题，无法识别：\n${failed.join('\n')}` : '没有可导入的题'
        return
      }
      payload.items = items
    }
    const r = await campAdminApi.importProblems(id, payload)
    rejected = [...rejected, ...r.failed]
    const excluded = r.excluded ?? []
    importHasWarnings.value = rejected.length > 0 || excluded.length > 0
    importResult.value = `导入 ${r.added} 道，跳过 ${r.skipped} 道重复题`
      + (excluded.length ? `\n以下洛谷 U/T 题不会加入集训：\n${excluded.join('\n')}` : '')
      + (rejected.length ? `\n${rejected.length} 行未导入：\n${rejected.join('\n')}` : '')
    if (source === 'text') importText.value = rejected.join('\n')
    await loadList()
    await loadDetail(id, false)
    // 题名是后端导入后异步抓的，此刻多半还没回填，轮询补齐。
    void refreshNames(id)
  } catch (err) {
    error.value = message(err)
  } finally {
    busy.value = false
  }
}

async function openImport() {
  if (busy.value || importListsLoading.value) return
  importOpen.value = !importOpen.value
  if (!importOpen.value || importLists.value.length) return
  importListsLoading.value = true
  try {
    const lists = await problemListApi.list({ include_nested: true })
    importLists.value = lists.map((l) => ({
      id: l.id,
      label: `${l.kind === 'collection' ? '合集' : '题单'} · ${l.title}${l.item_count ? `（${l.item_count}）` : ''}`,
    }))
  } catch (err) {
    error.value = message(err)
  } finally { importListsLoading.value = false }
}
async function removeProblem(id: number, name: string) {
  if (!detail.value || busy.value || locked.value || !await confirmAction(`从集训中移除「${name}」？过题统计会随题目列表重新计算。`, '移除题目')) return
  const campId = detail.value.id
  await mutate(() => campAdminApi.removeProblem(campId, id), '题目已移除')
}
async function reorder(from: number, to: number) {
  if (!detail.value || busy.value || locked.value || to < 0 || to >= detail.value.problems.length || from === to) return
  const id = detail.value.id
  const items = [...detail.value.problems]
  const [moved] = items.splice(from, 1); items.splice(to, 0, moved)
  await mutate(() => campAdminApi.reorderProblems(id, items.map(p => p.id)), '题目顺序已保存')
}
function setupSortable() {
  sortable?.destroy(); sortable = null
  if (!problemsEl.value || locked.value) return
  sortable = Sortable.create(problemsEl.value, {
    handle: '[data-drag-handle]', animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150,
    delayOnTouchOnly: true, delay: 200, disabled: busy.value,
    onEnd(event) {
      const from = event.oldIndex, to = event.newIndex
      if (from === undefined || to === undefined || from === to) return
      // 先恢复 Sortable 改过的 DOM，再让 Vue 根据服务器结果渲染顺序。
      const parent = event.from
      const remaining = [...parent.children].filter(el => el !== event.item)
      parent.insertBefore(event.item, remaining[from] ?? null)
      void reorder(from, to)
    },
  })
}
watch(problemsEl, setupSortable, { flush: 'post' })
watch(busy, value => sortable?.option('disabled', value))
async function searchMembers() {
  if (!memberQuery.value.trim() || busy.value) return
  busy.value = true; error.value = ''
  try { memberResults.value = (await adminApi.users({ q: memberQuery.value.trim(), page_size: 8 })).items }
  catch (err) { error.value = message(err) }
  finally { busy.value = false }
}
async function addMember(id: number) {
  if (!detail.value || locked.value) return
  const campId = detail.value.id
  await mutate(() => campAdminApi.addMember(campId, id), '成员已加入，同步已安排')
}
async function removeMember(id: number, name: string) {
  if (!detail.value || busy.value || locked.value || !await confirmAction(`从集训报名名单移除「${name}」？`, '移除报名成员')) return
  const campId = detail.value.id
  await mutate(() => campAdminApi.removeMember(campId, id), '成员已移除')
}
async function exportResults(format: 'xlsx' | 'csv' | 'json') {
  if (!detail.value || busy.value) return
  const id = detail.value.id
  busy.value = true; error.value = ''
  try {
    const blob = await campAdminApi.export(id, format)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `camp-${id}.${format}`
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice.value = detail.value.phase === 'finalized' ? '最终成绩已导出' : '当前成绩已导出，尚未封榜'
  } catch (err) { error.value = message(err) }
  finally { busy.value = false }
}

// ------------------------------------------------------------------ 导出排行榜 PNG
//
// 数据已经在 detail 里，不用额外拉：把 CampLeaderboard 渲到离屏容器
// （export-light 强制浅色），html-to-image 截成 PNG 下载。

const exportingPng = ref(false)
const pngHost = ref<HTMLElement | null>(null)

// 导出筛选：年级/学院，渲之前过滤——和排行榜自带筛选同一套字段。
const exportYear = ref<number | null>(null)
const exportCollege = ref('')

const exportYears = computed(() =>
  [...new Set((detail.value?.leaderboard ?? []).map((e) => e.enroll_year).filter(Boolean))].sort(
    (a, b) => b - a,
  ),
)
const exportColleges = computed(() =>
  [...new Set((detail.value?.leaderboard ?? []).map((e) => e.college_name).filter(Boolean))].sort() as string[],
)
const exportEntries = computed(() =>
  (detail.value?.leaderboard ?? []).filter((e) => {
    if (exportCollege.value && e.college_name !== exportCollege.value) return false
    if (exportYear.value !== null && e.enroll_year !== exportYear.value) return false
    return true
  }),
)

async function exportPng() {
  if (!detail.value || busy.value || exportingPng.value) return
  exportingPng.value = true
  busy.value = true
  error.value = ''
  try {
    await nextTick()
    // 等一帧让组件渲染完 + 字体就绪。数据都是本地传入，不用等网络。
    await new Promise((r) => setTimeout(r, 300))
    if (!pngHost.value) throw new Error('渲染容器没准备好')
    const { toPng } = await import('html-to-image')
    const dataUrl = await Promise.race([
      toPng(pngHost.value, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        // 跳过字体嵌入：嵌入要读所有样式表的 cssRules，页面里跨域的
        // katex.min.css 会抛 SecurityError 让整个截取失败。站点用的是
        // 系统字体，不嵌字体也不影响渲染。
        skipFonts: true,
        // 筛选条、横向滚动提示这类「操作控件」不进图。
        filter: (node) => !(node instanceof HTMLElement && node.hasAttribute('data-export-hidden')),
      }),
      // html-to-image 内部要等 rAF——隐藏标签页永远不触发，真卡住时
      // 报个错而不是无声挂死。
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('截图超时，请把页面切到前台再试')), 15000),
      ),
    ])
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${detail.value.name}-排行榜.png`
    link.click()
  } catch (err) {
    error.value = message(err)
  } finally {
    busy.value = false
    exportingPng.value = false
  }
}
function beforeUnload(event: Event) { if (hasUnsavedChanges.value) { event.preventDefault() } }
onMounted(async () => {
  await ensureLoaded()
  if (!isAdmin.value) { loading.value = false; return }
  const id = Number(new URLSearchParams(location.search).get('id'))
  if (Number.isSafeInteger(id) && id > 0) activeId.value = id
  await refresh()
  await nextTick(); setupSortable()
  window.addEventListener('beforeunload', beforeUnload)
})
onUnmounted(() => { disposed = true; ++requestId; sortable?.destroy(); window.removeEventListener('beforeunload', beforeUnload) })
</script>

<template>
  <div class="mx-auto w-full max-w-6xl space-y-4">
    <AdminWorkspaceNav active="camps">
      <RefreshButton :busy="busy || loading" @click="refresh" />
    </AdminWorkspaceNav>
    <p v-if="!loading && !isAdmin" class="rounded-lg border p-6 text-sm text-muted-foreground">{{ user ? '需要管理员权限才能管理集训。' : '请先登录管理员账号。' }} <a v-if="!user" href="/login" class="underline">前往登录</a></p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="mr-auto text-base font-semibold">集训管理 <span class="text-sm font-normal text-muted-foreground">{{ camps.length }} 场</span></h2>
        <Button :disabled="busy" @click="startCreate"><Plus class="mr-2 h-4 w-4" />新建集训</Button>
      </div>
      <ActionNotice :message="error" variant="error" />
      <ActionNotice :message="notice" />
      <p v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" />正在读取集训…</p>
      <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div class="min-w-0 space-y-3" :class="activeId || creating ? 'hidden lg:block' : ''">
          <Input v-model="query" aria-label="搜索集训" placeholder="搜索集训名称" class="min-h-11" />
          <Card v-if="filtered.length">
<CardContent class="p-1">
            <button v-for="c in filtered" :key="c.id" type="button" :disabled="busy" class="row-action flex min-h-16 w-full flex-col justify-center gap-1 rounded-md px-3 py-3 text-left disabled:opacity-50" :class="activeId === c.id ? 'bg-accent' : ''" @click="select(c.id)">
              <span class="w-full truncate text-sm font-medium">{{ c.name }}</span>
              <span class="text-xs text-muted-foreground">{{ c.registration_count }} 人 · {{ c.problem_count }} 题 · {{ c.ended ? '已截止' : c.started ? '进行中' : '未开始' }}</span>
            </button>
          </CardContent>
</Card>
          <p v-else class="py-10 text-center text-sm text-muted-foreground">{{ query ? '没有匹配的集训' : '还没有集训，先创建一场。' }}</p>
        </div>
        <div class="min-w-0 space-y-4" :class="activeId || creating ? '' : 'hidden lg:block'">
          <Button v-if="activeId || creating" variant="ghost" :disabled="busy" @click="back"><ArrowLeft class="mr-2 h-4 w-4" />返回集训列表</Button>
          <Card v-if="creating">
            <CardHeader><CardTitle class="text-base">新建集训</CardTitle></CardHeader>
            <CardContent>
              <form class="space-y-4" @submit.prevent="create">
                <label class="block space-y-1 text-sm"><span>集训名称</span><Input v-model="newName" required maxlength="200" class="min-h-11" /></label>
                <label class="block space-y-1 text-sm"><span>说明</span><textarea v-model="newDesc" rows="3" maxlength="5000" class="form-textarea" /></label>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label class="block space-y-1 text-sm"><span>开始时间（本地时间）</span><Input v-model="newStart" type="datetime-local" required class="min-h-11" /></label>
                  <label class="block space-y-1 text-sm"><span>截止时间（本地时间）</span><Input v-model="newEnd" type="datetime-local" required class="min-h-11" /></label>
                </div>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <CampTimingField v-model:mode="newRegMode" v-model:days="newRegDays" v-model:at="newRegAt" label="开放报名" />
                  <CampTimingField v-model:mode="newVisMode" v-model:days="newVisDays" v-model:at="newVisAt" label="开始显示" />
                </div>
                <p v-if="!validTimes(newStart, newEnd)" class="text-sm text-destructive">截止时间必须晚于开始时间。</p>
                <Button type="submit" :disabled="busy || !newName.trim() || !validTimes(newStart, newEnd)">创建集训</Button>
              </form>
            </CardContent>
          </Card>
          <p v-else-if="detailLoading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" />正在读取详情…</p>
          <template v-else-if="detail">
            <div class="flex flex-wrap items-center gap-2"><h2 class="mr-auto break-words text-base font-semibold">{{ detail.name }}</h2><a :href="`/camp?id=${detail.id}`" class="inline-flex min-h-11 items-center text-sm text-primary hover:underline">查看成员页面 →</a></div>
            <CampResultNotice :status="detail" admin />
            <Card>
              <CardHeader><CardTitle class="text-sm">基本信息</CardTitle></CardHeader>
              <CardContent>
                <form class="space-y-4" @submit.prevent="save">
                  <label class="block space-y-1 text-sm"><span>名称</span><Input v-model="editName" required maxlength="200" class="min-h-11" /></label>
                  <label class="block space-y-1 text-sm"><span>说明</span><textarea v-model="editDesc" rows="3" maxlength="5000" class="form-textarea" /></label>
                  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label class="block space-y-1 text-sm"><span>开始时间（本地时间）</span><Input v-model="editStart" type="datetime-local" required :disabled="timingLocked" class="min-h-11" /></label>
                    <label class="block space-y-1 text-sm"><span>截止时间（本地时间）</span><Input v-model="editEnd" type="datetime-local" required :disabled="locked" class="min-h-11" /></label>
                  </div>
                  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <CampTimingField v-model:mode="editRegMode" v-model:days="editRegDays" v-model:at="editRegAt" label="开放报名" :disabled="timingLocked" />
                    <CampTimingField v-model:mode="editVisMode" v-model:days="editVisDays" v-model:at="editVisAt" label="开始显示" :disabled="timingLocked" />
                  <p v-if="timingLocked && !locked" class="text-xs text-muted-foreground">已开始，开放报名和显示时间已锁定。</p>
                  </div>
                  <p v-if="locked" class="text-xs text-muted-foreground">已截止，题目、报名名单和时间已锁定。</p>
                  <Button type="submit" :disabled="busy || !dirty || !editName.trim() || (!locked && !validTimes(editStart, editEnd))"><Loader2 v-if="busy" class="mr-2 h-4 w-4 animate-spin" />保存信息</Button>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div class="flex flex-wrap items-baseline gap-2">
                  <CardTitle class="text-sm">题目 <span class="text-muted-foreground">{{ detail.problems.length }}</span></CardTitle>
                  <!-- 题名是异步抓的，明说在取，免得看成导入失败。 -->
                  <span v-if="namesLoading" class="text-xs text-muted-foreground" role="status">正在获取题名…</span>
                </div>
              </CardHeader>
              <CardContent class="space-y-4">
                <div v-if="detail.problems.length" ref="problemsEl" class="divide-y divide-border/40">
                  <div v-for="(p, index) in detail.problems" :key="p.id" class="flex items-center gap-2 py-2">
                    <span v-if="!locked" data-drag-handle class="hidden shrink-0 cursor-grab p-2 text-muted-foreground lg:block" title="拖动排序"><GripVertical class="h-4 w-4" /></span>
                    <div class="min-w-0 flex-1"><p class="break-words text-sm font-medium">{{ p.name || p.key }}</p><p class="break-all text-xs text-muted-foreground">{{ platformLabel(p.platform) }} · {{ p.platform === LEARN_PLATFORM ? `#${p.key}` : p.key }}</p></div>
                    <div v-if="!locked" class="flex shrink-0">
                    <IconButton :disabled="busy || index === 0" :label="`上移 ${p.name || p.key}`" @click="reorder(index, index - 1)"><ArrowUp class="h-4 w-4" /></IconButton>
                      <IconButton :disabled="busy || index === detail.problems.length - 1" :label="`下移 ${p.name || p.key}`" @click="reorder(index, index + 1)"><ArrowDown class="h-4 w-4" /></IconButton>
                      <IconButton destructive :disabled="busy" :label="`移除 ${p.name || p.key}`" @click="removeProblem(p.id, p.name || p.key)"><X class="h-4 w-4" /></IconButton>
                    </div>
                  </div>
                </div>
                <p v-else class="text-sm text-muted-foreground">还没有题目，添加后成员才能报名。</p>
                <form v-if="!locked" class="space-y-2" @submit.prevent="addProblem">
                  <label class="block text-sm font-medium">添加题目</label>
                  <div class="flex flex-wrap gap-2">
                    <select v-model="newPlatform" aria-label="题目平台" class="form-select w-auto" :disabled="busy"><option v-for="p in PLATFORMS" :key="p" :value="p">{{ PLATFORM_META[p].label }}</option><option v-if="LEARN_LOCAL" value="learn">题库</option></select>
                    <select v-if="newPlatform === LEARN_PLATFORM" v-model="learnProblemId" aria-label="题库题目" class="form-select min-w-0 flex-1" :disabled="busy || learnProblemsLoading">
                      <option v-for="lp in learnProblems" :key="lp.id" :value="lp.id">{{ lp.id }}. {{ lp.title }}</option>
                    </select>
                    <Input v-else v-model="newKey" aria-label="题号" placeholder="题号，如 P1001" class="min-h-11 min-w-0 flex-1" :disabled="busy" />
                    <Button type="submit" :disabled="busy || (newPlatform === LEARN_PLATFORM ? learnProblemsLoading || !learnProblemId : !newKey.trim())" class="w-full sm:w-auto"><Plus class="mr-1 h-4 w-4" />添加题目</Button>
                  </div>
                  <p v-if="lookup" class="text-xs text-muted-foreground">最近添加：{{ lookup }}</p>
                </form>
                <div v-if="!locked" class="border-t border-border/40 pt-3">
                  <Button variant="outline" :aria-expanded="importOpen" aria-controls="camp-import" :disabled="busy || importListsLoading" @click="openImport">
                    <ChevronRight class="mr-2 h-4 w-4" :class="{ 'rotate-90': importOpen }" />批量导入
                  </Button>
                  <div v-if="importOpen" id="camp-import" class="mt-4 space-y-4">
                    <p class="text-sm text-muted-foreground">洛谷 U/T 题不会加入集训，其余有效题目照常导入。</p>
                    <form class="space-y-2" @submit.prevent="runImport('list')">
                      <label for="camp-import-list" class="text-sm font-medium">从题单导入</label>
                      <div class="flex flex-wrap gap-2">
                        <select id="camp-import-list" v-model="importListId" class="form-select flex-1 basis-48" :disabled="busy || importListsLoading">
                          <option :value="null">{{ importListsLoading ? '正在读取题单…' : '选择题单 / 合集' }}</option>
                          <option v-for="l in importLists" :key="l.id" :value="l.id">{{ l.label }}</option>
                        </select>
                        <Button type="submit" variant="outline" :disabled="busy || !importListId">导入题单</Button>
                      </div>
                    </form>
                    <form class="space-y-2" @submit.prevent="runImport('text')">
                      <label for="camp-import-text" class="text-sm font-medium">按行粘贴题号</label>
                      <label class="block space-y-1 text-sm text-muted-foreground">
                        <span>未写平台前缀时使用</span>
                        <select v-model="importDefaultPlatform" class="form-select" :disabled="busy"><option v-for="p in PLATFORMS" :key="p" :value="p">{{ PLATFORM_META[p].label }}</option><option v-if="LEARN_LOCAL" value="learn">题库</option></select>
                      </label>
                      <textarea id="camp-import-text" v-model="importText" rows="4" :placeholder="'luogu:P1000\ncf:1234A\nac:abc300_a\nP1002'" class="form-textarea font-mono" :disabled="busy" />
                      <Button type="submit" variant="outline" :disabled="busy || !importText.trim()">导入题号</Button>
                    </form>
                    <ActionNotice :message="importResult" :variant="importHasWarnings ? 'info' : 'success'" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle class="text-sm">报名名单 <span class="text-muted-foreground">{{ detail.registrations.length }}</span></CardTitle></CardHeader>
              <CardContent class="space-y-4">
                <div class="divide-y divide-border/40">
                  <div v-for="r in detail.registrations" :key="r.user_id" class="flex min-h-12 items-center gap-3"><span class="min-w-0 flex-1 truncate text-sm">{{ r.display_name }}</span><IconButton v-if="!locked" destructive :disabled="busy" :label="`移除报名成员 ${r.display_name}`" @click="removeMember(r.user_id, r.display_name)"><X class="h-4 w-4" /></IconButton></div>
                </div>
                <p v-if="!detail.registrations.length" class="text-sm text-muted-foreground">还没有成员报名。</p>
                <form v-if="!locked" class="flex gap-2" @submit.prevent="searchMembers"><Input v-model="memberQuery" aria-label="搜索成员" placeholder="姓名或学号" class="min-h-11 min-w-0 flex-1" /><Button type="submit" variant="outline" :disabled="busy || !memberQuery.trim()"><Search class="mr-1 h-4 w-4" />搜索</Button></form>
                <div v-if="!locked" class="divide-y divide-border/40"><div v-for="u in memberResults" :key="u.id" class="flex min-h-12 items-center gap-2"><span class="min-w-0 flex-1 text-sm">{{ u.display_name }} <span class="text-xs text-muted-foreground">{{ u.student_id }}</span></span><Button variant="outline" :disabled="busy || registeredIds.has(u.id)" @click="addMember(u.id)">{{ registeredIds.has(u.id) ? '已报名' : '加入集训' }}</Button></div></div>
                <p v-if="!locked" class="text-xs leading-relaxed text-muted-foreground">管理员可手动加入尚未绑定平台账号的成员；绑定并验证账号后才会同步成绩。</p>
              </CardContent>
            </Card>
            <CampLeaderboard :entries="detail.leaderboard ?? []" :problems="detail.problems" />
            <Card>
              <CardHeader><CardTitle class="text-sm">{{ detail.phase === 'finalized' ? '导出最终成绩' : '导出当前成绩（未封榜）' }}</CardTitle></CardHeader>
              <CardContent class="space-y-4">
                <div class="flex flex-wrap gap-2"><Button v-for="fmt in (['xlsx', 'csv', 'json'] as const)" :key="fmt" variant="outline" :disabled="busy" @click="exportResults(fmt)"><Download class="mr-2 h-4 w-4" />{{ fmt.toUpperCase() }}</Button></div>
                <div class="space-y-2 border-t border-border/40 pt-4">
                  <p class="text-sm font-medium">PNG 榜单图</p>
                  <p class="text-xs text-muted-foreground">以下筛选仅用于图片，保留原榜名次。</p>
                  <div class="flex flex-wrap gap-2">
                    <select v-model="exportCollege" class="form-select flex-1 basis-40" aria-label="图片筛选：学院" :disabled="busy"><option value="">全部学院</option><option v-for="c in exportColleges" :key="c" :value="c">{{ c }}</option></select>
                    <select v-model="exportYear" class="form-select flex-1 basis-32" aria-label="图片筛选：年级" :disabled="busy"><option :value="null">全部年级</option><option v-for="y in exportYears" :key="y" :value="y">{{ y }} 级</option></select>
                    <Button variant="outline" :disabled="busy" @click="exportPng"><Download class="mr-2 h-4 w-4" />导出 PNG</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <!-- 离屏渲染：导出 PNG 用。export-light 强制浅色，跟用户端看到的浅色版一致。
                 w-max + 内层 overflow-visible：排行榜表格在自然宽度下全量铺开，
                 题多的时候不能被横向滚动裁掉。 -->
            <div v-if="exportingPng" class="fixed -left-[6000px] top-0" aria-hidden="true">
              <div ref="pngHost" class="export-light w-max min-w-[960px] bg-background p-14 [&_.overflow-x-auto]:!overflow-visible">
                <div class="mb-7">
                  <p class="text-xl font-semibold text-foreground">
                    {{ detail.name }}{{ exportCollege ? ` · ${exportCollege}` : '' }}{{ exportYear !== null ? ` · ${exportYear} 级` : '' }}
                  </p>
                  <p class="mt-1 text-sm text-muted-foreground">
                    {{ detail.phase === 'finalized' ? '最终成绩' : '实时成绩' }} · sgu-acw.zh314.xyz
                  </p>
                </div>
                <CampLeaderboard :entries="exportEntries" :problems="detail.problems" />
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 p-4"><p class="text-xs text-muted-foreground">删除会清除题目、报名记录和最终成绩。</p><Button variant="outline" class="text-destructive" :disabled="busy" @click="removeCamp"><Trash2 class="mr-2 h-4 w-4" />删除集训</Button></div>
          </template>
          <div v-else-if="!activeId" class="flex flex-col items-center gap-3 py-20 text-muted-foreground"><Trophy class="h-8 w-8 opacity-40" /><p class="text-sm">选择一场集训，或新建集训</p></div>
        </div>
      </div>
    </template>
  </div>
</template>
