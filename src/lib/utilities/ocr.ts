'use client'

export async function prepareImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1280
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

export async function extractMeterReading(imageDataUrl: string): Promise<number> {
  const [header, base64] = imageDataUrl.split(',')
  const mimeType = header.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg'

  const res = await fetch('/api/utilities/extract-reading', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, mimeType }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error ?? 'Could not read meter')
  }

  const value = typeof body.value === 'number' ? body.value : parseFloat(body.value)
  if (isNaN(value)) throw new Error('Invalid meter reading')
  return value
}
