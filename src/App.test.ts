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

describe('Rainwatch app', () => {
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
    expect(wrapper.find('polygon').attributes('points')).toBe('10,10 50,10 50,50')
    expect(wrapper.text()).toContain('Office')
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
    expect(wrapper.get('select').element.value).toBe('heavy')
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
})
