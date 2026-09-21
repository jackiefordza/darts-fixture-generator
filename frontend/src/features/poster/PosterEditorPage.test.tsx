import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PosterEditorPage } from './PosterEditorPage'
import { SeasonContext } from '../../context/SeasonContext'
import type { Fixture, SeasonDetail } from '../../api/types'

vi.mock('../../api/fixtures', () => ({
  getSchedule: vi.fn(),
  validateSeason: vi.fn(),
}))

import { getSchedule, validateSeason } from '../../api/fixtures'

const season: SeasonDetail = {
  id: 'season-1',
  league_name: 'Test Darts League',
  name: '2026/27 Season',
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
      ],
    },
  ],
  venues: [{ id: 'v1', season_id: 'season-1', name: 'The Anchor', board_capacity: 4 }],
  calendar_events: [],
}

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    id: 'f1',
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

function renderPage() {
  return render(
    <MemoryRouter>
      <SeasonContext.Provider value={{ season, refetch: vi.fn() }}>
        <PosterEditorPage />
      </SeasonContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(getSchedule).mockReset()
  vi.mocked(validateSeason).mockReset()
})

describe('PosterEditorPage', () => {
  it('shows a clear empty state when no schedule has been generated, and never fabricates fixtures', async () => {
    vi.mocked(getSchedule).mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('No generated schedule yet')).toBeInTheDocument()
    expect(screen.queryByTestId('poster-page')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export PNG' })).not.toBeInTheDocument()
  })

  it('shows the validation issues instead of the poster when the schedule is invalid', async () => {
    vi.mocked(getSchedule).mockResolvedValue([fixture({})])
    vi.mocked(validateSeason).mockResolvedValue({
      is_valid: false,
      issues: [{ code: 'CAPACITY', message: 'Venue over capacity on 2026-09-16', severity: 'error', fixture_ids: [], division_id: null }],
    })
    renderPage()

    expect(await screen.findByText('Schedule is not currently valid')).toBeInTheDocument()
    expect(screen.getByText('Venue over capacity on 2026-09-16')).toBeInTheDocument()
    expect(screen.queryByTestId('poster-page')).not.toBeInTheDocument()
    // TEST 8: an invalid schedule must never reach an export-capable poster view.
    expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export PNG' })).not.toBeInTheDocument()
  })

  it('loads real season data: divisions, team numbers/names, and a fixture grid derived from the schedule', async () => {
    vi.mocked(getSchedule).mockResolvedValue([fixture({})])
    vi.mocked(validateSeason).mockResolvedValue({ is_valid: true, issues: [] })
    renderPage()

    const page = await screen.findByTestId('poster-page')
    // "Premier Division" appears both as the division heading and as the grid's row header,
    // so scope to the heading specifically rather than asserting a single match.
    expect(page.querySelector('.poster-division-name')?.textContent).toBe('Premier Division')
    expect(within(page).getByText('Aces')).toBeInTheDocument()
    expect(within(page).getByText('Bullseyes')).toBeInTheDocument()
    // Aces is team #1 and Bullseyes is team #2 in the division, so the fixture reads "1v2".
    expect(within(page).getByText('1v2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeInTheDocument()
  })

  it('fixture grid cells contain no editable controls', async () => {
    vi.mocked(getSchedule).mockResolvedValue([fixture({})])
    vi.mocked(validateSeason).mockResolvedValue({ is_valid: true, issues: [] })
    renderPage()

    const page = await screen.findByTestId('poster-page')
    const grid = page.querySelector('.poster-fixture-grid')!
    expect(grid.querySelectorAll('input, textarea, button, [contenteditable="true"]')).toHaveLength(0)
  })

  it('preview mode hides editor-only controls (toolbar actions and the properties sidebar)', async () => {
    vi.mocked(getSchedule).mockResolvedValue([fixture({})])
    vi.mocked(validateSeason).mockResolvedValue({ is_valid: true, issues: [] })
    const user = userEvent.setup()
    renderPage()

    await screen.findByTestId('poster-page')
    expect(document.querySelector('.poster-properties-sidebar')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(document.querySelector('.poster-properties-sidebar')).toBeNull()
    expect(screen.getByRole('button', { name: 'Exit preview' })).toBeInTheDocument()
  })

  it('asks for confirmation before resetting the entire poster, and only resets on confirm', async () => {
    vi.mocked(getSchedule).mockResolvedValue([fixture({})])
    vi.mocked(validateSeason).mockResolvedValue({ is_valid: true, issues: [] })
    const user = userEvent.setup()
    renderPage()

    await screen.findByTestId('poster-page')

    await user.click(screen.getByRole('button', { name: 'Reset entire poster' }))
    // Still showing the original poster - a confirmation dialog, not an immediate reset.
    expect(screen.getByRole('heading', { name: 'Reset entire poster' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { name: 'Reset entire poster' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset entire poster' }))
    const confirmButtons = screen.getAllByRole('button', { name: 'Reset entire poster' })
    await user.click(confirmButtons[confirmButtons.length - 1])
    expect(screen.queryByRole('heading', { name: 'Reset entire poster' })).not.toBeInTheDocument()
  })
})
