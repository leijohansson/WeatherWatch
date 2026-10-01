import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import RadarMap from './RadarMap.vue'
import type { AlertArea } from '@/types'

describe('RadarMap', () => {
  it('emits normalized vertex edits independent of displayed dimensions', async () => {
    const area: AlertArea = {
      id: 'home',
      name: 'Home',
      color: '#ff0000',
      enabled: true,
      vertices: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.5 },
      ],
      intensityThreshold: 'light',
      pixelThreshold: 1,
      notifyNewCell: false,
    }
    const wrapper = mount(RadarMap, {
      props: {
        areas: [area],
        selectedId: area.id,
        drawing: false,
        draft: [],
        overlayUrl: '/radar.png',
        overlayOpacity: 0.7,
        rainyAreaIds: new Set(),
      },
    })
    const map = wrapper.get('[data-testid="radar-map"]')
    vi.spyOn(map.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: 600,
      height: 600,
      right: 700,
      bottom: 650,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    })
    await wrapper.get('circle.vertex').trigger('pointerdown', { pointerId: 1 })
    await map.trigger('pointermove', { clientX: 400, clientY: 350, pointerId: 1 })
    await map.trigger('pointerup', { pointerId: 1 })
    expect(wrapper.emitted('move-vertex')?.[0]).toEqual(['home', 0, { x: 0.5, y: 0.5 }])
    expect(wrapper.emitted('move-vertex-end')?.[0]).toEqual(['home'])
    expect(wrapper.get('.radar-overlay').attributes('crossorigin')).toBe('anonymous')
  })

  it('places corners at the right map position when zoomed, and panning places none', async () => {
    const wrapper = mount(RadarMap, {
      props: {
        areas: [],
        selectedId: null,
        drawing: true,
        draft: [],
        overlayUrl: null,
        overlayOpacity: 0.7,
        rainyAreaIds: new Set(),
      },
    })
    const map = wrapper.get('[data-testid="radar-map"]')
    vi.spyOn(map.element, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}),
    })
    await wrapper.get('button[aria-label="Zoom in"]').trigger('click')
    expect(wrapper.get('svg[aria-label="Alert areas"]').attributes('viewBox')).toBe('16.666666666666664 16.666666666666664 66.66666666666667 66.66666666666667')

    // The viewport's top-left corner is a sixth of the way into the map at 1.5×.
    await map.trigger('click', { clientX: 0, clientY: 0 })
    const [first] = wrapper.emitted('map-click')![0] as [{ x: number; y: number }]
    expect(first.x).toBeCloseTo(1 / 6, 6)
    expect(first.y).toBeCloseTo(1 / 6, 6)

    await map.trigger('pointerdown', { button: 0, clientX: 200, clientY: 200 })
    await map.trigger('pointermove', { clientX: 260, clientY: 200 })
    await map.trigger('pointerup', {})
    await map.trigger('click', { clientX: 260, clientY: 200 })
    expect(wrapper.emitted('map-click')).toHaveLength(1)
    expect(wrapper.get('svg[aria-label="Alert areas"]').attributes('viewBox')).not.toContain('16.666666666666664 16')
  })
})

