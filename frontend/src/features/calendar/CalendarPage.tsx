import { useState } from 'react'
import { useSeason } from '../../context/SeasonContext'
import { useAction } from '../../hooks/useAction'
import { addEvent, deleteEvent, updateEvent } from '../../api/seasons'
import { EventForm } from './EventForm'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { formatDate } from '../../utils/lookups'
import type { CalendarEvent, CalendarEventType, EventInput } from '../../api/types'

const TYPE_LABEL: Record<CalendarEventType, string> = {
  competition: 'Competition',
  tournament: 'Tournament',
  team_ko: 'Team K.O.',
  break: 'Break',
  other: 'Other',
}

function EventRow({ event, onChanged }: { event: CalendarEvent; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const update = useAction((values: EventInput) => updateEvent(event.id, values))
  const remove = useAction(() => deleteEvent(event.id).then(() => true))

  async function handleSave(values: EventInput) {
    const result = await update.run(values)
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
      <li className="calendar-event-row calendar-event-editing">
        <EventForm initial={event} submitLabel="Save changes" busy={update.loading} error={update.error} onSubmit={handleSave} onCancel={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li className="calendar-event-row">
      <div className="calendar-event-main">
        <span className="row-title">{event.name}</span>
        <span className="muted">
          {formatDate(event.start_date)}
          {event.end_date && event.end_date !== event.start_date ? ` – ${formatDate(event.end_date)}` : ''}
        </span>
      </div>
      <div className="calendar-event-badges">
        <StatusBadge tone="info">{TYPE_LABEL[event.event_type]}</StatusBadge>
        {event.blocks_initial_generation ? (
          <StatusBadge tone="danger">Blocks generation</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Generation allowed</StatusBadge>
        )}
      </div>
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
          title="Remove calendar event"
          description={`Remove "${event.name}"? If it was blocking fixture generation, that date becomes available again.`}
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

export function CalendarPage() {
  const { season, refetch } = useSeason()
  const [showAddForm, setShowAddForm] = useState(false)
  const create = useAction((values: EventInput) => addEvent(season.id, values))

  async function handleCreate(values: EventInput) {
    const result = await create.run(values)
    if (result) {
      setShowAddForm(false)
      refetch()
    }
  }

  const sortedEvents = [...season.calendar_events].sort((a, b) => a.start_date.localeCompare(b.start_date))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Calendar</h1>
          <p className="muted">
            League match nights fall every {season.cadence_days} day{season.cadence_days === 1 ? '' : 's'} from{' '}
            {formatDate(season.first_fixture_date)}, skipping any date below that blocks generation.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowAddForm((value) => !value)}>
          {showAddForm ? 'Close' : 'Add event'}
        </Button>
      </div>

      {showAddForm && (
        <section className="card">
          <h2>New calendar event</h2>
          <EventForm submitLabel="Add event" busy={create.loading} error={create.error} onSubmit={handleCreate} />
        </section>
      )}

      <section className="card">
        {sortedEvents.length === 0 ? (
          <EmptyState
            title="No calendar events yet"
            description="Add competitions, tournaments, Team K.O. dates or breaks that should block initial fixture generation."
          />
        ) : (
          <ul className="calendar-event-list">
            {sortedEvents.map((event) => (
              <EventRow key={event.id} event={event} onChanged={refetch} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
