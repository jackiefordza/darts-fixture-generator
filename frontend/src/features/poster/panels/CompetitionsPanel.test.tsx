import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CompetitionsPanel } from './CompetitionsPanel'
import { DEFAULT_GLOBAL_STYLE } from '../defaultLayout'
import type { CompetitionsElement } from '../posterTypes'
import type { SeasonDetail } from '../../../api/types'

const season: SeasonDetail = {
  id: 'season-1',
  league_name: 'Test League',
  name: '2026/27',
  first_fixture_date: '2026-09-16',
  cadence_days: 7,
  generation_seed: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  divisions: [],
  venues: [],
  calendar_events: [
    {
      id: 'event-1',
      season_id: 'season-1',
      name: 'County Cup',
      start_date: '2026-11-01',
      end_date: null,
      event_type: 'competition',
      blocks_initial_generation: true,
      appears_on_poster: true,
    },
  ],
}

function makeElement(overrides: Partial<CompetitionsElement> = {}): CompetitionsElement {
  return {
    id: 'competitions-1',
    type: 'competitions',
    name: 'Competitions',
    rect: { x: 0, y: 0, width: 100, height: 50 },
    visible: true,
    removable: false,
    entries: [],
    style: {},
    ...overrides,
  }
}

describe('CompetitionsPanel', () => {
  it('shows calendar events flagged appears_on_poster as read-only, non-deletable entries', () => {
    render(
      <CompetitionsPanel
        element={makeElement()}
        season={season}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        onChange={vi.fn()}
        onStyleChange={vi.fn()}
        onReset={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    )

    expect(screen.getByText('County Cup')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete competition/ })).not.toBeInTheDocument()
  })

  it('adds a poster-only entry', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <CompetitionsPanel
        element={makeElement()}
        season={{ ...season, calendar_events: [] }}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        onChange={onChange}
        onStyleChange={vi.fn()}
        onReset={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('New competition title'), 'Turkey Trot')
    await user.type(screen.getByLabelText('New competition detail'), 'Boxing Day')
    await user.click(screen.getByRole('button', { name: 'Add competition' }))

    expect(onChange).toHaveBeenCalledWith({
      entries: [expect.objectContaining({ source: 'poster', title: 'Turkey Trot', detail: 'Boxing Day', order: 0 })],
    })
  })

  it('deletes a poster-only entry', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <CompetitionsPanel
        element={makeElement({
          entries: [{ id: 'p1', source: 'poster', title: 'Turkey Trot', visible: true, order: 0 }],
        })}
        season={{ ...season, calendar_events: [] }}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        onChange={onChange}
        onStyleChange={vi.fn()}
        onReset={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete competition 1' }))
    expect(onChange).toHaveBeenCalledWith({ entries: [] })
  })

  it('toggles a calendar-sourced entry visible/hidden by materialising an overlay', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <CompetitionsPanel
        element={makeElement()}
        season={season}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        onChange={onChange}
        onStyleChange={vi.fn()}
        onReset={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Visible' }))

    expect(onChange).toHaveBeenCalledWith({
      entries: [expect.objectContaining({ source: 'calendar', calendarEventId: 'event-1', visible: false })],
    })
  })
})
