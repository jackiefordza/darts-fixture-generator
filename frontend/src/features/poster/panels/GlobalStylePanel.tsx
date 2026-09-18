import type { GlobalStyle } from '../posterTypes'

const FONT_OPTIONS = [
  { value: "'Public Sans', -apple-system, BlinkMacSystemFont, sans-serif", label: 'Public Sans (default)' },
  { value: "'Fraunces', Georgia, serif", label: 'Fraunces (serif)' },
  { value: "'IBM Plex Mono', ui-monospace, monospace", label: 'IBM Plex Mono' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
]

export function GlobalStylePanel({
  style,
  onChange,
}: {
  style: GlobalStyle
  onChange: (patch: Partial<GlobalStyle>) => void
}) {
  return (
    <div className="poster-panel">
      <h3>Page &amp; global design</h3>
      <p className="muted">
        These are the poster's defaults. Any section can override them individually from its own panel.
      </p>

      <label className="field">
        <span>Background colour</span>
        <input
          type="color"
          value={style.backgroundColor}
          onChange={(event) => onChange({ backgroundColor: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Primary colour</span>
        <input type="color" value={style.primaryColor} onChange={(event) => onChange({ primaryColor: event.target.value })} />
      </label>
      <label className="field">
        <span>Secondary colour</span>
        <input
          type="color"
          value={style.secondaryColor ?? '#ffffff'}
          onChange={(event) => onChange({ secondaryColor: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Accent colour</span>
        <input type="color" value={style.accentColor} onChange={(event) => onChange({ accentColor: event.target.value })} />
      </label>
      <label className="field">
        <span>Text colour</span>
        <input type="color" value={style.textColor} onChange={(event) => onChange({ textColor: event.target.value })} />
      </label>
      <label className="field">
        <span>Border colour</span>
        <input type="color" value={style.borderColor} onChange={(event) => onChange({ borderColor: event.target.value })} />
      </label>
      <label className="field">
        <span>Font family</span>
        <select value={style.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>
          {FONT_OPTIONS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Base text size (mm)</span>
        <input
          type="number"
          min={2}
          max={6}
          step={0.1}
          value={style.baseFontSize}
          onChange={(event) => onChange({ baseFontSize: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        <span>Border width (mm)</span>
        <input
          type="number"
          min={0}
          max={3}
          step={0.1}
          value={style.borderWidth}
          onChange={(event) => onChange({ borderWidth: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        <span>Section spacing (mm)</span>
        <input
          type="number"
          min={0}
          max={15}
          step={0.5}
          value={style.spacing}
          onChange={(event) => onChange({ spacing: Number(event.target.value) })}
        />
      </label>
    </div>
  )
}
