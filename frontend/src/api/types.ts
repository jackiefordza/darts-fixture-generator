/**
 * Wire and domain types for the Fixture Generator backend.
 *
 * "Raw*" types mirror exactly what the backend sends over HTTP (including SQLite's
 * 0/1 integer booleans on rows read straight from storage). The plain types (without
 * the "Raw" prefix) are what the rest of the UI works with, normalized once in api/*.ts.
 */

export type CalendarEventType = 'competition' | 'tournament' | 'team_ko' | 'break' | 'other'

export type IssueSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  code: string
  message: string
  severity: IssueSeverity
  fixture_ids: string[]
  division_id: string | null
}

export interface ValidationResult {
  is_valid: boolean
  issues: ValidationIssue[]
}

export interface RawTeam {
  id: string
  division_id: string
  name: string
  position: number
  venue_id: string
}

export interface RawDivision {
  id: string
  season_id: string
  name: string
  position: number
  teams: RawTeam[]
}

export interface RawVenue {
  id: string
  season_id: string
  name: string
  board_capacity: number
}

export interface RawCalendarEvent {
  id: string
  season_id: string
  name: string
  start_date: string
  end_date: string | null
  event_type: CalendarEventType
  blocks_initial_generation: number
  appears_on_poster: number
}

export interface CalendarEvent {
  id: string
  season_id: string
  name: string
  start_date: string
  end_date: string | null
  event_type: CalendarEventType
  blocks_initial_generation: boolean
  appears_on_poster: boolean
}

export interface RawSeasonSummary {
  id: string
  league_name: string
  name: string
  first_fixture_date: string
  cadence_days: number
  generation_seed: number | null
  created_at: string
  updated_at: string
}

export interface RawSeasonDetail extends RawSeasonSummary {
  divisions: RawDivision[]
  venues: RawVenue[]
  calendar_events: RawCalendarEvent[]
}

export interface Team {
  id: string
  division_id: string
  name: string
  /** Display order within the division - freely reorderable, has no effect on `number`. */
  position: number
  /** The team's stable identity: what a fixture like "2v1" or the poster's compact grid
   * means by "2". Fixed at creation and never changed by reordering `position`. */
  number: number
  venue_id: string
}

export interface Division {
  id: string
  season_id: string
  name: string
  position: number
  teams: Team[]
}

export interface Venue {
  id: string
  season_id: string
  name: string
  board_capacity: number
}

export interface SeasonSummary {
  id: string
  league_name: string
  name: string
  first_fixture_date: string
  cadence_days: number
  generation_seed: number | null
  created_at: string
  updated_at: string
}

export interface SeasonDetail extends SeasonSummary {
  divisions: Division[]
  venues: Venue[]
  calendar_events: CalendarEvent[]
}

export type FixtureStatus = 'scheduled' | string

export interface RawFixture {
  id: string
  season_id: string
  division_id: string
  week_number: number
  scheduled_date: string
  home_team_id: string
  away_team_id: string
  playing_venue_id: string
  original_scheduled_date: string | null
  locked: number
  manual: number
  status: FixtureStatus
}

export interface Fixture {
  id: string
  season_id: string
  division_id: string
  week_number: number
  scheduled_date: string
  home_team_id: string
  away_team_id: string
  playing_venue_id: string
  original_scheduled_date: string | null
  locked: boolean
  manual: boolean
  status: FixtureStatus
}

export interface RescheduleEntry {
  id: string
  fixture_id: string
  from_date: string
  to_date: string
  reason: string | null
  actor: string | null
  changed_at: string
}

export interface FixtureDetail extends Fixture {
  history: RescheduleEntry[]
}

/** As returned by /generate and /regenerate: asdict() of the domain Fixture, real booleans. */
export interface GenerationFixture {
  id: string
  division_id: string
  home_team_id: string
  away_team_id: string
  week_number: number
  scheduled_date: string
  playing_venue_id: string
  original_scheduled_date: string | null
  locked: boolean
  manual: boolean
  rescheduling_history: {
    from_date: string
    to_date: string
    reason: string | null
    actor: string | null
    changed_at: string | null
  }[]
}

export interface GenerationStatistics {
  fixture_count: number
  weeks_used: number
  soft_score: number
  pairing_attempts: number
}

export interface GenerationResult {
  success: boolean
  seed: number
  fixtures: GenerationFixture[]
  validation: ValidationResult
  diagnostics: string[]
  statistics: GenerationStatistics | null
}

export interface DivisionInput {
  name: string
  position: number
}

export interface VenueInput {
  name: string
  board_capacity: number
}

export interface TeamInput {
  division_id: string
  name: string
  position: number
  venue_id: string
}

export interface EventInput {
  name: string
  start_date: string
  end_date?: string | null
  event_type: CalendarEventType
  blocks_initial_generation: boolean
  appears_on_poster?: boolean
}

export interface SeasonInput {
  league_name?: string
  name?: string
  first_fixture_date?: string
  cadence_days?: number
}

export interface FixtureMoveInput {
  new_date: string
  reason?: string | null
  actor?: string | null
}
