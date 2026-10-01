import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { fetchArmyCat, fetchTwoHourForecast, type TwoHourForecast } from '@/lib/officialForecast'

const REFRESH_MS = 5 * 60_000

/**
 * The published forecasts that Discrepancy is judged against. A failed refresh keeps the last good
 * data and records the failure, so Live can say it isn't getting live information.
 */
export function useOfficialForecast(clock: () => number = Date.now) {
  const twoHour = shallowRef<TwoHourForecast | null>(null)
  const twoHourUpdated = ref<number | null>(null)
  const twoHourFailed = ref(false)
  const armyCat = shallowRef<Record<string, string> | null>(null)
  const armyUpdated = ref<number | null>(null)
  const armyFailed = ref(false)
  const armyConfigured = ref(true)
  let timer: ReturnType<typeof setInterval> | undefined

  async function refresh() {
    const [forecast, cat] = await Promise.allSettled([fetchTwoHourForecast(), fetchArmyCat()])
    if (forecast.status === 'fulfilled') {
      twoHour.value = forecast.value
      twoHourUpdated.value = clock()
      twoHourFailed.value = false
    } else {
      twoHourFailed.value = true
    }
    if (cat.status === 'fulfilled') {
      armyConfigured.value = cat.value !== null
      armyCat.value = cat.value
      armyUpdated.value = cat.value ? clock() : null
      armyFailed.value = false
    } else {
      armyFailed.value = true
    }
  }

  onMounted(() => {
    void refresh()
    timer = setInterval(() => void refresh(), REFRESH_MS)
  })
  onBeforeUnmount(() => clearInterval(timer))

  return {
    twoHour,
    twoHourUpdated,
    twoHourFailed,
    armyCat,
    armyUpdated,
    armyFailed,
    armyConfigured,
    refresh,
  }
}
