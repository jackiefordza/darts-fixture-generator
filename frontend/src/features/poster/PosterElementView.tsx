import type { CSSProperties } from 'react'
import type { Fixture, SeasonDetail } from '../../api/types'
import { formatPosterDate } from './dateFormat'
import { buildFixtureGrid } from './fixtureGridData'
import { mergeCompetitions } from './competitionsMerge'
import type { GlobalStyle, PosterElement } from './posterTypes'
import { resolveStyle } from './styleResolution'

function mmFont(mm: number, zoom: number): string {
  return `${(mm * (96 / 25.4) * zoom).toFixed(2)}px`
}

/**
 * Fallback base text size (mm) for layouts saved before `globalStyle.baseFontSize`
 * existed. Without a fontSize here, box dimensions would scale with zoom (via mmToPx)
 * but text would stay pinned to the browser's fixed CSS px size - fine at 100%, but
 * overflowing badly at low zoom and tiny relative to the box when zoomed in.
 */
const DEFAULT_BASE_FONT_MM = 3.7

/**
 * The previous fixture creator's fix for long team names at a dense 4-per-row layout:
 * shrink the individual name in place rather than truncating it or narrowing the whole
 * grid to fewer, wider columns. Thresholds match that tool's own values.
 */
function teamNameStyle(name: string): CSSProperties {
  if (name.length > 22) return { fontSize: '75%', letterSpacing: '-0.02em' }
  if (name.length > 17) return { fontSize: '85%', letterSpacing: '-0.01em' }
  if (name.length > 13) return { fontSize: '92%' }
  return {}
}

export function PosterElementView({
  element,
  season,
  fixtures,
  globalStyle,
  zoom,
}: {
  element: PosterElement
  season: SeasonDetail
  fixtures: Fixture[]
  globalStyle: GlobalStyle
  zoom: number
}) {
  const resolved = resolveStyle(element.style, globalStyle)
  const boxStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    background: resolved.backgroundColor,
    color: resolved.textColor,
    borderColor: resolved.borderColor,
    borderWidth: resolved.borderWidth,
    fontFamily: resolved.fontFamily,
    fontSize: mmFont(globalStyle.baseFontSize ?? DEFAULT_BASE_FONT_MM, zoom),
    overflow: 'hidden',
  }

  switch (element.type) {
    case 'header': {
      // Recreates the previous fixture creator's masthead: a strong dark band (never a
      // blank rectangle even with no image), a diagonally-clipped photo on the lead edge
      // when one is supplied, and bottom-anchored right-aligned titles - deliberately
      // bottom-anchored so they can never grow upward into the league-logo corner (see
      // `leagueLogoElement` in defaultLayout.ts, which claims the top-right corner).
      const hasCustomBg = element.style.backgroundColor != null
      const FALLBACK_DARK = '#14161c'
      const headerBg = hasCustomBg ? resolved.backgroundColor : FALLBACK_DARK
      const headerText = hasCustomBg ? resolved.textColor : '#ffffff'
      const headerSubtitle = hasCustomBg ? resolved.textColor : 'rgba(255, 255, 255, 0.82)'
      return (
        <div
          className="poster-box poster-header"
          style={{ ...boxStyle, background: headerBg, color: headerText, borderStyle: 'solid' }}
        >
          {element.backgroundImage && (
            <div
              className="poster-header-image"
              style={{ backgroundImage: `url(${element.backgroundImage})` }}
            />
          )}
          <div className="poster-header-titles">
            <div className="poster-header-league">{season.league_name}</div>
            <div className="poster-header-season" style={{ color: headerSubtitle }}>
              {season.name}
            </div>
          </div>
        </div>
      )
    }

    case 'trim': {
      // Purely decorative brand statement between masthead and content - always the
      // season's own primary/secondary/accent colours, in from the previous poster's
      // three-band trim (there is deliberately no per-band colour override; see
      // TrimElement's doc comment in posterTypes.ts).
      return (
        <div className="poster-box poster-trim" style={{ ...boxStyle, borderStyle: 'none', background: 'transparent' }}>
          <span style={{ background: globalStyle.primaryColor, flex: 5 }} />
          <span style={{ background: globalStyle.secondaryColor ?? '#ffffff', flex: 2 }} />
          <span style={{ background: globalStyle.accentColor, flex: 5 }} />
        </div>
      )
    }

    case 'divisions':
      // The single bordered frame around every division row, recreating the previous
      // poster's one-block-with-dividers treatment instead of four separate cards.
      return (
        <div
          className="poster-box poster-divisions-frame"
          style={{
            ...boxStyle,
            background: resolved.backgroundColor === 'transparent' ? '#ffffff' : resolved.backgroundColor,
            borderStyle: 'solid',
          }}
        />
      )

    case 'division': {
      const division = season.divisions.find((candidate) => candidate.id === element.divisionId)
      if (!division) return null
      const divisionIndex = season.divisions.findIndex((candidate) => candidate.id === element.divisionId)
      const isLast = divisionIndex === season.divisions.length - 1
      return (
        <div
          className="poster-box poster-division"
          style={{
            ...boxStyle,
            background: 'transparent',
            borderStyle: 'solid',
            borderWidth: 0,
            borderBottomWidth: isLast ? 0 : 0.35,
            borderColor: '#d7d9de',
          }}
        >
          <div className="poster-division-header">
            <span className="poster-division-name" style={{ color: globalStyle.primaryColor }}>
              {division.name}
            </span>
          </div>
          <ol className="poster-division-teams">
            {division.teams.map((team, index) => (
              <li key={team.id}>
                <span className="poster-team-number" style={{ color: globalStyle.primaryColor }}>
                  {index + 1}.
                </span>
                <span className="poster-team-name" style={teamNameStyle(team.name)}>
                  {team.name}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )
    }

    case 'logo':
    case 'image': {
      const placeholder = element.type === 'logo' ? (element.role === 'league' ? 'League logo' : 'Sponsor') : 'Image'
      const isEmpty = !element.src
      // An empty slot reads as quiet, unobtrusive brand space - a soft tinted panel with no
      // border at all - rather than an "upload logo here" dropzone; a real sponsor logo,
      // once supplied, always replaces this placeholder outright ("Custom" overrides too).
      const placeholderBg = element.style.backgroundColor ?? '#f4f5f8'
      return (
        <div
          className="poster-box poster-logo"
          style={{
            ...boxStyle,
            borderStyle: 'none',
            borderColor: resolved.borderColor,
            background: isEmpty ? placeholderBg : resolved.backgroundColor,
          }}
        >
          {element.src ? (
            <img src={element.src} alt={element.name} className="poster-logo-image" />
          ) : (
            <span className="poster-logo-placeholder muted">{placeholder}</span>
          )}
        </div>
      )
    }

    case 'fixture-grid': {
      // Dark header row (matching the masthead's tone, not the configurable brand colour)
      // recreates the previous poster's fixture matrix, still driven entirely by
      // `buildFixtureGrid` - every cell is real generated-schedule data, nothing hand-authored.
      const grid = buildFixtureGrid(season, fixtures)
      const fontSize = mmFont(element.fontSize, zoom)
      const headCellStyle: CSSProperties = { background: '#14161c', color: '#ffffff' }
      return (
        <div className="poster-box poster-fixture-grid" style={{ ...boxStyle, borderStyle: 'solid', fontSize }}>
          <table className={element.showBorders ? 'poster-grid-table bordered' : 'poster-grid-table'}>
            <thead>
              <tr>
                <th style={headCellStyle}>Div</th>
                {grid.weeks.map((week) => (
                  <th key={week.week} style={headCellStyle}>
                    Wk {week.week}
                    {week.date && (
                      <div className="poster-grid-date">{formatPosterDate(week.date, element.dateFormat)}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.divisionId}>
                  <th scope="row" style={{ color: globalStyle.primaryColor }}>
                    {row.divisionName}
                  </th>
                  {row.cells.map((cell, index) => (
                    <td key={index}>
                      {cell.map((fixture) => (
                        <div key={fixture.id} className="poster-grid-fixture">
                          {fixture.homeNumber}v{fixture.awayNumber}
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'competitions': {
      // Borderless "dotted leader" strip (name ... date), recreating the previous poster's
      // programme-style competitions list instead of a boxed panel with a title bar - it
      // stays a compact strip whether it holds many entries or none.
      const items = mergeCompetitions(season.calendar_events, element.entries).filter((item) => item.visible)
      return (
        <div className="poster-box poster-competitions" style={{ ...boxStyle, borderStyle: 'none', background: 'transparent' }}>
          <div className="poster-section-title poster-section-title-plain" style={{ color: globalStyle.primaryColor }}>
            Competitions
          </div>
          {items.length === 0 ? (
            <p className="muted poster-empty-hint">No competitions added yet.</p>
          ) : (
            <ul className="poster-competitions-list">
              {items.map((item) => (
                <li key={item.id}>
                  <span className="poster-competition-title">{item.title}</span>
                  <span className="poster-competition-leader" />
                  <span className="poster-competition-date">{item.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }

    case 'rules': {
      // The floating notched label (a same-colour patch over the border) recreates the
      // previous poster's certificate-style "Rules" tab straddling the box's top edge.
      const rules = [...element.rules].sort((a, b) => a.order - b.order)
      const rulesBg = resolved.backgroundColor === 'transparent' ? globalStyle.backgroundColor : resolved.backgroundColor
      return (
        <div
          className="poster-box poster-rules"
          style={{
            ...boxStyle,
            background: rulesBg,
            borderStyle: 'solid',
            fontSize: mmFont(element.fontSize, zoom),
            // The label below straddles this box's own top border, so this one element
            // must allow that overflow rather than clip to its own rect (unlike every
            // other section, which stays clipped to its rect as normal).
            overflow: 'visible',
          }}
        >
          <div className="poster-section-label-notch" style={{ background: rulesBg, color: globalStyle.textColor }}>
            Rules
          </div>
          <ol className="poster-rules-list" style={{ columnCount: element.columns }}>
            {rules.map((rule, index) => (
              <li key={rule.id}>
                <span className="poster-rule-number" style={{ color: globalStyle.accentColor }}>
                  {index + 1}.
                </span>{' '}
                {rule.text}
              </li>
            ))}
          </ol>
        </div>
      )
    }

    default:
      return null
  }
}
