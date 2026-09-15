import { apiDelete, apiGet, apiPatch, apiPost } from './http'
import type {
  CalendarEvent,
  Division,
  DivisionInput,
  EventInput,
  RawCalendarEvent,
  RawSeasonDetail,
  RawSeasonSummary,
  SeasonDetail,
  SeasonInput,
  SeasonSummary,
  Team,
  TeamInput,
  Venue,
  VenueInput,
} from './types'

function normalizeEvent(event: RawCalendarEvent): CalendarEvent {
  return {
    ...event,
    blocks_initial_generation: Boolean(event.blocks_initial_generation),
    appears_on_poster: Boolean(event.appears_on_poster),
  }
}

function normalizeSummary(season: RawSeasonSummary): SeasonSummary {
  return { ...season }
}

function normalizeDetail(season: RawSeasonDetail): SeasonDetail {
  return {
    ...season,
    divisions: season.divisions as Division[],
    venues: season.venues as Venue[],
    calendar_events: season.calendar_events.map(normalizeEvent),
  }
}

export async function listSeasons(): Promise<SeasonSummary[]> {
  const seasons = await apiGet<RawSeasonSummary[]>('/seasons')
  return seasons.map(normalizeSummary)
}

export async function getSeason(seasonId: string): Promise<SeasonDetail> {
  const season = await apiGet<RawSeasonDetail>(`/seasons/${seasonId}`)
  return normalizeDetail(season)
}

export async function createSeason(input: Required<SeasonInput>): Promise<SeasonDetail> {
  const season = await apiPost<RawSeasonDetail>('/seasons', input)
  return normalizeDetail(season)
}

export async function updateSeason(seasonId: string, input: SeasonInput): Promise<SeasonDetail> {
  const season = await apiPatch<RawSeasonDetail>(`/seasons/${seasonId}`, input)
  return normalizeDetail(season)
}

export async function addDivision(seasonId: string, input: DivisionInput): Promise<Division> {
  return apiPost<Division>(`/seasons/${seasonId}/divisions`, input)
}

export async function updateDivision(
  divisionId: string,
  input: Partial<DivisionInput>,
): Promise<Division> {
  return apiPatch<Division>(`/divisions/${divisionId}`, input)
}

export async function deleteDivision(divisionId: string): Promise<void> {
  return apiDelete(`/divisions/${divisionId}`)
}

export async function addVenue(seasonId: string, input: VenueInput): Promise<Venue> {
  return apiPost<Venue>(`/seasons/${seasonId}/venues`, input)
}

export async function updateVenue(venueId: string, input: Partial<VenueInput>): Promise<Venue> {
  return apiPatch<Venue>(`/venues/${venueId}`, input)
}

export async function deleteVenue(venueId: string): Promise<void> {
  return apiDelete(`/venues/${venueId}`)
}

export async function addTeam(seasonId: string, input: TeamInput): Promise<Team> {
  return apiPost<Team>(`/seasons/${seasonId}/teams`, input)
}

export async function updateTeam(teamId: string, input: Partial<TeamInput>): Promise<Team> {
  return apiPatch<Team>(`/teams/${teamId}`, input)
}

export async function deleteTeam(teamId: string): Promise<void> {
  return apiDelete(`/teams/${teamId}`)
}

export async function addEvent(seasonId: string, input: EventInput): Promise<CalendarEvent> {
  const event = await apiPost<RawCalendarEvent>(`/seasons/${seasonId}/events`, input)
  return normalizeEvent(event)
}

export async function updateEvent(
  eventId: string,
  input: Partial<EventInput>,
): Promise<CalendarEvent> {
  const event = await apiPatch<RawCalendarEvent>(`/events/${eventId}`, input)
  return normalizeEvent(event)
}

export async function deleteEvent(eventId: string): Promise<void> {
  return apiDelete(`/events/${eventId}`)
}
