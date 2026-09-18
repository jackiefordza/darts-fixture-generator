import { useMemo, useState } from 'react'
import { useSeason } from '../../context/SeasonContext'
import { useFetch } from '../../hooks/useFetch'
import { getSchedule } from '../../api/fixtures'
import { LoadingState } from '../../components/ui/LoadingState'
import { ErrorState } from '../../components/ui/ErrorState'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { FixtureDetailModal } from '../schedule/FixtureDetailModal'
import { buildLookups, formatDate } from '../../utils/lookups'
import { computeByeTeams } from '../../utils/schedule'
import type { Fixture } from '../../api/types'

/**
 * A single team's complete season at a glance - the equivalent of the previous fixture
 * creator's Team View tab. Reads the same schedule data as the Schedule page (one
 * `getSchedule` call, filtered client-side for the selected team); it never fetches or
 * stores a second copy of the schedule, so a manual move or a regeneration is reflected
 * here the moment the underlying fixtures are refetched, exactly as it is on the
 * Schedule page.
 */
export function TeamViewPage() {
  const { season } = useSeason()
  const { data: fixtures, loading, error, refetch } = useFetch(() => getSchedule(season.id), [season.id])
  const lookups = useMemo(() => buildLookups(season), [season])

  const allTeams = useMemo(
    () => season.divisions.flatMap((division) => division.teams.map((team) => ({ ...team, divisionName: division.name }))),
    [season],
  )
  const [selectedTeamId, setSelectedTeamId] = useState(() => allTeams[0]?.id ?? '')
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null)

  const selectedTeam = allTeams.find((team) => team.id === selectedTeamId)

  const rows = useMemo(() => {
    if (!fixtures || !selectedTeam) return []
    const byes = computeByeTeams(fixtures, season.divisions)
    const teamFixtures = fixtures.filter(
      (fixture) => fixture.home_team_id === selectedTeam.id || fixture.away_team_id === selectedTeam.id,
    )
    const divisionWeeks = new Set(
      fixtures.filter((fixture) => fixture.division_id === selectedTeam.division_id).map((fixture) => fixture.week_number),
    )
    const byeWeeks = [...divisionWeeks].filter((week) => {
      const teamIds = byes.get(`${week}:${selectedTeam.division_id}`) ?? []
      return teamIds.includes(selectedTeam.id)
    })

    type Row =
      | { kind: 'fixture'; week: number; fixture: Fixture }
      | { kind: 'bye'; week: number }
    const combined: Row[] = [
      ...teamFixtures.map((fixture): Row => ({ kind: 'fixture', week: fixture.week_number, fixture })),
      ...byeWeeks.map((week): Row => ({ kind: 'bye', week })),
    ]
    return combined.sort((a, b) => a.week - b.week)
  }, [fixtures, selectedTeam, season.divisions])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Team View</h1>
          <p className="muted">A single team&apos;s complete season - week, opponent, home/away, and current date.</p>
        </div>
      </div>

      <section className="card">
        <label className="field">
          <span>Team</span>
          <select
            value={selectedTeamId}
            onChange={(event) => setSelectedTeamId(event.target.value)}
            aria-label="Select team"
          >
            {season.divisions.map((division) => (
              <optgroup key={division.id} label={division.name}>
                {division.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </section>

      {loading && <LoadingState label="Loading schedule…" />}
      {!loading && error && <ErrorState message={error} onRetry={refetch} />}

      {!loading && !error && !selectedTeam && (
        <EmptyState title="No teams yet" description="Add divisions and teams in Season Setup first." />
      )}

      {!loading && !error && selectedTeam && rows.length === 0 && (
        <EmptyState
          title="No schedule generated yet"
          description={`Generate a schedule to see ${selectedTeam.name}'s fixtures here.`}
        />
      )}

      {!loading && !error && selectedTeam && rows.length > 0 && (
        <section className="card">
          <table className="schedule-table team-view-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Date</th>
                <th>Opponent</th>
                <th>Home / Away</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.kind === 'bye') {
                  return (
                    <tr key={`bye-${row.week}`} className="schedule-row schedule-row-bye">
                      <td>{row.week}</td>
                      <td>—</td>
                      <td colSpan={2}>Bye</td>
                      <td>—</td>
                    </tr>
                  )
                }
                const fixture = row.fixture
                const isHome = fixture.home_team_id === selectedTeam.id
                const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id
                const postponed = Boolean(
                  fixture.original_scheduled_date && fixture.original_scheduled_date !== fixture.scheduled_date,
                )
                return (
                  <tr
                    key={fixture.id}
                    className="schedule-row"
                    onClick={() => setSelectedFixtureId(fixture.id)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') setSelectedFixtureId(fixture.id)
                    }}
                  >
                    <td>{fixture.week_number}</td>
                    <td>{formatDate(fixture.scheduled_date)}</td>
                    <td>{lookups.teamName(opponentId)}</td>
                    <td>{isHome ? 'Home' : 'Away'}</td>
                    <td>
                      {postponed && (
                        <StatusBadge tone="warning">
                          Postponed - was {formatDate(fixture.original_scheduled_date)}
                        </StatusBadge>
                      )}
                      {!postponed && fixture.locked && <StatusBadge tone="neutral">Locked</StatusBadge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
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
