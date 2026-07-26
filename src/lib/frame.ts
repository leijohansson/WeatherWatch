import type { RadarFrame } from '@/types'

export class CanvasAccessError extends Error {
  constructor(message = 'The radar image cannot be read because cross-origin canvas access is blocked.') {
    super(message)
    this.name = 'CanvasAccessError'
  }
}

export async function loadRadarFrame(
  url: string,
  timestamp: string,
  source: RadarFrame['source'],
): Promise<RadarFrame> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`Unable to load radar frame ${timestamp}`))
  })
  image.src = url
  await loaded

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new CanvasAccessError('Canvas analysis is unavailable in this browser.')
  context.drawImage(image, 0, 0)
  try {
    const data = context.getImageData(0, 0, canvas.width, canvas.height)
    return {
      source,
      timestamp,
      url,
      width: canvas.width,
      height: canvas.height,
      pixels: data.data,
    }
  } catch {
    throw new CanvasAccessError()
  }
}
