import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { SeasonSwitcher } from './SeasonSwitcher'
import type { SeasonDetail } from '../../api/types'

const NAV_ITEMS = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'setup', label: 'Season Setup' },
  { to: 'calendar', label: 'Calendar' },
  { to: 'schedule', label: 'Schedule' },
  { to: 'validation', label: 'Validation' },
]

export function AppShell({ season, children }: { season: SeasonDetail; children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-mark">🎯</span>
          <span className="app-brand-name">Fixture Generator</span>
        </div>
        <nav className="app-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-season">
            <span className="app-topbar-label">Season</span>
            <strong>{season.league_name} — {season.name}</strong>
          </div>
          <SeasonSwitcher currentSeasonId={season.id} />
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
