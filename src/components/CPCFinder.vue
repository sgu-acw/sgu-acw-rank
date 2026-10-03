<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import {
  useVueTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  FlexRender,
  type SortingState,
} from '@tanstack/vue-table'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'
import { Card, CardContent } from './ui/card'
import { Skeleton } from './ui/skeleton'
import { Alert } from './ui/alert'
import { Separator } from './ui/separator'

interface Student {
  studentId: string
  name: string
  schoolName: string
  championCount: number
  secCount: number
  thiCount: number
  goldCount: number
  silverCount: number
  bronzeCount: number
}

interface ApiResponse {
  data: Student[]
  pagination: {
    current: number
    pageSize: number
    total: number
    pages: number
  }
}

const students = ref<Student[]>([])
const loading = ref(true)
const error = ref('')
const sorting = ref<SortingState>([])

const columnHelper = createColumnHelper<Student>()

const columns = [
  columnHelper.accessor('name', { header: '姓名' }),
  columnHelper.accessor('goldCount', { header: '金牌' }),
  columnHelper.accessor('silverCount', { header: '银牌' }),
  columnHelper.accessor('bronzeCount', { header: '铜牌' }),
]

const table = useVueTable({
  get data() { return students.value },
  columns,
  state: {
    get sorting() { return sorting.value },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
})

const fetchStudents = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await axios.get<ApiResponse>(
      'https://cpcfinder-api.zh314.xyz/student?school=韶关学院&pageSize=1000'
    )
    if (response.data && response.data.data) {
      students.value = response.data.data
    } else {
      error.value = '接口没有返回数据。'
      students.value = []
    }
  } catch (err) {
    console.error('Error fetching student data:', err)
    error.value = '数据加载失败。'
    students.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchStudents()
})
</script>

<template>
  <div class="flex items-center justify-center">
    <Card class="w-full max-w-[700px] mt-5">
      <Separator />
      <CardContent class="p-0">
        <!-- Loading -->
        <div v-if="loading" class="p-6 space-y-3">
          <Skeleton v-for="i in 10" :key="i" class="h-10 w-full" />
        </div>

        <!-- Error -->
        <Alert v-else-if="error" class="m-4">
          {{ error }}
        </Alert>

        <!-- Table -->
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
              <TableRow v-for="row in table.getRowModel().rows" :key="row.id">
                <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                  <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
                </TableCell>
              </TableRow>
              <TableRow v-if="!students.length">
                <TableCell :colspan="columns.length" class="text-center text-muted-foreground py-8">
                  暂无数据或加载失败
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
