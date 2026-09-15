import { useState, type FormEvent } from 'react'
import { useSeason } from '../../context/SeasonContext'
import { useAction } from '../../hooks/useAction'
import { addVenue, deleteVenue, updateVenue } from '../../api/seasons'
import { Button } from '../../components/ui/Button'
import { InlineError } from '../../components/ui/InlineError'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { Venue } from '../../api/types'

function VenueRow({ venue, onChanged }: { venue: Venue; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(venue.name)
  const [capacity, setCapacity] = useState(venue.board_capacity)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const save = useAction(() => updateVenue(venue.id, { name: name.trim(), board_capacity: capacity }))
  const remove = useAction(() => deleteVenue(venue.id).then(() => true))

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

  if (editing) {
    return (
      <li className="editable-row">
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Venue name" />
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(event) => setCapacity(Number(event.target.value) || 1)}
          aria-label="Board capacity"
          className="capacity-input"
        />
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
      <span className="row-title">{venue.name}</span>
      <span className="muted">
        {venue.board_capacity} board{venue.board_capacity === 1 ? '' : 's'}
      </span>
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
          title="Remove venue"
          description={`Remove "${venue.name}"? This can't be undone, and will fail if any team or fixture still uses it.`}
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

export function VenuesPanel() {
  const { season, refetch } = useSeason()
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(1)
  const create = useAction(() => addVenue(season.id, { name: name.trim(), board_capacity: capacity }))

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    const result = await create.run()
    if (result) {
      setName('')
      setCapacity(1)
      refetch()
    }
  }

  return (
    <section className="card">
      <h2>Venues</h2>
      <p className="muted">Board capacity is the maximum number of home fixtures a venue can host on one date, across all divisions.</p>

      {season.venues.length === 0 ? (
        <EmptyState title="No venues yet" description="Add at least one venue before assigning teams." />
      ) : (
        <ul className="editable-list">
          {season.venues.map((venue) => (
            <VenueRow key={venue.id} venue={venue} onChanged={refetch} />
          ))}
        </ul>
      )}

      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="Venue name" value={name} onChange={(event) => setName(event.target.value)} aria-label="New venue name" />
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(event) => setCapacity(Number(event.target.value) || 1)}
          aria-label="New venue board capacity"
          className="capacity-input"
        />
        <Button type="submit" variant="secondary" busy={create.loading} disabled={!name.trim()}>
          Add venue
        </Button>
      </form>
      <InlineError error={create.error} />
    </section>
  )
}
