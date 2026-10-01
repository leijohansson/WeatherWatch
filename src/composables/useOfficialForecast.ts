import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { fetchArmyCat, fetchTwoHourForecast, type TwoHourForecast } from '@/lib/officialForecast'

const REFRESH_MS = 5 * 60_000

/**
 * The published forecasts that Discrepancy is judged against. Either can be missing; sectors then
 * show Thunderstorm or Clear only.
 */
export function useOfficialForecast() {
  const twoHour = shallowRef<TwoHourForecast | null>(null)
  const armyCat = shallowRef<Record<string, string> | null>(null)
  const armyConfigured = ref(true)
  let timer: ReturnType<typeof setInterval> | undefined

  async function refresh() {
    const [forecast, cat] = await Promise.allSettled([fetchTwoHourForecast(), fetchArmyCat()])
    if (forecast.status === 'fulfilled') twoHour.value = forecast.value
    if (cat.status === 'fulfilled') {
      armyConfigured.value = cat.value !== null
      armyCat.value = cat.value
    }
  }

  onMounted(() => {
    void refresh()
    timer = setInterval(() => void refresh(), REFRESH_MS)
  })
  onBeforeUnmount(() => clearInterval(timer))

  return { twoHour, armyCat, armyConfigured, refresh }
}
