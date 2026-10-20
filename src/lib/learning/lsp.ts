/**
 * 编辑器语言服务的页面侧客户端。
 *
 * 语言服务器（clangd / pyright）跑在运行器 origin 的 Worker 里——它们的
 * 资源是那个 origin 的 blob: URL，主站页面直接 new Worker 会被同源策略拦掉。
 * 所以这里只做 RPC 转发，把补全和诊断接到 CodeMirror。
 */
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Diagnostic } from '@codemirror/lint'
import { linter } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { LearningEngine } from './engine'
import type { Environment, LspId } from './types'

interface LspItem { label: string; kind?: number; detail?: string; insertText?: string }
interface LspDiagnostic { range: { start: { line: number; character: number }; end: { line: number; character: number } }; message: string; severity?: number }

export const serviceFor = (env: Environment): LspId | null =>
  env === 'c' || env === 'cpp' ? 'clangd' : env === 'python' ? 'pyright' : null

/** LSP CompletionItemKind → CodeMirror 的补全类型。 */
const KIND: Record<number, string> = {
  2: 'method', 3: 'function', 4: 'function', 5: 'property', 6: 'variable', 7: 'class',
  8: 'interface', 9: 'namespace', 10: 'property', 13: 'variable', 14: 'keyword', 21: 'constant',
}

/** LSP 位置 → 文档偏移。 */
function offsetOf(view: EditorView, pos: { line: number; character: number }): number {
  const line = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, pos.line + 1)))
  return Math.min(line.to, line.from + Math.max(0, pos.character))
}

export interface LspBinding {
  completionSource: (context: CompletionContext) => Promise<CompletionResult | null>
  extension: Extension
}

/**
 * 把运行器里的语言服务接到 CM6。
 * `client` 返回 null（没装语言包/未启动）时补全与诊断都安静地不生效。
 */
export function lspExtension(client: () => { engine: LearningEngine; service: LspId } | null): LspBinding {
  const completionSource = async (context: CompletionContext): Promise<CompletionResult | null> => {
    const active = client()
    if (!active) return null
    // 只对标识符触发，避免每个字符都打一次 RPC。
    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_:]*$/)
    if (!word || (word.from === word.to && !context.explicit)) return null
    const line = context.state.doc.lineAt(context.pos)
    try {
      const items = await active.engine.lspComplete(active.service, context.state.doc.toString(), line.number - 1, context.pos - line.from) as LspItem[]
      if (!items.length) return null
      return {
        from: word.from,
        options: items.slice(0, 200).map(item => ({
          label: item.label,
          type: KIND[item.kind ?? 0] ?? 'text',
          detail: item.detail,
          apply: item.insertText ?? item.label,
        })),
        validFor: /^[A-Za-z0-9_]*$/,
      }
    } catch { return null }
  }
  const extension = linter(async view => {
    const active = client()
    if (!active) return []
    try {
      const list = await active.engine.lspDiagnostics(active.service) as LspDiagnostic[]
      return list.map((d): Diagnostic => ({
        from: offsetOf(view, d.range.start),
        to: offsetOf(view, d.range.end),
        severity: d.severity === 1 ? 'error' : d.severity === 2 ? 'warning' : 'info',
        message: d.message,
        source: active.service === 'clangd' ? 'clangd' : 'pyright',
      }))
    } catch { return [] }
  }, { delay: 900 })
  return { completionSource, extension }
}
