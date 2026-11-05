import { api } from './api'

export interface HonorPerson {
  id: number
  name: string
  aliases: string[]
  user_id: number | null
  study_start: string | null
  study_end: string | null
  effective_study_end: string | null
  note: string
  revision: number
  merged_into_id: number | null
}
export interface HonorEvent {
  id?: number
  key: string
  title: string
  family: string
  occurred_on: string | null
  date_precision: 'day' | 'month' | 'year'
  category: string
}
export interface HonorAward {
  id: number
  event: HonorEvent
  award: string
  team: string
  source_url: string
  recipients: { name: string; person_id: number | null; raw_name?: string; eligibility?: string }[]
  source_key?: string
  status?: 'pending' | 'verified' | 'excluded'
  revision?: number
  evidence?: string
}
export interface HonorImportRecord {
  source_key: string
  event: HonorEvent
  award: string
  team: string
  source_url: string
  evidence: string
  recipients: string[]
}
export interface ImportResult {
  preview: boolean
  added: string[]
  duplicates: string[]
  failed: { row: number; source_key: string; reason: string; record: HonorImportRecord }[]
}
export const HONOR_FAMILIES: Record<string, string> = {
  icpc: 'ICPC',
  ccpc: 'CCPC',
  provincial: '省级程序设计竞赛',
  lanqiao: '蓝桥杯',
  gplt: '天梯赛',
  astar: '百度之星',
  matibei: '码蹄杯',
  other: '其他',
}
export const honorsApi = {
  list: () => api.get<HonorAward[]>('/honors'),
  user: (id: number) => api.get<HonorAward[]>(`/honors/users/${id}`),
  people: () => api.get<HonorPerson[]>('/honors/admin/people'),
  awards: () => api.get<HonorAward[]>('/honors/admin/awards'),
  savePerson: (id: number | null, data: unknown) =>
    id === null
      ? api.post<HonorPerson>('/honors/admin/people', data)
      : api.put<HonorPerson>(`/honors/admin/people/${id}`, data),
  import: (records: HonorImportRecord[], preview: boolean) =>
    api.post<ImportResult>('/honors/admin/import', { records, preview }),
  saveEventDate: (id: number, data: unknown) =>
    api.put<HonorEvent>(`/honors/admin/events/${id}/date`, data),
  review: (id: number, revision: number, status: string, person_ids: (number | null)[]) =>
    api.put(`/honors/admin/awards/${id}`, { revision, status, person_ids }),
}
export function honorDate(event: HonorEvent) {
  if (!event.occurred_on) return '日期待核实'
  return event.occurred_on.slice(
    0,
    event.date_precision === 'year' ? 4 : event.date_precision === 'month' ? 7 : 10
  )
}
