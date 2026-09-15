import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SchedulePage } from './SchedulePage'
import { SeasonContext } from '../../context/SeasonContext'
import type { Fixture, SeasonDetail } from '../../api/types'

vi.mock('../../api/fixtures', () => ({
  getSchedule: vi.fn(),
  getFixture: vi.fn(),
  generateSchedule: vi.fn(),
  regenerateSchedule: vi.fn(),
  validateSeason: vi.fn(),
  moveFixture: vi.fn(),
  downloadSeasonCsv: vi.fn(),
  downloadDivisionCsv: vi.fn(),
}))

import { getSchedule } from '../../api/fixtures'

const season: SeasonDetail = {
  id: 'season-1',
  league_name: 'Test League',
  name: '2026/27',
  first_fixture_date: '2026-09-16',
  cadence_days: 7,
  generation_seed: 42,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  divisions: [
    {
      id: 'div-a',
      season_id: 'season-1',
      name: 'Premier Division',
      position: 1,
      teams: [
        { id: 'team-a1', division_id: 'div-a', name: 'Aces', position: 1, venue_id: 'venue-1' },
        { id: 'team-a2', division_id: 'div-a', name: 'Bullseyes', position: 2, venue_id: 'venue-1' },
      ],
    },
    {
      id: 'div-b',
      season_id: 'season-1',
      name: 'Division One',
      position: 2,
      teams: [
        { id: 'team-b1', division_id: 'div-b', name: 'Wildcats', position: 1, venue_id: 'venue-1' },
        { id: 'team-b2', division_id: 'div-b', name: 'Sharpshooters', position: 2, venue_id: 'venue-1' },
      ],
    },
  ],
  venues: [{ id: 'venue-1', season_id: 'season-1', name: 'The Anchor', board_capacity: 4 }],
  calendar_events: [],
}

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    id: 'f',
    season_id: 'season-1',
    division_id: 'div-a',
    week_number: 1,
    scheduled_date: '2026-09-16',
    home_team_id: 'team-a1',
    away_team_id: 'team-a2',
    playing_venue_id: 'venue-1',
    original_scheduled_date: '2026-09-16',
    locked: false,
    manual: false,
    status: 'scheduled',
    ...overrides,
  }
}

const fixtures: Fixture[] = [
  fixture({ id: 'f1', division_id: 'div-a', week_number: 1, home_team_id: 'team-a1', away_team_id: 'team-a2' }),
  fixture({ id: 'f2', division_id: 'div-b', week_number: 1, home_team_id: 'team-b1', away_team_id: 'team-b2' }),
  fixture({
    id: 'f3',
    division_id: 'div-a',
    week_number: 2,
    scheduled_date: '2026-09-23',
    home_team_id: 'team-a2',
    away_team_id: 'team-a1',
  }),
  fixture({
    id: 'f4',
    division_id: 'div-b',
    week_number: 2,
    scheduled_date: '2026-09-23',
    home_team_id: 'team-b2',
    away_team_id: 'team-b1',
  }),
]

function renderPage() {
  return render(
    <SeasonContext.Provider value={{ season, refetch: vi.fn() }}>
      <SchedulePage />
    </SeasonContext.Provider>,
  )
}

describe('SchedulePage filters', () => {
  beforeEach(() => {
    vi.mocked(getSchedule).mockReset()
    vi.mocked(getSchedule).mockResolvedValue(fixtures)
  })

  it('shows the complete schedule with no filters applied', async () => {
    renderPage()

    expect(await screen.findAllByRole('heading', { level: 4, name: 'Premier Division' })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { level: 4, name: 'Division One' })).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 3, name: 'Week 1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Week 2' })).toBeInTheDocument()
  })

  it('filters by division', async () => {
    renderPage()
    await screen.findAllByRole('heading', { level: 4, name: 'Premier Division' })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Division'), 'div-a')

    expect(screen.getAllByRole('heading', { level: 4, name: 'Premier Division' })).toHaveLength(2)
    expect(screen.queryAllByRole('heading', { level: 4, name: 'Division One' })).toHaveLength(0)
    expect(screen.queryByText('Wildcats')).not.toBeInTheDocument()
    // Aces plays home in week 1 and away in week 2, so it appears in both remaining rows.
    expect(screen.getAllByText('Aces')).toHaveLength(2)
  })

  it('filters by week', async () => {
    renderPage()
    await screen.findAllByRole('heading', { level: 4, name: 'Premier Division' })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Week'), '1')

    expect(screen.getByRole('heading', { level: 3, name: 'Week 1' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Week 2' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 4, name: 'Premier Division' })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 4, name: 'Division One' })).toHaveLength(1)
  })

  it('combines division and week filters', async () => {
    renderPage()
    await screen.findAllByRole('heading', { level: 4, name: 'Premier Division' })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Division'), 'div-a')
    await user.selectOptions(screen.getByLabelText('Week'), '2')

    expect(screen.getByRole('heading', { level: 3, name: 'Week 2' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Week 1' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 4, name: 'Premier Division' })).toHaveLength(1)
    expect(screen.queryAllByRole('heading', { level: 4, name: 'Division One' })).toHaveLength(0)
  })

  it('clears filters and restores the full schedule', async () => {
    renderPage()
    await screen.findAllByRole('heading', { level: 4, name: 'Premier Division' })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Division'), 'div-a')
    expect(screen.queryAllByRole('heading', { level: 4, name: 'Division One' })).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(screen.getAllByRole('heading', { level: 4, name: 'Division One' })).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 3, name: 'Week 1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Week 2' })).toBeInTheDocument()
  })
})
