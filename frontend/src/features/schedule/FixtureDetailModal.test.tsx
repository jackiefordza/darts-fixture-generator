import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FixtureDetailModal } from './FixtureDetailModal'
import { ApiError } from '../../api/http'
import type { FixtureDetail } from '../../api/types'
import type { SeasonLookups } from '../../utils/lookups'

vi.mock('../../api/fixtures', () => ({
  getFixture: vi.fn(),
  moveFixture: vi.fn(),
}))

import { getFixture, moveFixture } from '../../api/fixtures'

const lookups: SeasonLookups = {
  divisionName: () => 'Premier Division',
  teamName: (id) => (id === 'team-a1' ? 'Aces' : 'Bullseyes'),
  venueName: () => 'The Anchor',
  teamCount: 2,
}

function baseFixture(overrides: Partial<FixtureDetail> = {}): FixtureDetail {
  return {
    id: 'fixture-1',
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
    history: [],
    ...overrides,
  }
}

describe('FixtureDetailModal move / postpone flow', () => {
  beforeEach(() => {
    vi.mocked(getFixture).mockReset()
    vi.mocked(moveFixture).mockReset()
  })

  it('opens the move/postpone form from the fixture detail view', async () => {
    vi.mocked(getFixture).mockResolvedValue(baseFixture())
    const user = userEvent.setup()

    render(<FixtureDetailModal fixtureId="fixture-1" lookups={lookups} onClose={vi.fn()} onChanged={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: 'Move / postpone fixture' }))

    expect(screen.getByLabelText('New date')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move fixture' })).toBeInTheDocument()
  })

  it('submits the expected move request and reflects the locked/manual state afterwards', async () => {
    vi.mocked(getFixture)
      .mockResolvedValueOnce(baseFixture())
      .mockResolvedValueOnce(baseFixture({ scheduled_date: '2026-10-15', locked: true, manual: true }))
    vi.mocked(moveFixture).mockResolvedValue(
      baseFixture({ scheduled_date: '2026-10-15', locked: true, manual: true }),
    )
    const onChanged = vi.fn()
    const user = userEvent.setup()

    render(<FixtureDetailModal fixtureId="fixture-1" lookups={lookups} onClose={vi.fn()} onChanged={onChanged} />)

    await user.click(await screen.findByRole('button', { name: 'Move / postpone fixture' }))
    fireEvent.change(screen.getByLabelText('New date'), { target: { value: '2026-10-15' } })
    await user.type(screen.getByLabelText('Reason (optional)'), 'Testing move')
    await user.click(screen.getByRole('button', { name: 'Move fixture' }))

    expect(moveFixture).toHaveBeenCalledWith('fixture-1', { new_date: '2026-10-15', reason: 'Testing move' })
    await waitFor(() => expect(screen.getByText('Manual')).toBeInTheDocument())
    expect(screen.getByText('Locked')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(getFixture).toHaveBeenCalledTimes(2)
  })

  it('shows the original date and rescheduling history when the backend returns them', async () => {
    vi.mocked(getFixture).mockResolvedValue(
      baseFixture({
        scheduled_date: '2026-10-15',
        original_scheduled_date: '2026-09-16',
        locked: true,
        manual: true,
        history: [
          {
            id: 'h1',
            fixture_id: 'fixture-1',
            from_date: '2026-09-16',
            to_date: '2026-10-15',
            reason: 'Testing move',
            actor: null,
            changed_at: '2026-09-15T10:57:00Z',
          },
        ],
      }),
    )

    render(<FixtureDetailModal fixtureId="fixture-1" lookups={lookups} onClose={vi.fn()} onChanged={vi.fn()} />)

    expect(await screen.findByText('Original date')).toBeInTheDocument()
    expect(screen.getByText('Testing move', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Manual')).toBeInTheDocument()
    expect(screen.getByText('Locked')).toBeInTheDocument()
  })
})

describe('FixtureDetailModal move conflict flow', () => {
  beforeEach(() => {
    vi.mocked(getFixture).mockReset()
    vi.mocked(moveFixture).mockReset()
  })

  it('surfaces a backend conflict with its issues and suggested dates, without treating the move as successful', async () => {
    vi.mocked(getFixture).mockResolvedValue(baseFixture())
    vi.mocked(moveFixture).mockRejectedValue(
      new ApiError(
        409,
        'Requested fixture move conflicts with the existing schedule',
        [
          {
            code: 'VENUE_CAPACITY',
            message: 'The Anchor has no free board on this date',
            severity: 'error',
            fixture_ids: ['fixture-1'],
            division_id: 'div-a',
          },
        ],
        ['2026-10-16', '2026-10-19'],
      ),
    )
    const onChanged = vi.fn()
    const user = userEvent.setup()

    render(<FixtureDetailModal fixtureId="fixture-1" lookups={lookups} onClose={vi.fn()} onChanged={onChanged} />)

    await user.click(await screen.findByRole('button', { name: 'Move / postpone fixture' }))
    fireEvent.change(screen.getByLabelText('New date'), { target: { value: '2026-10-15' } })
    await user.click(screen.getByRole('button', { name: 'Move fixture' }))

    expect(
      await screen.findByText('Requested fixture move conflicts with the existing schedule'),
    ).toBeInTheDocument()
    expect(screen.getByText('The Anchor has no free board on this date')).toBeInTheDocument()
    // The Modal portals to document.body, so search the whole document rather than a render container.
    expect(document.querySelectorAll('.suggested-dates-list button')).toHaveLength(2)

    // The failed move must never be treated as a success.
    expect(screen.queryByText('Manual')).not.toBeInTheDocument()
    expect(screen.getByText('Generated')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    expect(getFixture).toHaveBeenCalledTimes(1)
  })
})
