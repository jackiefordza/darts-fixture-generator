import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamViewPage } from './TeamViewPage'
import { SeasonContext } from '../../context/SeasonContext'
import type { Fixture, FixtureDetail, SeasonDetail } from '../../api/types'

vi.mock('../../api/fixtures', () => ({
  getSchedule: vi.fn(),
  getFixture: vi.fn(),
  moveFixture: vi.fn(),
}))

import { getFixture, getSchedule } from '../../api/fixtures'

// An odd-sized division (3 teams) so a real Bye naturally occurs, alongside a normal
// even division - matching how the app models Byes generally, not a special case.
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
      id: 'div-odd',
      season_id: 'season-1',
      name: 'Odd Division',
      position: 1,
      teams: [
        { id: 't1', division_id: 'div-odd', name: 'Aces', position: 1, number: 1, venue_id: 'v1' },
        { id: 't2', division_id: 'div-odd', name: 'Bullseyes', position: 2, number: 2, venue_id: 'v1' },
        { id: 't3', division_id: 'div-odd', name: 'Checkout Kings', position: 3, number: 3, venue_id: 'v1' },
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
    division_id: 'div-odd',
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

// Week 1: t1 v t2 (t3 has a bye). Week 2: t2 v t3, postponed to a later date (t1 has a bye).
const fixtures: Fixture[] = [
  fixture({ id: 'f1', week_number: 1, home_team_id: 't1', away_team_id: 't2', scheduled_date: '2026-09-16' }),
  fixture({
    id: 'f2',
    week_number: 2,
    home_team_id: 't2',
    away_team_id: 't3',
    scheduled_date: '2026-10-01',
    original_scheduled_date: '2026-09-23',
    manual: true,
    locked: true,
  }),
]

function renderPage() {
  return render(
    <SeasonContext.Provider value={{ season, refetch: vi.fn() }}>
      <TeamViewPage />
    </SeasonContext.Provider>,
  )
}

describe('TeamViewPage', () => {
  beforeEach(() => {
    vi.mocked(getSchedule).mockReset()
    vi.mocked(getSchedule).mockResolvedValue(fixtures)
    vi.mocked(getFixture).mockReset()
  })

  it("shows the first team's fixtures by default: week, date, opponent, and home/away", async () => {
    renderPage()

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Bullseyes')).toBeInTheDocument()
    expect(within(table).getByText('Home')).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Week' })).toBeInTheDocument()
  })

  it('shows an explicit Bye row for the week the selected team sat out', async () => {
    renderPage()
    const table = await screen.findByRole('table')

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Select team'), 't3')

    // t3 played nobody in week 1 (t1 v t2 that week) - an explicit Bye, not a blank gap.
    expect(await within(table).findByText('Bye')).toBeInTheDocument()
    // ...and does appear, as an opponent, in week 2.
    expect(within(table).getByText('Bullseyes')).toBeInTheDocument()
  })

  it('clearly labels a postponed fixture with its original date', async () => {
    renderPage()
    const table = await screen.findByRole('table')

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Select team'), 't2')

    expect(await within(table).findByText(/Postponed - was/)).toBeInTheDocument()
  })

  it('switching the selected team changes the displayed fixtures', async () => {
    renderPage()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Bullseyes')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Select team'), 't3')

    // t3's only real fixture is week 2 v t2 (Bullseyes) - t1 (Aces), its week-1 opponent
    // as team 1, must no longer appear now that t3's own (different) schedule is shown.
    expect(await within(table).findByText('Bye')).toBeInTheDocument()
    expect(within(table).queryByText('Aces')).not.toBeInTheDocument()
    expect(within(table).getByText('Bullseyes')).toBeInTheDocument()
  })

  it('opens the fixture detail view when a fixture row is clicked', async () => {
    vi.mocked(getFixture).mockResolvedValue({
      ...fixtures[0],
      history: [],
    } as FixtureDetail)
    renderPage()
    const table = await screen.findByRole('table')

    const user = userEvent.setup()
    await user.click(within(table).getByText('Bullseyes'))

    expect(await screen.findByText('Fixture detail')).toBeInTheDocument()
  })

  it('reuses the same schedule data as the Schedule page - one getSchedule call, no separate dataset', async () => {
    renderPage()
    await screen.findByRole('table')

    expect(getSchedule).toHaveBeenCalledTimes(1)
    expect(getSchedule).toHaveBeenCalledWith('season-1')
  })
})
