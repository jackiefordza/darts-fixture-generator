import type { GlobalStyle, StyleOverride } from '../posterTypes'

interface FieldProps {
  label: string
  globalValue: string
  value: string | null | undefined
  onChange: (value: string | null) => void
  type?: 'color' | 'text'
}

function OverrideField({ label, globalValue, value, onChange, type = 'color' }: FieldProps) {
  const useCustom = value != null
  return (
    <div className="poster-style-field">
      <span className="poster-style-field-label">{label}</span>
      <label className="checkbox-field poster-style-toggle">
        <input
          type="checkbox"
          checked={useCustom}
          onChange={(event) => onChange(event.target.checked ? globalValue : null)}
        />
        <span>Custom</span>
      </label>
      <input
        type={type}
        value={value ?? globalValue}
        disabled={!useCustom}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`${label} value`}
      />
    </div>
  )
}

/** "Use global / Custom" style override controls shared by every section's properties panel. */
export function StyleOverrideFields({
  style,
  global,
  onChange,
}: {
  style: StyleOverride
  global: GlobalStyle
  onChange: (patch: StyleOverride) => void
}) {
  return (
    <div className="poster-style-fields">
      <OverrideField
        label="Background"
        globalValue="#ffffff"
        value={style.backgroundColor}
        onChange={(value) => onChange({ backgroundColor: value })}
      />
      <OverrideField
        label="Text"
        globalValue={global.textColor}
        value={style.textColor}
        onChange={(value) => onChange({ textColor: value })}
      />
      <OverrideField
        label="Border"
        globalValue={global.borderColor}
        value={style.borderColor}
        onChange={(value) => onChange({ borderColor: value })}
      />
    </div>
  )
}
