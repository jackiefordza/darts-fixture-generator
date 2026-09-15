import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { InlineError } from '../../components/ui/InlineError'
import { useAction } from '../../hooks/useAction'
import { moveFixture } from '../../api/fixtures'
import { ApiError } from '../../api/http'
import { formatDate } from '../../utils/lookups'
import type { FixtureDetail } from '../../api/types'

export function MoveFixtureForm({
  fixture,
  onMoved,
  onCancel,
}: {
  fixture: FixtureDetail
  onMoved: () => void
  onCancel: () => void
}) {
  const [newDate, setNewDate] = useState(fixture.scheduled_date)
  const [reason, setReason] = useState('')
  const move = useAction((date: string) => moveFixture(fixture.id, { new_date: date, reason: reason.trim() || null }))

  async function submit(date: string) {
    const result = await move.run(date)
    if (result) onMoved()
  }

  const suggestions = move.error instanceof ApiError ? move.error.suggestedDates : []

  return (
    <div className="move-fixture-form">
      <label className="field">
        <span>New date</span>
        <input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
      </label>
      <label className="field">
        <span>Reason (optional)</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Waterlogged board"
        />
      </label>

      <InlineError error={move.error} />

      {suggestions.length > 0 && (
        <div className="suggested-dates">
          <p>Suggested valid dates instead:</p>
          <div className="suggested-dates-list">
            {suggestions.map((date) => (
              <button
                key={date}
                type="button"
                className="btn btn-ghost"
                disabled={move.loading}
                onClick={() => {
                  setNewDate(date)
                  submit(date)
                }}
              >
                {formatDate(date)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-actions">
        <Button variant="primary" busy={move.loading} onClick={() => submit(newDate)} disabled={!newDate}>
          Move fixture
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={move.loading}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
