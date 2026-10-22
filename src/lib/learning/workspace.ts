import type { Environment, PointResult, TestCase } from './types'

export interface CustomCase { id: number; input: string; expected: string }
export interface WorkspaceCase extends TestCase { id: string; editable: boolean }
export interface CaseResult { signature: string; point: PointResult }
export const caseSignature = (test: Pick<TestCase, 'input' | 'output'>) => JSON.stringify([test.input, test.output])
export const filenameOf = (env: Environment) => env === 'c' ? 'main.c' : env === 'cpp' ? 'main.cpp' : env === 'python' ? 'main.py' : 'Main.java'
export interface EditorPreferences { fontSize: number; tabSize: number; wrap: boolean }
export const defaultPreferences: EditorPreferences = { fontSize: 14, tabSize: 4, wrap: false }

export function loadPreferences(): EditorPreferences {
  try {
    const p = JSON.parse(localStorage.getItem('learning:editor-preferences') || '{}')
    return { fontSize: [12, 13, 14, 16, 18].includes(p.fontSize) ? p.fontSize : 14,
      tabSize: [2, 4, 8].includes(p.tabSize) ? p.tabSize : 4, wrap: p.wrap === true }
  } catch { return { ...defaultPreferences } }
}
export function loadCases(bucket: string): CustomCase[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(`learning:cases:${bucket}`) || '[]')
    if (!Array.isArray(data)) return []
    const ids = new Set<number>()
    return data.filter((c): c is CustomCase => {
      if (!c || !Number.isSafeInteger(c.id) || ids.has(c.id) || typeof c.input !== 'string' || typeof c.expected !== 'string') return false
      ids.add(c.id); return true
    }).slice(0, 20)
  } catch { return [] }
}
export function saveLocal(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
}
export const clipText = (text: string, limit = 8192) => text.length > limit
  ? `${text.slice(0, limit)}\n…（共 ${text.length.toLocaleString()} 字符，显示已截断）` : text

export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
