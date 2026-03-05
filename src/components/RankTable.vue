<script setup lang="ts">
import { ref, onMounted, h, computed } from 'vue'
import {
  useVueTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  createColumnHelper,
  FlexRender,
  type SortingState,
  type ExpandedState,
} from '@tanstack/vue-table'
import {
  fetchUserInfoStructured,
  getRatingColorClass,
} from '../lib/cfapi'
import type { User } from '../lib/interfaces/cfapi'
import type { BaseStudentInfo } from '../data/students'
import * as XLSX from 'xlsx'
import { ExternalLink, Info, ChevronDown, ChevronRight, FileSpreadsheet, Eye, EyeOff } from 'lucide-vue-next'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Avatar } from './ui/avatar'
import { Skeleton } from './ui/skeleton'

interface StudentInfo extends BaseStudentInfo {
  cfProfiles: User[]
  rating: number
  handle: string
  name: string
  avatar: string
}

const props = defineProps<{
  students: Record<string, BaseStudentInfo>
}>()

const mapping: Record<string, string> = {}
for (const key in props.students) {
  for (const handle of props.students[key].handles) {
    mapping[handle.toLowerCase()] = key
  }
}

const userItems = ref<StudentInfo[]>([])
const loading = ref(false)
const sorting = ref<SortingState>([{ id: 'rating', desc: true }])
const expanded = ref<ExpandedState>({})
const isMobile = ref(false)
const hideNames = ref(false)

const columnVisibility = computed(() => {
  if (isMobile.value) {
    return { expand: false, avatar: false, enrollment_year: false }
  }
  return {}
})
const columnHelper = createColumnHelper<StudentInfo>()

const columns = [
  columnHelper.display({
    id: 'expand',
    header: '',
    cell: ({ row }) => {
      if (row.original.cfProfiles.length <= 1) return ''
      return h('button', {
        onClick: () => row.toggleExpanded(),
        class: 'p-1 hover:bg-accent rounded',
      }, [
        h(row.getIsExpanded() ? ChevronDown : ChevronRight, { class: 'h-4 w-4' })
      ])
    },
    size: 40,
  }),
  columnHelper.accessor('avatar', {
    header: 'Avatar',
    cell: (info) => h(Avatar, {
      src: info.getValue() || 'https://via.placeholder.com/40',
      alt: info.row.original.name,
      size: '35',
    }),
    enableSorting: false,
    size: 50,
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    enableSorting: false,
    cell: (info) => h('span', { class: 'whitespace-nowrap' }, hideNames.value ? '***' : info.getValue()),
  }),
  columnHelper.accessor('enrollment_year', {
    header: 'Grade',
    cell: (info) => {
      const v = info.getValue()
      return v > 0 ? String(v) : '?'
    },
  }),
  columnHelper.accessor('handle', {
    header: 'Handle',
    enableSorting: false,
  }),
  columnHelper.accessor('rating', {
    header: 'Rating',
  }),
]

const table = useVueTable({
  get data() { return userItems.value },
  columns,
  state: {
    get sorting() { return sorting.value },
    get expanded() { return expanded.value },
    get columnVisibility() { return columnVisibility.value },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  onExpandedChange: (updater) => {
    expanded.value = typeof updater === 'function' ? updater(expanded.value) : updater
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  getRowCanExpand: (row) => row.original.cfProfiles.length > 1,
})

const fetchUsers = async () => {
  loading.value = true
  const handles = Object.keys(mapping)
  const tmpUserMp: Record<string, StudentInfo> = {}
  const userData: User[] = []

  try {
    for await (const user of fetchUserInfoStructured(handles))
      userData.push(user)
  } catch (error) {
    console.error('Error during API call:', error)
    loading.value = false
    return
  }

  for (const cfProfile of userData) {
    const name = mapping[cfProfile.handle.toLowerCase()]
    if (!name) continue
    if (!tmpUserMp[name]) {
      tmpUserMp[name] = {
        handles: props.students[name].handles,
        cfProfiles: [],
        handle: cfProfile.handle,
        name,
        avatar: cfProfile.avatar || '',
        rating: 0,
        enrollment_year: props.students[name].enrollment_year || -1,
      }
    }
    tmpUserMp[name].cfProfiles.push(cfProfile)
    if (cfProfile.rating > tmpUserMp[name].rating) {
      tmpUserMp[name].rating = cfProfile.rating
      tmpUserMp[name].handle = cfProfile.handle
      tmpUserMp[name].avatar = cfProfile.avatar
    }
  }

  userItems.value = Object.values(tmpUserMp)
  loading.value = false
}

const exportToXLSX = () => {
  if (!userItems.value.length) return
  const dataToExport = userItems.value.map((user) => ({
    Name: user.name,
    'Handle (Primary)': user.handle,
    'Rating (Highest)': user.rating || 'N/A',
  }))
  const worksheet = XLSX.utils.json_to_sheet(dataToExport)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'SGU CF Ranks')
  worksheet['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 15 }]
  XLSX.writeFile(workbook, 'sgu_codeforces_ranks.xlsx')
}

onMounted(() => {
  isMobile.value = window.innerWidth < 768
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 768
  })
  fetchUsers()
})
</script>

<template>
  <div class="flex items-center justify-center min-h-[50vh]">
    <Card class="w-full max-w-[900px]">
      <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle class="text-lg md:text-xl">
          <span class="hidden md:inline">SGU CodeForces Rank</span>
          <span class="md:hidden">CF RK</span>
        </CardTitle>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" @click="hideNames = !hideNames">
            <component :is="hideNames ? EyeOff : Eye" class="h-4 w-4 md:mr-2" />
            <span class="hidden md:inline">{{ hideNames ? 'Show Names' : 'Hide Names' }}</span>
          </Button>
          <Button variant="outline" size="sm" @click="exportToXLSX">
            <FileSpreadsheet class="h-4 w-4 md:mr-2" />
            <span class="hidden md:inline">Export XLSX</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <!-- Loading skeleton -->
        <div v-if="loading" class="p-6 space-y-3">
          <div class="text-sm text-muted-foreground text-center mb-4">
            Fetching data from Codeforces API...
          </div>
          <Skeleton v-for="i in 8" :key="i" class="h-12 w-full" />
        </div>

        <!-- Data table -->
        <div v-else class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
                <TableHead
                  v-for="header in headerGroup.headers"
                  :key="header.id"
                  :class="header.column.getCanSort() ? 'cursor-pointer select-none' : ''"
                  @click="header.column.getToggleSortingHandler()?.($event)"
                >
                  <div class="flex items-center gap-1">
                    <FlexRender
                      v-if="!header.isPlaceholder"
                      :render="header.column.columnDef.header"
                      :props="header.getContext()"
                    />
                    <span v-if="header.column.getIsSorted() === 'asc'" class="text-xs">▲</span>
                    <span v-else-if="header.column.getIsSorted() === 'desc'" class="text-xs">▼</span>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="row in table.getRowModel().rows" :key="row.id">
                <TableRow>
                  <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                    <!-- Handle column with links -->
                    <template v-if="cell.column.id === 'handle'">
                      <span>{{ cell.getValue() }}</span>
                      <a
                        :href="`https://codeforces.com/profile/${cell.getValue()}`"
                        target="_blank"
                        class="inline-flex items-center p-1 ml-1 hover:bg-accent rounded"
                        title="Open Codeforces Profile"
                      >
                        <ExternalLink class="h-3.5 w-3.5" />
                      </a>
                      <a
                        :href="`/codeforces/profile?handle=${cell.getValue()}`"
                        class="inline-flex items-center p-1 hover:bg-accent rounded"
                        title="Open Local Profile"
                      >
                        <Info class="h-3.5 w-3.5" />
                      </a>
                    </template>
                    <!-- Rating column with color badge -->
                    <template v-else-if="cell.column.id === 'rating'">
                      <span
                        class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        :class="getRatingColorClass(cell.getValue() as number)"
                      >
                        {{ (cell.getValue() as number) || 'N/A' }}
                      </span>
                    </template>
                    <!-- Default rendering -->
                    <template v-else>
                      <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
                    </template>
                  </TableCell>
                </TableRow>
                <!-- Expanded sub-rows -->
                <template v-if="row.getIsExpanded()">
                  <TableRow v-for="(cfProfile, index) in row.original.cfProfiles" :key="index" class="bg-muted/50">
                    <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                      <template v-if="cell.column.id === 'avatar'">
                        <Avatar
                          :src="cfProfile.avatar || 'https://via.placeholder.com/40'"
                          :alt="cfProfile.handle"
                          size="35"
                        />
                      </template>
                      <template v-else-if="cell.column.id === 'handle'">
                        <span class="text-muted-foreground">{{ cfProfile.handle }}</span>
                      </template>
                      <template v-else-if="cell.column.id === 'rating'">
                        <span
                          class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          :class="getRatingColorClass(cfProfile.rating)"
                        >
                          {{ cfProfile.rating || 'N/A' }}
                        </span>
                      </template>
                    </TableCell>
                  </TableRow>
                </template>
              </template>
              <TableRow v-if="!userItems.length && !loading">
                <TableCell :colspan="columns.length" class="text-center text-muted-foreground py-8">
                  No data available.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
