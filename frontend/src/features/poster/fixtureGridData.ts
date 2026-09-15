import type { Fixture, SeasonDetail } from '../../api/types'

export interface GridCellFixture {
  id: string
  homeNumber: number
  awayNumber: number
}

export interface GridWeek {
  week: number
  /** The most common scheduled date among that week's fixtures; null if the week is empty. */
  date: string | null
}

export interface GridRow {
  divisionId: string
  divisionName: string
  cells: GridCellFixture[][]
}

export interface FixtureGridData {
  weeks: GridWeek[]
  rows: GridRow[]
}

/**
 * Derives the poster's compact fixture grid purely from the validated schedule -
 * weeks, per-division cells, and home/away team *numbers* (a team's 1-based
 * position within its division, the same numbering scheme already used
 * everywhere else in the season). Nothing here invents or reorders a fixture:
 * it only groups and looks up numbers for whatever `fixtures` already contains.
 */
export function buildFixtureGrid(season: SeasonDetail, fixtures: Fixture[]): FixtureGridData {
  const weekNumbers = [...new Set(fixtures.map((fixture) => fixture.week_number))].sort((a, b) => a - b)

  const weeks: GridWeek[] = weekNumbers.map((week) => {
    const counts = new Map<string, number>()
    for (const fixture of fixtures) {
      if (fixture.week_number !== week) continue
      counts.set(fixture.scheduled_date, (counts.get(fixture.scheduled_date) ?? 0) + 1)
    }
    let bestDate: string | null = null
    let bestCount = -1
    for (const [date, count] of counts) {
      if (count > bestCount || (count === bestCount && (bestDate === null || date < bestDate))) {
        bestDate = date
        bestCount = count
      }
    }
    return { week, date: bestDate }
  })

  const numberByTeamId = new Map<string, number>()
  for (const division of season.divisions) {
    division.teams.forEach((team, index) => numberByTeamId.set(team.id, index + 1))
  }

  const rows: GridRow[] = season.divisions.map((division) => ({
    divisionId: division.id,
    divisionName: division.name,
    cells: weekNumbers.map((week) =>
      fixtures
        .filter((fixture) => fixture.division_id === division.id && fixture.week_number === week)
        .map((fixture) => ({
          id: fixture.id,
          homeNumber: numberByTeamId.get(fixture.home_team_id) ?? 0,
          awayNumber: numberByTeamId.get(fixture.away_team_id) ?? 0,
        })),
    ),
  }))

  return { weeks, rows }
}
