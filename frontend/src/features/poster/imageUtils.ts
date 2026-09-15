/**
 * Reads an uploaded image file and downsizes it (longest side capped) before
 * returning a data URL, so logos/images stored in the poster layout (and
 * ultimately in localStorage) stay a reasonable size. Returns the natural
 * (post-resize) width/height so callers can size the new element to its
 * aspect ratio.
 */
const MAX_DIMENSION = 900

export interface LoadedImage {
  src: string
  width: number
  height: number
}

export function readImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the selected file'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('Could not load the selected image'))
      image.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height))
        const width = Math.round(image.width * scale)
        const height = Math.round(image.height * scale)

        if (scale === 1) {
          resolve({ src: reader.result as string, width, height })
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve({ src: reader.result as string, width: image.width, height: image.height })
          return
        }
        ctx.drawImage(image, 0, 0, width, height)
        resolve({ src: canvas.toDataURL('image/png'), width, height })
      }
      image.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
