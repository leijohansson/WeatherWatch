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
})
