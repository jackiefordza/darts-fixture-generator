import { useState } from 'react'
import { Modal } from '../../components/ui/Modal'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Button } from '../../components/ui/Button'
import { useFetch } from '../../hooks/useFetch'
import { getFixture } from '../../api/fixtures'
import { MoveFixtureForm } from './MoveFixtureForm'
import { formatDate, formatDateTime } from '../../utils/lookups'
import type { SeasonLookups } from '../../utils/lookups'

export function FixtureDetailModal({
  fixtureId,
  lookups,
  onClose,
  onChanged,
}: {
  fixtureId: string
  lookups: SeasonLookups
  onClose: () => void
  onChanged: () => void
}) {
  const [moving, setMoving] = useState(false)
  const { data: fixture, loading, error, refetch } = useFetch(() => getFixture(fixtureId), [fixtureId])

  function handleMoved() {
    setMoving(false)
    refetch()
    onChanged()
  }

  return (
    <Modal title="Fixture detail" onClose={onClose}>
      {loading && <LoadingState label="Loading fixture…" />}
      {!loading && error && <ErrorState message={error} onRetry={refetch} />}
      {!loading && fixture && (
        <div className="fixture-detail">
          <dl className="fixture-detail-grid">
            <dt>Fixture ID</dt>
            <dd className="mono">{fixture.id}</dd>
            <dt>Division</dt>
            <dd>{lookups.divisionName(fixture.division_id)}</dd>
            <dt>Week</dt>
            <dd>{fixture.week_number}</dd>
            <dt>Current date</dt>
            <dd>{formatDate(fixture.scheduled_date)}</dd>
            {fixture.original_scheduled_date && fixture.original_scheduled_date !== fixture.scheduled_date && (
              <>
                <dt>Original date</dt>
                <dd>{formatDate(fixture.original_scheduled_date)}</dd>
              </>
            )}
            <dt>Home team</dt>
            <dd>{lookups.teamName(fixture.home_team_id)}</dd>
            <dt>Away team</dt>
            <dd>{lookups.teamName(fixture.away_team_id)}</dd>
            <dt>Venue</dt>
            <dd>{lookups.venueName(fixture.playing_venue_id)}</dd>
            <dt>Status</dt>
            <dd>
              {fixture.manual && <StatusBadge tone="warning">Manual</StatusBadge>}
              {fixture.locked && <StatusBadge tone="neutral">Locked</StatusBadge>}
              {!fixture.manual && !fixture.locked && <StatusBadge tone="success">Generated</StatusBadge>}
            </dd>
          </dl>

          {fixture.locked && (
            <p className="muted">
              This fixture is locked. Regenerating unlocked fixtures will leave it untouched.
            </p>
          )}

          <h3>Rescheduling history</h3>
          {fixture.history.length === 0 ? (
            <p className="muted">No rescheduling history.</p>
          ) : (
            <ul className="history-list">
              {fixture.history.map((entry) => (
                <li key={entry.id}>
                  <span>
                    {formatDate(entry.from_date)} → {formatDate(entry.to_date)}
                  </span>
                  {entry.reason && <span className="muted"> · {entry.reason}</span>}
                  {entry.actor && <span className="muted"> · {entry.actor}</span>}
                  <span className="muted"> · {formatDateTime(entry.changed_at)}</span>
                </li>
              ))}
            </ul>
          )}

          {moving ? (
            <MoveFixtureForm fixture={fixture} onMoved={handleMoved} onCancel={() => setMoving(false)} />
          ) : (
            <div className="form-actions">
              <Button variant="primary" onClick={() => setMoving(true)}>
                Move / postpone fixture
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
