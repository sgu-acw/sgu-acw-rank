<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, LogIn, Trash2 } from 'lucide-vue-next'
import { Alert } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import ActionNotice from './ui/ActionNotice.vue'
import { ApiError, PLATFORM_META, signupApi, type SignupAnswer, type SignupSummary } from '../lib/api'
import { useAuth } from '../lib/auth'
import { confirmAction } from '../lib/confirm'
import { useNow } from '../lib/useNow'

const { user, ensureLoaded } = useAuth()

const id = ref<number | null>(null)
const signup = ref<SignupSummary | null>(null)
const now = useNow()
const currentStatus = computed(() => {
  const s = signup.value
  if (!s) return 'upcoming'
  if (now.value < Date.parse(s.open_at)) return 'upcoming'
  if (s.close_at && now.value >= Date.parse(s.close_at)) return 'closed'
  return 'open'
})
const answers = ref<Record<string, SignupAnswer>>({})
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const editing = ref(false) // 已报名的人改答案
let savedAnswers: Record<string, SignupAnswer> = {}
function cancelEdit() {
  if (busy.value) return
  answers.value = window.structuredClone(savedAnswers)
  editing.value = false
}
const yearEligible = computed(() => !signup.value?.required_years.length
  || (!!user.value && signup.value.required_years.includes(user.value.enroll_year)))

const canSubmit = computed(() => {
  if (!signup.value || currentStatus.value !== 'open') return false
  if (!user.value || !yearEligible.value || full.value) return false
  for (const f of signup.value.fields) {
    if (!f.required) continue
    const v = answers.value[f.key]
    if (f.type === 'checkbox') {
      if (!v) return false
    } else if (f.type === 'multiselect') {
      if (!Array.isArray(v) || !v.length) return false
    } else if (!v || String(v).trim() === '') {
      return false
    }
  }
  return true
})

const capacityText = computed(() => {
  const s = signup.value
  if (!s || s.capacity === null) return `${s?.entry_count ?? 0} 人报名`
  return `${s.entry_count} / ${s.capacity} 人报名`
})

const full = computed(
  () => !!signup.value && signup.value.capacity !== null
    && signup.value.entry_count >= signup.value.capacity && !signup.value.my_entry,
)

async function load() {
  if (!id.value) return
  loading.value = true
  error.value = ''
  try {
    signup.value = await signupApi.detail(id.value)
    const values: Record<string, SignupAnswer> = {}
    for (const f of signup.value.fields) {
      values[f.key] = f.type === 'checkbox' ? false : f.type === 'multiselect' ? [] : ''
    }
    if (signup.value.my_entry) {
      const mine = await signupApi.myEntry(id.value)
      for (const f of signup.value.fields) {
        const answer = mine.answers[f.key]
        if (answer !== undefined) values[f.key] = f.type === 'multiselect'
          ? (Array.isArray(answer) ? answer : []) : answer
      }
    }
    savedAnswers = window.structuredClone(values)
    answers.value = values
    editing.value = false
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '读取失败'
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (!id.value || busy.value || !canSubmit.value) return
  busy.value = true
  error.value = ''
  try {
    const r = await signupApi.submit(id.value, answers.value)
    notice.value = r.message
    window.setTimeout(() => { if (notice.value === r.message) notice.value = '' }, 3000)
    editing.value = false
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '提交失败'
  } finally {
    busy.value = false
  }
}

async function withdraw() {
  if (!id.value || busy.value || !signup.value?.my_entry) return
  if (!await confirmAction(`撤销「${signup.value.name}」的报名？`)) return
  busy.value = true
  error.value = ''
  try {
    await signupApi.withdraw(id.value)
    answers.value = {}
    await load()
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '撤销失败'
  } finally {
    busy.value = false
  }
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(async () => {
  const raw = new URLSearchParams(window.location.search).get('id')
  id.value = raw ? parseInt(raw, 10) : null
  await ensureLoaded()
  if (!id.value) {
    error.value = '缺少报名地址'
    loading.value = false
    return
  }
  await load()
})
</script>

<template>
  <div class="mx-auto w-full max-w-2xl space-y-4">
    <a href="/signups" class="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft class="h-4 w-4" />全部报名
    </a>

    <Alert v-if="error" variant="destructive" class="flex items-start gap-2">
      <AlertCircle class="h-4 w-4 shrink-0 translate-y-0.5" />
      <span class="text-sm">{{ error }}</span>
    </Alert>
    <ActionNotice :message="notice" />

    <div v-if="loading" class="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />正在读取…
    </div>

    <template v-else-if="signup">
      <div class="space-y-2">
        <div class="flex flex-wrap items-baseline gap-x-2">
          <h1 class="text-xl font-semibold">{{ signup.name }}</h1>
          <span
            class="text-xs font-medium"
            :class="{
              'text-emerald-600 dark:text-emerald-500': signup.my_entry,
              'text-primary': !signup.my_entry && currentStatus === 'open',
              'text-muted-foreground': currentStatus !== 'open' && !signup.my_entry,
            }"
          >
            {{ signup.my_entry ? '已报名' : currentStatus === 'open' ? '报名中' : currentStatus === 'upcoming' ? '未开始' : '已截止' }}
          </span>
        </div>
        <p class="text-sm text-muted-foreground">
          {{ fmt(signup.open_at) }} 开放<span v-if="signup.close_at"> · {{ fmt(signup.close_at) }} 截止</span>
          <span class="mx-1.5">·</span>{{ capacityText }}
        </p>
        <p v-if="signup.required_platforms?.length" class="text-sm text-muted-foreground">
          需要先绑定并验证这些平台的账号：
          <template v-for="(p, i) in signup.required_platforms" :key="p"><template v-if="i">、</template><span class="font-medium">{{ PLATFORM_META[p]?.label ?? p }}</span></template>
        </p>
        <p v-if="signup.required_years.length" class="text-sm text-muted-foreground">入学年级：{{ signup.required_years.join('、') }} 级</p>
        <p v-if="signup.description" class="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{{ signup.description }}</p>
      </div>

      <!-- 已报名：先看自己的答案 -->
      <Card v-if="signup.my_entry && !editing">
        <CardHeader class="pb-2">
          <CardTitle class="flex items-center gap-1.5 text-sm"><CheckCircle2 class="h-4 w-4 text-emerald-600 dark:text-emerald-500" />我的报名</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <dl class="space-y-2 text-sm">
            <div v-for="f in signup.fields" :key="f.key" class="flex justify-between gap-4">
              <dt class="shrink-0 text-muted-foreground">{{ f.label }}</dt>
              <dd class="min-w-0 text-right">
                {{ f.type === 'checkbox' ? (answers[f.key] ? '是' : '否') : Array.isArray(answers[f.key]) ? (answers[f.key] as string[]).join('、') || '—' : (answers[f.key] || '—') }}
              </dd>
            </div>
          </dl>
          <div v-if="currentStatus === 'open'" class="flex gap-2">
            <Button size="sm" variant="outline" :disabled="busy" @click="editing = true">修改报名信息</Button>
            <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" :disabled="busy" @click="withdraw">
              <Trash2 class="mr-1 h-3.5 w-3.5" />撤销报名
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- 表单：未报名的人填，已报名的点修改后也是这份 -->
      <Card v-else-if="currentStatus === 'open' && (!signup.my_entry || editing)">
        <CardContent class="space-y-4 py-5">
          <p v-if="full" class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">名额已满</p>
          <div v-else-if="!user" class="flex items-center gap-3">
            <LogIn class="h-4 w-4 text-muted-foreground" />
            <p class="mr-auto text-sm text-muted-foreground">登录后可以报名</p>
            <a href="/login" class="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">登录</a>
          </div>
          <p v-else-if="!yearEligible" class="text-sm text-muted-foreground">你的入学年级不在本次报名范围内。</p>
          <form v-else class="space-y-4" @submit.prevent="submit">
            <fieldset :disabled="busy" class="min-w-0 space-y-4">
            <div v-for="f in signup.fields" :key="f.key" class="space-y-1.5">
              <label :for="`signup-field-${f.key}`" class="block text-sm font-medium">
                {{ f.label }}
                <span v-if="f.required" class="text-destructive">*</span>
              </label>
              <p v-if="f.hint" class="text-xs text-muted-foreground">{{ f.hint }}</p>

              <Input
                v-if="f.type === 'text'"
                :id="`signup-field-${f.key}`"
                v-model="answers[f.key] as string"
                class="min-h-11"
                :placeholder="f.hint"
              />
              <textarea
                v-else-if="f.type === 'textarea'"
                :id="`signup-field-${f.key}`"
                v-model="answers[f.key] as string"
                rows="3"
                class="form-textarea"
                :placeholder="f.hint"
              />
              <Input
                v-else-if="f.type === 'number'"
                :id="`signup-field-${f.key}`"
                v-model="answers[f.key] as string"
                type="number"
                class="min-h-11"
              />
              <Input
                v-else-if="f.type === 'phone'"
                :id="`signup-field-${f.key}`"
                v-model="answers[f.key] as string"
                type="tel"
                inputmode="numeric"
                maxlength="11"
                placeholder="11 位手机号"
                class="min-h-11"
              />
              <Input
                v-else-if="f.type === 'email'"
                :id="`signup-field-${f.key}`"
                v-model="answers[f.key] as string"
                type="email"
                placeholder="name@example.com"
                class="min-h-11"
              />
              <select
                v-else-if="f.type === 'select'"
                :id="`signup-field-${f.key}`"
                v-model="answers[f.key] as string"
                class="form-select"
              >
                <option value="">请选择</option>
                <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
              </select>
              <div v-else-if="f.type === 'multiselect'" class="space-y-1">
                <label
                  v-for="o in f.options"
                  :key="o"
                  class="flex min-h-9 cursor-pointer items-center gap-2.5"
                >
                  <input
                    type="checkbox"
                    class="h-5 w-5 rounded border-input accent-primary"
                    :checked="(answers[f.key] as string[]).includes(o)"
                    @change="(e) => {
                      const arr = answers[f.key] as string[]
                      const on = (e.target as HTMLInputElement).checked
                      answers[f.key] = on ? [...arr, o] : arr.filter((v) => v !== o)
                    }"
                  />
                  <span class="text-sm">{{ o }}</span>
                </label>
              </div>
              <label v-else-if="f.type === 'checkbox'" class="flex min-h-11 cursor-pointer items-center gap-2.5">
                <input
                  v-model="answers[f.key] as boolean"
                  type="checkbox"
                  class="h-5 w-5 rounded border-input accent-primary"
                />
                <span class="text-sm">是</span>
              </label>
            </div>
            </fieldset>
            <div class="flex flex-wrap gap-2">
              <Button type="submit" :disabled="busy || !canSubmit">
                <Loader2 v-if="busy" class="mr-2 h-4 w-4 animate-spin" />
                {{ editing ? '保存修改' : '报名' }}
              </Button>
              <Button v-if="editing" variant="outline" :disabled="busy" @click="cancelEdit">取消</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card v-else-if="currentStatus === 'upcoming'">
        <CardContent class="py-6 text-center text-sm text-muted-foreground">
          报名还没开始，{{ fmt(signup.open_at) }} 开放
        </CardContent>
      </Card>
      <Card v-else-if="currentStatus === 'closed'">
        <CardContent class="py-6 text-center text-sm text-muted-foreground">报名已截止</CardContent>
      </Card>
    </template>
  </div>
</template>
