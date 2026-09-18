import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PosterExportView } from './PosterExportView'
import { PosterCanvas } from './PosterCanvas'
import { usePosterEditor } from './usePosterEditor'
import { buildDefaultLayout } from './defaultLayout'
import { mmToPx } from './geometry'
import type { Fixture, SeasonDetail } from '../../api/types'
import type { PosterLayout } from './posterTypes'

const season: SeasonDetail = {
  id: 'season-1',
  league_name: 'Phase 8 Test League',
  name: '2026/27 Export Test Season',
  first_fixture_date: '2026-10-14',
  cadence_days: 7,
  generation_seed: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  divisions: [1, 2, 3, 4].map((n) => ({
    id: `div-${n}`,
    season_id: 'season-1',
    name: `Division ${n}`,
    position: n,
    teams: [
      { id: `d${n}t1`, division_id: `div-${n}`, name: `Division ${n} Team 1`, position: 1, number: 1, venue_id: 'v1' },
      { id: `d${n}t2`, division_id: `div-${n}`, name: `Division ${n} Team 2`, position: 2, number: 2, venue_id: 'v1' },
    ],
  })),
  venues: [{ id: 'v1', season_id: 'season-1', name: 'The Anchor', board_capacity: 4 }],
  calendar_events: [
    {
      id: 'evt-1',
      season_id: 'season-1',
      name: 'County Cup Final',
      start_date: '2026-11-04',
      end_date: null,
      event_type: 'competition',
      blocks_initial_generation: true,
      appears_on_poster: true,
    },
  ],
}

/** Postponed: originally 2026-10-14, actually rescheduled to 2030-01-02. */
const postponedFixture: Fixture = {
  id: 'f1',
  season_id: 'season-1',
  division_id: 'div-1',
  week_number: 1,
  scheduled_date: '2030-01-02',
  home_team_id: 'd1t1',
  away_team_id: 'd1t2',
  playing_venue_id: 'v1',
  original_scheduled_date: '2026-10-14',
  locked: true,
  manual: true,
  status: 'scheduled',
}

function buildLayout(): PosterLayout {
  const layout = buildDefaultLayout(season)
  const rules = layout.elements.find((el) => el.type === 'rules')
  if (rules && rules.type === 'rules') {
    rules.rules = [{ id: 'r1', text: 'Matches start at 8pm sharp.', order: 0 }]
  }
  const logo = layout.elements.find((el) => el.type === 'logo' && el.role === 'league')
  if (logo && logo.type === 'logo') {
    logo.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  }
  return layout
}

describe('PosterExportView', () => {
  it('renders league name, season title, all four divisions, and team names from season setup', () => {
    render(<PosterExportView layout={buildLayout()} season={season} fixtures={[postponedFixture]} zoom={3.125} />)

    expect(screen.getByText('Phase 8 Test League')).toBeInTheDocument()
    expect(screen.getByText('2026/27 Export Test Season')).toBeInTheDocument()
    const divisionHeadings = Array.from(document.querySelectorAll('.poster-division-name')).map(
      (node) => node.textContent,
    )
    for (let n = 1; n <= 4; n += 1) {
      expect(divisionHeadings).toContain(`Division ${n}`)
      expect(screen.getByText(`Division ${n} Team 1`)).toBeInTheDocument()
      expect(screen.getByText(`Division ${n} Team 2`)).toBeInTheDocument()
    }
  })

  it('renders the fixture grid, competitions, and rules content from the current data', () => {
    render(<PosterExportView layout={buildLayout()} season={season} fixtures={[postponedFixture]} zoom={3.125} />)

    expect(screen.getByText('1v2')).toBeInTheDocument()
    expect(screen.getByText('County Cup Final')).toBeInTheDocument()
    expect(screen.getByText('Matches start at 8pm sharp.')).toBeInTheDocument()
  })

  it('uses the fixture current scheduled date, not its original date, in the grid header', () => {
    render(<PosterExportView layout={buildLayout()} season={season} fixtures={[postponedFixture]} zoom={3.125} />)

    // Default fixture-grid date format is 'short' (dd/mm/yy).
    expect(screen.getByText('02/01/30')).toBeInTheDocument()
    expect(screen.queryByText('14/10/26')).not.toBeInTheDocument()
  })

  it('renders a logo image preserving its source (no cropping/substitution)', () => {
    render(<PosterExportView layout={buildLayout()} season={season} fixtures={[postponedFixture]} zoom={3.125} />)

    const image = document.querySelector('img.poster-logo-image') as HTMLImageElement
    expect(image).toBeTruthy()
    expect(image.src).toContain('data:image/png;base64')
  })

  it('omits a hidden element entirely from the export output', () => {
    const layout = buildLayout()
    const competitions = layout.elements.find((el) => el.type === 'competitions')!
    competitions.visible = false

    render(<PosterExportView layout={layout} season={season} fixtures={[postponedFixture]} zoom={3.125} />)

    expect(screen.queryByText('County Cup Final')).not.toBeInTheDocument()
    expect(document.querySelector('.poster-competitions')).toBeNull()
    // Everything else is still there - only the hidden element is affected.
    expect(screen.getByText('1v2')).toBeInTheDocument()
  })

  it('contains no editor-only chrome: no drag handles, selection outline, or guides', () => {
    render(<PosterExportView layout={buildLayout()} season={season} fixtures={[postponedFixture]} zoom={3.125} />)

    expect(document.querySelectorAll('.poster-handle')).toHaveLength(0)
    expect(document.querySelectorAll('.selected')).toHaveLength(0)
    expect(document.querySelectorAll('.poster-guide')).toHaveLength(0)
  })

  it('positions and sizes elements from their rect, scaled to the given export zoom - not to any editor zoom', () => {
    const layout = buildLayout()
    const header = layout.elements.find((el) => el.type === 'header')!
    render(<PosterExportView layout={layout} season={season} fixtures={[postponedFixture]} zoom={3.125} />)

    const node = screen.getByTestId(`poster-export-element-${header.id}`)
    expect(Number.parseFloat(node.style.left)).toBeCloseTo(mmToPx(header.rect.x, 3.125), 1)
    expect(Number.parseFloat(node.style.top)).toBeCloseTo(mmToPx(header.rect.y, 3.125), 1)
    expect(Number.parseFloat(node.style.width)).toBeCloseTo(mmToPx(header.rect.width, 3.125), 1)
    expect(Number.parseFloat(node.style.height)).toBeCloseTo(mmToPx(header.rect.height, 3.125), 1)
  })

  it('is independent of the interactive editor zoom: export size never tracks the on-screen zoom state', () => {
    const layout = buildLayout()

    function EditorAtZoom({ initialZoom }: { initialZoom: number }) {
      const editor = usePosterEditor(season)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => editor.setZoom(initialZoom), [])
      return <PosterCanvas editor={editor} season={season} fixtures={[postponedFixture]} />
    }

    // Two different interactive editor zoom levels...
    const low = render(<EditorAtZoom initialZoom={0.5} />)
    const lowPage = screen.getByTestId('poster-page')
    low.unmount()
    const high = render(<EditorAtZoom initialZoom={2} />)
    const highPage = screen.getByTestId('poster-page')
    high.unmount()

    expect(Number.parseFloat(lowPage.style.width)).not.toBeCloseTo(Number.parseFloat(highPage.style.width), 1)

    // ...but PosterExportView, given a fixed export zoom, always produces the same size,
    // regardless of what the editor's zoom happens to be at export time.
    const exportedA = render(<PosterExportView layout={layout} season={season} fixtures={[postponedFixture]} zoom={3.125} />)
    const widthA = screen.getByTestId('poster-export-page').style.width
    exportedA.unmount()
    const exportedB = render(<PosterExportView layout={layout} season={season} fixtures={[postponedFixture]} zoom={3.125} />)
    const widthB = screen.getByTestId('poster-export-page').style.width
    exportedB.unmount()

    expect(widthA).toBe(widthB)
  })
})
