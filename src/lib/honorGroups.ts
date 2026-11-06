import type { HonorAward, HonorEvent } from './honors'

export type DisplayAward = HonorAward & { count: number }
export interface HonorContestGroup {
  key: string
  event: HonorEvent
  rows: DisplayAward[]
  count: number
}

function contestKey(event: HonorEvent): string {
  // A year/month placeholder is not an exact contest date. Keep distinct
  // events separate until a date is known instead of merging different rounds.
  if (!event.occurred_on || event.date_precision !== 'day') return `event:${event.key}`
  return JSON.stringify([event.family, event.title.replace(/\s+/g, '').normalize('NFC'), event.occurred_on])
}

export function groupHonorContests(records: HonorAward[]): HonorContestGroup[] {
  const contests = new Map<string, HonorContestGroup>()
  const individuals = new Map<string, DisplayAward>()
  for (const record of records) {
    const key = contestKey(record.event)
    let contest = contests.get(key)
    if (!contest) {
      contest = { key, event: record.event, rows: [], count: 0 }
      contests.set(key, contest)
    }
    contest.count++
    // Keep team awards separate and retain each source within its own row.
    const rowKey = JSON.stringify([key, record.event.key, record.award, record.source_url])
    const previous = !record.team && individuals.get(rowKey)
    if (previous) {
      previous.recipients.push(...record.recipients)
      previous.count++
    } else {
      const row = { ...record, recipients: [...record.recipients], count: 1 }
      contest.rows.push(row)
      if (!record.team) individuals.set(rowKey, row)
    }
  }
  return [...contests.values()]
}
