/**
 * Poster design/layout data model.
 *
 * This is deliberately separate from season data (divisions/teams/fixtures, fetched
 * through the existing api/seasons.ts and api/fixtures.ts) and from editor state
 * (selection/drag/zoom/undo, see usePosterEditor.ts). A PosterLayout stores only
 * presentation: positions, sizes, styling, and the small amount of poster-only
 * content (extra rules/competition entries, uploaded logos) that has no home in the
 * season data model. It never stores fixtures, teams, or divisions themselves -
 * those are always read live from the season so the poster can't drift from the
 * validated schedule.
 */

export interface Rect {
  /** All measurements are in millimetres on the A3 portrait page, not screen pixels. */
  x: number
  y: number
  width: number
  height: number
}

export interface StyleOverride {
  backgroundColor?: string | null
  textColor?: string | null
  borderColor?: string | null
  borderWidth?: number | null
  fontFamily?: string | null
}

export type DateFormatId = 'short' | 'medium' | 'long'

interface BaseElement {
  id: string
  rect: Rect
  visible: boolean
  removable: boolean
  name: string
  style: StyleOverride
}

export interface HeaderElement extends BaseElement {
  type: 'header'
  /** Optional masthead photo/graphic, shown behind a diagonal clip on the header's
   * lead edge. Null means the dark fallback background (or a custom style override)
   * is used instead - there is always a strong masthead, never a blank rectangle. */
  backgroundImage: string | null
}

export interface DivisionsContainerElement extends BaseElement {
  type: 'divisions'
}

/** Purely decorative brand trim (three colour bands) between the masthead and the
 * main content, recreating the previous poster's tri-colour trim. Its three bands
 * always read from the season's primary/secondary/accent colours - there is
 * deliberately no per-band colour override, keeping it a single coherent brand
 * statement rather than another place to configure three separate colours. */
export interface TrimElement extends BaseElement {
  type: 'trim'
}

export interface DivisionElement extends BaseElement {
  type: 'division'
  divisionId: string
}

export interface LogoElement extends BaseElement {
  type: 'logo'
  role: 'league' | 'division-sponsor'
  divisionId?: string
  src: string | null
  aspectLocked: boolean
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src: string | null
  aspectLocked: boolean
}

export interface FixtureGridElement extends BaseElement {
  type: 'fixture-grid'
  dateFormat: DateFormatId
  fontSize: number
  showBorders: boolean
}

export interface CompetitionEntry {
  id: string
  source: 'calendar' | 'poster'
  /** Present only when source === 'calendar'; the season's CalendarEvent id. */
  calendarEventId?: string
  /** Present only when source === 'poster'; calendar-sourced titles come from the season. */
  title?: string
  detail?: string
  visible: boolean
  order: number
}

export interface CompetitionsElement extends BaseElement {
  type: 'competitions'
  entries: CompetitionEntry[]
}

export interface RuleEntry {
  id: string
  text: string
  order: number
}

export interface RulesElement extends BaseElement {
  type: 'rules'
  rules: RuleEntry[]
  columns: number
  fontSize: number
}

export type PosterElement =
  | HeaderElement
  | DivisionsContainerElement
  | DivisionElement
  | LogoElement
  | ImageElement
  | FixtureGridElement
  | CompetitionsElement
  | RulesElement
  | TrimElement

export interface GlobalStyle {
  backgroundColor: string
  primaryColor: string
  /** Second brand colour - currently only used by the masthead trim's middle band. */
  secondaryColor: string
  accentColor: string
  textColor: string
  fontFamily: string
  /** Base text size (mm) for sections without their own size field (header, divisions,
   * logos, competitions) - fixture-grid and rules have their own dedicated size instead. */
  baseFontSize: number
  borderColor: string
  borderWidth: number
  spacing: number
}

export interface PosterLayout {
  version: 1
  pageWidth: number
  pageHeight: number
  globalStyle: GlobalStyle
  elements: PosterElement[]
}

export const PAGE_WIDTH_MM = 297
export const PAGE_HEIGHT_MM = 420
