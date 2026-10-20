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

interface LspItem {
  label: string; kind?: number; detail?: string; insertText?: string
  /** clangd 把完整签名放 label，改由 filterText 决定前缀匹配。 */
  filterText?: string
  /** 首选：结构化编辑，比 insertText 更准。 */
  textEdit?: { newText: string }
  /** 老式片段语法，snippetSupport 关闭时不能用。 */
  insertTextFormat?: number
}
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
      // clangd 的 label 可能以 • 开头（表示索引项，std::vector 这类也带），
      // 不能直接丢掉，否则常见类型全没了。剥掉前缀即可。
      const visible = items
        .filter(item => item.label)
        .map(item => item.label.startsWith('•')
          ? { ...item, label: item.label.replace(/^•+/, '').trim() }
          : item)
      if (!visible.length) return null
      // 先按用户已经输入的前缀筛一遍。clangd 会返回上万个候选，
      // 直接切前 200 条会把 vector 这类排在后面的常见符号丢掉。
      const typed = context.state.doc.sliceString(word.from, context.pos)
      const prefix = typed.split('::').pop()?.toLowerCase() ?? ''
      const nameOf = (item: LspItem) =>
        (item.filterText ?? item.label.trim().match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0] ?? item.label.trim())
      // 前缀匹配而不是子串匹配：子串会把 _PSTL_PRAGMA_VECTOR_UNALIGNED 这类
      // 宏排在 vector 前面，而向量容器正是用户要找的。
      const starts = prefix ? visible.filter(item => nameOf(item).toLowerCase().startsWith(prefix)) : []
      const contains = prefix ? visible.filter(item => nameOf(item).toLowerCase().includes(prefix)) : []
      // 前缀命中的优先，其次是子串命中；短名字再优先（vector 优于 vector_variant_t）。
      const pool = (starts.length ? starts : contains).sort((a, b) => nameOf(a).length - nameOf(b).length)
      const candidates = pool.length ? pool : visible
      return {
        from: word.from,
        // to 必须给：CM6 用它在结果返回后判断范围是否仍有效。
        to: context.pos,
        // validFor 让 CM6 在继续输入时沿用这批结果，而不是每个字符重发请求。
        validFor: /^[A-Za-z0-9_]*$/,
        options: candidates.slice(0, 200).map(item => {
          // clangd 的 label 是完整签名，当补全项难扫读。filterText 是干净的
          // 标识符；insertText/textEdit 是实际插入内容。
          const name = item.filterText ?? item.label.trim().match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0] ?? item.label.trim()
          const raw = item.textEdit?.newText ?? item.insertText ?? name
          // insertTextFormat 2 是 snippet，没开 snippetSupport 时要剥掉 ${n:x}。
          const apply = item.insertTextFormat === 2
            ? raw.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\d+/g, '')
            : raw
          // detail 只在签名确实有额外信息时显示；label 已经是名字，
          // 再塞一遍完整签名会让列表看起来重复。
          const signature = item.label.trim()
          return {
            label: name,
            detail: signature.startsWith(name) && signature.length > name.length
              ? signature.slice(name.length).trim() || undefined
              : signature === name ? undefined : signature,
            type: KIND[item.kind ?? 0] ?? 'text',
            apply,
          }
        }),
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
