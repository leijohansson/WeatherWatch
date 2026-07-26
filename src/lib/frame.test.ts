import { describe, expect, it, vi } from 'vitest'
import { CanvasAccessError, loadRadarFrame } from './frame'

describe('radar image loading', () => {
  it('loads images anonymously and returns readable pixel data', async () => {
    const frame = await loadRadarFrame('/sample.png', '2026072320150000', 'test')
    expect(frame).toMatchObject({
      source: 'test',
      width: 480,
      height: 480,
      timestamp: '2026072320150000',
    })
    expect(frame.pixels).toHaveLength(480 * 480 * 4)
  })

  it('reports malformed or missing images without creating a frame', async () => {
    class BrokenImage {
      crossOrigin: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', BrokenImage)
    await expect(loadRadarFrame('/missing.png', 'missing', 'live')).rejects.toThrow(
      'Unable to load radar frame',
    )
  })

  it('identifies cross-origin canvas failures explicitly', async () => {
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        throw new DOMException('The operation is insecure')
      }),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never)
    await expect(loadRadarFrame('/blocked.png', 'blocked', 'live')).rejects.toBeInstanceOf(
      CanvasAccessError,
    )
  })
})
