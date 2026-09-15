import type { PosterLayout } from './posterTypes'

/**
 * Poster layouts persist in the browser, separate from the season's fixture data
 * on the backend. This keeps the poster editor working today without a backend
 * change; the storage boundary is isolated here so a future backend-backed store
 * (needed for the Phase 7 template library) can replace it without touching the
 * editor or renderer.
 */
function storageKey(seasonId: string): string {
  return `fixture-generator:poster-layout:${seasonId}`
}

export function loadPosterLayout(seasonId: string): PosterLayout | null {
  try {
    const raw = localStorage.getItem(storageKey(seasonId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PosterLayout
    if (parsed && parsed.version === 1 && Array.isArray(parsed.elements)) return parsed
    return null
  } catch {
    return null
  }
}

export function savePosterLayout(seasonId: string, layout: PosterLayout): void {
  try {
    localStorage.setItem(storageKey(seasonId), JSON.stringify(layout))
  } catch {
    // Storage may be unavailable (private browsing, quota) - the editor still works in-memory.
  }
}

export function clearPosterLayout(seasonId: string): void {
  try {
    localStorage.removeItem(storageKey(seasonId))
  } catch {
    // Ignore - nothing to clear if storage isn't available.
  }
}
