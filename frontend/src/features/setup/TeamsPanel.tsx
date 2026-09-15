import { useState, type FormEvent } from 'react'
import { useSeason } from '../../context/SeasonContext'
import { useAction } from '../../hooks/useAction'
import { addTeam, deleteTeam, updateTeam } from '../../api/seasons'
import { Button } from '../../components/ui/Button'
import { InlineError } from '../../components/ui/InlineError'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { Division, SeasonDetail, Team, Venue } from '../../api/types'

function TeamRow({
  team,
  divisions,
  venues,
  onChanged,
}: {
  team: Team
  divisions: Division[]
  venues: Venue[]
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(team.name)
  const [divisionId, setDivisionId] = useState(team.division_id)
  const [venueId, setVenueId] = useState(team.venue_id)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const save = useAction(() =>
    updateTeam(team.id, { name: name.trim(), division_id: divisionId, venue_id: venueId }),
  )
  const remove = useAction(() => deleteTeam(team.id).then(() => true))

  async function handleSave() {
    const result = await save.run()
    if (result) {
      setEditing(false)
      onChanged()
    }
  }

  async function handleDelete() {
    const ok = await remove.run()
    if (ok) {
      setConfirmingDelete(false)
      onChanged()
    }
  }

  const venueName = venues.find((venue) => venue.id === team.venue_id)?.name ?? 'Unknown venue'

  if (editing) {
    return (
      <li className="editable-row">
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Team name" />
        <select value={divisionId} onChange={(event) => setDivisionId(event.target.value)} aria-label="Team division">
          {divisions.map((division) => (
            <option key={division.id} value={division.id}>
              {division.name}
            </option>
          ))}
        </select>
        <select value={venueId} onChange={(event) => setVenueId(event.target.value)} aria-label="Team home venue">
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </select>
        <div className="row-actions">
          <Button variant="primary" busy={save.loading} onClick={handleSave}>
            Save
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)} disabled={save.loading}>
            Cancel
          </Button>
        </div>
        <InlineError error={save.error} />
      </li>
    )
  }

  return (
    <li className="editable-row">
      <span className="row-title">{team.name}</span>
      <span className="muted">Home: {venueName}</span>
      <div className="row-actions">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
          Remove
        </Button>
      </div>
      {confirmingDelete && (
        <ConfirmDialog
          title="Remove team"
          description={`Remove "${team.name}"? This will fail if it already has fixtures.`}
          confirmLabel="Remove"
          variant="danger"
          busy={remove.loading}
          error={remove.error}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </li>
  )
}

function AddTeamForm({ division, season, onChanged }: { division: Division; season: SeasonDetail; onChanged: () => void }) {
  const [name, setName] = useState('')
  const [venueId, setVenueId] = useState(season.venues[0]?.id ?? '')
  const create = useAction(() =>
    addTeam(season.id, {
      division_id: division.id,
      name: name.trim(),
      position: division.teams.length + 1,
      venue_id: venueId,
    }),
  )

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !venueId) return
    const result = await create.run()
    if (result) {
      setName('')
      onChanged()
    }
  }

  if (season.venues.length === 0) {
    return <p className="muted">Add a venue before adding teams.</p>
  }

  return (
    <>
      <form className="inline-form" onSubmit={handleAdd}>
        <input
          placeholder="Team name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={`New team name for ${division.name}`}
        />
        <select value={venueId} onChange={(event) => setVenueId(event.target.value)} aria-label={`Home venue for new team in ${division.name}`}>
          {season.venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" busy={create.loading} disabled={!name.trim()}>
          Add team
        </Button>
      </form>
      <InlineError error={create.error} />
    </>
  )
}

export function TeamsPanel() {
  const { season, refetch } = useSeason()

  if (season.divisions.length === 0) {
    return (
      <section className="card">
        <h2>Teams</h2>
        <EmptyState title="Add a division first" description="Teams belong to a division." />
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Teams</h2>
      {season.divisions.map((division) => (
        <div key={division.id} className="team-division-group">
          <h3>{division.name}</h3>
          {division.teams.length === 0 ? (
            <p className="muted">No teams in this division yet.</p>
          ) : (
            <ul className="editable-list">
              {division.teams.map((team) => (
                <TeamRow key={team.id} team={team} divisions={season.divisions} venues={season.venues} onChanged={refetch} />
              ))}
            </ul>
          )}
          <AddTeamForm division={division} season={season} onChanged={refetch} />
        </div>
      ))}
    </section>
  )
}
