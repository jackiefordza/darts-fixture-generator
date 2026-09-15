import { Navigate } from 'react-router-dom'
import { lastRememberedSeasonId } from '../context/SeasonContext'

export function RootRedirect() {
  const seasonId = lastRememberedSeasonId()
  return <Navigate to={seasonId ? `/seasons/${seasonId}` : '/seasons'} replace />
}
