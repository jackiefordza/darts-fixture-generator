import { useMemo, useState } from 'react'
import { useSeason } from '../../context/SeasonContext'
import { useFetch } from '../../hooks/useFetch'
import { getSchedule } from '../../api/fixtures'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { GenerateControls } from './GenerateControls'
import { ScheduleFilters, type ScheduleFilterState } from './ScheduleFilters'
import { ScheduleTable } from './ScheduleTable'
import { ExportButtons } from './ExportButtons'
import { FixtureDetailModal } from './FixtureDetailModal'
import { buildLookups } from '../../utils/lookups'

const EMPTY_FILTERS: ScheduleFilterState = { divisionId: '', week: '', date: '' }

export function SchedulePage() {
  const { season } = useSeason()
  const { data: fixtures, loading, error, refetch } = useFetch(() => getSchedule(season.id), [season.id])
  const [filters, setFilters] = useState<ScheduleFilterState>(EMPTY_FILTERS)
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null)

  const lookups = useMemo(() => buildLookups(season), [season])

  const weeks = useMemo(
    () => [...new Set((fixtures ?? []).map((fixture) => fixture.week_number))].sort((a, b) => a - b),
    [fixtures],
  )

  const filteredFixtures = useMemo(() => {
    return (fixtures ?? []).filter((fixture) => {
      if (filters.divisionId && fixture.division_id !== filters.divisionId) return false
      if (filters.week && fixture.week_number !== Number(filters.week)) return false
      if (filters.date && fixture.scheduled_date !== filters.date) return false
      return true
    })
  }, [fixtures, filters])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Schedule</h1>
          <p className="muted">Generation applies to the complete season, across all divisions at once.</p>
        </div>
      </div>

      <section className="card">
        <GenerateControls seasonId={season.id} hasFixtures={(fixtures?.length ?? 0) > 0} onComplete={refetch} />
      </section>

      {loading && <LoadingState label="Loading schedule…" />}
      {!loading && error && <ErrorState message={error} onRetry={refetch} />}

      {!loading && !error && fixtures && fixtures.length === 0 && (
        <EmptyState title="No schedule generated yet" description="Use Generate schedule above once your divisions, teams and venues are configured." />
      )}

      {!loading && !error && fixtures && fixtures.length > 0 && (
        <>
          <section className="card">
            <ExportButtons seasonId={season.id} divisions={season.divisions} />
          </section>

          <section className="card">
            <ScheduleFilters divisions={season.divisions} weeks={weeks} filters={filters} onChange={setFilters} />
            <ScheduleTable
              fixtures={filteredFixtures}
              allFixtures={fixtures}
              season={season}
              lookups={lookups}
              onSelectFixture={setSelectedFixtureId}
            />
          </section>
        </>
      )}

      {selectedFixtureId && (
        <FixtureDetailModal
          fixtureId={selectedFixtureId}
          lookups={lookups}
          onClose={() => setSelectedFixtureId(null)}
          onChanged={refetch}
        />
      )}
    </div>
  )
}
