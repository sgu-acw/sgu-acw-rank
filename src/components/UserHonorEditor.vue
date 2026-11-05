<script setup lang="ts">
import { onUnmounted, reactive, ref, watch } from 'vue'
import { honorsApi, type HonorUser } from '../lib/honors'
import ActionNotice from './ui/ActionNotice.vue'
import RefreshButton from './ui/RefreshButton.vue'
import { Button } from './ui/button'
import { Input } from './ui/input'

const props = defineProps<{ userId: number }>()
const emit = defineEmits<{ saved: [profile: HonorUser]; busyChange: [busy: boolean] }>()
const profile = ref<HonorUser | null>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const draft = reactive({ former_names: '', study_start: '', study_end: '' })
let sequence = 0
function reset() {
  if (!profile.value || busy.value) return
  draft.former_names = profile.value.former_names.join('、')
  draft.study_start = profile.value.study_start || ''
  draft.study_end = profile.value.study_end || ''
  error.value = notice.value = ''
}
async function load() {
  if (busy.value) return
  const request = ++sequence
  loading.value = true
  error.value = notice.value = ''
  profile.value = null
  try {
    const data = await honorsApi.userProfile(props.userId)
    if (request !== sequence) return
    profile.value = data
    reset()
  } catch (e) {
    if (request === sequence) error.value = e instanceof Error ? e.message : '读取失败'
  } finally {
    if (request === sequence) loading.value = false
  }
}
async function save() {
  if (busy.value || !profile.value || profile.value.id !== props.userId) return
  const id = props.userId
  const request = sequence
  busy.value = true
  emit('busyChange', true)
  error.value = notice.value = ''
  try {
    const data = await honorsApi.saveUserProfile(id, {
      former_names: draft.former_names.split(/[、,，\n]/).map((n) => n.trim()).filter(Boolean),
      study_start: draft.study_start || null,
      study_end: draft.study_end || null,
      revision: profile.value.revision,
    })
    if (request !== sequence || id !== props.userId) return
    profile.value = data
    draft.former_names = data.former_names.join('、')
    notice.value = '用户获奖资料已保存；候选匹配和在校时间已重新计算'
    emit('saved', data)
  } catch (e) {
    if (request === sequence) error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    busy.value = false
    emit('busyChange', false)
  }
}
watch(() => props.userId, load, { immediate: true })
onUnmounted(() => { sequence++; emit('busyChange', false) })
</script>

<template>
  <div class="min-w-0 space-y-3">
    <h3 class="font-medium">曾用名与在校时间</h3>
    <ActionNotice :message="error" variant="error" />
    <ActionNotice :message="notice" />
    <p v-if="loading" class="text-sm text-muted-foreground" role="status">正在读取用户资料…</p>
    <RefreshButton v-else-if="!profile" :busy="loading" @click="load" />
    <form v-else class="space-y-4" @submit.prevent="save">
      <p class="break-words text-sm">{{ profile.display_name }} · {{ profile.student_id }}</p>
      <fieldset class="min-w-0 space-y-3" :disabled="busy">
        <label class="block space-y-1 text-sm">
          曾用名（用顿号分隔）
          <Input v-model="draft.former_names" placeholder="例如：名单中的旧姓名" />
        </label>
        <p class="text-xs text-muted-foreground">审核页同时匹配当前姓名和曾用名，候选需要管理员确认。</p>
        <label class="block space-y-1 text-sm">
          入学日期（可覆盖默认值）
          <Input v-model="draft.study_start" type="date" />
        </label>
        <label class="block space-y-1 text-sm">
          离校日期（不含当天）
          <Input v-model="draft.study_end" type="date" />
        </label>
        <p class="text-xs text-muted-foreground">
          入学日期留空使用入学年 9 月 1 日，离校日期留空默认四年。目前保存的计入区间：
          {{ profile.effective_study_start || '待核实' }} 至 {{ profile.effective_study_end || '待核实' }}（不含离校当天）。
        </p>
      </fieldset>
      <div class="flex flex-wrap gap-2">
        <Button type="submit" :disabled="busy">保存用户获奖资料</Button>
        <Button variant="outline" :disabled="busy" @click="reset">取消修改</Button>
      </div>
    </form>
  </div>
</template>
