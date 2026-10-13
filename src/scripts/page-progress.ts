/**
 * ClientRouter 页面切换反馈。
 *
 * Astro 的导航请求没有可用的真实进度值，所以这里用「开始 → 处理中 → 完成」
 * 三段状态表达等待，而不是伪造精确百分比。页面切换时公共导航保持稳定，主内容
 * 在交换完成后短暂淡入，用户能明确知道请求正在进行以及页面已经换好。
 */

let progressTimer: ReturnType<typeof setTimeout> | null = null

function bar(): HTMLElement | null {
  return document.getElementById('nav-progress')
}

function setProgress(width: string, opacity = '1') {
  const element = bar()
  if (!element) return
  element.style.width = width
  element.style.opacity = opacity
}

function start() {
  if (progressTimer) clearTimeout(progressTimer)
  setProgress('22%')
  progressTimer = setTimeout(() => setProgress('62%'), 260)
}

function complete() {
  if (progressTimer) clearTimeout(progressTimer)
  setProgress('100%')
  progressTimer = setTimeout(() => {
    setProgress('100%', '0')
    progressTimer = setTimeout(() => setProgress('0%', '0'), 240)
  }, 140)
}

function animateContent() {
  const main = document.querySelector<HTMLElement>('main[data-page-main]')
  if (!main) return
  main.classList.remove('page-enter-active')
  requestAnimationFrame(() => {
    requestAnimationFrame(() => main.classList.add('page-enter-active'))
  })
}

document.addEventListener('astro:before-preparation', start)
document.addEventListener('astro:page-load', () => {
  complete()
  animateContent()
})
