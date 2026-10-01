import { defineComponent, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIGHTNING_POLL_MS, useLightningFeed } from './useLightningFeed'
import type { LightningSource } from '@/lib/lightningApi'
import type { Strike } from '@/types'

const MIN = 60_000

function mountFeed(options: Parameters<typeof useLightningFeed>[0]) {
  let feed!: ReturnType<typeof useLightningFeed>
  const wrapper = mount(
    defineComponent({
      setup() {
        feed = useLightningFeed(options)
        return () => h('div')
      },
    }),
  )
  return { feed, wrapper }
}

function strike(id: string, time: number): Strike {
  return { id, time, lat: 1.35, lon: 103.82, type: 'cg' }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('lightning feed', () => {
  it('backfills 30 minutes, then polls every minute with overlap and de-duplicates', async () => {
    vi.useFakeTimers()
    let now = Date.parse('2026-10-01T14:30:00+08:00')
    const calls: number[] = []
    const responses = [
      [strike('a', now - 20 * MIN), strike('b', now - 2 * MIN)],
      [strike('b', now - 2 * MIN), strike('c', now)],
    ]
    const source: LightningSource = {
      kind: 'live',
      fetchSince: vi.fn(async (since: number) => {
        calls.push(since)
        return responses.shift() ?? []
      }),
    }
    const { feed, wrapper } = mountFeed({ enabled: ref(true), source, clock: () => now })
    await flushPromises()
    expect(calls[0]).toBe(now - 30 * MIN)
    expect(feed.strikes.value.map((s) => s.id)).toEqual(['a', 'b'])
    expect(feed.status.value).toBe('monitoring')

    const firstPoll = now
    now += LIGHTNING_POLL_MS
    await vi.advanceTimersByTimeAsync(LIGHTNING_POLL_MS)
    expect(calls[1]).toBe(firstPoll - 6 * MIN)
    expect(feed.strikes.value.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    wrapper.unmount()
  })

  it('keeps strikes and reports an error when the source fails', async () => {
    const now = Date.parse('2026-10-01T14:30:00+08:00')
    let fail = false
    const source: LightningSource = {
      kind: 'live',
      fetchSince: vi.fn(async () => {
        if (fail) throw new Error('boom')
        return [strike('a', now - MIN)]
      }),
    }
    const { feed, wrapper } = mountFeed({ enabled: ref(true), source, clock: () => now })
    await flushPromises()
    fail = true
    await feed.poll()
    expect(feed.status.value).toBe('error')
    expect(feed.lastError.value).toContain('could not be loaded')
    expect(feed.strikes.value).toHaveLength(1)
    wrapper.unmount()
  })

  it('reports offline without calling the source', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const source: LightningSource = { kind: 'live', fetchSince: vi.fn(async () => []) }
    const { feed, wrapper } = mountFeed({ enabled: ref(true), source })
    await flushPromises()
    expect(feed.status.value).toBe('offline')
    expect(source.fetchSince).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('switches to the fixture storm and back, even with monitoring off', async () => {
    const source: LightningSource = { kind: 'live', fetchSince: vi.fn(async () => []) }
    const onUpdate = vi.fn()
    const { feed, wrapper } = mountFeed({ enabled: ref(false), source, onUpdate })
    await flushPromises()
    expect(source.fetchSince).not.toHaveBeenCalled()
    await feed.useFixture()
    expect(feed.testMode.value).toBe(true)
    expect(feed.strikes.value.length).toBeGreaterThan(50)
    expect(onUpdate).toHaveBeenLastCalledWith(feed.strikes.value, 'test')
    await feed.leaveFixture()
    expect(feed.testMode.value).toBe(false)
    expect(feed.strikes.value).toEqual([])
    wrapper.unmount()
  })
})
