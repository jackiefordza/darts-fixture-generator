import type { Division, Fixture } from '../api/types'

/**
 * Teams with no fixture in a division's week they otherwise played in have a Bye.
 * Byes aren't persisted as fixtures (per the backend's domain model), so this is
 * inferred purely from the roster vs. the fixtures already returned by the API -
 * it never decides scheduling, only reads it.
 */
export function computeByeTeams(fixtures: Fixture[], divisions: Division[]): Map<string, string[]> {
  const fixturesByDivisionWeek = new Map<string, Fixture[]>()
  for (const fixture of fixtures) {
    const key = `${fixture.week_number}:${fixture.division_id}`
    const group = fixturesByDivisionWeek.get(key)
    if (group) group.push(fixture)
    else fixturesByDivisionWeek.set(key, [fixture])
  }

  const divisionById = new Map(divisions.map((division) => [division.id, division]))
  const byes = new Map<string, string[]>()

  for (const [key, weekFixtures] of fixturesByDivisionWeek) {
    const [, divisionId] = key.split(':')
    const division = divisionById.get(divisionId)
    if (!division) continue
    const playing = new Set(weekFixtures.flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]))
    const missing = division.teams.filter((team) => !playing.has(team.id)).map((team) => team.id)
    if (missing.length > 0) byes.set(key, missing)
  }

  return byes
}

export function groupFixturesByWeek(fixtures: Fixture[]): [number, Fixture[]][] {
  const byWeek = new Map<number, Fixture[]>()
  for (const fixture of fixtures) {
    const group = byWeek.get(fixture.week_number)
    if (group) group.push(fixture)
    else byWeek.set(fixture.week_number, [fixture])
  }
  return [...byWeek.entries()].sort(([a], [b]) => a - b)
}

export function groupByDivision(fixtures: Fixture[], divisions: Division[]): [Division, Fixture[]][] {
  const byDivision = new Map<string, Fixture[]>()
  for (const fixture of fixtures) {
    const group = byDivision.get(fixture.division_id)
    if (group) group.push(fixture)
    else byDivision.set(fixture.division_id, [fixture])
  }
  return divisions
    .filter((division) => byDivision.has(division.id))
    .map((division) => [division, byDivision.get(division.id) ?? []] as [Division, Fixture[]])
}
