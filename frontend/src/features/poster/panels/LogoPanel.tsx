import { useRef, type ChangeEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { readImageFile } from '../imageUtils'
import type { ImageElement, LogoElement } from '../posterTypes'

export function LogoPanel({
  element,
  onReplace,
  onRemoveImage,
  onToggleAspectLock,
  onReset,
  onDeleteElement,
}: {
  element: LogoElement | ImageElement
  onReplace: (src: string, width: number, height: number) => void
  onRemoveImage: () => void
  onToggleAspectLock: (locked: boolean) => void
  onReset: () => void
  onDeleteElement: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const loaded = await readImageFile(file)
    onReplace(loaded.src, loaded.width, loaded.height)
  }

  return (
    <div className="poster-panel">
      <h3>{element.name}</h3>

      <div className="poster-logo-preview">
        {element.src ? (
          <img src={element.src} alt={element.name} />
        ) : (
          <span className="muted">No image uploaded</span>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFile} aria-label={`Replace ${element.name}`} />
      <div className="form-actions">
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
          {element.src ? 'Replace image' : 'Upload image'}
        </Button>
        {element.src && (
          <Button variant="ghost" onClick={onRemoveImage}>
            Remove image
          </Button>
        )}
      </div>

      <label className="checkbox-field">
        <input type="checkbox" checked={element.aspectLocked} onChange={(event) => onToggleAspectLock(event.target.checked)} />
        <span>Preserve aspect ratio when resizing</span>
      </label>

      <div className="form-actions">
        {!element.removable && (
          <Button variant="ghost" onClick={onReset}>
            Reset this logo
          </Button>
        )}
        {element.removable && (
          <Button variant="ghost" onClick={onDeleteElement}>
            Remove from poster
          </Button>
        )}
      </div>
    </div>
  )
}
