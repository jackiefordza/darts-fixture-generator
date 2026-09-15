import { useState, type ReactNode } from 'react'
import type { SeasonDetail } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { CompetitionsPanel } from './panels/CompetitionsPanel'
import { DivisionPanel } from './panels/DivisionPanel'
import { FixtureGridPanel } from './panels/FixtureGridPanel'
import { GlobalStylePanel } from './panels/GlobalStylePanel'
import { LogoPanel } from './panels/LogoPanel'
import { RulesPanel } from './panels/RulesPanel'
import { StyleOverrideFields } from './panels/StyleOverrideFields'
import type { HeaderElement, DivisionsContainerElement } from './posterTypes'
import type { PosterEditor } from './usePosterEditor'

function SectionStylePanel({
  element,
  globalStyle,
  onStyleChange,
  onReset,
}: {
  element: HeaderElement | DivisionsContainerElement
  globalStyle: PosterEditor['layout']['globalStyle']
  onStyleChange: (style: HeaderElement['style']) => void
  onReset: () => void
}) {
  return (
    <div className="poster-panel">
      <h3>{element.name}</h3>
      <StyleOverrideFields style={element.style} global={globalStyle} onChange={(patch) => onStyleChange({ ...element.style, ...patch })} />
      <div className="form-actions">
        <Button variant="ghost" onClick={onReset}>
          Reset {element.name.toLowerCase()}
        </Button>
      </div>
    </div>
  )
}

export function PosterPropertiesPanel({
  editor,
  season,
  onSeasonChanged,
}: {
  editor: PosterEditor
  season: SeasonDetail
  onSeasonChanged: () => void
}) {
  const { layout, selected, updateElement, setGlobalStyle, resetElement, deleteSelected } = editor
  const [confirmingReset, setConfirmingReset] = useState(false)

  function requestReset() {
    setConfirmingReset(true)
  }
  function confirmReset() {
    if (selected) resetElement(selected.id)
    setConfirmingReset(false)
  }

  let content: ReactNode

  if (!selected) {
    content = <GlobalStylePanel style={layout.globalStyle} onChange={setGlobalStyle} />
  } else if (selected.type === 'division') {
    content = (
      <DivisionPanel
        element={selected}
        season={season}
        globalStyle={layout.globalStyle}
        onStyleChange={(style) => updateElement(selected.id, { style })}
        onReset={requestReset}
        onSeasonChanged={onSeasonChanged}
      />
    )
  } else if (selected.type === 'logo' || selected.type === 'image') {
    content = (
      <LogoPanel
        element={selected}
        onReplace={(src, width, height) => {
          const aspect = width / height || 1
          const rect = selected.aspectLocked ? { ...selected.rect, height: selected.rect.width / aspect } : selected.rect
          updateElement(selected.id, { src, rect })
        }}
        onRemoveImage={() => updateElement(selected.id, { src: null })}
        onToggleAspectLock={(aspectLocked) => updateElement(selected.id, { aspectLocked })}
        onReset={requestReset}
        onDeleteElement={deleteSelected}
      />
    )
  } else if (selected.type === 'fixture-grid') {
    content = (
      <FixtureGridPanel
        element={selected}
        globalStyle={layout.globalStyle}
        onChange={(patch) => updateElement(selected.id, patch)}
        onStyleChange={(style) => updateElement(selected.id, { style })}
        onReset={requestReset}
      />
    )
  } else if (selected.type === 'rules') {
    content = (
      <RulesPanel
        element={selected}
        globalStyle={layout.globalStyle}
        onChange={(patch) => updateElement(selected.id, patch)}
        onStyleChange={(style) => updateElement(selected.id, { style })}
        onReset={requestReset}
        onToggleVisible={(visible) => updateElement(selected.id, { visible })}
      />
    )
  } else if (selected.type === 'competitions') {
    content = (
      <CompetitionsPanel
        element={selected}
        season={season}
        globalStyle={layout.globalStyle}
        onChange={(patch) => updateElement(selected.id, patch)}
        onStyleChange={(style) => updateElement(selected.id, { style })}
        onReset={requestReset}
        onToggleVisible={(visible) => updateElement(selected.id, { visible })}
      />
    )
  } else {
    content = (
      <SectionStylePanel
        element={selected}
        globalStyle={layout.globalStyle}
        onStyleChange={(style) => updateElement(selected.id, { style })}
        onReset={requestReset}
      />
    )
  }

  return (
    <div className="poster-properties">
      {content}
      {confirmingReset && (
        <ConfirmDialog
          title="Reset selected section"
          description={`Reset "${selected?.name}" back to its default position, size and content? You can undo this afterwards.`}
          confirmLabel="Reset section"
          variant="danger"
          onConfirm={confirmReset}
          onCancel={() => setConfirmingReset(false)}
        />
      )}
    </div>
  )
}
