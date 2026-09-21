import type { Fixture, SeasonDetail } from '../../api/types'

export interface GridFixtureCell {
  type: 'fixture'
  id: string
  homeNumber: number
  awayNumber: number
}

/** A synthetic marker for an odd-sized division's sitting-out team - never a real
 * `Fixture`, never persisted, never exported. Purely so the compact grid says "BYE"
 * instead of leaving that team unexplained by simply having one fewer line that week
 * (the schedule page already labels this explicitly; the poster grid did not). */
export interface GridByeCell {
  type: 'bye'
  id: string
  teamNumber: number
}

export type GridCellEntry = GridFixtureCell | GridByeCell

export interface GridWeek {
  week: number
  /** The most common scheduled date among that week's fixtures; null if the week is empty. */
  date: string | null
}

export interface GridRow {
  divisionId: string
  divisionName: string
  cells: GridCellEntry[][]
}

export interface FixtureGridData {
  weeks: GridWeek[]
  rows: GridRow[]
}

/**
 * Derives the poster's compact fixture grid purely from the validated schedule -
 * weeks, per-division cells, and home/away team *numbers*. The number shown is
 * each team's stable `number` from the backend (fixed at creation, independent
 * of display-order reordering) - never recomputed from live list order here, so
 * reordering a division's team list can't silently change what an already-
 * generated fixture like "2v1" means. Nothing here invents or reorders a
 * fixture: it only groups and looks up numbers for whatever `fixtures` already
 * contains, plus a synthetic Bye marker (see `GridByeCell`) for whichever team an
 * odd-sized division's own fixtures already imply sat out that week - never a
 * new fixture, and never present for an even-sized division (so an all-8-team
 * season's grid is completely unaffected).
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
    for (const team of division.teams) numberByTeamId.set(team.id, team.number)
  }

  const rows: GridRow[] = season.divisions.map((division) => ({
    divisionId: division.id,
    divisionName: division.name,
    cells: weekNumbers.map((week) => {
      const weekFixtures = fixtures.filter(
        (fixture) => fixture.division_id === division.id && fixture.week_number === week,
      )
      const cell: GridCellEntry[] = weekFixtures.map((fixture) => ({
        type: 'fixture',
        id: fixture.id,
        homeNumber: numberByTeamId.get(fixture.home_team_id) ?? 0,
        awayNumber: numberByTeamId.get(fixture.away_team_id) ?? 0,
      }))
      // Only an odd-sized division can have a Bye, and only for weeks it actually
      // played (an empty cell for a division that simply has no round that week -
      // e.g. a smaller division once a larger one's calendar runs on - is not a Bye).
      if (weekFixtures.length > 0 && division.teams.length % 2 === 1) {
        const playing = new Set(weekFixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]))
        const byeTeam = division.teams.find((team) => !playing.has(team.id))
        if (byeTeam) {
          cell.push({ type: 'bye', id: `bye-${division.id}-${week}-${byeTeam.id}`, teamNumber: byeTeam.number })
        }
      }
      return cell
    }),
  }))

  return { weeks, rows }
}
