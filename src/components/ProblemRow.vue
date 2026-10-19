<script setup lang="ts">
/**
 * 题单里的一道题。详情页和管理页共用。
 *
 * 管理页比详情页多出几个按钮（上移、下移、改备注、移除），用 `editable`
 * 开关控制。两边的显示部分完全一样——题名、题号、平台、难度、标签——
 * 分开写迟早会长歪。
 */
import { Check, ExternalLink, Pencil, Trash2, X } from 'lucide-vue-next'
import { difficultyLabel } from '../lib/format'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { LEARN_PLATFORM, platformLabel, type ProblemEntry } from '../lib/api'

withDefaults(
  defineProps<{
    problem: ProblemEntry
    /** 显示完成状态。未登录时关掉——进度是个人数据。 */
    showProgress?: boolean
    /** 显示管理按钮。 */
    editable?: boolean
    /** 编辑中的备注，由父组件控制。 */
    editingNote?: boolean
    noteDraft?: string
  }>(),
  {
    showProgress: true,
    editable: false,
    editingNote: false,
    noteDraft: '',
  },
)

const emit = defineEmits<{
  editNote: []
  saveNote: []
  cancelNote: []
  remove: []
  'update:noteDraft': [value: string]
}>()


</script>

<template>
  <div
    class="flex items-start gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3"
    :class="problem.done && showProgress ? 'bg-emerald-500/5' : ''"
  >
    <!-- 完成状态。未登录时整块不渲染，避免显示成「全都没做」。 -->
    <span
      v-if="showProgress"
      class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]"
      :class="
        problem.done
          ? 'border-emerald-600/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          : 'border-border/50 text-transparent'
      "
      :title="problem.done ? '已解决' : '未解决'"
    >
      ✓
    </span>

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <a
          :href="problem.url"
          target="_blank"
          rel="noreferrer"
          class="text-sm font-medium underline-offset-4 transition-colors hover:text-primary hover:underline"
          :class="problem.done && showProgress ? 'text-emerald-700 dark:text-emerald-400' : ''"
        >
          {{ problem.name || problem.key }}
        </a>
        <span v-if="problem.platform !== LEARN_PLATFORM" class="shrink-0 font-mono text-[11px] text-muted-foreground/60">
          {{ problem.key }}
      </span>
        <span class="shrink-0 text-[11px] text-muted-foreground/70">
          {{ platformLabel(problem.platform) }}
        </span>
        <span
          v-if="difficultyLabel(problem.platform, problem.rating)"
          class="shrink-0 rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {{ difficultyLabel(problem.platform, problem.rating) }}
        </span>
      </div>

      <!-- 抓不到题目信息时说清原因，比空着让人以为是 bug 好 -->
      <p
        v-if="problem.missing_reason"
        class="mt-0.5 text-[11px] text-amber-600/80 dark:text-amber-500/80"
      >
        {{ problem.missing_reason }}
      </p>

      <!-- 备注。管理页可以就地改。 -->
      <div v-if="editingNote" class="mt-1.5 flex items-center gap-1.5">
        <Input
          :model-value="noteDraft"
          placeholder="备注，如「这题的重点是边界」"
          class="h-8 flex-1 text-xs"
          @update:model-value="emit('update:noteDraft', $event)"
          @keyup.enter="emit('saveNote')"
        />
        <Button size="sm" class="h-8" @click="emit('saveNote')">
          <Check class="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" class="h-8" @click="emit('cancelNote')">
          <X class="h-3.5 w-3.5" />
        </Button>
      </div>
      <p v-else-if="problem.note" class="mt-0.5 text-[11px] text-muted-foreground/70">
        {{ problem.note }}
      </p>

      <div v-if="problem.tags.length" class="mt-1 flex flex-wrap gap-1">
        <span
          v-for="tag in problem.tags"
          :key="tag"
          class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>
    </div>

    <!--
      管理按钮。排序靠拖拽，所以没有上移下移——两套并排会让人不知道
      该用哪个。
    -->
    <div v-if="editable" class="flex shrink-0 items-center gap-0.5">
      <Button variant="ghost" size="sm" title="改备注" @click="emit('editNote')">
        <Pencil class="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" title="从题单移除" @click="emit('remove')">
        <Trash2 class="h-3.5 w-3.5" />
      </Button>
    </div>

    <a
      v-else
      :href="problem.url"
      target="_blank"
      rel="noreferrer"
      class="shrink-0 rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
      title="去平台上做这道题"
    >
      <ExternalLink class="h-3.5 w-3.5" />
    </a>
  </div>
</template>
