import type { SeasonDetail } from '../api/types'

export interface SeasonLookups {
  divisionName: (id: string) => string
  teamName: (id: string) => string
  venueName: (id: string) => string
  teamCount: number
}

export function buildLookups(season: SeasonDetail): SeasonLookups {
  const divisions = new Map(season.divisions.map((division) => [division.id, division.name]))
  const teams = new Map(
    season.divisions.flatMap((division) => division.teams.map((team) => [team.id, team.name] as const)),
  )
  const venues = new Map(season.venues.map((venue) => [venue.id, venue.name]))

  return {
    divisionName: (id) => divisions.get(id) ?? 'Unknown division',
    teamName: (id) => teams.get(id) ?? 'Unknown team',
    venueName: (id) => venues.get(id) ?? 'Unknown venue',
    teamCount: teams.size,
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parsed = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
