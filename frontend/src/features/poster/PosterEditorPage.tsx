import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useSeason } from '../../context/SeasonContext'
import { useFetch } from '../../hooks/useFetch'
import { getSchedule, validateSeason } from '../../api/fixtures'
import type { Fixture } from '../../api/types'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { PosterCanvas } from './PosterCanvas'
import { PosterToolbar } from './PosterToolbar'
import { PosterPropertiesPanel } from './PosterPropertiesPanel'
import { usePosterEditor } from './usePosterEditor'
import { readImageFile } from './imageUtils'
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, type ImageElement } from './posterTypes'
import { PX_PER_MM } from './geometry'
import { Link } from 'react-router-dom'

function PosterWorkspace({ fixtures }: { fixtures: Fixture[] }) {
  const { season, refetch } = useSeason()
  const editor = usePosterEditor(season)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const addImageInputRef = useRef<HTMLInputElement>(null)
  const [confirmingResetAll, setConfirmingResetAll] = useState(false)

  const fitToPage = useCallback(() => {
    const container = canvasContainerRef.current
    if (!container) return
    const availableWidth = container.clientWidth - 32
    const availableHeight = container.clientHeight - 32
    const zoomToFitWidth = availableWidth / (PAGE_WIDTH_MM * PX_PER_MM)
    const zoomToFitHeight = availableHeight / (PAGE_HEIGHT_MM * PX_PER_MM)
    editor.setZoom(Math.min(zoomToFitWidth, zoomToFitHeight))
  }, [editor])

  useEffect(() => {
    fitToPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isEditingText = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) editor.redo()
        else editor.undo()
        return
      }
      if (isEditingText) return

      if (event.key === 'Escape') {
        editor.select(null)
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        editor.deleteSelected()
      } else if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        const step = event.shiftKey ? 5 : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        editor.nudgeSelected(dx, dy)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor])

  async function handleAddImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const loaded = await readImageFile(file)
    const aspect = loaded.width / loaded.height || 1
    const width = 60
    const element: ImageElement = {
      id: `image-${crypto.randomUUID()}`,
      type: 'image',
      name: 'Image',
      rect: { x: (PAGE_WIDTH_MM - width) / 2, y: (PAGE_HEIGHT_MM - width / aspect) / 2, width, height: width / aspect },
      visible: true,
      removable: true,
      src: loaded.src,
      aspectLocked: true,
      style: {},
    }
    editor.addElement(element)
    editor.select(element.id)
  }

  return (
    <div className="poster-editor">
      <PosterToolbar
        editor={editor}
        season={season}
        fixtures={fixtures}
        onFitToPage={fitToPage}
        onAddImage={() => addImageInputRef.current?.click()}
        onResetAll={() => setConfirmingResetAll(true)}
      />
      <input ref={addImageInputRef} type="file" accept="image/*" hidden onChange={handleAddImage} aria-label="Add image" />
      <div className="poster-editor-body">
        <div className="poster-canvas-container" ref={canvasContainerRef}>
          <PosterCanvas editor={editor} season={season} fixtures={fixtures} />
        </div>
        {!editor.preview && (
          <aside className="poster-properties-sidebar">
            <PosterPropertiesPanel editor={editor} season={season} onSeasonChanged={refetch} />
          </aside>
        )}
      </div>
      {confirmingResetAll && (
        <ConfirmDialog
          title="Reset entire poster"
          description="Reset every section back to the default layout, position, size and content? Any custom images, styling and poster-only content will be lost. You can undo this afterwards."
          confirmLabel="Reset entire poster"
          variant="danger"
          onConfirm={() => {
            editor.resetAll()
            setConfirmingResetAll(false)
          }}
          onCancel={() => setConfirmingResetAll(false)}
        />
      )}
    </div>
  )
}

export function PosterEditorPage() {
  const { season } = useSeason()
  const {
    data: fixtures,
    loading: loadingFixtures,
    error: fixturesError,
  } = useFetch(() => getSchedule(season.id), [season.id])
  const generated = (fixtures?.length ?? 0) > 0
  const {
    data: validation,
    loading: validating,
    error: validationError,
  } = useFetch(() => (generated ? validateSeason(season.id) : Promise.resolve(null)), [season.id, generated])

  // `generated` can flip true a render before the real validateSeason() request has even
  // started (its own effect fires off the back of that dependency change), so `validating`
  // briefly reads false with a stale `validation: null` left over from the disabled
  // placeholder fetch. Treat "generated but no validation result yet" as still loading too,
  // otherwise the poster can flash into view for a moment before a schedule is confirmed valid.
  const awaitingValidation = generated && (validating || validation === null)

  if (loadingFixtures || awaitingValidation) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Poster Editor</h1>
        </div>
        <LoadingState label="Checking the season schedule…" />
      </div>
    )
  }

  if (fixturesError || validationError) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Poster Editor</h1>
        </div>
        <ErrorState message={fixturesError ?? validationError ?? 'Something went wrong'} />
      </div>
    )
  }

  if (!generated) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Poster Editor</h1>
        </div>
        <EmptyState
          title="No generated schedule yet"
          description="A validated schedule is required before the poster can be produced. Generate the season's fixtures first."
          action={
            <Link className="btn btn-primary" to="../schedule">
              Go to Schedule
            </Link>
          }
        />
      </div>
    )
  }

  if (validation && !validation.is_valid) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Poster Editor</h1>
        </div>
        <div className="card">
          <h2>Schedule is not currently valid</h2>
          <p className="muted">
            The poster is generated from the validated season schedule, so it can't be produced until the
            following issues are resolved.
          </p>
          <ul className="validation-issue-list">
            {validation.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`} className={`validation-issue severity-${issue.severity}`}>
                {issue.message}
              </li>
            ))}
          </ul>
          <Link className="btn btn-primary" to="../validation">
            Go to Validation
          </Link>
        </div>
      </div>
    )
  }

  return <PosterWorkspace fixtures={fixtures ?? []} />
}
