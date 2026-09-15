import { useMemo } from 'react'
import { useSeason } from '../../context/SeasonContext'
import { useFetch } from '../../hooks/useFetch'
import { getSchedule, validateSeason } from '../../api/fixtures'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { buildLookups } from '../../utils/lookups'

export function ValidationPage() {
  const { season } = useSeason()
  const lookups = useMemo(() => buildLookups(season), [season])
  const { data: fixtures, loading: loadingFixtures } = useFetch(() => getSchedule(season.id), [season.id])
  const generated = (fixtures?.length ?? 0) > 0

  const {
    data: validation,
    loading: validating,
    error,
    refetch,
  } = useFetch(() => (generated ? validateSeason(season.id) : Promise.resolve(null)), [season.id, generated])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Validation</h1>
        <p className="muted">Runs the backend's independent schedule validator against the complete stored season.</p>
      </div>

      {(loadingFixtures || validating) && <LoadingState label="Validating…" />}
      {!loadingFixtures && !validating && error && <ErrorState message={error} onRetry={refetch} />}

      {!loadingFixtures && !validating && !error && !generated && (
        <EmptyState title="No schedule to validate yet" description="Generate the schedule first from the Schedule page." />
      )}

      {!loadingFixtures && !validating && !error && generated && validation && (
        <section className="card">
          {validation.is_valid ? (
            <StatusBadge tone="success">Schedule is valid</StatusBadge>
          ) : (
            <>
              <StatusBadge tone="danger">
                {validation.issues.length} issue{validation.issues.length === 1 ? '' : 's'} found
              </StatusBadge>
              <ul className="validation-issue-list">
                {validation.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className={`validation-issue severity-${issue.severity}`}>
                    <div className="validation-issue-header">
                      <StatusBadge tone={issue.severity === 'error' ? 'danger' : issue.severity === 'warning' ? 'warning' : 'info'}>
                        {issue.code}
                      </StatusBadge>
                      {issue.division_id && <span className="muted">{lookups.divisionName(issue.division_id)}</span>}
                    </div>
                    <p>{issue.message}</p>
                    {issue.fixture_ids.length > 0 && (
                      <p className="muted mono">Fixtures: {issue.fixture_ids.join(', ')}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
