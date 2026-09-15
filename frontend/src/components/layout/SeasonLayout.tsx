import { useEffect } from 'react'
import { Navigate, Outlet, useParams } from 'react-router-dom'
import { AppShell } from './AppShell'
import { LoadingState } from '../ui/LoadingState'
import { ErrorState } from '../ui/ErrorState'
import { getSeason } from '../../api/seasons'
import { useFetch } from '../../hooks/useFetch'
import { SeasonContext, rememberSeasonId } from '../../context/SeasonContext'

export function SeasonLayout() {
  const { seasonId } = useParams<{ seasonId: string }>()
  const { data: season, loading, error, refetch } = useFetch(
    () => getSeason(seasonId as string),
    [seasonId],
  )

  useEffect(() => {
    if (season) rememberSeasonId(season.id)
  }, [season])

  if (!seasonId) return <Navigate to="/seasons" replace />

  if (loading && !season) {
    return (
      <div className="page-center">
        <LoadingState label="Loading season…" />
      </div>
    )
  }

  if (error || !season) {
    return (
      <div className="page-center">
        <ErrorState message={error ?? 'Season not found.'} onRetry={refetch} />
      </div>
    )
  }

  return (
    <SeasonContext.Provider value={{ season, refetch }}>
      <AppShell season={season}>
        <Outlet />
      </AppShell>
    </SeasonContext.Provider>
  )
}
