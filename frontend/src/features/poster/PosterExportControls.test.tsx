import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PosterExportControls } from './PosterExportControls'
import { buildDefaultLayout } from './defaultLayout'
import type { SeasonDetail } from '../../api/types'

vi.mock('./posterExport', () => ({
  exportPosterPdf: vi.fn(),
  exportPosterPng: vi.fn(),
}))

import { exportPosterPdf, exportPosterPng } from './posterExport'

const season: SeasonDetail = {
  id: 'season-1',
  league_name: 'Test League',
  name: '2026/27',
  first_fixture_date: '2026-10-14',
  cadence_days: 7,
  generation_seed: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  divisions: [],
  venues: [],
  calendar_events: [],
}

const layout = buildDefaultLayout(season)

beforeEach(() => {
  vi.mocked(exportPosterPdf).mockReset()
  vi.mocked(exportPosterPng).mockReset()
})

describe('PosterExportControls', () => {
  it('exports a PDF using the current layout, season, and fixtures when clicked', async () => {
    vi.mocked(exportPosterPdf).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<PosterExportControls layout={layout} season={season} fixtures={[]} />)

    await user.click(screen.getByRole('button', { name: 'Export PDF' }))

    expect(exportPosterPdf).toHaveBeenCalledTimes(1)
    const [calledLayout, calledSeason, calledFixtures, filename] = vi.mocked(exportPosterPdf).mock.calls[0]
    expect(calledLayout).toBe(layout)
    expect(calledSeason).toBe(season)
    expect(calledFixtures).toEqual([])
    expect(filename).toMatch(/\.pdf$/)
  })

  it('exports a PNG using the current layout, season, and fixtures when clicked', async () => {
    vi.mocked(exportPosterPng).mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<PosterExportControls layout={layout} season={season} fixtures={[]} />)

    await user.click(screen.getByRole('button', { name: 'Export PNG' }))

    expect(exportPosterPng).toHaveBeenCalledTimes(1)
    const [, , , filename] = vi.mocked(exportPosterPng).mock.calls[0]
    expect(filename).toMatch(/\.png$/)
  })

  it('shows a clear error and stays usable when export fails', async () => {
    vi.mocked(exportPosterPdf).mockRejectedValue(new Error('Could not render the poster image'))
    const user = userEvent.setup()
    render(<PosterExportControls layout={layout} season={season} fixtures={[]} />)

    await user.click(screen.getByRole('button', { name: 'Export PDF' }))

    expect(await screen.findByText('Could not render the poster image')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export PDF' })).not.toBeDisabled()
  })

  it('disables the other export button while one export is in progress', async () => {
    let resolveExport: () => void = () => {}
    vi.mocked(exportPosterPdf).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveExport = resolve
      }),
    )
    const user = userEvent.setup()
    render(<PosterExportControls layout={layout} season={season} fixtures={[]} />)

    await user.click(screen.getByRole('button', { name: 'Export PDF' }))
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeDisabled()

    resolveExport()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export PNG' })).not.toBeDisabled())
  })
})
