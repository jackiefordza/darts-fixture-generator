import { useRef, type ChangeEvent } from 'react'
import { Button } from '../../../components/ui/Button'
import { readImageFile } from '../imageUtils'
import { StyleOverrideFields } from './StyleOverrideFields'
import type { GlobalStyle, HeaderElement } from '../posterTypes'

/** The masthead's own panel: a background-image upload (shown with a diagonal clip
 * on the poster, matching the previous fixture creator's header) alongside the
 * usual background/text colour overrides shared by every section. */
export function HeaderPanel({
  element,
  globalStyle,
  onChangeImage,
  onStyleChange,
  onReset,
}: {
  element: HeaderElement
  globalStyle: GlobalStyle
  onChangeImage: (src: string | null) => void
  onStyleChange: (style: HeaderElement['style']) => void
  onReset: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const loaded = await readImageFile(file)
    onChangeImage(loaded.src)
  }

  return (
    <div className="poster-panel">
      <h3>{element.name}</h3>
      <p className="muted">
        A supplied image is shown behind a diagonal clip on the masthead&apos;s lead edge. With no
        image, the masthead keeps a strong dark fallback background rather than an empty box.
      </p>

      <div className="poster-logo-preview">
        {element.backgroundImage ? (
          <img src={element.backgroundImage} alt="Header background" />
        ) : (
          <span className="muted">No header image uploaded</span>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFile} aria-label="Header background image" />
      <div className="form-actions">
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
          {element.backgroundImage ? 'Replace header image' : 'Upload header image'}
        </Button>
        {element.backgroundImage && (
          <Button variant="ghost" onClick={() => onChangeImage(null)}>
            Remove image
          </Button>
        )}
      </div>

      <StyleOverrideFields style={element.style} global={globalStyle} onChange={(patch) => onStyleChange({ ...element.style, ...patch })} />

      <div className="form-actions">
        <Button variant="ghost" onClick={onReset}>
          Reset header
        </Button>
      </div>
    </div>
  )
}
