const DEFAULT_TARGET_BYTES = 200 * 1024
const MAX_DIMENSION = 2048
const MIN_QUALITY = 0.5
const QUALITY_STEP = 0.1
const SCALE_STEP = 0.9
const MAX_ATTEMPTS = 8

export async function compressImageToTarget(file: File, targetBytes = DEFAULT_TARGET_BYTES): Promise<File> {
  if (file.size <= targetBytes && file.type === 'image/jpeg') return file

  const image = await loadImage(file)
  const baseName = stripExtension(file.name)

  let scale = 1
  const maxSide = Math.max(image.naturalWidth, image.naturalHeight)
  if (maxSide > MAX_DIMENSION) {
    scale = MAX_DIMENSION / maxSide
  }

  let quality = 0.85
  let bestBlob: Blob | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const blob = await renderJpeg(image, scale, quality)
    if (!blob) break
    bestBlob = blob
    if (blob.size <= targetBytes) break

    if (quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP)
    } else {
      scale = scale * SCALE_STEP
    }
  }

  if (!bestBlob) return file

  return new File([bestBlob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified
  })
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = url

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Failed to decode image'))
  })

  URL.revokeObjectURL(url)
  return image
}

async function renderJpeg(image: HTMLImageElement, scale: number, quality: number): Promise<Blob | null> {
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, width, height)

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
}

function stripExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  if (idx <= 0) return fileName || 'image'
  return fileName.slice(0, idx)
}
