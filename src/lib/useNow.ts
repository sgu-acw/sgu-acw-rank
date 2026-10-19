import { onMounted, onUnmounted, ref } from 'vue'

/** 时间窗口应随时钟生效；切回标签页时立即校准，不依赖重新读取列表。 */
export function useNow() {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  const update = () => { now.value = Date.now() }
  onMounted(() => {
    update()
    timer = setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
  })
  onUnmounted(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', update)
  })
  return now
}
