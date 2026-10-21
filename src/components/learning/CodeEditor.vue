<script setup lang="ts">
/**
 * CodeMirror 6 源码编辑器。
 *
 * 只做「编辑」这一件事：语法高亮、括号匹配、自动缩进、搜索、历史、Tab
 * 缩进、跟随深浅色。补全和诊断由 LSP 客户端按需挂载（见 lsp.ts），
 * 这样语言包没装时编辑器仍然可用。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { lintKeymap } from '@codemirror/lint'
import { cpp } from '@codemirror/lang-cpp'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { tags } from '@lezer/highlight'
import type { Environment } from '../../lib/learning/types'

const darkTheme = EditorView.theme({
  '&': { color: '#cdd9e5', backgroundColor: 'transparent' },
  '.cm-content': { caretColor: '#cdd9e5' },
  '.cm-gutters': { backgroundColor: 'transparent', color: '#768390', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.06)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(110,170,255,0.25)',
  },
}, { dark: true })

const lightTheme = EditorView.theme({
  '&': { color: '#24292f', backgroundColor: 'transparent' },
  '.cm-content': { caretColor: '#24292f' },
  '.cm-gutters': { backgroundColor: 'transparent', color: '#6e7781', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.035)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(0,0,0,0.06)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(84,140,255,0.22)',
  },
}, { dark: false })

// 与 OJ++ 同一套配色，深浅色各自定义。
const darkHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword], color: '#f47067' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#96d0ff' },
  { tag: [tags.number, tags.bool, tags.null], color: '#6cafff' },
  { tag: [tags.comment, tags.blockComment], color: '#768390', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#dcbdfb' },
  { tag: [tags.typeName, tags.className, tags.tagName], color: '#8ddb8c' },
  { tag: [tags.propertyName, tags.attributeName], color: '#79b8ff' },
  { tag: tags.operator, color: '#cdd9e5' },
  { tag: [tags.macroName, tags.meta], color: '#f69d50' },
])
const lightHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword], color: '#cf222e' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#0a3069' },
  { tag: [tags.number, tags.bool, tags.null], color: '#0550ae' },
  { tag: [tags.comment, tags.blockComment], color: '#6e7781', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#8250df' },
  { tag: [tags.typeName, tags.className, tags.tagName], color: '#116329' },
  { tag: [tags.propertyName, tags.attributeName], color: '#0550ae' },
  { tag: tags.operator, color: '#24292f' },
  { tag: [tags.macroName, tags.meta], color: '#bc4c00' },
])

const languageOf = (env: Environment): Extension[] => {
  if (env === 'c' || env === 'cpp') return [cpp()]
  if (env === 'python') return [python()]
  return [java()]
}

const props = defineProps<{
  modelValue: string; environment: Environment; readonly?: boolean
  /** 语言服务的补全源；由工作台在装好语言包后注入，未装时为 undefined。 */
  completion?: (context: import('@codemirror/autocomplete').CompletionContext) => Promise<unknown>
  /** 语言服务诊断扩展（linter）。 */
  diagnostics?: Extension
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const host = ref<HTMLElement | null>(null)
const languageFacet = new Compartment()
const themeFacet = new Compartment()
// 补全源要能后配：语言包是进页面之后才装好的，编辑器创建时还没有 LSP。
const completionFacet = new Compartment()
const lintFacet = new Compartment()
// readOnly 是 Facet，不能直接 reconfigure，必须走 Compartment。
const readOnlyFacet = new Compartment()
/** 稳定的补全源：始终注册，内部按当前 props 决定是否走 LSP。 */
const stableSource = (context: import('@codemirror/autocomplete').CompletionContext) =>
  props.completion ? props.completion(context) : null
const completionExtension = () =>
  autocompletion({ override: [stableSource as never], activateOnTyping: true, defaultKeymap: true })
const lintExtension = () => props.diagnostics ?? []
let view: EditorView | undefined
let dark = false

const isDark = () => document.documentElement.classList.contains('dark')

function buildState(value: string, env: Environment, readOnly: boolean) {
  return EditorState.create({
    doc: value,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      indentUnit.of('    '),
      highlightSelectionMatches(),
      completionFacet.of(completionExtension()),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
      EditorView.lineWrapping,
      placeholder('在此编写代码…'),
      readOnlyFacet.of(EditorState.readOnly.of(readOnly)),
      languageFacet.of(languageOf(env)),
      themeFacet.of([dark ? darkTheme : lightTheme, syntaxHighlighting(dark ? darkHighlight : lightHighlight)]),
      lintFacet.of(lintExtension()),
      EditorView.updateListener.of(update => {
        if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
      }),
    ],
  })
}

onMounted(() => {
  if (!host.value) return
  dark = isDark()
  view = new EditorView({ state: buildState(props.modelValue, props.environment, !!props.readonly), parent: host.value })
  // 主题由 <html class="dark"> 决定，监听它的变化而不是自己猜。
  observer = new MutationObserver(() => {
    const next = isDark()
    if (next === dark || !view) return
    dark = next
    view.dispatch({ effects: themeFacet.reconfigure([dark ? darkTheme : lightTheme, syntaxHighlighting(dark ? darkHighlight : lightHighlight)]) })
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

let observer: MutationObserver | undefined

// 外部改动（切换语言载入草稿）要同步进编辑器，但不能打断用户正在进行的输入。
watch(() => props.modelValue, value => {
  if (!view) return
  const current = view.state.doc.toString()
  if (current === value) return
  view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
})
watch(() => props.environment, env => view?.dispatch({ effects: languageFacet.reconfigure(languageOf(env)) }))
watch(() => props.readonly, ro => view?.dispatch({ effects: readOnlyFacet.reconfigure(EditorState.readOnly.of(!!ro)) }))
watch(() => props.completion, v => {
  const g = globalThis as Record<string, unknown>
  g.__reconf = ((g.__reconf as number) || 0) + 1
  g.__hasCompletion = !!v
  view?.dispatch({ effects: completionFacet.reconfigure(completionExtension()) })
}, { immediate: false })
watch(() => props.diagnostics, () => view?.dispatch({ effects: lintFacet.reconfigure(lintExtension()) }))

onUnmounted(() => { observer?.disconnect(); view?.destroy(); view = undefined })

defineExpose({ focus: () => view?.focus() })
</script>

<template>
  <!-- 不能加 overflow-hidden：补全提示渲染在编辑器内部，裁剪会把 tooltip 整个切掉。 -->
  <div ref="host" class="learning-cm min-h-[320px] overflow-visible rounded-md border border-border/60 bg-background/40 text-sm" />
</template>

<style>
/* 编辑器高度跟随容器；内容多时内部滚动，不撑破页面，390px 下也不横向溢出。 */
.learning-cm .cm-editor { height: 100%; min-height: 320px; }
.learning-cm .cm-scroller {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  max-height: 70vh;
  overflow: auto;
}
.learning-cm .cm-editor.cm-focused { outline: none; }
.learning-cm .cm-tooltip { border-radius: 8px; border: 1px solid var(--border); }

/* —— 补全弹层（JetBrains 风：字母徽标 + 签名灰字 + 紧凑行高） —— */
.learning-cm .cm-tooltip.cm-tooltip-autocomplete {
  border-radius: 10px;
  padding: 5px;
  font-size: 13px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .18), 0 2px 8px rgba(0, 0, 0, .08);
}
.learning-cm .cm-tooltip-autocomplete ul { font-family: inherit; max-height: 330px; }
.learning-cm .cm-tooltip-autocomplete li {
  display: flex; align-items: baseline; gap: 7px;
  padding: 3px 10px 3px 5px;
  border-radius: 6px;
  line-height: 1.5;
}
.learning-cm .cm-tooltip-autocomplete li[aria-selected] { background: var(--muted); color: var(--foreground); }
/* 类型字母徽标：JB 的 m/f/c/v/k 那套，扁平色块不抢视线。 */
.learning-cm .cm-completionIcon {
  display: inline-flex; align-items: center; justify-content: center;
  align-self: center;
  width: 18px; height: 18px; padding: 0;
  font-size: 11px; font-weight: 700; font-style: normal;
  border-radius: 4px;
  opacity: 1;
}
.learning-cm .cm-completionIcon::after { display: block; }
.learning-cm .cm-completionIcon-method { background: rgba(168, 85, 247, .16); color: #a855f7; }
.learning-cm .cm-completionIcon-method::after { content: 'm'; }
.learning-cm .cm-completionIcon-function { background: rgba(217, 119, 6, .15); color: #d97706; }
.learning-cm .cm-completionIcon-function::after { content: 'f'; }
.learning-cm .cm-completionIcon-constructor { background: rgba(37, 99, 235, .14); color: #2563eb; }
.learning-cm .cm-completionIcon-constructor::after { content: 'C'; }
.learning-cm .cm-completionIcon-field, .learning-cm .cm-completionIcon-property { background: rgba(37, 99, 235, .13); color: #2563eb; }
.learning-cm .cm-completionIcon-field::after { content: 'f'; }
.learning-cm .cm-completionIcon-property::after { content: 'p'; }
.learning-cm .cm-completionIcon-variable { background: rgba(14, 165, 233, .14); color: #0284c7; }
.learning-cm .cm-completionIcon-variable::after { content: 'v'; }
.learning-cm .cm-completionIcon-class { background: rgba(13, 148, 136, .14); color: #0d9488; }
.learning-cm .cm-completionIcon-class::after { content: 'c'; }
.learning-cm .cm-completionIcon-struct { background: rgba(13, 148, 136, .14); color: #0d9488; }
.learning-cm .cm-completionIcon-struct::after { content: 's'; }
.learning-cm .cm-completionIcon-interface { background: rgba(13, 148, 136, .14); color: #0d9488; }
.learning-cm .cm-completionIcon-interface::after { content: 'i'; }
.learning-cm .cm-completionIcon-enum { background: rgba(79, 70, 229, .13); color: #4f46e5; }
.learning-cm .cm-completionIcon-enum::after { content: 'e'; }
.learning-cm .cm-completionIcon-namespace { background: rgba(100, 116, 139, .16); color: #64748b; }
.learning-cm .cm-completionIcon-namespace::after { content: 'n'; }
.learning-cm .cm-completionIcon-keyword { background: rgba(225, 29, 72, .12); color: #e11d48; }
.learning-cm .cm-completionIcon-keyword::after { content: 'k'; }
.learning-cm .cm-completionIcon-constant { background: rgba(8, 145, 178, .14); color: #0891b2; }
.learning-cm .cm-completionIcon-constant::after { content: 'C'; }
.learning-cm .cm-completionIcon-operator { background: rgba(100, 116, 139, .16); color: #64748b; }
.learning-cm .cm-completionIcon-operator::after { content: 'o'; }
.learning-cm .cm-completionIcon-type { background: rgba(13, 148, 136, .14); color: #0d9488; }
.learning-cm .cm-completionIcon-type::after { content: 'T'; }
.learning-cm .cm-completionIcon-snippet { background: rgba(100, 116, 139, .16); color: #64748b; }
.learning-cm .cm-completionIcon-snippet::after { content: 's'; }
.learning-cm .cm-completionIcon-file { background: rgba(100, 116, 139, .16); color: #64748b; }
.learning-cm .cm-completionIcon-file::after { content: 'F'; }
/* 签名跟在名字后面，淡一点；JB 就是这么排的。 */
.learning-cm .cm-completionLabel { font-family: inherit; }
.learning-cm .cm-completionDetail { margin-left: 1.4em; color: var(--muted-foreground); opacity: .8; font-style: normal; }
.learning-cm .cm-completionMatchedText { font-weight: 600; color: var(--foreground); text-decoration: none; }
.learning-cm .cm-completionInfo {
  border-radius: 10px; border: 1px solid var(--border);
  padding: 10px 12px; font-size: 12px; max-width: 340px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .18);
}
</style>
