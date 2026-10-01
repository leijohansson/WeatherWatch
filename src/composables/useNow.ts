import { onBeforeUnmount, onMounted, ref } from 'vue'

/** The current time, refreshed every `intervalMs`, for countdowns and strike ages. */
export function useNow(intervalMs = 1000, clock: () => number = Date.now) {
  const now = ref(clock())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    timer = setInterval(() => {
      now.value = clock()
    }, intervalMs)
  })
  onBeforeUnmount(() => clearInterval(timer))
  return now
}
