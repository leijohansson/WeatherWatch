import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import fixture from '@/test/fixtures/lightning-sample.json'
import { mergeStrikes, STRIKE_WINDOW_MIN } from '@/lib/lightning'
import {
  FixtureLightningSource,
  HttpLightningSource,
  type LightningResponse,
  type LightningSource,
} from '@/lib/lightningApi'
import type { MonitoringStatus, Strike } from '@/types'

export const LIGHTNING_POLL_MS = 60_000
// Records are issued every 2 minutes and cover the 2 minutes before that, so re-ask for a little overlap.
const OVERLAP_MS = 6 * 60_000
const WINDOW_MS = STRIKE_WINDOW_MIN * 60_000

interface FeedOptions {
  enabled: Ref<boolean>
  source?: LightningSource
  clock?: () => number
  /** Called after every successful poll with the full buffer. */
  onUpdate?: (strikes: Strike[], source: LightningSource['kind']) => void
}

export function useLightningFeed(options: FeedOptions) {
  const clock = options.clock ?? Date.now
  const liveSource = options.source ?? new HttpLightningSource()
  const source = shallowRef<LightningSource>(liveSource)
  const strikes = shallowRef<Strike[]>([])
  const status = ref<MonitoringStatus>('idle')
  const lastError = ref<string | null>(null)
  const lastUpdated = ref<number | null>(null)
  const testMode = computed(() => source.value.kind === 'test')
  let lastSuccess: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0

  async function poll() {
    if (!options.enabled.value && !testMode.value) return
    if (status.value === 'checking') return
    clearTimeout(timer)
    const current = generation
    const now = clock()
    if (!testMode.value && !navigator.onLine) {
      status.value = 'offline'
      lastError.value = 'You appear to be offline. Strikes already received are still shown.'
      scheduleNext()
      return
    }
    status.value = 'checking'
    try {
      const since = lastSuccess === null ? now - WINDOW_MS : Math.max(now - WINDOW_MS, lastSuccess - OVERLAP_MS)
      const incoming = await source.value.fetchSince(since)
      if (current !== generation) return
      strikes.value = mergeStrikes(strikes.value, incoming, clock())
      lastSuccess = now
      lastUpdated.value = now
      lastError.value = null
      status.value = 'monitoring'
      options.onUpdate?.(strikes.value, source.value.kind)
    } catch {
      if (current !== generation) return
      status.value = 'error'
      lastError.value = 'The lightning feed could not be loaded. Strikes already received are still shown.'
    }
    scheduleNext()
  }

  function scheduleNext() {
    clearTimeout(timer)
    if (!options.enabled.value && !testMode.value) return
    timer = setTimeout(() => void poll(), LIGHTNING_POLL_MS)
  }

  function switchSource(next: LightningSource) {
    generation += 1
    clearTimeout(timer)
    source.value = next
    strikes.value = []
    lastSuccess = null
    lastUpdated.value = null
    status.value = 'idle'
    return poll()
  }

  /** Replays the bundled storm so Live mode and alerts can be tried without a real one. */
  function useFixture() {
    return switchSource(new FixtureLightningSource(fixture as LightningResponse, clock))
  }

  function leaveFixture() {
    return switchSource(liveSource)
  }

  const newestStrikeTime = computed(() => strikes.value.at(-1)?.time ?? null)

  watch(
    () => options.enabled.value,
    (enabled) => {
      if (enabled) void poll()
      else if (!testMode.value) {
        clearTimeout(timer)
        status.value = 'idle'
      }
    },
  )

  onMounted(() => {
    if (options.enabled.value) void poll()
  })
  onBeforeUnmount(() => clearTimeout(timer))

  return {
    strikes,
    status,
    lastError,
    lastUpdated,
    newestStrikeTime,
    testMode,
    poll,
    useFixture,
    leaveFixture,
  }
}
