<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
  fetchOneUserInfoStructured,
  fetchUserRating,
  getRatingHexColor,
} from '../lib/cfapi'
import type { User } from '../lib/interfaces/cfapi'
import { Card, CardContent } from './ui/card'
import { Avatar } from './ui/avatar'
import { Separator } from './ui/separator'
import { Input } from './ui/input'

const searchHandle = ref('')
const user = ref<User | null>(null)
const ratingHistory = ref<number[]>([])
const hasSearched = ref(false)

const rankColor = computed(() => {
  return user.value ? getRatingHexColor(user.value.rating) : undefined
})

// SVG Sparkline — smooth Catmull-Rom spline
function catmullRomToBezier(points: [number, number][]): string {
  if (points.length < 2) return ''
  const d: string[] = [`M ${points[0][0]},${points[0][1]}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    d.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`)
  }
  return d.join(' ')
}

function getSparklinePoints(data: number[]): [number, number][] {
  const width = 600
  const height = 100
  const padding = 8
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  return data.map((val, i) => [
    padding + (i / (data.length - 1)) * (width - 2 * padding),
    padding + (1 - (val - min) / range) * (height - 2 * padding),
  ])
}

const sparklinePath = computed(() => {
  const data = ratingHistory.value
  if (data.length < 2) return ''
  return catmullRomToBezier(getSparklinePoints(data))
})

const sparklineAreaPath = computed(() => {
  const data = ratingHistory.value
  if (data.length < 2) return ''
  const points = getSparklinePoints(data)
  const width = 600
  const height = 100
  const padding = 8
  const firstX = padding
  const lastX = padding + (width - 2 * padding)
  const curvePath = catmullRomToBezier(points)
  return `${curvePath} L ${lastX},${height} L ${firstX},${height} Z`
})

async function searchUser() {
  if (!searchHandle.value) return
  hasSearched.value = true
  try {
    user.value = await fetchOneUserInfoStructured(searchHandle.value)
    const ratingChanges = await fetchUserRating(searchHandle.value)
    ratingHistory.value = ratingChanges.map((change) => change.newRating)
  } catch (error) {
    console.error('Failed to fetch user info or rating history:', error)
    user.value = null
    ratingHistory.value = []
  }
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const handle = params.get('handle')
  if (handle) {
    searchHandle.value = handle
    await searchUser()
  }
})
</script>

<template>
  <div class="flex items-center justify-center min-h-[50vh]">
    <!-- Profile Card -->
    <Card v-if="user" class="w-full max-w-[600px] p-6">
      <div class="flex flex-col md:flex-row items-center gap-6">
        <Avatar :src="user.titlePhoto" :alt="user.handle" size="120" />
        <div class="flex-1">
          <p class="text-sm" :style="{ color: rankColor }">{{ user.rank }}</p>
          <h2 class="text-2xl font-bold" :style="{ color: rankColor }">{{ user.handle }}</h2>
          <div class="mt-2 space-y-1 text-sm">
            <p>
              <strong>Rating：</strong>
              <span :style="{ color: rankColor }" class="ml-2">{{ user.rating }}</span>
              <span class="ml-2 text-muted-foreground">
                （最高 <span :style="{ color: rankColor }">{{ user.maxRank }}</span> |
                <span :style="{ color: rankColor }">{{ user.maxRating }}</span>）
              </span>
            </p>
            <p><strong>组织：</strong> {{ user.organization || 'N/A' }}</p>
            <p><strong>好友数：</strong> {{ user.friendOfCount }}</p>
            <p><strong>邮箱：</strong> {{ user.email || 'N/A' }}</p>
          </div>
        </div>
      </div>

      <Separator class="my-4" />

      <!-- Rating Sparkline -->
      <div v-if="ratingHistory.length >= 2" class="mt-4">
        <h3 class="text-center text-sm font-medium mb-2">Rating 变化</h3>
        <svg viewBox="0 0 600 100" class="w-full h-24" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgb(59,130,246)" stop-opacity="0.3" />
              <stop offset="100%" stop-color="rgb(59,130,246)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path :d="sparklineAreaPath" fill="url(#sparkGrad)" />
          <path :d="sparklinePath" fill="none" stroke="rgb(59,130,246)" stroke-width="2" />
        </svg>
      </div>
    </Card>

    <!-- Search Box -->
    <div v-else class="w-full max-w-[400px]">
      <Input
        v-model="searchHandle"
        placeholder="输入 Codeforces Handle"
        @keyup.enter="searchUser"
      />
    </div>
  </div>
</template>
