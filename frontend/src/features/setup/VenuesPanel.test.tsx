import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VenuesPanel } from './VenuesPanel'
import { SeasonContext } from '../../context/SeasonContext'
import type { SeasonDetail } from '../../api/types'

vi.mock('../../api/seasons', () => ({
  addVenue: vi.fn(),
  updateVenue: vi.fn(),
  deleteVenue: vi.fn(),
}))

import { deleteVenue } from '../../api/seasons'

const season: SeasonDetail = {
  id: 'season-1',
  league_name: 'Test League',
  name: '2026/27',
  first_fixture_date: '2026-09-16',
  cadence_days: 7,
  generation_seed: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  divisions: [],
  venues: [{ id: 'venue-1', season_id: 'season-1', name: 'The Anchor', board_capacity: 2 }],
  calendar_events: [],
}

function renderPanel(refetch = vi.fn()) {
  return render(
    <SeasonContext.Provider value={{ season, refetch }}>
      <VenuesPanel />
    </SeasonContext.Provider>,
  )
}

describe('VenuesPanel destructive actions', () => {
  beforeEach(() => {
    vi.mocked(deleteVenue).mockReset()
  })

  it('asks for confirmation before removing a venue and does nothing on cancel', async () => {
    const refetch = vi.fn()
    const user = userEvent.setup()
    renderPanel(refetch)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove venue' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteVenue).not.toHaveBeenCalled()
    expect(refetch).not.toHaveBeenCalled()
  })

  it('deletes the venue and refreshes only after the user confirms', async () => {
    vi.mocked(deleteVenue).mockResolvedValue(undefined)
    const refetch = vi.fn()
    const user = userEvent.setup()
    renderPanel(refetch)

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove venue' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(deleteVenue).toHaveBeenCalledWith('venue-1'))
    expect(refetch).toHaveBeenCalled()
  })
})
