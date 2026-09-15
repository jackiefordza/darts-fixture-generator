import { useNavigate } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { useAction } from '../../hooks/useAction'
import { listSeasons, createSeason } from '../../api/seasons'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { SeasonForm, type SeasonFormValues } from './SeasonForm'
import { rememberSeasonId } from '../../context/SeasonContext'
import { formatDate } from '../../utils/lookups'

export function SeasonsHomePage() {
  const navigate = useNavigate()
  const { data: seasons, loading, error, refetch } = useFetch(listSeasons, [])
  const create = useAction((values: SeasonFormValues) => createSeason(values))

  async function handleCreate(values: SeasonFormValues) {
    const season = await create.run(values)
    if (season) {
      rememberSeasonId(season.id)
      navigate(`/seasons/${season.id}`)
    }
  }

  return (
    <div className="page-center">
      <div className="season-home">
        <section className="card">
          <h1>Fixture Generator</h1>
          <p className="muted">Manage darts league seasons: divisions, teams, venues, calendar and fixtures.</p>

          {loading && <LoadingState label="Loading seasons…" />}
          {!loading && error && <ErrorState message={error} onRetry={refetch} />}
          {!loading && !error && seasons && seasons.length === 0 && (
            <EmptyState title="No seasons yet" description="Create your first season to get started." />
          )}
          {!loading && !error && seasons && seasons.length > 0 && (
            <ul className="season-list">
              {seasons.map((season) => (
                <li key={season.id}>
                  <button
                    type="button"
                    className="season-list-item"
                    onClick={() => {
                      rememberSeasonId(season.id)
                      navigate(`/seasons/${season.id}`)
                    }}
                  >
                    <span className="season-list-title">
                      {season.league_name} — {season.name}
                    </span>
                    <span className="muted">First fixture {formatDate(season.first_fixture_date)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Create a new season</h2>
          <SeasonForm submitLabel="Create season" busy={create.loading} error={create.error} onSubmit={handleCreate} />
        </section>
      </div>
    </div>
  )
}
