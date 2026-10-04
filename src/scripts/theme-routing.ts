/**
 * 让主题在客户端路由切换时活下来。
 *
 * **问题**
 *
 * Astro 的 ClientRouter 交换页面时会调 ``swapRootAttributes``：它先把当前
 * ``<html>`` 上的属性全部删掉，再设成新文档的。而新文档的 ``<html>`` 是
 * 服务端渲染的，不带任何类——所以用户选的主题在每次导航后都被抹掉，
 * 系统偏好和用户选择不一致时就表现为「切换页面后主题变了」。
 *
 * ``
 * astro:before-swap`` 在属性交换**之前**触发，且能拿到新文档。在这里把类
 * 写上去，交换时就自然带过来了。
 *
 * **为什么不放在 head 的内联脚本里**
 *
 * 内联脚本每次导航都会被重新执行（head 合并），但执行时机在 swapRootAttributes
 * **之后**——那时类已经被删了，脚本里那句 ``add`` 虽然能补回来，中间却隔了
 * 一帧。监听 ``before-swap`` 才是没有间隙的做法。
 *
 * 另外内联脚本会被 Cloudflare 的 Rocket Loader 改写 type 而延迟执行，
 * 这个模块由 Astro 打包，走的是另一条路径。
 */

import type { TransitionBeforeSwapEvent } from 'astro:transitions/client'

type Theme = 'dark' | 'light'

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem('theme')
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    // 隐私模式下 localStorage 会抛异常。跟随系统就够了。
    return null
  }
}

/** 把当前该用的主题写到给定文档的 html 上。 */
function applyTo(doc: Document) {
  const saved = savedTheme()
  if (!saved) return
  // 两个类都清掉再设，避免 dark 和 light 同时挂着时优先级打架。
  doc.documentElement.classList.remove('dark', 'light')
  doc.documentElement.classList.add(saved)
}

/*
 * 注册导航前的钩子。
 *
 * 这个文件通过 BaseLayout 里的 <script> 标签引入——用 ``import`` 的话
 * rollup 会把它当成无副作用的模块 tree-shake 掉，打包产物里根本没有它。
 */
document.addEventListener('astro:before-swap', (event) => {
  applyTo((event as TransitionBeforeSwapEvent).newDocument)
})

// 首次加载由 head 里的内联脚本处理，这里不重复——那时 html 是新建的，
// 不带类，内联脚本挂上就行，没有需要抢救的东西。
