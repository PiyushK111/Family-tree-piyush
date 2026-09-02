const MAX_INPUT_BYTES = 25 * 1024 * 1024

/**
 * Shrinks a picked image to a square thumbnail data URL.
 *
 * Photos are stored inline in Firestore rather than Cloud Storage (which needs a
 * billed plan), so they must stay small: a Firestore document is capped at 1 MiB
 * and base64 inflates by about a third. 256px at quality 0.82 lands around
 * 20-30 KB, roughly 40x under the limit.
 */
export async function resizeImage(file: File, size = 256, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That image is over 25 MB. Please pick a smaller one.')
  }

  const bitmap = await loadBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not read the image.')

    // Centre-crop to a square so every card is the same shape.
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)

    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    if ('close' in bitmap) bitmap.close()
  }
}

/** `createImageBitmap` where available, with an <img> fallback for older Safari. */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // The browser's own message here is jargon ("The source image could not
      // be decoded"), so say something the user can act on instead.
      throw new Error('That image could not be read. Try a JPEG or PNG.')
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not decode that image.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
