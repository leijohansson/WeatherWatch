import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import App from '@/App.vue'
import LayersPanel from './LayersPanel.vue'
import LocationStatus from './LocationStatus.vue'
import { defaultLiveSettings, STORAGE_KEY } from '@/composables/usePersistence'
import type { LiveLocation, Strike } from '@/types'

const MIN = 60_000
const NOW = Date.UTC(2026, 9, 1, 6, 30)

const home: LiveLocation = {
  id: 'home',
  name: 'Home',
  lat: 1.35,
  lon: 103.82,
  radiusKm: 8,
  countCloudToCloud: true,
  showCountdown: true,
  notifyStrike: true,
  notifyAllClear: true,
}

const strikeNear = (ageMin: number, type: Strike['type'] = 'cg'): Strike => ({
  id: `${type}-${ageMin}`,
  time: NOW - ageMin * MIN,
  lat: 1.37,
  lon: 103.82,
  type,
})

describe('layers panel', () => {
  it('disables the forecast while sectors are off and restores it after', async () => {
    const layers = reactive(defaultLiveSettings().layers)
    const wrapper = mount(LayersPanel, { props: { layers } })
    const forecast = () => wrapper.get<HTMLInputElement>('input[aria-label="Recommended forecast"]')
    expect(forecast().element.checked).toBe(true)

    await wrapper.findAll('input[name="sectors"]')[2]!.setValue()
    expect(layers.sectors).toBe('off')
    expect(forecast().element.checked).toBe(false)
    expect(forecast().element.disabled).toBe(true)
    expect(wrapper.text()).toContain('Pick a sector set to use')
    expect(wrapper.get('.layer-link').attributes('tabindex')).toBe('-1')

    await wrapper.findAll('input[name="sectors"]')[1]!.setValue()
    expect(layers.sectors).toBe('army')
    expect(forecast().element.checked).toBe(true)
  })
})

describe('location status', () => {
  const mountStatus = (strikes: Strike[], ringState: 'active' | 'clear', allClearEnabled = true) =>
    mount(LocationStatus, {
      props: {
        locations: [home],
        ringStates: { home: ringState },
        strikes,
        now: NOW,
        settings: { ...defaultLiveSettings(), allClearEnabled },
      },
    })

  it('shows an active ring with its countdown', () => {
    const wrapper = mountStatus([strikeNear(1)], 'active')
    expect(wrapper.text()).toContain('ACTIVE')
    expect(wrapper.text()).toMatch(/Ground strike 2\.2 km away, inside the 8 km ring · 1 min ago/)
    expect(wrapper.get('.countdown-time').text()).toBe('14:00')
    expect(wrapper.text()).toContain('restarts on each strike inside 8 km')
  })

  it('hides countdowns when the all-clear countdown is off', () => {
    const wrapper = mountStatus([strikeNear(1)], 'active', false)
    expect(wrapper.find('.countdown').exists()).toBe(false)
  })

  it('counts strikes by type and age', () => {
    const wrapper = mountStatus([strikeNear(1), strikeNear(7, 'cc'), strikeNear(20)], 'active')
    const cells = wrapper.findAll('.strike-table td').map((td) => td.text())
    expect(cells).toEqual(['1', '0', '1', '0', '1', '0'])
  })

  it('reports all clear', () => {
    const wrapper = mountStatus([], 'clear')
    expect(wrapper.text()).toContain('CLEAR')
    expect(wrapper.text()).toContain('No strikes in the last 30 min')
    expect(wrapper.text()).toContain('1 location · alerts for strikes in ring, all-clear')
  })
})

describe('live deep link', () => {
  it('shows a dismissible chip for an alert link', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        areas: [],
        history: [],
        alertState: {},
        settings: { monitoring: false, overlayOpacity: 0.8, soundAlerts: false, soundVolume: 70 },
        liveLocations: [home],
        live: {},
        lightningState: {},
      }),
    )
    window.location.hash = '#/live?focus=home&from=alert'
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.get('.alert-chip').text()).toContain('FROM ALERT')
    // There's no backend in tests, so the lightning feed fails and Live says so.
    expect(wrapper.get('.data-warnings').text()).toContain('Not getting live lightning')
    expect(wrapper.get('.alert-chip').text()).toContain('Home')
    await wrapper.get('.chip-dismiss').trigger('click')
    await flushPromises()
    expect(window.location.hash).toBe('#/live?focus=home')
    expect(wrapper.find('.alert-chip').exists()).toBe(false)
    wrapper.unmount()
    window.location.hash = ''
  })
})
