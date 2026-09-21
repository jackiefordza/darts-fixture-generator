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
        { id: 't1', division_id: 'div-a', name: 'Aces', position: 1, number: 1, venue_id: 'v1' },
        { id: 't2', division_id: 'div-a', name: 'Bullseyes', position: 2, number: 2, venue_id: 'v1' },
        { id: 't3', division_id: 'div-a', name: 'Checkout Kings', position: 3, number: 3, venue_id: 'v1' },
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

  it('maps home/away teams to their stable team number, not the raw fixture data', () => {
    const fixtures = [fixture({ id: 'f1', home_team_id: 't3', away_team_id: 't1' })]
    const grid = buildFixtureGrid(season, fixtures)
    const cell = grid.rows[0].cells[0][0]
    expect(cell).toEqual({ type: 'fixture', id: 'f1', homeNumber: 3, awayNumber: 1 })
  })

  it('keeps a fixture\'s number meaning stable when the displayed team list is reordered', () => {
    // Same teams, same numbers, but re-sorted (as a division might be for display) so
    // array order no longer matches `number` - t3 is now first, t1 is now last.
    const reordered: SeasonDetail = {
      ...season,
      divisions: [
        {
          ...season.divisions[0],
          teams: [
            { id: 't3', division_id: 'div-a', name: 'Checkout Kings', position: 1, number: 3, venue_id: 'v1' },
            { id: 't2', division_id: 'div-a', name: 'Bullseyes', position: 2, number: 2, venue_id: 'v1' },
            { id: 't1', division_id: 'div-a', name: 'Aces', position: 3, number: 1, venue_id: 'v1' },
          ],
        },
      ],
    }
    const fixtures = [fixture({ id: 'f1', home_team_id: 't3', away_team_id: 't1' })]
    const grid = buildFixtureGrid(reordered, fixtures)
    const cell = grid.rows[0].cells[0][0]
    // Unchanged from the un-reordered case above: "3v1" still means the same two teams.
    expect(cell).toEqual({ type: 'fixture', id: 'f1', homeNumber: 3, awayNumber: 1 })
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

  it("adds an explicit Bye cell for the team an odd-sized division's own fixtures show sat out", () => {
    // `season` has 3 teams (odd); only t3 v t1 play in week 1, so t2 has a Bye.
    const fixtures = [fixture({ id: 'f1', home_team_id: 't3', away_team_id: 't1' })]
    const grid = buildFixtureGrid(season, fixtures)
    const cell = grid.rows[0].cells[0]
    expect(cell).toHaveLength(2)
    expect(cell[0]).toEqual({ type: 'fixture', id: 'f1', homeNumber: 3, awayNumber: 1 })
    expect(cell[1]).toEqual({ type: 'bye', id: 'bye-div-a-1-t2', teamNumber: 2 })
  })

  it('never adds a Bye cell for an even-sized division (e.g. the real season\'s 8-team divisions)', () => {
    const evenSeason: SeasonDetail = {
      ...season,
      divisions: [
        {
          ...season.divisions[0],
          teams: [
            { id: 'e1', division_id: 'div-a', name: 'One', position: 1, number: 1, venue_id: 'v1' },
            { id: 'e2', division_id: 'div-a', name: 'Two', position: 2, number: 2, venue_id: 'v1' },
            { id: 'e3', division_id: 'div-a', name: 'Three', position: 3, number: 3, venue_id: 'v1' },
            { id: 'e4', division_id: 'div-a', name: 'Four', position: 4, number: 4, venue_id: 'v1' },
          ],
        },
      ],
    }
    // Only one of the two week-1 matches is present - an incomplete week, not a real Bye
    // scenario for an even division, and the guard must not treat it as one regardless.
    const fixtures = [fixture({ id: 'f1', home_team_id: 'e1', away_team_id: 'e2' })]
    const grid = buildFixtureGrid(evenSeason, fixtures)
    const cell = grid.rows[0].cells[0]
    expect(cell).toEqual([{ type: 'fixture', id: 'f1', homeNumber: 1, awayNumber: 2 }])
    expect(cell.some((entry) => entry.type === 'bye')).toBe(false)
  })

  it('returns no weeks when there are no fixtures', () => {
    const grid = buildFixtureGrid(season, [])
    expect(grid.weeks).toEqual([])
    expect(grid.rows[0].cells).toEqual([])
  })
})
