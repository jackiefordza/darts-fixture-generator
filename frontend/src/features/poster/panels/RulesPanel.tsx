import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import type { GlobalStyle, RuleEntry, RulesElement } from '../posterTypes'
import { StyleOverrideFields } from './StyleOverrideFields'

export function RulesPanel({
  element,
  globalStyle,
  onChange,
  onStyleChange,
  onReset,
  onToggleVisible,
}: {
  element: RulesElement
  globalStyle: GlobalStyle
  onChange: (patch: Partial<RulesElement>) => void
  onStyleChange: (patch: RulesElement['style']) => void
  onReset: () => void
  onToggleVisible: (visible: boolean) => void
}) {
  const [rules, setRules] = useState<RuleEntry[]>(element.rules)

  useEffect(() => setRules(element.rules), [element.rules])

  function commit(next: RuleEntry[]) {
    setRules(next)
    onChange({ rules: next })
  }

  function addRule() {
    commit([...rules, { id: crypto.randomUUID(), text: '', order: rules.length }])
  }

  function deleteRule(id: string) {
    commit(rules.filter((rule) => rule.id !== id).map((rule, index) => ({ ...rule, order: index })))
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= rules.length) return
    const next = [...rules]
    ;[next[index], next[target]] = [next[target], next[index]]
    commit(next.map((rule, position) => ({ ...rule, order: position })))
  }

  const sorted = [...rules].sort((a, b) => a.order - b.order)

  return (
    <div className="poster-panel">
      <h3>Rules</h3>

      <label className="checkbox-field">
        <input type="checkbox" checked={element.visible} onChange={(event) => onToggleVisible(event.target.checked)} />
        <span>Show rules section on the poster</span>
      </label>

      <ol className="poster-rules-edit-list">
        {sorted.map((rule, index) => (
          <li key={rule.id}>
            <textarea
              value={rule.text}
              onChange={(event) => setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, text: event.target.value } : r)))}
              onBlur={() => onChange({ rules })}
              aria-label={`Rule ${index + 1}`}
              rows={2}
            />
            <div className="poster-rules-edit-actions">
              <Button variant="ghost" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move rule ${index + 1} up`}>
                Up
              </Button>
              <Button variant="ghost" onClick={() => move(index, 1)} disabled={index === sorted.length - 1} aria-label={`Move rule ${index + 1} down`}>
                Down
              </Button>
              <Button variant="ghost" onClick={() => deleteRule(rule.id)} aria-label={`Delete rule ${index + 1}`}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ol>

      <div className="form-actions">
        <Button variant="secondary" onClick={addRule}>
          Add rule
        </Button>
      </div>

      <label className="field">
        <span>Columns</span>
        <input
          type="number"
          min={1}
          max={3}
          value={element.columns}
          onChange={(event) => onChange({ columns: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        <span>Text size (mm)</span>
        <input
          type="number"
          min={1.5}
          max={5}
          step={0.1}
          value={element.fontSize}
          onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
        />
      </label>

      <h4>Appearance</h4>
      <StyleOverrideFields style={element.style} global={globalStyle} onChange={(patch) => onStyleChange({ ...element.style, ...patch })} />

      <div className="form-actions">
        <Button variant="ghost" onClick={onReset}>
          Reset rules
        </Button>
      </div>
    </div>
  )
}
