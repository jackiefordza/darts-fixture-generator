import { Button } from '../../../components/ui/Button'
import { DATE_FORMAT_OPTIONS } from '../dateFormat'
import type { FixtureGridElement, GlobalStyle } from '../posterTypes'
import { StyleOverrideFields } from './StyleOverrideFields'

export function FixtureGridPanel({
  element,
  globalStyle,
  onChange,
  onStyleChange,
  onReset,
}: {
  element: FixtureGridElement
  globalStyle: GlobalStyle
  onChange: (patch: Partial<FixtureGridElement>) => void
  onStyleChange: (patch: FixtureGridElement['style']) => void
  onReset: () => void
}) {
  return (
    <div className="poster-panel">
      <h3>Fixture grid</h3>
      <p className="muted">Generated from the validated season schedule. Fixture cells cannot be edited here.</p>

      <label className="field">
        <span>Date format</span>
        <select value={element.dateFormat} onChange={(event) => onChange({ dateFormat: event.target.value as FixtureGridElement['dateFormat'] })}>
          {DATE_FORMAT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.example}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Grid text size (mm)</span>
        <input
          type="number"
          min={1.5}
          max={5}
          step={0.1}
          value={element.fontSize}
          onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
        />
      </label>

      <label className="checkbox-field">
        <input type="checkbox" checked={element.showBorders} onChange={(event) => onChange({ showBorders: event.target.checked })} />
        <span>Show cell borders</span>
      </label>

      <h4>Appearance</h4>
      <StyleOverrideFields style={element.style} global={globalStyle} onChange={(patch) => onStyleChange({ ...element.style, ...patch })} />

      <div className="form-actions">
        <Button variant="ghost" onClick={onReset}>
          Reset fixture grid
        </Button>
      </div>
    </div>
  )
}
