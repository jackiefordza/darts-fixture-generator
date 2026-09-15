import { describe, expect, it } from 'vitest'
import { mergeCompetitions } from './competitionsMerge'
import type { CalendarEvent } from '../../api/types'
import type { CompetitionEntry } from './posterTypes'

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'event-1',
    season_id: 'season-1',
    name: 'Christmas Break',
    start_date: '2026-12-23',
    end_date: null,
    event_type: 'break',
    blocks_initial_generation: true,
    appears_on_poster: true,
    ...overrides,
  }
}

describe('mergeCompetitions', () => {
  it('only includes calendar events flagged appears_on_poster', () => {
    const events = [event({ id: 'e1', appears_on_poster: true }), event({ id: 'e2', appears_on_poster: false })]
    const merged = mergeCompetitions(events, [])
    expect(merged.map((item) => item.calendarEventId)).toEqual(['e1'])
  })

  it('takes a calendar entry title live from the season, not from any stored overlay', () => {
    const events = [event({ id: 'e1', name: 'County Cup' })]
    const overlay: CompetitionEntry = { id: 'overlay-1', source: 'calendar', calendarEventId: 'e1', visible: true, order: 0 }
    const merged = mergeCompetitions(events, [overlay])
    expect(merged[0].title).toBe('County Cup')
  })

  it('includes poster-only entries with their own title and detail', () => {
    const entry: CompetitionEntry = { id: 'p1', source: 'poster', title: 'Turkey Trot', detail: 'Boxing Day', visible: true, order: 0 }
    const merged = mergeCompetitions([], [entry])
    expect(merged).toEqual([{ id: 'p1', source: 'poster', title: 'Turkey Trot', detail: 'Boxing Day', visible: true, order: 0 }])
  })

  it('orders calendar and poster-only entries together by their order field', () => {
    const events = [event({ id: 'e1' })]
    const overlay: CompetitionEntry = { id: 'overlay-1', source: 'calendar', calendarEventId: 'e1', visible: true, order: 1 }
    const posterEntry: CompetitionEntry = { id: 'p1', source: 'poster', title: 'Cup Final', visible: true, order: 0 }
    const merged = mergeCompetitions(events, [overlay, posterEntry])
    expect(merged.map((item) => item.id)).toEqual(['p1', 'overlay-1'])
  })

  it('respects a visibility overlay on a calendar-sourced entry', () => {
    const events = [event({ id: 'e1' })]
    const overlay: CompetitionEntry = { id: 'overlay-1', source: 'calendar', calendarEventId: 'e1', visible: false, order: 0 }
    const merged = mergeCompetitions(events, [overlay])
    expect(merged[0].visible).toBe(false)
  })
})
