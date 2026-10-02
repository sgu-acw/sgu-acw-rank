<script setup lang="ts">
/**
 * 往题单里加题。
 *
 * 详情页和管理页都用这个。填平台和题号，题号离开焦点会自动去查题目名——
 * 光看「1004A」看不出是哪个平台的哪道题，填错了要到列表里才发现。
 * 查不到就标红并禁用按钮。
 */
import { ref } from 'vue'
import { AlertCircle, Check, Loader2 } from 'lucide-vue-next'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ApiError, PLATFORM_META, PROBLEM_KEY_HINT, problemListApi, type Platform } from '../lib/api'

const props = defineProps<{ listId: number }>()
const emit = defineEmits<{ added: [] }>()

const PLATFORMS = Object.keys(PLATFORM_META) as Platform[]

const platform = ref<Platform>('codeforces')
const key = ref('')
const note = ref('')
const adding = ref(false)
const error = ref('')

/** 题号校验结果。null 表示还没查过。 */
const lookup = ref<
  | null
  | { status: 'loading' }
  | { status: 'ok'; name: string; rating: number | null; tags: string[] }
  | { status: 'bad'; reason: string }
>(null)

async function check() {
  const value = key.value.trim()
  if (!value) {
    lookup.value = null
    return
  }

  lookup.value = { status: 'loading' }
  try {
    const result = await problemListApi.lookup(platform.value, value)
    if (result.missing_reason) {
      lookup.value = { status: 'bad', reason: result.missing_reason }
    } else {
      lookup.value = {
        status: 'ok',
        name: result.name,
        rating: result.rating,
        tags: result.tags,
      }
    }
  } catch (err) {
    lookup.value = {
      status: 'bad',
      reason: err instanceof ApiError ? err.message : '查询失败',
    }
  }
}

/** 换平台要重查，同一个题号在不同平台上是不同的题。 */
function onPlatformChange() {
  if (key.value.trim()) check()
}

async function submit() {
  const value = key.value.trim()
  if (!value || lookup.value?.status === 'bad') return

  adding.value = true
  error.value = ''
  try {
    await problemListApi.addProblem(props.listId, {
      platform: platform.value,
      key: value,
      note: note.value.trim(),
    })
    key.value = ''
    note.value = ''
    lookup.value = null
    emit('added')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '添加失败'
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2">
      <select
        v-model="platform"
        class="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
        @change="onPlatformChange"
      >
        <option v-for="p in PLATFORMS" :key="p" :value="p">{{ PLATFORM_META[p].label }}</option>
      </select>

      <Input
        v-model="key"
        :placeholder="PROBLEM_KEY_HINT[platform]"
        class="h-9 min-w-[160px] flex-1 font-mono text-sm"
        @blur="check"
        @keyup.enter="submit"
      />

      <Button
        size="sm"
        class="h-9"
        :disabled="adding || !key.trim() || lookup?.status === 'bad'"
        @click="submit"
      >
        <Loader2 v-if="adding" class="mr-1 h-3.5 w-3.5 animate-spin" />
        添加
      </Button>
    </div>

    <Input v-model="note" placeholder="备注（可选）" class="h-9 text-sm" />

    <div class="flex items-start gap-2 text-xs">
      <Loader2
        v-if="lookup?.status === 'loading'"
        class="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
      />
      <Check
        v-else-if="lookup?.status === 'ok'"
        class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500"
      />
      <AlertCircle
        v-else-if="lookup?.status === 'bad'"
        class="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
      />

      <span v-if="lookup?.status === 'loading'" class="text-muted-foreground">正在查题号…</span>
      <span v-else-if="lookup?.status === 'ok'" class="text-muted-foreground">
        <span class="font-medium text-foreground">{{ lookup.name }}</span>
        <span v-if="lookup.rating" class="ml-1.5 font-mono">★{{ lookup.rating }}</span>
        <span v-if="lookup.tags.length" class="ml-1.5">
          {{ lookup.tags.slice(0, 4).join(' · ') }}
        </span>
      </span>
      <span v-else-if="lookup?.status === 'bad'" class="text-destructive">
        {{ lookup.reason }}
      </span>
      <span v-else class="text-muted-foreground/60">填完题号离开输入框会自动查题目名</span>
    </div>

    <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
  </div>
</template>
