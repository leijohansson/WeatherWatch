import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
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
}

const strikeNear = (ageMin: number, type: Strike['type'] = 'cg'): Strike => ({
  id: `${type}-${ageMin}`,
  time: NOW - ageMin * MIN,
  lat: 1.37,
  lon: 103.82,
  type,
})

describe('layers panel', () => {
  it('can be minimised and names the Army set Army Sectors', async () => {
    const layers = reactive(defaultLiveSettings().layers)
    const wrapper = mount(LayersPanel, { props: { layers, collapsed: false } })
    expect(wrapper.text()).toContain('Army Sectors')
    await wrapper.get('.layers-minimise').trigger('click')
    expect(wrapper.emitted('toggle-collapsed')).toHaveLength(1)
    await wrapper.setProps({ collapsed: true })
    expect(wrapper.classes()).toContain('collapsed')
    expect(wrapper.get('.layers-minimise').attributes('aria-expanded')).toBe('false')
  })

  it('disables the forecast while sectors are off and restores it after', async () => {
    const layers = reactive(defaultLiveSettings().layers)
    const wrapper = mount(LayersPanel, { props: { layers, collapsed: false } })
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
    expect(wrapper.text()).toContain('1 location · alerts for strikes in ring')
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

function storeState(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      areas: [],
      history: [],
      alertState: {},
      settings: { monitoring: false, overlayOpacity: 0.8, soundAlerts: true, soundVolume: 70 },
      liveLocations: [home],
      live: {},
      ...overrides,
    }),
  )
}

describe('adding a location', () => {
  it('places the pin on the map first, then opens setup', async () => {
    storeState()
    window.location.hash = '#/live'
    const wrapper = mount(App, { attachTo: document.body })
    await flushPromises()
    await wrapper.get('.location-status .add-button').trigger('click')
    expect(wrapper.text()).toContain('Place your location')
    expect(wrapper.get('[data-testid="live-map"]').classes()).toContain('placing')
    const continueButton = () => wrapper.findAll('.drawing-card button').find((b) => b.text() === 'Continue')!
    expect(continueButton().attributes('disabled')).toBeDefined()

    const map = wrapper.get('[data-testid="live-map"]')
    await map.trigger('pointerdown', { button: 0, clientX: 100, clientY: 100 })
    await map.trigger('pointerup', { clientX: 100, clientY: 100 })
    expect(wrapper.text()).toContain('Pin placed at')
    await continueButton().trigger('click')
    expect(wrapper.text()).toContain('New location')
    await wrapper.get('input#location-name').setValue('Office')
    const save = wrapper.findAll('button').find((b) => b.text() === 'Save location')!
    await save.trigger('click')
    expect(wrapper.findAll('.location-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('Office')
    wrapper.unmount()
    window.location.hash = ''
  })
})

describe('rain alert tone', () => {
  function rainyCanvas() {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4)
        for (let i = 0; i < data.length; i += 4) data.set([30, 250, 0, 255], i)
        return { data }
      },
    })) as never
    vi.stubGlobal(
      'Audio',
      class {
        play = vi.fn(() => Promise.resolve())
        pause = vi.fn()
        loop = false
        volume = 1
        currentTime = 0
        addEventListener() {}
      },
    )
  }

  const area = {
    id: 'home',
    name: 'Home',
    color: '#fff',
    enabled: true,
    vertices: [
      { x: 0.4, y: 0.4 },
      { x: 0.6, y: 0.4 },
      { x: 0.6, y: 0.6 },
    ],
    intensityThreshold: 'moderate',
    pixelThreshold: 1,
    notifyNewCell: false,
  }

  it('sounds on Watch until acknowledged, and stops when leaving Watch', async () => {
    rainyCanvas()
    storeState({ areas: [area] })
    window.location.hash = '#/watch'
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.text()).toContain('Alerts only notify and sound while Watch is open.')
    const sample = wrapper.findAll('.test-card button').find((b) => b.text() === 'Sample frame')!

    await sample.trigger('click')
    await flushPromises()
    expect(wrapper.get('.alert-banner').text()).toContain('RAIN ALERT')
    await wrapper.get('.alert-banner button').trigger('click')
    expect(wrapper.find('.alert-banner').exists()).toBe(false)

    await wrapper.get('.test-card .text-button').trigger('click')
    await sample.trigger('click')
    await flushPromises()
    expect(wrapper.find('.alert-banner').exists()).toBe(true)
    await wrapper.findAll('.mode-tab')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.alert-banner').exists()).toBe(false)
    wrapper.unmount()
    window.location.hash = ''
  })

  it('stays quiet when rain alerts are off', async () => {
    rainyCanvas()
    storeState({
      areas: [area],
      settings: {
        monitoring: false,
        overlayOpacity: 0.8,
        soundAlerts: true,
        soundVolume: 70,
        alertTypes: { rain: false, lightning: true, discrepancy: true },
      },
    })
    window.location.hash = '#/watch'
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.findAll('.test-card button').find((b) => b.text() === 'Sample frame')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.alert-banner').exists()).toBe(false)
    expect(wrapper.text()).toContain('Rain entered')
    wrapper.unmount()
    window.location.hash = ''
  })
})

