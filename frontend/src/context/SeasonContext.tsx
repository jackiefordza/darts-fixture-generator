import { createContext, useContext } from 'react'
import type { SeasonDetail } from '../api/types'

export interface SeasonContextValue {
  season: SeasonDetail
  refetch: () => void
}

export const SeasonContext = createContext<SeasonContextValue | null>(null)

/** Only usable inside <SeasonLayout>, which guarantees the season has already loaded. */
export function useSeason(): SeasonContextValue {
  const context = useContext(SeasonContext)
  if (!context) {
    throw new Error('useSeason() must be used within a season route')
  }
  return context
}

const LAST_SEASON_KEY = 'fixture-generator:last-season-id'

export function rememberSeasonId(seasonId: string): void {
  try {
    localStorage.setItem(LAST_SEASON_KEY, seasonId)
  } catch {
    // Storage may be unavailable (private browsing); the switcher still works without it.
  }
}

export function lastRememberedSeasonId(): string | null {
  try {
    return localStorage.getItem(LAST_SEASON_KEY)
  } catch {
    return null
  }
}
