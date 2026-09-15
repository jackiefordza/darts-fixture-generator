import { useState, type FormEvent } from 'react'
import { useSeason } from '../../context/SeasonContext'
import { useAction } from '../../hooks/useAction'
import { addDivision, deleteDivision, updateDivision } from '../../api/seasons'
import { Button } from '../../components/ui/Button'
import { InlineError } from '../../components/ui/InlineError'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { Division } from '../../api/types'

function DivisionRow({ division, onChanged }: { division: Division; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(division.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const save = useAction(() => updateDivision(division.id, { name: name.trim() }))
  const remove = useAction(() => deleteDivision(division.id).then(() => true))

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
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Division name" />
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
      <span className="row-title">{division.name}</span>
      <span className="muted">
        {division.teams.length} team{division.teams.length === 1 ? '' : 's'}
        {division.teams.length % 2 !== 0 && ' · auto Bye'}
      </span>
      <div className="row-actions">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Rename
        </Button>
        <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
          Remove
        </Button>
      </div>
      {confirmingDelete && (
        <ConfirmDialog
          title="Remove division"
          description={`Remove "${division.name}"? This will fail if it still has teams or fixtures.`}
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

export function DivisionsPanel() {
  const { season, refetch } = useSeason()
  const [name, setName] = useState('')
  const create = useAction(() =>
    addDivision(season.id, { name: name.trim(), position: season.divisions.length + 1 }),
  )

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    const result = await create.run()
    if (result) {
      setName('')
      refetch()
    }
  }

  return (
    <section className="card">
      <h2>Divisions</h2>
      <p className="muted">Divisions may have different numbers of teams. Odd-numbered divisions get an automatic Bye.</p>

      {season.divisions.length === 0 ? (
        <EmptyState title="No divisions yet" description="Add a division to start building the season." />
      ) : (
        <ul className="editable-list">
          {season.divisions.map((division) => (
            <DivisionRow key={division.id} division={division} onChanged={refetch} />
          ))}
        </ul>
      )}

      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="Division name" value={name} onChange={(event) => setName(event.target.value)} aria-label="New division name" />
        <Button type="submit" variant="secondary" busy={create.loading} disabled={!name.trim()}>
          Add division
        </Button>
      </form>
      <InlineError error={create.error} />
    </section>
  )
}
