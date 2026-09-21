import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { InlineError } from '../../../components/ui/InlineError'
import { useAction } from '../../../hooks/useAction'
import { updateTeam } from '../../../api/seasons'
import type { SeasonDetail } from '../../../api/types'
import type { DivisionElement, GlobalStyle } from '../posterTypes'
import { StyleOverrideFields } from './StyleOverrideFields'

function TeamNameRow({ teamId, name, number, onSaved }: { teamId: string; name: string; number: number; onSaved: () => void }) {
  const [value, setValue] = useState(name)
  const [editing, setEditing] = useState(false)
  const save = useAction(() => updateTeam(teamId, { name: value.trim() }))

  async function handleSave() {
    if (!value.trim() || value.trim() === name) {
      setEditing(false)
      return
    }
    const result = await save.run()
    if (result) {
      setEditing(false)
      onSaved()
    }
  }

  return (
    <li className="poster-team-edit-row">
      <span className="poster-team-number">{number}</span>
      {editing ? (
        <>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={`Team ${number} name`}
            autoFocus
          />
          <Button variant="primary" busy={save.loading} onClick={handleSave}>
            Save
          </Button>
          <Button variant="ghost" onClick={() => { setValue(name); setEditing(false) }} disabled={save.loading}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="poster-team-name">{name}</span>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Rename
          </Button>
        </>
      )}
      <InlineError error={save.error} />
    </li>
  )
}

export function DivisionPanel({
  element,
  season,
  globalStyle,
  onStyleChange,
  onReset,
  onSeasonChanged,
}: {
  element: DivisionElement
  season: SeasonDetail
  globalStyle: GlobalStyle
  onStyleChange: (patch: DivisionElement['style']) => void
  onReset: () => void
  onSeasonChanged: () => void
}) {
  const division = season.divisions.find((candidate) => candidate.id === element.divisionId)
  if (!division) {
    return (
      <div className="poster-panel">
        <p className="muted">This division no longer exists in season setup.</p>
      </div>
    )
  }

  return (
    <div className="poster-panel">
      <h3>{division.name}</h3>
      <p className="muted">
        Team order and numbering come from Season Setup. Renaming a team here updates the season - it does not
        create a separate poster-only name.
      </p>

      <ol className="poster-team-edit-list">
        {division.teams.map((team) => (
          <TeamNameRow key={team.id} teamId={team.id} name={team.name} number={team.number} onSaved={onSeasonChanged} />
        ))}
      </ol>

      <h4>Appearance</h4>
      <StyleOverrideFields style={element.style} global={globalStyle} onChange={(patch) => onStyleChange({ ...element.style, ...patch })} />

      <div className="form-actions">
        <Button variant="ghost" onClick={onReset}>
          Reset this division
        </Button>
      </div>
    </div>
  )
}
