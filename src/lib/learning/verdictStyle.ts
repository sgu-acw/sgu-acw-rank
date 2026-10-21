import { verdictLabels, type Verdict } from './types'

/**
 * 判定状态在标题行里的文字与颜色。
 * 判定永远不靠色单独承载：verdictLabels 是文字，颜色只是强调。
 */
export const verdictStatusClass: Record<Verdict | 'OK', string> = {
  AC: 'text-emerald-600 dark:text-emerald-400',
  WA: 'text-rose-600 dark:text-rose-400',
  TLE: 'text-amber-600 dark:text-amber-400',
  RE: 'text-violet-600 dark:text-violet-400',
  CE: 'text-sky-600 dark:text-sky-400',
  OLE: 'text-orange-600 dark:text-orange-400',
  OK: 'text-emerald-600 dark:text-emerald-400',
  CANCELLED: 'text-muted-foreground',
  ENVIRONMENT_ERROR: 'text-muted-foreground',
}

export function verdictStatus(verdict: Verdict | 'OK' | string) {
  return { text: verdictLabels[verdict] || verdict, cls: verdictStatusClass[verdict as Verdict] || 'text-muted-foreground' }
}
