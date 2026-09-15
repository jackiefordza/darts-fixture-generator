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
      // The masthead defaults to a solid primary-colour band (white text) rather than an
      // outlined box - a "use global" background override is absent (null), so only an
      // explicit custom background/text override should ever change that.
      const hasCustomBg = element.style.backgroundColor != null
      const headerBg = hasCustomBg ? resolved.backgroundColor : globalStyle.primaryColor
      const headerText = hasCustomBg ? resolved.textColor : '#ffffff'
      const headerSubtitle = hasCustomBg ? resolved.textColor : 'rgba(255, 255, 255, 0.85)'
      return (
        <div
          className="poster-box poster-header"
          style={{ ...boxStyle, background: headerBg, color: headerText, borderStyle: 'solid' }}
        >
          <div className="poster-header-league">{season.league_name}</div>
          <div className="poster-header-season" style={{ color: headerSubtitle }}>
            {season.name}
          </div>
        </div>
      )
    }

    case 'divisions':
      // Purely a layout/selection group for the rows inside it - the rows themselves carry
      // the visible divider lines, so this frame has no border or fill of its own.
      return (
        <div
          className="poster-box poster-divisions-frame"
          style={{ ...boxStyle, background: 'transparent', borderStyle: 'none' }}
        />
      )

    case 'division': {
      const division = season.divisions.find((candidate) => candidate.id === element.divisionId)
      if (!division) return null
      const divisionIndex = season.divisions.findIndex((candidate) => candidate.id === element.divisionId)
      const dividerWidth = resolved.borderWidth
      return (
        <div
          className="poster-box poster-division"
          style={{
            ...boxStyle,
            borderStyle: 'solid',
            borderTopWidth: divisionIndex === 0 ? dividerWidth : 0,
            borderBottomWidth: dividerWidth,
            borderLeftWidth: 0,
            borderRightWidth: 0,
          }}
        >
          <div className="poster-division-header" style={{ borderBottomColor: globalStyle.accentColor }}>
            <span className="poster-division-name" style={{ color: globalStyle.primaryColor }}>
              {division.name}
            </span>
          </div>
          <ol className="poster-division-teams">
            {division.teams.map((team, index) => (
              <li key={team.id}>
                <span className="poster-team-number" style={{ background: globalStyle.primaryColor }}>
                  {index + 1}
                </span>
                <span className="poster-team-name">{team.name}</span>
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
      // An empty slot reads as a genuine poster logo area (tinted panel, neutral frame) rather
      // than a dashed "drop a file here" input - "Custom" overrides still take over normally.
      const placeholderBorder = element.style.borderColor ?? '#c7ccd6'
      const placeholderBg = element.style.backgroundColor ?? '#f4f5f8'
      return (
        <div
          className="poster-box poster-logo"
          style={{
            ...boxStyle,
            borderStyle: isEmpty ? 'solid' : 'none',
            borderColor: isEmpty ? placeholderBorder : resolved.borderColor,
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
      const grid = buildFixtureGrid(season, fixtures)
      const fontSize = mmFont(element.fontSize, zoom)
      const headCellStyle: CSSProperties = { background: globalStyle.primaryColor, color: '#ffffff' }
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
      const items = mergeCompetitions(season.calendar_events, element.entries).filter((item) => item.visible)
      return (
        <div className="poster-box poster-competitions" style={{ ...boxStyle, borderStyle: 'solid' }}>
          <div className="poster-section-title" style={{ background: globalStyle.primaryColor, color: '#ffffff' }}>
            Competitions
          </div>
          {items.length === 0 ? (
            <p className="muted poster-empty-hint">No competitions added yet.</p>
          ) : (
            <ul className="poster-competitions-list">
              {items.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  {item.detail && <span className="muted"> — {item.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }

    case 'rules': {
      const rules = [...element.rules].sort((a, b) => a.order - b.order)
      return (
        <div className="poster-box poster-rules" style={{ ...boxStyle, borderStyle: 'solid', fontSize: mmFont(element.fontSize, zoom) }}>
          <div className="poster-section-title" style={{ background: globalStyle.primaryColor, color: '#ffffff' }}>
            Rules
          </div>
          <ol className="poster-rules-list" style={{ columnCount: element.columns }}>
            {rules.map((rule, index) => (
              <li key={rule.id}>
                <span className="poster-rule-number">{index + 1}.</span> {rule.text}
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
