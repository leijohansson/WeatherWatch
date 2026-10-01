import { shallowRef } from 'vue'
import type { GeoCollection } from '@/lib/mapGeometry'

export interface CoastProperties {
  kind: 'land' | 'sea'
  source?: string
}
export interface SectorProperties {
  id: string
  name: string
  forecastArea?: string
}

const coast = shallowRef<GeoCollection<CoastProperties> | null>(null)
const townships = shallowRef<GeoCollection<SectorProperties> | null>(null)
const army = shallowRef<GeoCollection<SectorProperties> | null>(null)
let loading: Promise<void> | null = null

async function load<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url)
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

/** The static map layers in public/geo, loaded once and shared. Missing files leave a layer empty. */
export function useGeoLayers() {
  loading ??= Promise.all([
    load<GeoCollection<CoastProperties>>(`${import.meta.env.BASE_URL}geo/coast.geojson`),
    load<GeoCollection<SectorProperties>>(`${import.meta.env.BASE_URL}geo/townships.geojson`),
    load<GeoCollection<SectorProperties>>(`${import.meta.env.BASE_URL}geo/army-cat1.geojson`),
  ]).then(([c, t, a]) => {
    coast.value = c
    townships.value = t
    army.value = a
  })
  return { coast, townships, army, loaded: loading }
}
