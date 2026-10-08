<script setup lang="ts">
/**
 * 文章管理。
 *
 * 左边是列表（新建在上），右边是编辑区：标题、slug、排序、正文
 * （所见即所得编辑器）、弹窗开关、上下架、删除。
 *
 * 弹窗开关做成一个明确的分区：「设为公告」意味着全站弹窗，和「文章
 * 本身写得好不好」是两件事，不混在一个表单里。
 */
import { computed, onMounted, ref } from 'vue'
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  Megaphone,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import PostEditor from './PostEditor.vue'
import {
  ApiError,
  postAdminApi,
  type AdminPostDetail,
  type AdminPostSummary,
} from '../lib/api'
import { useAuth } from '../lib/auth'

const { isAdmin, ensureLoaded } = useAuth()

const posts = ref<AdminPostSummary[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')

const activeId = ref<number | null>(null)
const detail = ref<AdminPostDetail | null>(null)
const detailLoading = ref(false)

// 新建/编辑
const editing = ref(false)
const editTitle = ref('')
const editSlug = ref('')
const editSort = ref(0)
const editBody = ref('')
const saving = ref(false)

// 弹窗
const popupUntil = ref('')
const togglingPopup = ref(false)
// 新建时直接发成公告
const createAsPopup = ref(false)

const isEditingExisting = computed(() => activeId.value !== null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    posts.value = await postAdminApi.list()
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
    detail.value = await postAdminApi.detail(id)
    editTitle.value = detail.value.title
    editSlug.value = detail.value.slug
    editSort.value = detail.value.sort_order
    editBody.value = detail.value.body
    popupUntil.value = detail.value.popup_until
      ? toLocalInput(detail.value.popup_until)
      : ''
    editing.value = false
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败'
  } finally {
    detailLoading.value = false
  }
}

function select(id: number) {
  activeId.value = id
  // 先把上一篇的内容清掉再让编辑器重 mount——detail/editBody 不先清
  // 的话，新编辑器 defaultValue 会吃到旧篇的正文（串扰）。
  detail.value = null
  editBody.value = ''
  editing.value = false
  void loadDetail(id)
}

function startNew() {
  activeId.value = null
  detail.value = null
  editTitle.value = ''
  editSlug.value = ''
  editSort.value = 0
  editBody.value = ''
  createAsPopup.value = false
  popupUntil.value = ''
  editing.value = true
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function save() {
  if (!editTitle.value.trim()) return
  saving.value = true
  error.value = ''
  try {
    if (isEditingExisting.value && detail.value) {
      await postAdminApi.update(detail.value.id, {
        title: editTitle.value.trim(),
        body: editBody.value,
        sort_order: editSort.value,
      })
      notice.value = '已保存'
    } else {
      const created = await postAdminApi.create({
        title: editTitle.value.trim(),
        body: editBody.value,
        sort_order: editSort.value,
        slug: editSlug.value.trim() || undefined,
      })
      // 勾了「发成公告」就顺手开弹窗——不用再去另一区块点一次
      if (createAsPopup.value) {
        await postAdminApi.setPopup(
          created.id,
          true,
          popupUntil.value ? new Date(popupUntil.value).toISOString() : undefined,
        )
        notice.value = '已发布并设为公告'
      } else {
        notice.value = '已创建'
      }
      activeId.value = created.id
      createAsPopup.value = false
      editing.value = false
    }
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!detail.value) return
  if (!window.confirm(`确定删除《${detail.value.title}》？`)) return
  try {
    await postAdminApi.remove(detail.value.id)
    detail.value = null
    activeId.value = null
    editing.value = false
    notice.value = '已删除'
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败'
  }
}

async function togglePopup(on: boolean) {
  if (!detail.value) return
  togglingPopup.value = true
  error.value = ''
  try {
    await postAdminApi.setPopup(
      detail.value.id,
      on,
      on && popupUntil.value ? new Date(popupUntil.value).toISOString() : undefined,
    )
    notice.value = on ? '已设为公告' : '已取消公告'
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '操作失败'
  } finally {
    togglingPopup.value = false
  }
}

async function togglePublish() {
  if (!detail.value) return
  const next = !detail.value.published
  try {
    await postAdminApi.setPublished(detail.value.id, next)
    notice.value = next ? '已上架' : '已下架'
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '操作失败'
  }
}

onMounted(async () => {
  await ensureLoaded()
  await load()
})
</script>

<template>
  <div class="mx-auto w-full max-w-5xl space-y-4">
    <AdminWorkspaceNav active="posts">
      <Button size="sm" class="h-7 gap-1 px-2 text-xs" @click="startNew">
        <Plus class="h-3.5 w-3.5" />
        写新的
      </Button>
    </AdminWorkspaceNav>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
    <p v-if="notice" class="text-sm text-muted-foreground">{{ notice }}</p>

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在读取…
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-[260px_1fr]">
      <!-- 左：列表 -->
      <Card>
        <CardContent class="p-1">
          <p v-if="!posts.length" class="px-3 py-6 text-center text-xs text-muted-foreground">
            还没有文章
          </p>
          <button
            v-for="post in posts"
            :key="post.id"
            type="button"
            class="row-action flex w-full items-center gap-2 rounded-md px-3 py-2 text-left"
            :class="activeId === post.id ? 'bg-accent' : ''"
            @click="select(post.id)"
          >
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-1.5 truncate text-sm font-medium">
                <Megaphone
                  v-if="post.is_popup"
                  class="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500"
                />
                {{ post.title }}
              </p>
              <p class="text-[11px] text-muted-foreground">
                {{ post.author_name || '—' }}
                <span v-if="!post.published"> · 已下架</span>
              </p>
            </div>
          </button>
        </CardContent>
      </Card>

      <!-- 右：编辑区 -->
      <div class="space-y-3">
        <p
          v-if="!editing && !detail"
          class="py-16 text-center text-sm text-muted-foreground"
        >
          左边选一篇，或者点「写新的」
        </p>

        <Card v-if="editing || detail">
          <CardHeader class="pb-2">
            <div class="flex items-center justify-between">
              <CardTitle class="text-sm font-medium">
                {{ isEditingExisting ? '编辑文章' : '新文章' }}
              </CardTitle>
              <div v-if="detail" class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-xs"
                  @click="togglePublish"
                >
                  <component :is="detail.published ? EyeOff : Eye" class="mr-1 h-3.5 w-3.5" />
                  {{ detail.published ? '下架' : '上架' }}
                </Button>
                <Button
                  v-if="isAdmin"
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  @click="remove"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="grid gap-2 sm:grid-cols-[1fr_180px_100px]">
              <Input v-model="editTitle" placeholder="标题" class="h-8 text-sm" />
              <Input
                v-model="editSlug"
                placeholder="slug（留空自动生成）"
                class="h-8 font-mono text-sm"
                :disabled="isEditingExisting"
              />
              <Input
                v-model.number="editSort"
                type="number"
                placeholder="排序"
                class="h-8 text-sm"
                title="大的排前面"
              />
            </div>

            <!-- 编辑器：v-if 保证每次新建/换文章都是全新实例 -->
            <PostEditor v-if="editing || detail" :key="activeId ?? 'new'" v-model="editBody" />

            <!-- 新建时就能发成公告，不用先保存再找开关 -->
            <div
              v-if="!isEditingExisting && isAdmin"
              class="flex flex-wrap items-center gap-3 rounded-md border border-border/50 bg-muted/20 px-3 py-2"
            >
              <label class="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  v-model="createAsPopup"
                  type="checkbox"
                  class="h-4 w-4 rounded border-input accent-primary"
                />
                <span class="flex items-center gap-1">
                  <Megaphone class="h-3.5 w-3.5" />
                  发布时设为公告
                </span>
              </label>
              <template v-if="createAsPopup">
                <label class="text-xs text-muted-foreground">自动下架</label>
                <Input v-model="popupUntil" type="datetime-local" class="h-7 w-auto text-xs" />
                <span class="text-[10px] text-muted-foreground/70">留空 = 手动关</span>
              </template>
            </div>

            <div class="flex items-center gap-2">
              <Button size="sm" :disabled="saving || !editTitle.trim()" @click="save">
                <Loader2 v-if="saving" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
                <Check v-else class="mr-1.5 h-3.5 w-3.5" />
                {{ isEditingExisting ? '保存' : '发布' }}
              </Button>
              <p v-if="isEditingExisting" class="text-[11px] text-muted-foreground/70">
                改了内容会推高版本号，开着弹窗的话确认过的人也会再看到一次
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- 公告开关：独立一块，只有管理员可见 -->
        <Card v-if="detail && isAdmin">
          <CardHeader class="pb-2">
            <CardTitle class="flex items-center gap-1.5 text-sm font-medium">
              <Megaphone class="h-4 w-4 text-muted-foreground" />
              公告弹窗
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <p class="text-xs text-muted-foreground">
              开着的公告会在全站弹一次。同一时刻只弹一篇——开这篇会自动关掉别的。
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                :variant="detail.is_popup ? 'secondary' : 'default'"
                :disabled="togglingPopup"
                @click="togglePopup(!detail.is_popup)"
              >
                <Loader2 v-if="togglingPopup" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {{ detail.is_popup ? '取消公告' : '设为公告' }}
              </Button>
              <template v-if="detail.is_popup">
                <label class="text-xs text-muted-foreground">自动下架</label>
                <Input
                  v-model="popupUntil"
                  type="datetime-local"
                  class="h-8 w-auto text-xs"
                />
                <span class="text-[11px] text-muted-foreground/70">留空 = 手动关</span>
              </template>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
