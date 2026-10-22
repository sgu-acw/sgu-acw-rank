/**
 * 代码截图：lezer 语法树取 token 配色（和编辑器同一套主题色），
 * canvas 渲成 PNG。不依赖 DOM 截图，避免 foreignObject 兼容问题。
 */
import { highlightTree, tags } from '@lezer/highlight'
import { cppLanguage } from '@codemirror/lang-cpp'
import { pythonLanguage } from '@codemirror/lang-python'
import { javaLanguage } from '@codemirror/lang-java'
import type { Environment } from './types'

const parserOf = (env: Environment) =>
  env === 'c' || env === 'cpp' ? cppLanguage.parser : env === 'python' ? pythonLanguage.parser : javaLanguage.parser

type TagSet = { contains: (tag: unknown) => boolean } | readonly unknown[]
const has = (set: TagSet, tag: unknown) => 'contains' in set ? set.contains(tag) : set.includes(tag)

/** 与 CodeEditor 的 HighlightStyle 同一套色。 */
function colorOf(set: TagSet, dark: boolean): string | undefined {
  if (dark) {
    if (has(set, tags.keyword) || has(set, tags.modifier) || has(set, tags.controlKeyword)) return '#f47067'
    if (has(set, tags.string) || has(set, tags.special(tags.string)) || has(set, tags.regexp)) return '#96d0ff'
    if (has(set, tags.number) || has(set, tags.bool) || has(set, tags.null)) return '#6cafff'
    if (has(set, tags.comment) || has(set, tags.blockComment)) return '#768390'
    if (has(set, tags.function(tags.variableName)) || has(set, tags.function(tags.propertyName))) return '#dcbdfb'
    if (has(set, tags.typeName) || has(set, tags.className) || has(set, tags.tagName)) return '#8ddb8c'
    if (has(set, tags.propertyName) || has(set, tags.attributeName)) return '#79b8ff'
    if (has(set, tags.macroName) || has(set, tags.meta)) return '#f69d50'
    return '#cdd9e5'
  }
  if (has(set, tags.keyword) || has(set, tags.modifier) || has(set, tags.controlKeyword)) return '#cf222e'
  if (has(set, tags.string) || has(set, tags.special(tags.string)) || has(set, tags.regexp)) return '#0a3069'
  if (has(set, tags.number) || has(set, tags.bool) || has(set, tags.null)) return '#0550ae'
  if (has(set, tags.comment) || has(set, tags.blockComment)) return '#6e7781'
  if (has(set, tags.function(tags.variableName)) || has(set, tags.function(tags.propertyName))) return '#8250df'
  if (has(set, tags.typeName) || has(set, tags.className) || has(set, tags.tagName)) return '#116329'
  if (has(set, tags.propertyName) || has(set, tags.attributeName)) return '#0550ae'
  if (has(set, tags.macroName) || has(set, tags.meta)) return '#bc4c00'
  return '#24292f'
}

export interface ShotOptions { dark?: boolean; padding?: number; fontPx?: number; lineHeight?: number; scale?: number }

export function renderCodePng(code: string, env: Environment, opts: ShotOptions = {}): HTMLCanvasElement {
  const { dark = true, padding = 28, fontPx = 15, lineHeight = 1.7, scale = 2 } = opts
  const font = `${fontPx}px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  // 去掉首尾空行、按最长行定宽（宽上限防超长单行爆炸）。
  const lines = code.replace(/^\n+|\n+$/g, '').split('\n')
  const monoW = measure.measureText('M').width
  const numW = String(lines.length).length * monoW + 20
  const maxPx = Math.min(1200, Math.max(320, ...lines.map(l => {
    const tabs = (l.match(/\t/g) || []).length
    return l.length * monoW + tabs * monoW * 3 // tab 按 4 空格估算
  })))

  const canvas = document.createElement('canvas')
  const innerH = lines.length * fontPx * lineHeight
  canvas.width = (numW + maxPx + padding * 2) * scale
  canvas.height = (innerH + padding * 2) * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  const w = canvas.width / scale, h = canvas.height / scale
  ctx.fillStyle = dark ? '#0d1117' : '#ffffff'
  roundRect(ctx, 0, 0, w, h, 12); ctx.fill()

  // token 着色
  const spans: { from: number; to: number; color: string }[] = []
  try {
    const tree = parserOf(env).parse(code)
    highlightTree(tree, { style: set => colorOf(set, dark) ?? '' }, (from, to, cls) => {
      if (cls) spans.push({ from, to, color: cls })
    })
  } catch { /* 解析失败就全默认色 */ }

  ctx.font = font
  ctx.textBaseline = 'middle'
  let offset = 0
  const lineH = fontPx * lineHeight
  lines.forEach((line, i) => {
    const y = padding + i * lineH + lineH / 2
    // 行号
    ctx.fillStyle = dark ? '#4b5563' : '#9ca3af'
    ctx.textAlign = 'right'
    ctx.fillText(String(i + 1), padding + numW - 10, y)
    ctx.textAlign = 'left'
    // 行内 token：把行切成 span 段，逐段画；超长裁剪。
    const lineStart = offset, lineEnd = offset + line.length
    let x = padding + numW
    let cursor = lineStart
    const segs = spans.filter(s => s.from < lineEnd && s.to > lineStart)
    for (const s of segs) {
      if (cursor < s.from) { x += draw(ctx, code.slice(cursor, s.from), x, y, dark ? '#cdd9e5' : '#24292f') }
      x += draw(ctx, code.slice(Math.max(cursor, s.from), Math.min(s.to, lineEnd)), x, y, s.color)
      cursor = s.to
      if (cursor >= lineEnd) break
    }
    if (cursor < lineEnd) draw(ctx, code.slice(cursor, lineEnd), x, y, dark ? '#cdd9e5' : '#24292f')
    offset = lineEnd + 1 // +'\n'
  })
  return canvas
}

function draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): number {
  const expanded = text.replace(/\t/g, '    ')
  ctx.fillStyle = color
  ctx.fillText(expanded, x, y)
  return ctx.measureText(expanded).width
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'))
}
