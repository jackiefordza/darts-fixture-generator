import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { InlineError } from '../../components/ui/InlineError'
import type { ApiError } from '../../api/http'
import type { SeasonSummary } from '../../api/types'

export interface SeasonFormValues {
  league_name: string
  name: string
  first_fixture_date: string
  cadence_days: number
}

interface SeasonFormProps {
  initial?: SeasonSummary
  busy: boolean
  error: ApiError | string | null
  submitLabel: string
  onSubmit: (values: SeasonFormValues) => void
}

export function SeasonForm({ initial, busy, error, submitLabel, onSubmit }: SeasonFormProps) {
  const [leagueName, setLeagueName] = useState(initial?.league_name ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [firstFixtureDate, setFirstFixtureDate] = useState(initial?.first_fixture_date ?? '')
  const [cadenceDays, setCadenceDays] = useState(initial?.cadence_days ?? 7)

  const canSubmit = leagueName.trim() !== '' && name.trim() !== '' && firstFixtureDate !== ''

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({
      league_name: leagueName.trim(),
      name: name.trim(),
      first_fixture_date: firstFixtureDate,
      cadence_days: cadenceDays,
    })
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <label className="field">
        <span>League name</span>
        <input value={leagueName} onChange={(event) => setLeagueName(event.target.value)} placeholder="e.g. Riverside Darts League" required />
      </label>
      <label className="field">
        <span>Season name / title</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 2026/27" required />
      </label>
      <label className="field">
        <span>First fixture date</span>
        <input
          type="date"
          value={firstFixtureDate}
          onChange={(event) => setFirstFixtureDate(event.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>Days between fixture weeks</span>
        <input
          type="number"
          min={1}
          value={cadenceDays}
          onChange={(event) => setCadenceDays(Number(event.target.value) || 1)}
        />
        <small>Normally 7 for a weekly match night.</small>
      </label>
      <InlineError error={error} />
      <div className="form-actions">
        <Button type="submit" variant="primary" busy={busy} disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
