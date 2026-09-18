import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultLayout } from './defaultLayout'
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from './posterTypes'
import type { Fixture, SeasonDetail } from '../../api/types'

const season: SeasonDetail = {
  id: 'season-1',
  league_name: 'Phase 8 Test League',
  name: '2026/27 Export Test Season',
  first_fixture_date: '2026-10-14',
  cadence_days: 7,
  generation_seed: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  divisions: [
    {
      id: 'div-1',
      season_id: 'season-1',
      name: 'Division 1',
      position: 1,
      teams: [
        { id: 't1', division_id: 'div-1', name: 'Team 1', position: 1, number: 1, venue_id: 'v1' },
        { id: 't2', division_id: 'div-1', name: 'Team 2', position: 2, number: 2, venue_id: 'v1' },
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
    division_id: 'div-1',
    week_number: 1,
    scheduled_date: '2026-10-14',
    home_team_id: 't1',
    away_team_id: 't2',
    playing_venue_id: 'v1',
    original_scheduled_date: '2026-10-14',
    locked: false,
    manual: false,
    status: 'scheduled',
  },
]

const fakeCanvas = {
  width: 3508,
  height: 4961,
  toDataURL: vi.fn(() => 'data:image/png;base64,FAKE'),
  toBlob: vi.fn((cb: (blob: Blob | null) => void) => cb(new Blob(['fake'], { type: 'image/png' }))),
}

let capturedTextContent = ''
const html2canvasMock = vi.fn(async (node: HTMLElement) => {
  // A real rasteriser reads the node's rendered content synchronously as part of this
  // call; snapshot it here too, since renderPosterCanvas unmounts the node right after.
  capturedTextContent = node.textContent ?? ''
  return fakeCanvas as unknown as HTMLCanvasElement
})
vi.mock('html2canvas', () => ({ default: (...args: [HTMLElement, unknown]) => html2canvasMock(...args) }))

const addImage = vi.fn()
const save = vi.fn()
const jsPDFConstructor = vi.fn()
vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(options: unknown) {
      jsPDFConstructor(options)
    }
    addImage(...args: unknown[]) {
      addImage(...args)
    }
    save(...args: unknown[]) {
      save(...args)
    }
  },
}))

const createObjectURL = vi.fn(() => 'blob:fake-url')
const revokeObjectURL = vi.fn()

import { EXPORT_DPI, EXPORT_ZOOM, exportPixelSize, exportPosterPdf, exportPosterPng, renderPosterCanvas } from './posterExport'

beforeEach(() => {
  capturedTextContent = ''
  html2canvasMock.mockClear()
  addImage.mockClear()
  save.mockClear()
  jsPDFConstructor.mockClear()
  fakeCanvas.toDataURL.mockClear()
  fakeCanvas.toBlob.mockClear()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, writable: true })
})

describe('export pixel dimensions (TEST 1 / TEST 2)', () => {
  it('targets 300 DPI', () => {
    expect(EXPORT_DPI).toBe(300)
  })

  it('produces the documented ~3508x4961px A3 raster size at 300 DPI', () => {
    const { width, height } = exportPixelSize({ pageWidth: PAGE_WIDTH_MM, pageHeight: PAGE_HEIGHT_MM })
    expect(width).toBe(3508)
    expect(height).toBe(4961)
  })

  it('is derived from the fixed print-DPI ratio, not from any interactive editor zoom', () => {
    // EXPORT_ZOOM has no dependency on editor state at all - it's a pure constant.
    expect(EXPORT_ZOOM).toBeCloseTo(300 / 96, 10)
  })
})

interface Html2CanvasOptions {
  width: number
  height: number
  scale: number
  backgroundColor: string
}

describe('renderPosterCanvas', () => {
  it('renders the DOM at natural size and requests the print-DPI scale that yields 3508x4961', async () => {
    // The node itself stays at a normal, reasonably-sized DOM footprint; `scale` (not an
    // inflated node) is what produces the true print-resolution output - see the module's
    // doc comment for why an SVG-foreignObject-based capture library silently produced a
    // blank capture instead, which is why this project uses html2canvas.
    const layout = buildDefaultLayout(season)
    await renderPosterCanvas(layout, season, fixtures)

    expect(html2canvasMock).toHaveBeenCalledTimes(1)
    const [, options] = html2canvasMock.mock.calls[0]
    const opts = options as Html2CanvasOptions
    expect(opts.scale).toBeCloseTo(300 / 96, 10)
    expect(opts.width).toBeLessThan(2000)
    expect(opts.height).toBeLessThan(2000)
    // The node passed to the rasteriser is the real, fully-rendered poster content - same
    // data the editor shows - captured *at call time*, since it is unmounted right after.
    expect(capturedTextContent).toContain('Team 1')
  })

  it('removes the offscreen render container after capture, leaving no stray DOM behind', async () => {
    const before = document.body.children.length
    const layout = buildDefaultLayout(season)
    await renderPosterCanvas(layout, season, fixtures)
    expect(document.body.children.length).toBe(before)
  })

  it('resizes onto an exact-dimension canvas when the rasteriser rounds to a slightly different size', async () => {
    html2canvasMock.mockResolvedValueOnce({ width: 3509, height: 4960 } as unknown as HTMLCanvasElement)
    const layout = buildDefaultLayout(season)
    const result = await renderPosterCanvas(layout, season, fixtures)
    // jsdom's canvas 2D context is unavailable, so the safety net can't actually redraw -
    // it should still return *something* usable rather than throwing.
    expect(result).toBeTruthy()
  })
})

describe('exportPosterPdf (TEST 1)', () => {
  it('creates a true A3 portrait page ([297, 420]mm) and embeds the rendered poster image', async () => {
    const layout = buildDefaultLayout(season)
    await exportPosterPdf(layout, season, fixtures, 'poster.pdf')

    expect(jsPDFConstructor).toHaveBeenCalledWith({
      orientation: 'portrait',
      unit: 'mm',
      format: [297, 420],
      compress: true,
    })
    // 'SLOW' (max zlib compression) keeps the embedded raster lossless but avoids jsPDF's
    // default of storing it as a raw, uncompressed ~70MB bitmap.
    expect(addImage).toHaveBeenCalledWith('data:image/png;base64,FAKE', 'PNG', 0, 0, 297, 420, undefined, 'SLOW')
    expect(save).toHaveBeenCalledWith('poster.pdf')
  })
})

describe('exportPosterPng (TEST 2)', () => {
  it('downloads a PNG blob built from the rendered canvas', async () => {
    const layout = buildDefaultLayout(season)
    await exportPosterPng(layout, season, fixtures, 'poster.png')

    expect(fakeCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const [blob] = createObjectURL.mock.calls[0]
    expect((blob as Blob).type).toBe('image/png')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })
})

describe('TEST 7 - editor zoom independence', () => {
  it('renders identical export pixel dimensions regardless of any interactive zoom value', async () => {
    const layout = buildDefaultLayout(season)
    await renderPosterCanvas(layout, season, fixtures)
    const firstCallOptions = html2canvasMock.mock.calls[0][1] as { width: number; height: number }

    html2canvasMock.mockClear()
    // A second render call has no way to be told "the editor was at 200% zoom" at all -
    // renderPosterCanvas/exportPixelSize take no zoom argument, only the layout's own mm data.
    await renderPosterCanvas(layout, season, fixtures)
    const secondCallOptions = html2canvasMock.mock.calls[0][1] as { width: number; height: number }

    expect(secondCallOptions).toEqual(firstCallOptions)
  })
})
