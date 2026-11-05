<script setup lang="ts">
import { Award, BadgeCheck } from 'lucide-vue-next'
import { computed } from 'vue'
import { medalKind } from '../lib/honorPresentation'

const props = defineProps<{ award: string; compact?: boolean }>()
const kind = computed(() => medalKind(props.award))
</script>

<template>
  <span class="honor-medal" :class="[kind, compact && 'compact']" role="img" :aria-label="award" :title="award">
    <Award v-if="kind !== 'honorable'" :stroke-width="1.6" aria-hidden="true" />
    <BadgeCheck v-else :stroke-width="1.6" aria-hidden="true" />
  </span>
</template>

<style scoped>
.honor-medal { position: relative; display: inline-flex; width: 44px; height: 52px; flex: none; align-items: center; justify-content: center; }
.honor-medal > svg { width: 38px; height: 38px; }
.gold { color: #946200; }
.silver { color: #58677d; }
.bronze { color: #9a4d24; }
.honorable { color: hsl(var(--muted-foreground)); flex-direction: column; gap: 2px; }
.gold :deep(circle) { fill: #fbe8a2; }
.silver :deep(circle) { fill: #e0e6ef; }
.bronze :deep(circle) { fill: #f3d3be; }
.compact { width: 28px; height: 32px; }
.compact > svg { width: 26px; height: 26px; }
:global(.dark .honor-medal.gold) { color: #e5ba55; }
:global(.dark .honor-medal.silver) { color: #bdc9dc; }
:global(.dark .honor-medal.bronze) { color: #dfa278; }
:global(.dark .honor-medal.gold circle) { fill: #4b3a19; }
:global(.dark .honor-medal.silver circle) { fill: #303a49; }
:global(.dark .honor-medal.bronze circle) { fill: #493125; }
@media (prefers-color-scheme: dark) {
  :global(:root:not(.light) .honor-medal.gold) { color: #e5ba55; }
  :global(:root:not(.light) .honor-medal.silver) { color: #bdc9dc; }
  :global(:root:not(.light) .honor-medal.bronze) { color: #dfa278; }
  :global(:root:not(.light) .honor-medal.gold circle) { fill: #4b3a19; }
  :global(:root:not(.light) .honor-medal.silver circle) { fill: #303a49; }
  :global(:root:not(.light) .honor-medal.bronze circle) { fill: #493125; }
}
</style>
