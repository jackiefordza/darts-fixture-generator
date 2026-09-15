import type { SeasonDetail } from '../../api/types'
import {
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  type CompetitionsElement,
  type DivisionElement,
  type DivisionsContainerElement,
  type FixtureGridElement,
  type GlobalStyle,
  type HeaderElement,
  type LogoElement,
  type PosterElement,
  type PosterLayout,
  type RulesElement,
} from './posterTypes'

const MARGIN = 12
const CONTENT_WIDTH = PAGE_WIDTH_MM - MARGIN * 2

export const DEFAULT_GLOBAL_STYLE: GlobalStyle = {
  backgroundColor: '#ffffff',
  primaryColor: '#0b3d91',
  accentColor: '#c8102e',
  textColor: '#111318',
  fontFamily: "'Public Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  baseFontSize: 4,
  borderColor: '#0b3d91',
  borderWidth: 0.4,
  spacing: 3,
}

/** Starter content only - clearly generic, never a real league's actual rules. */
const STARTER_RULES = [
  'Matches start promptly at 8:00pm unless otherwise agreed by both team captains.',
  'The home team supplies the chalker for the first game.',
  'Results must be reported to the league secretary within 48 hours of the match.',
]

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

function headerElement(): HeaderElement {
  return {
    id: nextId('header'),
    type: 'header',
    name: 'Header',
    rect: { x: MARGIN, y: MARGIN, width: CONTENT_WIDTH, height: 40 },
    visible: true,
    removable: false,
    style: {},
  }
}

/** Sits in the header's right-hand corner, mirroring the division sponsor logos, so it
 * never overlaps the league name/season title text that starts at the header's left edge. */
function leagueLogoElement(header: HeaderElement): LogoElement {
  const size = header.rect.height - 8
  return {
    id: nextId('logo'),
    type: 'logo',
    role: 'league',
    name: 'League logo',
    rect: {
      x: header.rect.x + header.rect.width - size - 4,
      y: header.rect.y + (header.rect.height - size) / 2,
      width: size,
      height: size,
    },
    visible: true,
    removable: false,
    src: null,
    aspectLocked: true,
    style: {},
  }
}

function divisionsContainer(divisionCount: number, top: number, height: number): DivisionsContainerElement {
  return {
    id: nextId('divisions'),
    type: 'divisions',
    name: 'Divisions',
    rect: { x: MARGIN, y: top, width: CONTENT_WIDTH, height },
    visible: true,
    removable: false,
    style: {},
  }
}

function divisionRows(season: SeasonDetail, containerRect: { x: number; y: number; width: number; height: number }) {
  const rows: DivisionElement[] = []
  const logos: LogoElement[] = []
  const count = Math.max(season.divisions.length, 1)
  const rowHeight = containerRect.height / count
  season.divisions.forEach((division, index) => {
    const rowRect = {
      x: containerRect.x,
      y: containerRect.y + rowHeight * index,
      width: containerRect.width,
      height: rowHeight,
    }
    rows.push({
      id: nextId('division'),
      type: 'division',
      divisionId: division.id,
      name: division.name,
      rect: rowRect,
      visible: true,
      removable: false,
      style: {},
    })
    logos.push({
      id: nextId('sponsor'),
      type: 'logo',
      role: 'division-sponsor',
      divisionId: division.id,
      name: `${division.name} sponsor`,
      rect: {
        x: rowRect.x + rowRect.width - 32,
        y: rowRect.y + Math.max((rowRect.height - 18) / 2, 1),
        width: 28,
        height: 18,
      },
      visible: true,
      removable: false,
      src: null,
      aspectLocked: true,
      style: {},
    })
  })
  return { rows, logos }
}

function fixtureGridElement(top: number, height: number): FixtureGridElement {
  return {
    id: nextId('fixture-grid'),
    type: 'fixture-grid',
    name: 'Fixture grid',
    rect: { x: MARGIN, y: top, width: CONTENT_WIDTH, height },
    visible: true,
    removable: false,
    dateFormat: 'short',
    fontSize: 2.9,
    showBorders: true,
    style: {},
  }
}

function competitionsElement(top: number, height: number): CompetitionsElement {
  return {
    id: nextId('competitions'),
    type: 'competitions',
    name: 'Competitions',
    rect: { x: MARGIN, y: top, width: CONTENT_WIDTH, height },
    visible: true,
    removable: false,
    entries: [],
    style: {},
  }
}

function rulesElement(top: number, height: number): RulesElement {
  return {
    id: nextId('rules'),
    type: 'rules',
    name: 'Rules',
    rect: { x: MARGIN, y: top, width: CONTENT_WIDTH, height },
    visible: true,
    removable: false,
    columns: 2,
    fontSize: 2.9,
    rules: STARTER_RULES.map((text, index) => ({ id: nextId('rule'), text, order: index })),
    style: {},
  }
}

/**
 * Builds the default poster layout for a season: header, divisions, fixture grid,
 * competitions, then rules, stacked top to bottom in the reference poster's order.
 * Purely structural - it never reads fixtures, so it's safe to call before a
 * schedule has been generated.
 */
export function buildDefaultLayout(season: SeasonDetail): PosterLayout {
  const header = headerElement()
  const leagueLogo = leagueLogoElement(header)

  let cursor = header.rect.y + header.rect.height + 4
  const divisionsHeight = 115
  const divisions = divisionsContainer(season.divisions.length, cursor, divisionsHeight)
  const { rows, logos } = divisionRows(season, divisions.rect)
  cursor += divisionsHeight + 4

  const fixtureHeight = 95
  const grid = fixtureGridElement(cursor, fixtureHeight)
  cursor += fixtureHeight + 4

  const competitionsHeight = 40
  const competitions = competitionsElement(cursor, competitionsHeight)
  cursor += competitionsHeight + 4

  const rulesHeight = PAGE_HEIGHT_MM - MARGIN - cursor
  const rules = rulesElement(cursor, rulesHeight)

  return {
    version: 1,
    pageWidth: PAGE_WIDTH_MM,
    pageHeight: PAGE_HEIGHT_MM,
    globalStyle: DEFAULT_GLOBAL_STYLE,
    elements: [header, leagueLogo, divisions, ...rows, ...logos, grid, competitions, rules],
  }
}

/**
 * Rebuilds only the default rect/content for one element type, used by "reset section".
 * Keeps the *existing* element's id, since other state (selection, undo history) refers
 * to it - only its rect/content/style reset to what a fresh default layout would produce.
 */
export function defaultElementFor(season: SeasonDetail, elementId: string, layout: PosterLayout) {
  const fresh = buildDefaultLayout(season)
  const current = layout.elements.find((element) => element.id === elementId)
  if (!current) return null
  const replacement = fresh.elements.find((element) => element.type === current.type && matchesIdentity(element, current))
  return replacement ? ({ ...replacement, id: current.id } as PosterElement) : null
}

function matchesIdentity(a: PosterLayout['elements'][number], b: PosterLayout['elements'][number]): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'division' && b.type === 'division') return a.divisionId === b.divisionId
  if (a.type === 'logo' && b.type === 'logo') return a.role === b.role && a.divisionId === b.divisionId
  return true
}
