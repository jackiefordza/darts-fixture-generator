import { SeasonDetailsCard } from './SeasonDetailsCard'
import { DivisionsPanel } from './DivisionsPanel'
import { VenuesPanel } from './VenuesPanel'
import { TeamsPanel } from './TeamsPanel'

export function SetupPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Season Setup</h1>
        <p className="muted">Configure the league, divisions, teams and venues before generating fixtures.</p>
      </div>
      <div className="setup-grid">
        <SeasonDetailsCard />
        <VenuesPanel />
        <DivisionsPanel />
        <TeamsPanel />
      </div>
    </div>
  )
}
