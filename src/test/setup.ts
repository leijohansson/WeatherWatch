import { beforeEach, vi } from 'vitest'

const storageData = new Map<string, string>()
const storageMock: Storage = {
  get length() {
    return storageData.size
  },
  clear: () => storageData.clear(),
  getItem: (key) => storageData.get(key) ?? null,
  key: (index) => [...storageData.keys()][index] ?? null,
  removeItem: (key) => void storageData.delete(key),
  setItem: (key, value) => void storageData.set(key, String(value)),
}
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: storageMock,
})

Object.defineProperty(globalThis.crypto, 'randomUUID', {
  configurable: true,
  value: vi.fn(() => `test-${Math.random().toString(16).slice(2)}`),
})

Object.defineProperty(window, 'Notification', {
  configurable: true,
  value: class NotificationMock {
    static permission: NotificationPermission = 'default'
    static requestPermission = vi.fn(async () => 'granted' as NotificationPermission)
    constructor(
      public title: string,
      public options?: NotificationOptions,
    ) {}
  },
})

class ImageMock {
  crossOrigin: string | null = null
  naturalWidth = 480
  naturalHeight = 480
  width = 480
  height = 480
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

vi.stubGlobal('Image', ImageMock)

const canvasContext = {
  drawImage: vi.fn(),
  getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
  })),
}

HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContext) as never

Object.defineProperty(navigator, 'onLine', {
  configurable: true,
  value: true,
})
Element.prototype.setPointerCapture = vi.fn()

// jsdom has no object URLs; tests that need a specific value spy on these.
Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  writable: true,
  value: vi.fn(() => 'blob:test'),
})
Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  writable: true,
  value: vi.fn(),
})

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  })
  vi.stubGlobal('Image', ImageMock)
  HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContext) as never
})
