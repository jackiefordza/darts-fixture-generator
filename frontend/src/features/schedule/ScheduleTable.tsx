import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDate } from '../../utils/lookups'
import { computeByeTeams, groupByDivision, groupFixturesByWeek } from '../../utils/schedule'
import type { SeasonLookups } from '../../utils/lookups'
import type { Fixture, SeasonDetail } from '../../api/types'

export function ScheduleTable({
  fixtures,
  allFixtures,
  season,
  lookups,
  onSelectFixture,
}: {
  fixtures: Fixture[]
  allFixtures: Fixture[]
  season: SeasonDetail
  lookups: SeasonLookups
  onSelectFixture: (fixtureId: string) => void
}) {
  if (fixtures.length === 0) {
    return <EmptyState title="No fixtures match these filters" description="Try clearing the filters above." />
  }

  const byes = computeByeTeams(allFixtures, season.divisions)
  const weeks = groupFixturesByWeek(fixtures)

  return (
    <div className="schedule-weeks">
      {weeks.map(([week, weekFixtures]) => (
        <section key={week} className="schedule-week">
          <h3>Week {week}</h3>
          {groupByDivision(weekFixtures, season.divisions).map(([division, divisionFixtures]) => {
            const byeTeamIds = byes.get(`${week}:${division.id}`) ?? []
            return (
              <div key={division.id} className="schedule-division-group">
                <h4>{division.name}</h4>
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Home</th>
                      <th>Away</th>
                      <th>Venue</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {divisionFixtures
                      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
                      .map((fixture) => (
                        <tr
                          key={fixture.id}
                          className="schedule-row"
                          onClick={() => onSelectFixture(fixture.id)}
                          tabIndex={0}
                          role="button"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') onSelectFixture(fixture.id)
                          }}
                        >
                          <td>{formatDate(fixture.scheduled_date)}</td>
                          <td>{lookups.teamName(fixture.home_team_id)}</td>
                          <td>{lookups.teamName(fixture.away_team_id)}</td>
                          <td>{lookups.venueName(fixture.playing_venue_id)}</td>
                          <td>
                            {fixture.manual && <StatusBadge tone="warning">Manual</StatusBadge>}
                            {fixture.locked && <StatusBadge tone="neutral">Locked</StatusBadge>}
                          </td>
                        </tr>
                      ))}
                    {byeTeamIds.map((teamId) => (
                      <tr key={teamId} className="schedule-row schedule-row-bye">
                        <td>—</td>
                        <td colSpan={2}>{lookups.teamName(teamId)} — Bye</td>
                        <td>—</td>
                        <td>—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
