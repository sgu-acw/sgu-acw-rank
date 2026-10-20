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
      autocompletion(props.completion ? { override: [props.completion as never] } : {}),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
      EditorView.lineWrapping,
      placeholder('在此编写代码…'),
      EditorState.readOnly.of(readOnly),
      languageFacet.of(languageOf(env)),
      themeFacet.of([dark ? darkTheme : lightTheme, syntaxHighlighting(dark ? darkHighlight : lightHighlight)]),
      props.diagnostics ?? [],
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
watch(() => props.readonly, ro => view?.dispatch({ effects: EditorState.readOnly.reconfigure(!!ro) }))

onUnmounted(() => { observer?.disconnect(); view?.destroy(); view = undefined })

defineExpose({ focus: () => view?.focus() })
</script>

<template>
  <div ref="host" class="learning-cm min-h-[320px] overflow-hidden rounded-md border border-border/60 bg-background/40 text-sm" />
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
</style>
