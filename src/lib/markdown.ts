/**
 * 题解正文的渲染：Markdown + LaTeX。
 *
 * 生成器写的是 Markdown，公式用 `$...$`（行内）和 `$$...$$`（独立）。
 * markdown-it 本身不认 LaTeX，所以在渲染前先把公式抽出来交给 KaTeX，
 * 再把结果塞回去。
 *
 * **为什么先抽出来而不是写 markdown-it 插件**
 *
 * 插件要在 token 流里穿插，而公式可以出现在任何行内位置（标题、列表项、
 * 表格单元格）。先整体替换成占位符、渲染完再换回来，逻辑少得多，也不会
 * 因为某个上下文没覆盖到而漏渲染。
 *
 * 占位符用 `\u0000` 包起来：markdown-it 不会改动它，正文里也不可能出现。
 */

import katex from 'katex'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: false, // 不让生成器写裸 HTML——内容是模型生成的，不开这个口子
  linkify: true,
  breaks: false,
})

/** 行内公式 `$...$`。不匹配 `$$`，也不匹配转义的 `\$`。 */
const INLINE_MATH = /(?<!\$)\$(?!\$)((?:\\.|[^$\\])+?)\$(?!\$)/g
/** 独立公式 `$$...$$`，允许跨行。 */
const BLOCK_MATH = /\$\$([\s\S]+?)\$\$/g

/**
 * 占位符的标记字符。
 *
 * 用 Unicode 私用区（U+E000）：markdown-it 不会改动它，而正文里不可能
 * 出现这个字符。
 *
 * 一开始用的是 NUL（U+0000），结果 markdown-it 会把它规范化成 U+FFFD，
 * 占位符就再也匹配不上了——公式全部以原文形式留在页面上。
 */
const MARK = '\uE000'
const PLACEHOLDER = (index: number) => `${MARK}MATH${index}${MARK}`
const PLACEHOLDER_RE = /\uE000MATH(\d+)\uE000/g

function renderMath(source: string, displayMode: boolean): string {
  try {
    return katex.renderToString(source.trim(), {
      displayMode,
      throwOnError: false,
      // 公式里出现没定义的命令时显示成红色原文，而不是整段崩掉。
      errorColor: '#dc2626',
    })
  } catch {
    // KaTeX 自己也会抛（比如嵌套错误）。退化成原文，至少不丢内容。
    return displayMode ? `$$${source}$$` : `$${source}$`
  }
}

/**
 * 把 Markdown 渲染成 HTML。
 *
 * 先处理独立公式，再处理行内公式——否则 `$$a$$` 会被行内规则先吃掉一半。
 */
export function renderMarkdown(source: string): string {
  if (!source.trim()) return ''

  const math: string[] = []
  const stash = (html: string) => {
    math.push(html)
    return PLACEHOLDER(math.length - 1)
  }

  // 先换成占位符再渲染：直接把 KaTeX 产出的 HTML 交给 markdown-it 的话，
  // 会被 html:false 转义成可见的标签文本。
  let text = source.replace(BLOCK_MATH, (_match, body: string) => stash(renderMath(body, true)))
  text = text.replace(INLINE_MATH, (_match, body: string) => stash(renderMath(body, false)))

  const html = md.render(text)

  return html.replace(PLACEHOLDER_RE, (_match, index: string) => math[Number(index)] ?? '')
}
