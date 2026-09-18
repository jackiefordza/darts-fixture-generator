import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PosterCanvas } from './PosterCanvas'
import { usePosterEditor } from './usePosterEditor'
import { mmToPx } from './geometry'
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
      ],
    },
  ],
  venues: [{ id: 'v1', season_id: 'season-1', name: 'The Anchor', board_capacity: 4 }],
  calendar_events: [],
}

const fixtures: Fixture[] = [
  {
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
  },
]

// With this season/fixtures the default layout places (all in mm, at zoom 1):
//   header:     x:12    y:12    w:273 h:52
//   trim:       x:12    y:64    w:273 h:3.5
//   division:   x:12    y:71.5  w:273 h:120   (only one division, so it fills the whole row)
//   league logo:x:266.28 y:17   w:18.72 h:18.72 (header's top-right corner - deliberately overlapping)
//   fixture grid: x:12  y:195.5 w:273 h:105
//   competitions: x:12  y:304.5 w:273 h:22
//   rules:      x:12    y:330.5 w:273 h:77.5

function Harness() {
  const editor = usePosterEditor(season)
  return <PosterCanvas editor={editor} season={season} fixtures={fixtures} />
}

beforeEach(() => {
  localStorage.clear()
})

/** jsdom's getBoundingClientRect() is always zero, so clientX/Y map 1:1 onto page-relative px. */
function pointAtMm(xMm: number, yMm: number) {
  return { clientX: mmToPx(xMm, 1), clientY: mmToPx(yMm, 1) }
}

function getPage() {
  return screen.getByTestId('poster-page')
}

describe('PosterCanvas', () => {
  it('renders the fixture grid with no editable controls in its cells', () => {
    render(<Harness />)
    const grid = screen.getByTestId(/poster-element-fixture-grid/)
    expect(grid.querySelectorAll('input, textarea, [contenteditable="true"]')).toHaveLength(0)
    expect(grid.textContent).toContain('1v2')
  })

  it('clicking a fixture-grid cell only selects the grid element - it never opens an editor', () => {
    render(<Harness />)
    const grid = screen.getByTestId(/poster-element-fixture-grid/)
    const point = { ...pointAtMm(50, 200), pointerId: 1 }

    fireEvent.pointerDown(grid, point)
    fireEvent.pointerUp(getPage(), point)

    expect(grid.className).toContain('selected')
    expect(document.querySelectorAll('input, textarea').length).toBe(0)
  })

  it('dragging an element updates its rect position, independent of the on-screen zoom', () => {
    render(<Harness />)
    const division = screen.getByTestId(/poster-element-division-/)
    const page = getPage()

    // The division is 273mm wide on a 297mm page (12mm margin each side), so this +3mm/+3.5mm
    // move stays well clear of the page-edge clamp; both landing points (15, 75) are exact
    // 5mm grid lines too, so the result is deterministic regardless of snapping.
    fireEvent.pointerDown(division, { ...pointAtMm(50, 100), pointerId: 2 })
    fireEvent.pointerMove(page, { ...pointAtMm(53, 103.5), pointerId: 2 })
    fireEvent.pointerUp(page, { ...pointAtMm(53, 103.5), pointerId: 2 })

    expect(Number.parseFloat(division.style.left)).toBeCloseTo(mmToPx(15, 1), 1)
    expect(Number.parseFloat(division.style.top)).toBeCloseTo(mmToPx(75, 1), 1)
  })

  it("dragging a resize handle changes an element's dimensions", () => {
    render(<Harness />)
    const rules = screen.getByTestId(/poster-element-rules-/)
    const page = getPage()

    // Select it first so its resize handles render.
    fireEvent.pointerDown(rules, { ...pointAtMm(50, 390), pointerId: 3 })
    fireEvent.pointerUp(page, { ...pointAtMm(50, 390), pointerId: 3 })
    expect(rules.className).toContain('selected')

    const initialWidth = Number.parseFloat(rules.style.width)
    const handle = screen.getByTestId('poster-handle-se')
    fireEvent.pointerDown(handle, { ...pointAtMm(285, 418), pointerId: 4 })
    fireEvent.pointerMove(page, { ...pointAtMm(300, 418), pointerId: 4 })
    fireEvent.pointerUp(page, { ...pointAtMm(300, 418), pointerId: 4 })

    const updatedWidth = Number.parseFloat(rules.style.width)
    expect(updatedWidth).toBeCloseTo(initialWidth + mmToPx(15, 1), 0)
  })

  it('cycles through overlapping elements on repeated clicks at the same point', () => {
    render(<Harness />)
    const page = getPage()
    // (275, 25) is inside both the header band and the league logo that sits within it.
    const point = { ...pointAtMm(275, 25), pointerId: 5 }

    fireEvent.pointerDown(page, point)
    const first = document.querySelector('.poster-element.selected')?.getAttribute('data-testid')

    fireEvent.pointerDown(page, point)
    const second = document.querySelector('.poster-element.selected')?.getAttribute('data-testid')

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
  })

  it('does not select anything when clicking empty page background', () => {
    render(<Harness />)
    const page = getPage()
    // Below the rules section but still on the page - nothing is laid out there by default.
    fireEvent.pointerDown(page, { ...pointAtMm(150, 419), pointerId: 6 })
    expect(document.querySelector('.poster-element.selected')).toBeNull()
  })

  it('zooms on ctrl/cmd+wheel (mouse shortcut and trackpad pinch both report ctrlKey), but a plain wheel just scrolls', () => {
    render(<Harness />)
    const scroll = document.querySelector('.poster-canvas-scroll') as HTMLElement
    const widthBefore = Number.parseFloat(getPage().style.width)

    fireEvent.wheel(scroll, { deltaY: -100, ctrlKey: true, clientX: 100, clientY: 100 })
    const widthAfterZoom = Number.parseFloat(getPage().style.width)
    expect(widthAfterZoom).toBeGreaterThan(widthBefore)

    fireEvent.wheel(scroll, { deltaY: 100, ctrlKey: false, clientX: 100, clientY: 100 })
    expect(Number.parseFloat(getPage().style.width)).toBeCloseTo(widthAfterZoom, 5)
  })
})
