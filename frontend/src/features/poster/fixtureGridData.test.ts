import { describe, expect, it } from 'vitest'
import { buildFixtureGrid } from './fixtureGridData'
import type { Fixture, SeasonDetail } from '../../api/types'

const season: SeasonDetail = {
  id: 'season-1',
  league_name: 'Test League',
  name: '2026/27',
  first_fixture_date: '2026-09-16',
  cadence_days: 7,
  generation_seed: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  divisions: [
    {
      id: 'div-a',
      season_id: 'season-1',
      name: 'Premier Division',
      position: 1,
      teams: [
        { id: 't1', division_id: 'div-a', name: 'Aces', position: 1, venue_id: 'v1' },
        { id: 't2', division_id: 'div-a', name: 'Bullseyes', position: 2, venue_id: 'v1' },
        { id: 't3', division_id: 'div-a', name: 'Checkout Kings', position: 3, venue_id: 'v1' },
      ],
    },
  ],
  venues: [{ id: 'v1', season_id: 'season-1', name: 'The Anchor', board_capacity: 4 }],
  calendar_events: [],
}

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    id: 'f',
    season_id: 'season-1',
    division_id: 'div-a',
    week_number: 1,
    scheduled_date: '2026-09-16',
    home_team_id: 't1',
    away_team_id: 't2',
    playing_venue_id: 'v1',
    original_scheduled_date: '2026-09-16',
    locked: false,
    manual: false,
    status: 'scheduled',
    ...overrides,
  }
}

describe('buildFixtureGrid', () => {
  it('derives weeks from the actual schedule rather than assuming a fixed count', () => {
    const fixtures = [
      fixture({ id: 'f1', week_number: 1 }),
      fixture({ id: 'f2', week_number: 3, scheduled_date: '2026-09-30' }),
    ]
    const grid = buildFixtureGrid(season, fixtures)
    expect(grid.weeks.map((week) => week.week)).toEqual([1, 3])
  })

  it('maps home/away teams to their 1-based division position, not the raw fixture data', () => {
    const fixtures = [fixture({ id: 'f1', home_team_id: 't3', away_team_id: 't1' })]
    const grid = buildFixtureGrid(season, fixtures)
    const cell = grid.rows[0].cells[0][0]
    expect(cell).toEqual({ id: 'f1', homeNumber: 3, awayNumber: 1 })
  })

  it('groups every fixture for a division/week into that cell, in schedule order', () => {
    const fixtures = [
      fixture({ id: 'f1', home_team_id: 't1', away_team_id: 't2' }),
      fixture({ id: 'f2', home_team_id: 't3', away_team_id: 't1' }),
    ]
    const grid = buildFixtureGrid(season, fixtures)
    expect(grid.rows[0].cells[0]).toHaveLength(2)
    expect(grid.rows[0].cells[0].map((c) => c.id)).toEqual(['f1', 'f2'])
  })

  it('picks the most common date for a week as its representative date', () => {
    const fixtures = [
      fixture({ id: 'f1', scheduled_date: '2026-09-16' }),
      fixture({ id: 'f2', scheduled_date: '2026-09-16' }),
      fixture({ id: 'f3', scheduled_date: '2026-09-17' }),
    ]
    const grid = buildFixtureGrid(season, fixtures)
    expect(grid.weeks[0].date).toBe('2026-09-16')
  })

  it('returns no weeks when there are no fixtures', () => {
    const grid = buildFixtureGrid(season, [])
    expect(grid.weeks).toEqual([])
    expect(grid.rows[0].cells).toEqual([])
  })
})
