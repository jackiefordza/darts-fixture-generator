import { Button } from '../../components/ui/Button'
import type { Fixture, SeasonDetail } from '../../api/types'
import { PosterExportControls } from './PosterExportControls'
import type { PosterEditor } from './usePosterEditor'

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

export function PosterToolbar({
  editor,
  season,
  fixtures,
  onFitToPage,
  onAddImage,
  onResetAll,
}: {
  editor: PosterEditor
  season: SeasonDetail
  fixtures: Fixture[]
  onFitToPage: () => void
  onAddImage: () => void
  onResetAll: () => void
}) {
  const { layout, zoom, setZoom, preview, setPreview, canUndo, canRedo, undo, redo } = editor
  // Ctrl/Cmd+wheel zoom lands on values between the presets below - without a matching
  // <option>, the browser silently falls back to displaying the first preset instead of
  // the real zoom, so surface the exact current value as a selectable option too.
  const matchesPreset = ZOOM_STEPS.some((step) => Math.round(step * 100) === Math.round(zoom * 100))

  return (
    <div className="poster-toolbar">
      <div className="poster-toolbar-group">
        <Button variant="ghost" onClick={undo} disabled={!canUndo} aria-label="Undo">
          Undo
        </Button>
        <Button variant="ghost" onClick={redo} disabled={!canRedo} aria-label="Redo">
          Redo
        </Button>
      </div>

      <div className="poster-toolbar-group">
        <label className="poster-zoom-label" htmlFor="poster-zoom-select">
          Zoom
        </label>
        <select
          id="poster-zoom-select"
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
        >
          {!matchesPreset && <option value={zoom}>{Math.round(zoom * 100)}%</option>}
          {ZOOM_STEPS.map((step) => (
            <option key={step} value={step}>
              {Math.round(step * 100)}%
            </option>
          ))}
        </select>
        <Button variant="ghost" onClick={onFitToPage}>
          Fit to page
        </Button>
      </div>

      <div className="poster-toolbar-group">
        <Button variant="secondary" onClick={onAddImage} disabled={preview}>
          Add image
        </Button>
        <Button variant="ghost" onClick={onResetAll}>
          Reset entire poster
        </Button>
      </div>

      <div className="poster-toolbar-group poster-toolbar-preview">
        <Button variant={preview ? 'primary' : 'secondary'} onClick={() => setPreview(!preview)}>
          {preview ? 'Exit preview' : 'Preview'}
        </Button>
      </div>

      <PosterExportControls layout={layout} season={season} fixtures={fixtures} />
    </div>
  )
}
