<script setup lang="ts">
/**
 * 集训管理。
 *
 * 左边是集训列表（新建在上），右边是选中那一份的编辑区：
 * 改名改时间、加题删题、看报名名单、手动加人、导出、删除。
 */
import { computed, onMounted, ref } from 'vue'
import {
  Check,
  Download,
  Loader2,
  Plus,
  Search,
  Trash2,
  Trophy,
  UserPlus,
  X,
} from 'lucide-vue-next'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import {
  adminApi,
  ApiError,
  campAdminApi,
  PLATFORM_META,
  problemListApi,
  type AdminUser,
  type CampAdminDetail,
  type CampSummary,
  type Platform,
} from '../lib/api'

const camps = ref<CampSummary[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')

const activeId = ref<number | null>(null)
const detail = ref<CampAdminDetail | null>(null)
const detailLoading = ref(false)

// 新建表单
const creating = ref(false)
function toLocalInput(iso: string): string {
  // datetime-local 要的是本地时间的 YYYY-MM-DDTHH:mm
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const newName = ref('')
const newDesc = ref('')
// 默认「现在开始、两小时后结束」——常见集训时长，少调两个字段
const newStart = ref(toLocalInput(new Date().toISOString()))
const newEnd = ref(toLocalInput(new Date(Date.now() + 2 * 3600 * 1000).toISOString()))

// 编辑表单（选中一份后填充）
const editName = ref('')
const editDesc = ref('')
const editStart = ref('')
const editEnd = ref('')
const saving = ref(false)

// 加题
const PLATFORMS = Object.keys(PLATFORM_META) as Platform[]
const newPlatform = ref<Platform>('codeforces')
const newKey = ref('')
const addingProblem = ref(false)
const problemError = ref('')
const lookup = ref<
  | null
  | { status: 'loading' }
  | { status: 'ok'; name: string; rating: number | null }
  | { status: 'bad'; reason: string }
>(null)

// 加人
const memberQuery = ref('')
const memberResults = ref<AdminUser[]>([])
const searching = ref(false)

function fromLocalInput(v: string): string {
  return new Date(v).toISOString()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    camps.value = await campAdminApi.list()
    if (activeId.value) await loadDetail(activeId.value)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadDetail(id: number) {
  detailLoading.value = true
  try {
    detail.value = await campAdminApi.detail(id)
    editName.value = detail.value.name
    editDesc.value = detail.value.description
    editStart.value = toLocalInput(detail.value.start_at)
    editEnd.value = toLocalInput(detail.value.end_at)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  } finally {
    detailLoading.value = false
  }
}

function select(id: number) {
  activeId.value = id
  memberResults.value = []
  memberQuery.value = ''
  newKey.value = ''
  lookup.value = null
  void loadDetail(id)
}

async function create() {
  if (!newName.value.trim() || !newStart.value || !newEnd.value) return
  creating.value = true
  error.value = ''
  try {
    const camp = await campAdminApi.create({
      name: newName.value.trim(),
      description: newDesc.value.trim(),
      start_at: fromLocalInput(newStart.value),
      end_at: fromLocalInput(newEnd.value),
    })
    newName.value = ''
    newDesc.value = ''
    // 创建完重置回「现在 + 两小时」——下一次新建又是现成的
    newStart.value = toLocalInput(new Date().toISOString())
    newEnd.value = toLocalInput(new Date(Date.now() + 2 * 3600 * 1000).toISOString())
    notice.value = '已创建'
    await load()
    select(camp.id)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '创建失败'
  } finally {
    creating.value = false
  }
}

async function save() {
  if (!detail.value) return
  saving.value = true
  error.value = ''
  try {
    await campAdminApi.update(detail.value.id, {
      name: editName.value.trim(),
      description: editDesc.value.trim(),
      start_at: fromLocalInput(editStart.value),
      end_at: fromLocalInput(editEnd.value),
    })
    notice.value = '已保存'
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function removeCamp() {
  if (!detail.value || !window.confirm(`确定删除「${detail.value.name}」？题目和报名记录一起删。`)) return
  try {
    await campAdminApi.remove(detail.value.id)
    detail.value = null
    activeId.value = null
    notice.value = '已删除'
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败'
  }
}

async function checkProblem() {
  const value = newKey.value.trim()
  if (!value) {
    lookup.value = null
    return
  }
  lookup.value = { status: 'loading' }
  try {
    const r = await problemListApi.lookup(newPlatform.value, value)
    lookup.value = r.missing_reason
      ? { status: 'bad', reason: r.missing_reason }
      : { status: 'ok', name: r.name, rating: r.rating }
  } catch (err) {
    lookup.value = { status: 'bad', reason: err instanceof ApiError ? err.message : '查询失败' }
  }
}

async function addProblem() {
  if (!detail.value || !newKey.value.trim() || lookup.value?.status === 'bad') return
  addingProblem.value = true
  problemError.value = ''
  try {
    await campAdminApi.addProblem(detail.value.id, newPlatform.value, newKey.value.trim())
    newKey.value = ''
    lookup.value = null
    await loadDetail(detail.value.id)
  } catch (err) {
    problemError.value = err instanceof ApiError ? err.message : '添加失败'
  } finally {
    addingProblem.value = false
  }
}

async function removeProblem(problemId: number) {
  if (!detail.value) return
  try {
    await campAdminApi.removeProblem(detail.value.id, problemId)
    await loadDetail(detail.value.id)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败'
  }
}

async function searchMembers() {
  if (!memberQuery.value.trim()) return
  searching.value = true
  try {
    const page = await adminApi.users({ q: memberQuery.value.trim(), page_size: 8 })
    memberResults.value = page.items
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '搜索失败'
  } finally {
    searching.value = false
  }
}

async function addMember(userId: number) {
  if (!detail.value) return
  try {
    await campAdminApi.addMember(detail.value.id, userId)
    await loadDetail(detail.value.id)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '添加失败'
  }
}

async function removeMember(userId: number) {
  if (!detail.value) return
  try {
    await campAdminApi.removeMember(detail.value.id, userId)
    await loadDetail(detail.value.id)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '移除失败'
  }
}

const registeredIds = computed(
  () => new Set(detail.value?.registrations.map((r) => r.user_id) ?? []),
)

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-4">
    <AdminWorkspaceNav active="camps" />

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <p v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</p>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-[280px_1fr]">
      <!-- 左：集训列表 + 新建 -->
      <div class="space-y-3">
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium">新建集训</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2">
            <Input v-model="newName" placeholder="名称" class="h-8 text-sm" />
            <Input v-model="newDesc" placeholder="说明（可选）" class="h-8 text-sm" />
            <label class="block text-xs text-muted-foreground">开始时间</label>
            <Input v-model="newStart" type="datetime-local" class="h-8 text-sm" />
            <label class="block text-xs text-muted-foreground">截止时间</label>
            <Input v-model="newEnd" type="datetime-local" class="h-8 text-sm" />
            <Button
              size="sm"
              class="w-full"
              :disabled="creating || !newName.trim() || !newStart || !newEnd"
              @click="create"
            >
              <Loader2 v-if="creating" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
              <Plus v-else class="mr-1.5 h-3.5 w-3.5" />
              创建
            </Button>
          </CardContent>
        </Card>

        <Card v-if="camps.length">
          <CardContent class="p-1">
            <button
              v-for="camp in camps"
              :key="camp.id"
              type="button"
              class="row-action flex w-full items-center gap-2 rounded-md px-3 py-2 text-left"
              :class="activeId === camp.id ? 'bg-accent' : ''"
              @click="select(camp.id)"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ camp.name }}</p>
                <p class="text-[11px] text-muted-foreground">
                  {{ camp.registration_count }} 人 · {{ camp.problem_count }} 题
                  <span v-if="camp.ended"> · 已结束</span>
                  <span v-else-if="camp.started"> · 进行中</span>
                  <span v-else> · 未开始</span>
                </p>
              </div>
            </button>
          </CardContent>
        </Card>

        <p v-else class="px-1 text-xs text-muted-foreground">还没有集训</p>
      </div>

      <!-- 右：选中集训的编辑区 -->
      <div class="space-y-3">
        <div
          v-if="!detail && !detailLoading"
          class="flex flex-col items-center gap-2 py-16 text-muted-foreground"
        >
          <Trophy class="h-8 w-8 text-muted-foreground/40" />
          <p class="text-sm">选一份集训，或者在左边新建</p>
        </div>

        <div v-else-if="detailLoading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 class="h-4 w-4 animate-spin" />
          正在读取…
        </div>

        <template v-else-if="detail">
          <!-- 基本信息 -->
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center justify-between">
                <CardTitle class="text-sm font-medium">基本信息</CardTitle>
                <div class="flex items-center gap-1">
                  <!-- 导出。直接链过去让浏览器下载，cookie 自带。 -->
                  <a
                    v-for="fmt in ['xlsx', 'csv', 'json']"
                    :key="fmt"
                    :href="`/api/admin/camps/${detail.id}/export?format=${fmt}`"
                    class="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Download class="h-3 w-3" />
                    {{ fmt.toUpperCase() }}
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    @click="removeCamp"
                  >
                    <Trash2 class="mr-1 h-3 w-3" />
                    删除
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent class="space-y-2">
              <Input v-model="editName" placeholder="名称" class="h-8 text-sm" />
              <Input v-model="editDesc" placeholder="说明" class="h-8 text-sm" />
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="mb-1 block text-xs text-muted-foreground">开始时间</label>
                  <Input v-model="editStart" type="datetime-local" class="h-8 text-sm" />
                </div>
                <div>
                  <label class="mb-1 block text-xs text-muted-foreground">截止时间</label>
                  <Input v-model="editEnd" type="datetime-local" class="h-8 text-sm" />
                </div>
              </div>
              <Button size="sm" :disabled="saving" @click="save">
                <Loader2 v-if="saving" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
                保存
              </Button>
            </CardContent>
          </Card>

          <!-- 题目 -->
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium">
                题目
                <span class="ml-1 font-normal text-muted-foreground">{{ detail.problems.length }}</span>
              </CardTitle>
            </CardHeader>
            <CardContent class="space-y-2">
              <div v-if="detail.problems.length" class="divide-y divide-border/40 rounded-md border border-border/40">
                <div
                  v-for="p in detail.problems"
                  :key="p.id"
                  class="flex items-center gap-2 px-3 py-2"
                >
                  <span class="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">
                    {{ PLATFORM_META[p.platform]?.label ?? p.platform }}
                  </span>
                  <span class="min-w-0 flex-1 truncate font-mono text-sm">{{ p.key }}</span>
                  <button
                    type="button"
                    class="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    @click="removeProblem(p.id)"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p v-else class="text-xs text-muted-foreground">还没出题</p>

              <div class="flex items-center gap-2">
                <select
                  v-model="newPlatform"
                  class="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  @change="checkProblem"
                >
                  <option v-for="p in PLATFORMS" :key="p" :value="p">
                    {{ PLATFORM_META[p]?.label ?? p }}
                  </option>
                </select>
                <Input
                  v-model="newKey"
                  placeholder="题号，如 1838A / P1001"
                  class="h-8 flex-1 text-sm"
                  @blur="checkProblem"
                  @keyup.enter="checkProblem"
                />
                <Button
                  size="sm"
                  :disabled="addingProblem || !newKey.trim() || lookup?.status === 'bad'"
                  @click="addProblem"
                >
                  <Loader2 v-if="addingProblem" class="h-3.5 w-3.5 animate-spin" />
                  <Plus v-else class="h-3.5 w-3.5" />
                </Button>
              </div>
              <p v-if="lookup?.status === 'loading'" class="text-xs text-muted-foreground">
                正在查题目…
              </p>
              <p v-else-if="lookup?.status === 'ok'" class="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-500">
                <Check class="h-3 w-3" />
                {{ lookup.name }}<span v-if="lookup.rating" class="text-muted-foreground">（{{ lookup.rating }}）</span>
              </p>
              <p v-else-if="lookup?.status === 'bad'" class="text-xs text-destructive">
                {{ lookup.reason }}
              </p>
              <p v-if="problemError" class="text-xs text-destructive">{{ problemError }}</p>
            </CardContent>
          </Card>

          <!-- 报名名单 -->
          <Card>
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium">
                报名名单
                <span class="ml-1 font-normal text-muted-foreground">{{ detail.registrations.length }}</span>
              </CardTitle>
            </CardHeader>
            <CardContent class="space-y-2">
              <div v-if="detail.registrations.length" class="divide-y divide-border/40 rounded-md border border-border/40">
                <div
                  v-for="r in detail.registrations"
                  :key="r.user_id"
                  class="flex items-center gap-2 px-3 py-2"
                >
                  <span class="min-w-0 flex-1 truncate text-sm">{{ r.display_name }}</span>
                  <button
                    type="button"
                    class="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    @click="removeMember(r.user_id)"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p v-else class="text-xs text-muted-foreground">还没人报名</p>

              <div class="flex items-center gap-2">
                <Input
                  v-model="memberQuery"
                  placeholder="按姓名或学号找人"
                  class="h-8 flex-1 text-sm"
                  @keyup.enter="searchMembers"
                />
                <Button size="sm" variant="secondary" :disabled="searching" @click="searchMembers">
                  <Loader2 v-if="searching" class="h-3.5 w-3.5 animate-spin" />
                  <Search v-else class="h-3.5 w-3.5" />
                </Button>
              </div>
              <div v-if="memberResults.length" class="divide-y divide-border/40 rounded-md border border-border/40">
                <div
                  v-for="u in memberResults"
                  :key="u.id"
                  class="flex items-center gap-2 px-3 py-2"
                >
                  <span class="min-w-0 flex-1 truncate text-sm">
                    {{ u.display_name }}
                    <span class="font-mono text-xs text-muted-foreground">{{ u.student_id }}</span>
                  </span>
                  <button
                    v-if="!registeredIds.has(u.id)"
                    type="button"
                    class="flex shrink-0 items-center gap-1 text-xs text-primary transition-colors hover:underline"
                    @click="addMember(u.id)"
                  >
                    <UserPlus class="h-3.5 w-3.5" />
                    加人
                  </button>
                  <span v-else class="shrink-0 text-xs text-muted-foreground">已报名</span>
                </div>
              </div>
              <p class="text-[11px] text-muted-foreground/70">
                手动加人不受账号限制——他报不上名时的兜底办法
              </p>
            </CardContent>
          </Card>

          <!-- 榜单。管理员这里也要看——不然得翻到前台页面。 -->
          <Card v-if="detail.leaderboard.length">
            <CardHeader class="pb-2">
              <CardTitle class="text-sm font-medium">
                榜单
                <span class="ml-1 font-normal text-muted-foreground">{{ detail.leaderboard.length }} 人</span>
              </CardTitle>
            </CardHeader>
            <CardContent class="p-0">
              <div class="overflow-x-auto border-t border-border/40">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-border/40 text-left text-xs text-muted-foreground">
                      <th class="w-10 px-3 py-2 text-center font-medium">#</th>
                      <th class="px-3 py-2 font-medium">姓名</th>
                      <th class="px-3 py-2 text-right font-medium">过题</th>
                      <th
                        v-for="p in detail.problems"
                        :key="`${p.platform}:${p.key}`"
                        class="px-2 py-2 text-center font-mono text-[10px] font-medium"
                        :title="`${p.platform}:${p.key}`"
                      >
                        {{ p.key }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border/40">
                    <tr v-for="entry in detail.leaderboard" :key="entry.user_id">
                      <td
                        class="px-3 py-2.5 text-center font-mono text-xs"
                        :class="entry.rank <= 3 ? 'font-semibold text-foreground' : 'text-muted-foreground'"
                      >
                        {{ entry.rank }}
                      </td>
                      <td class="px-3 py-2.5">
                        <span class="font-medium">{{ entry.display_name }}</span>
                        <span v-if="entry.class_label" class="ml-1.5 text-[11px] text-muted-foreground/70">
                          {{ entry.class_label }}
                        </span>
                      </td>
                      <td class="px-3 py-2.5 text-right font-mono text-sm">
                        {{ entry.solved_count }}
                      </td>
                      <td
                        v-for="p in detail.problems"
                        :key="`${p.platform}:${p.key}`"
                        class="px-2 py-2.5 text-center"
                      >
                        <span
                          class="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                          :class="
                            entry.per_problem[`${p.platform}:${p.key}`]
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'text-muted-foreground/30'
                          "
                        >
                          {{ entry.per_problem[`${p.platform}:${p.key}`] ? '✓' : '—' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </template>
      </div>
    </div>
  </div>
</template>
