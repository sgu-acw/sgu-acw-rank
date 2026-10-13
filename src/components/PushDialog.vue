<script setup lang="ts">
/**
 * 推送弹窗。
 *
 * 从文章管理里点「推送」弹出来：标题/正文/链接默认从当前文章带过来，
 * 改完直接发。受众分类：全体、管理员、年级、班级、某场集训的报名人、
 * 指定成员。班级和指定成员在前端解析成 user id 列表走 ``users:`` 群体。
 */
import { computed, onMounted, ref, watch } from 'vue'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'radix-vue'
import { Bell, Check, Loader2, Search } from 'lucide-vue-next'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ApiError, adminApi, campAdminApi, pushApi, type AdminUser, type CampSummary } from '../lib/api'

const props = defineProps<{
  open: boolean
  /** 初始标题/链接——通常从文章带过来。 */
  initialTitle?: string
  initialUrl?: string
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const title = ref('')
const body = ref('')
const url = ref('/')
const category = ref<'all' | 'admins' | 'year' | 'class' | 'camp' | 'users'>('all')
const year = ref<number | null>(null)
const classKey = ref('')
const campId = ref<number | null>(null)
const years = ref<number[]>([])
const camps = ref<CampSummary[]>([])
const allUsers = ref<AdminUser[]>([])

// 指定成员：搜索 + 勾选
const search = ref('')
const picked = ref<AdminUser[]>([])

const searchResults = computed(() => {
  const q = search.value.trim().toLowerCase()
  const pool = q
    ? allUsers.value.filter(
        (u) =>
          u.display_name.toLowerCase().includes(q) ||
          u.student_id.includes(q) ||
          (u.class_label ?? '').toLowerCase().includes(q),
      )
    : []
  return pool.slice(0, 10)
})

const classGroups = computed(() => {
  const map = new Map<string, AdminUser[]>()
  for (const u of allUsers.value) {
    const label = u.class_label?.trim()
    if (!label) continue
    const list = map.get(label) ?? []
    list.push(u)
    map.set(label, list)
  }
  return [...map.entries()]
    .map(([label, users]) => ({ label, users }))
    .sort((a, b) => b.label.localeCompare(a.label))
})

const sending = ref(false)
const result = ref('')
const error = ref('')

watch(
  () => props.open,
  (v) => {
    if (v) {
      title.value = props.initialTitle ?? ''
      url.value = props.initialUrl ?? '/'
      result.value = ''
      error.value = ''
    }
  },
)

onMounted(async () => {
  try {
    camps.value = await campAdminApi.list()
  } catch {
    camps.value = []
  }
  try {
    const page = await adminApi.users({ page_size: 500 })
    allUsers.value = page.items
    years.value = page.enroll_years.length
      ? [...page.enroll_years].sort((a, b) => b - a)
      : [...new Set(page.items.map((u) => u.enroll_year).filter((y): y is number => !!y))].sort(
          (a, b) => b - a,
        )
  } catch {
    allUsers.value = []
  }
})

function togglePick(u: AdminUser) {
  const i = picked.value.findIndex((x) => x.id === u.id)
  if (i >= 0) picked.value.splice(i, 1)
  else picked.value.push(u)
}
function isPicked(u: AdminUser): boolean {
  return picked.value.some((x) => x.id === u.id)
}

function audienceString(): string {
  if (category.value === 'year') return year.value !== null ? `year:${year.value}` : ''
  if (category.value === 'camp') return campId.value !== null ? `camp:${campId.value}` : ''
  if (category.value === 'class') {
    const g = classGroups.value.find((x) => x.label === classKey.value)
    return g ? `users:${g.users.map((u) => u.id).join(',')}` : ''
  }
  if (category.value === 'users') {
    return picked.value.length ? `users:${picked.value.map((u) => u.id).join(',')}` : ''
  }
  return category.value
}

function audienceLabel(): string {
  if (category.value === 'all') return '全体成员'
  if (category.value === 'admins') return '全体管理员'
  if (category.value === 'year') return `${year.value} 级`
  if (category.value === 'class') return `${classKey.value} 的 ${classGroups.value.find((x) => x.label === classKey.value)?.users.length ?? 0} 人`
  if (category.value === 'users') return `${picked.value.length} 位成员`
  return camps.value.find((c) => c.id === campId.value)?.name ?? ''
}

async function send() {
  const audience = audienceString()
  if (!title.value.trim() || !audience) {
    error.value = '标题和群体都得有'
    return
  }
  sending.value = true
  error.value = ''
  result.value = ''
  try {
    const r = await pushApi.announce({
      title: title.value.trim(),
      body: body.value.trim(),
      url: url.value.trim() || '/',
      audience,
    })
    result.value = `已发给${audienceLabel()}：送达 ${r.sent} 台设备`
    if (r.failed || r.dead) result.value += `（失败 ${r.failed}，过期清理 ${r.dead}）`
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '推送失败'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[100] bg-black/40" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[101] max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-popover p-6 shadow-xl">
        <DialogTitle class="flex items-center gap-1.5 text-base font-semibold">
          <Bell class="h-4 w-4" />推送通知
        </DialogTitle>
        <DialogDescription class="mt-2 text-sm text-muted-foreground">
          发到开了通知的设备上，页面关着也能收到。
        </DialogDescription>

        <div class="mt-4 space-y-3">
          <Input v-model="title" placeholder="通知标题" maxlength="80" class="min-h-11" />
          <textarea
            v-model="body"
            rows="2"
            placeholder="正文（可选）"
            maxlength="300"
            class="w-full rounded-md border border-input bg-background p-3 text-sm"
          />
          <Input v-model="url" placeholder="点通知打开的地址，如 /post/xxx" maxlength="200" class="min-h-11" />

          <div class="space-y-2">
            <p class="text-xs font-medium text-muted-foreground">发给</p>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="c in [
                  { key: 'all', label: '全体成员' },
                  { key: 'admins', label: '全体管理员' },
                  { key: 'year', label: '按年级' },
                  { key: 'class', label: '按班级' },
                  { key: 'camp', label: '集训报名人' },
                  { key: 'users', label: '指定成员' },
                ]"
                :key="c.key"
                type="button"
                class="min-h-10 rounded-md border text-sm transition-colors"
                :class="category === c.key ? 'border-primary bg-primary/10 font-medium' : 'border-input text-muted-foreground hover:text-foreground'"
                @click="category = c.key as typeof category"
              >
                {{ c.label }}
              </button>
            </div>

            <select
              v-if="category === 'year'"
              v-model="year"
              class="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option :value="null" disabled>选年级</option>
              <option v-for="y in years" :key="y" :value="y">{{ y }} 级</option>
            </select>
            <select
              v-else-if="category === 'class'"
              v-model="classKey"
              class="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="" disabled>选班级</option>
              <option v-for="g in classGroups" :key="g.label" :value="g.label">{{ g.label }}（{{ g.users.length }} 人）</option>
            </select>
            <select
              v-else-if="category === 'camp'"
              v-model="campId"
              class="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option :value="null" disabled>选集训</option>
              <option v-for="c in camps" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>

            <!-- 指定成员：搜索 + 勾选 -->
            <div v-else-if="category === 'users'" class="space-y-2">
              <div class="relative">
                <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input v-model="search" placeholder="按姓名、学号、班级搜" class="min-h-11 pl-9" />
              </div>
              <div v-if="searchResults.length" class="max-h-40 divide-y divide-border/40 overflow-y-auto rounded-md border border-input">
                <button
                  v-for="u in searchResults"
                  :key="u.id"
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50"
                  @click="togglePick(u)"
                >
                  <span
                    class="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                    :class="isPicked(u) ? 'border-primary bg-primary text-primary-foreground' : 'border-input'"
                  >
                    <Check v-if="isPicked(u)" class="h-3 w-3" />
                  </span>
                  <span class="truncate">{{ u.display_name }}</span>
                  <span class="ml-auto shrink-0 text-xs text-muted-foreground">{{ u.class_label || u.student_id }}</span>
                </button>
              </div>
              <p v-else-if="search" class="px-1 text-xs text-muted-foreground">没搜到</p>
              <div v-if="picked.length" class="flex flex-wrap gap-1.5">
                <button
                  v-for="u in picked"
                  :key="u.id"
                  type="button"
                  class="rounded-full border border-border/60 px-2.5 py-0.5 text-xs hover:border-destructive/50 hover:text-destructive"
                  title="点掉移除"
                  @click="togglePick(u)"
                >
                  {{ u.display_name }}
                </button>
              </div>
            </div>
          </div>

          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
          <p v-else-if="result" class="text-sm text-emerald-600 dark:text-emerald-500">{{ result }}</p>

          <div class="flex justify-end gap-2 pt-1">
            <Button variant="outline" class="min-h-11" @click="emit('update:open', false)">关闭</Button>
            <Button class="min-h-11" :disabled="sending || !title.trim() || !audienceString()" @click="send">
              <Loader2 v-if="sending" class="mr-1.5 h-4 w-4 animate-spin" />
              推送{{ audienceString() && category !== 'all' && category !== 'admins' ? `（${audienceLabel()}）` : '' }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
