/**
 * 分栏拖拽：宽度比（两栏布局）和高度（单栏编辑器）共用一个指针拖拽 helper。
 * 值存 localStorage，刷新后记住。
 */
export function loadSplit(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(`learning-split:${key}`))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch { return fallback }
}
export function saveSplit(key: string, value: number) {
  try { localStorage.setItem(`learning-split:${key}`, String(value)) } catch { /* 忽略 */ }
}

/** pointerdown 后接管 move/up；onMove 收到容器内 0..1 的横向比例。 */
export function dragHorizontal(
  event: PointerEvent,
  container: HTMLElement,
  onMove: (ratio: number) => void,
  onEnd?: () => void,
) {
  const rect = container.getBoundingClientRect()
  const move = (ev: PointerEvent) => onMove(Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)))
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    onEnd?.()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/** 纵向拖拽：onMove 收到指针 clientY（相对文档）。 */
export function dragVertical(event: PointerEvent, onMove: (clientY: number) => void, onEnd?: () => void) {
  const move = (ev: PointerEvent) => onMove(ev.clientY)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    onEnd?.()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
