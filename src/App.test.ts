import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { STORAGE_KEY } from '@/composables/usePersistence'

function mountApp() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      areas: [],
      history: [],
      alertState: {},
      settings: { monitoring: false, overlayOpacity: 0.8 },
    }),
  )
  return mount(App, { attachTo: document.body })
}

describe('WeatherWatch app', () => {
  it('creates a polygon with normalized vertices and edits its settings', async () => {
    const wrapper = mountApp()
    await wrapper.get('button.add-button').trigger('click')
    const map = wrapper.get('[data-testid="radar-map"]')
    vi.spyOn(map.element, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 400,
      height: 400,
      right: 410,
      bottom: 420,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    })
    await map.trigger('click', { clientX: 50, clientY: 60 })
    await map.trigger('click', { clientX: 210, clientY: 60 })
    await map.trigger('click', { clientX: 210, clientY: 220 })
    await wrapper.get('button.primary-button').trigger('click')

    const name = wrapper.get('input[aria-label="Area name"]')
    await name.setValue('Office')
    await name.trigger('change')
    expect(wrapper.find('polygon.area-shape').attributes('points')).toBe('10,10 50,10 50,50')
    expect(wrapper.text()).toContain('Office')
    expect(wrapper.findAll('circle.vertex')).toHaveLength(3)
    await map.trigger('click')
    expect(wrapper.findAll('circle.vertex')).toHaveLength(0)
    expect(wrapper.text()).toContain('1 alert area configured')
    expect(wrapper.text()).not.toContain('No alert areas yet')
    wrapper.unmount()
  })

  it('shows notification states and keeps explicit test controls isolated', async () => {
    const wrapper = mountApp()
    expect(wrapper.text()).toContain('Enable desktop notifications')
    await wrapper.get('.notification-button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Desktop notifications on')
    expect(wrapper.text()).toContain('Test notification sent')

    const testButtons = wrapper.findAll('.test-card .button-row button')
    expect(testButtons[0]?.text()).toContain('Clear frame')
    expect(testButtons[1]?.text()).toContain('Sample frame')
    await testButtons[0]!.trigger('click')
    expect(wrapper.text()).toContain('Test mode')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).alertState).toEqual({})
    await wrapper.get('.test-card .text-button').trigger('click')
    expect(wrapper.text()).not.toContain('Test mode')
    wrapper.unmount()
  })

  it('restores persisted areas and exposes monitoring status', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        areas: [
          {
            id: 'home',
            name: 'Home',
            color: '#ff0000',
            enabled: true,
            vertices: [
              { x: 0.1, y: 0.1 },
              { x: 0.2, y: 0.1 },
              { x: 0.2, y: 0.2 },
            ],
            intensityThreshold: 'heavy',
            pixelThreshold: 9,
            notifyNewCell: false,
          },
        ],
        history: [],
        alertState: {},
        settings: { monitoring: false, overlayOpacity: 0.7 },
      }),
    )
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Home')
    expect(wrapper.text()).toContain('Monitoring paused')
    expect(wrapper.get('input[aria-label="Minimum rain intensity"]').element.value).toBe('3')
  })

  it('reports offline monitoring without clearing persisted rain state', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        areas: [],
        history: [],
        alertState: {
          home: { rainy: true, maximumIntensity: 'heavy', clusterPixels: [[1, 2, 3]] },
        },
        settings: { monitoring: true, overlayOpacity: 0.8 },
      }),
    )
    const wrapper = mount(App)
    await flushPromises()
    expect(wrapper.text()).toContain('Offline')
    expect(wrapper.text()).toContain('Existing rain states were preserved')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).alertState.home.rainy).toBe(true)
    wrapper.unmount()
  })

  it('switches modes with the tabs and drops the hero', async () => {
    window.location.hash = ''
    const wrapper = mountApp()
    expect(wrapper.text()).not.toContain('Watch the weather')
    const tabs = wrapper.findAll('.mode-tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]?.classes()).toContain('selected')
    await tabs[1]!.trigger('click')
    await flushPromises()
    expect(window.location.hash).toBe('#/live')
    expect(wrapper.findAll('.mode-tab')[1]?.classes()).toContain('selected')
    expect(wrapper.find('[data-testid="radar-map"]').exists()).toBe(false)
    window.location.hash = '#/watch'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await flushPromises()
    expect(wrapper.find('[data-testid="radar-map"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('raises a lightning alert from the test storm and links into Live', async () => {
    window.location.hash = ''
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        areas: [
          {
            id: 'central',
            name: 'Central',
            color: '#ffb454',
            enabled: true,
            vertices: [
              { x: 0.4, y: 0.48 },
              { x: 0.58, y: 0.48 },
              { x: 0.58, y: 0.62 },
              { x: 0.4, y: 0.62 },
            ],
            intensityThreshold: 'moderate',
            pixelThreshold: 20,
            notifyNewCell: true,
            lightningEnabled: true,
            lightningBufferKm: 5,
            lightningTypes: 'cg',
            openLiveOnAlert: true,
          },
        ],
        history: [],
        alertState: {},
        settings: { monitoring: false, overlayOpacity: 0.8, soundAlerts: false, soundVolume: 70 },
        liveLocations: [],
        live: {},
        lightningState: {},
      }),
    )
    const wrapper = mount(App, { attachTo: document.body })
    const stormButton = wrapper.findAll('.test-card button').find((b) => b.text() === 'Lightning storm')
    await stormButton!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Test mode')
    expect(wrapper.text()).toContain('Lightning nearby')
    expect(wrapper.text()).toMatch(/\d+ ground within 5 km · nearest/)
    expect(wrapper.get('.event-link').attributes('href')).toBe('#/live?focus=central&from=alert')
    expect(wrapper.findAll('.strike-mark').length).toBeGreaterThan(20)
    // Test storms never touch the persisted lightning state.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').lightningState ?? {}).toEqual({})
    wrapper.unmount()
  })
})
