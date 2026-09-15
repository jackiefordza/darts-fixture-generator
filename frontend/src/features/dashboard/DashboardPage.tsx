import { Link } from 'react-router-dom'
import { useSeason } from '../../context/SeasonContext'
import { useFetch } from '../../hooks/useFetch'
import { getSchedule } from '../../api/fixtures'
import { validateSeason } from '../../api/fixtures'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { formatDate } from '../../utils/lookups'

export function DashboardPage() {
  const { season } = useSeason()
  const { data: fixtures, loading, error } = useFetch(() => getSchedule(season.id), [season.id])
  const generated = (fixtures?.length ?? 0) > 0
  const {
    data: validation,
    loading: validating,
    error: validationError,
  } = useFetch(() => (generated ? validateSeason(season.id) : Promise.resolve(null)), [season.id, generated])

  const teamCount = season.divisions.reduce((total, division) => total + division.teams.length, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{season.league_name}</h1>
          <p className="muted">
            {season.name} · First fixture {formatDate(season.first_fixture_date)}
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <span className="stat-value">{season.divisions.length}</span>
          <span className="stat-label">Divisions</span>
        </div>
        <div className="card stat-card">
          <span className="stat-value">{teamCount}</span>
          <span className="stat-label">Teams</span>
        </div>
        <div className="card stat-card">
          <span className="stat-value">{season.venues.length}</span>
          <span className="stat-label">Venues</span>
        </div>
        <div className="card stat-card">
          <span className="stat-value">{season.calendar_events.length}</span>
          <span className="stat-label">Calendar events</span>
        </div>
      </div>

      <div className="card">
        <h2>Schedule status</h2>
        {loading && <LoadingState label="Checking schedule…" />}
        {!loading && error && <ErrorState message={error} />}
        {!loading && !error && (
          <div className="status-row">
            {!generated ? (
              <StatusBadge tone="warning">Not generated yet</StatusBadge>
            ) : validating ? (
              <LoadingState label="Validating…" />
            ) : validationError ? (
              <ErrorState message={validationError} />
            ) : validation?.is_valid ? (
              <StatusBadge tone="success">Valid — {fixtures?.length} fixtures</StatusBadge>
            ) : (
              <StatusBadge tone="danger">
                Invalid — {validation?.issues.length ?? 0} issue{validation?.issues.length === 1 ? '' : 's'}
              </StatusBadge>
            )}
            {season.generation_seed !== null && <span className="muted">Seed {season.generation_seed}</span>}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Get started</h2>
        <div className="quick-links">
          <Link className="btn btn-secondary" to="setup">
            Season setup
          </Link>
          <Link className="btn btn-secondary" to="calendar">
            Calendar
          </Link>
          <Link className="btn btn-primary" to="schedule">
            {generated ? 'View schedule' : 'Generate schedule'}
          </Link>
          <Link className="btn btn-secondary" to="validation">
            Validation
          </Link>
        </div>
      </div>
    </div>
  )
}
