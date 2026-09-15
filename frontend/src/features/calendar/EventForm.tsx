import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { InlineError } from '../../components/ui/InlineError'
import type { ApiError } from '../../api/http'
import type { CalendarEvent, CalendarEventType, EventInput } from '../../api/types'

const EVENT_TYPES: { value: CalendarEventType; label: string }[] = [
  { value: 'competition', label: 'Competition' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'team_ko', label: 'Team K.O.' },
  { value: 'break', label: 'Break' },
  { value: 'other', label: 'Other' },
]

interface EventFormProps {
  initial?: CalendarEvent
  busy: boolean
  error: ApiError | string | null
  submitLabel: string
  onSubmit: (values: EventInput) => void
  onCancel?: () => void
}

export function EventForm({ initial, busy, error, submitLabel, onSubmit, onCancel }: EventFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [isRange, setIsRange] = useState(Boolean(initial?.end_date))
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [eventType, setEventType] = useState<CalendarEventType>(initial?.event_type ?? 'competition')
  const [blocks, setBlocks] = useState(initial?.blocks_initial_generation ?? true)

  const canSubmit = name.trim() !== '' && startDate !== '' && (!isRange || endDate !== '')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({
      name: name.trim(),
      start_date: startDate,
      end_date: isRange ? endDate : null,
      event_type: eventType,
      blocks_initial_generation: blocks,
    })
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <label className="field">
        <span>Event name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Christmas break" required />
      </label>
      <label className="field">
        <span>Type</span>
        <select value={eventType} onChange={(event) => setEventType(event.target.value as CalendarEventType)}>
          {EVENT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Start date</span>
        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
      </label>
      <label className="field checkbox-field">
        <input type="checkbox" checked={isRange} onChange={(event) => setIsRange(event.target.checked)} />
        <span>Date range</span>
      </label>
      {isRange && (
        <label className="field">
          <span>End date</span>
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required={isRange} />
        </label>
      )}
      <label className="field checkbox-field">
        <input type="checkbox" checked={blocks} onChange={(event) => setBlocks(event.target.checked)} />
        <span>Blocks initial fixture generation on this date</span>
      </label>
      <InlineError error={error} />
      <div className="form-actions">
        <Button type="submit" variant="primary" busy={busy} disabled={!canSubmit}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy} type="button">
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
