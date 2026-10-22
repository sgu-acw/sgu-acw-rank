/** 分栏拖拽：跟踪发起拖动的指针，取消或离开窗口时结束并保存。 */
export function loadSplit(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(`learning-split:${key}`))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch { return fallback }
}
export function saveSplit(key: string, value: number) {
  try { localStorage.setItem(`learning-split:${key}`, String(value)) } catch { /* 忽略 */ }
}
function drag(event: PointerEvent, onMove: (event: PointerEvent) => void, onEnd?: () => void) {
  if (event.button !== 0 || !event.isPrimary) return
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  const pointer = event.pointerId
  target.setPointerCapture(pointer)
  const move = (e: PointerEvent) => { if (e.pointerId === pointer) onMove(e) }
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', end)
    target.removeEventListener('pointercancel', end)
    target.removeEventListener('lostpointercapture', end)
    window.removeEventListener('blur', end)
    if (target.hasPointerCapture(pointer)) target.releasePointerCapture(pointer)
    onEnd?.()
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', end)
  target.addEventListener('pointercancel', end)
  target.addEventListener('lostpointercapture', end)
  window.addEventListener('blur', end)
}
export function dragHorizontal(event: PointerEvent, container: HTMLElement, onMove: (ratio: number) => void, onEnd?: () => void) {
  const rect = container.getBoundingClientRect()
  drag(event, e => onMove(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))), onEnd)
}
export function dragVertical(event: PointerEvent, onMove: (clientY: number) => void, onEnd?: () => void) {
  drag(event, e => onMove(e.clientY), onEnd)
}
