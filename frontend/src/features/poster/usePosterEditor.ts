import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { SeasonDetail } from '../../api/types'
import { buildDefaultLayout, defaultElementFor } from './defaultLayout'
import { hitTestOrder } from './geometry'
import {
  addElement as addElementOp,
  removeElement as removeElementOp,
  replaceElement,
  setGlobalStyle as setGlobalStyleOp,
  transformDivisionsGroup,
  updateElement as updateElementOp,
} from './posterLayoutOps'
import { loadPosterLayout, savePosterLayout } from './posterStorage'
import type { GlobalStyle, PosterElement, PosterLayout, Rect } from './posterTypes'

const MAX_HISTORY = 50

interface HistoryState {
  past: PosterLayout[]
  present: PosterLayout
  future: PosterLayout[]
}

type HistoryAction =
  | { type: 'LOAD'; layout: PosterLayout }
  | { type: 'COMMIT'; layout: PosterLayout }
  | { type: 'UNDO' }
  | { type: 'REDO' }

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'LOAD':
      return { past: [], present: action.layout, future: [] }
    case 'COMMIT': {
      if (action.layout === state.present) return state
      const past = [...state.past, state.present].slice(-MAX_HISTORY)
      return { past, present: action.layout, future: [] }
    }
    case 'UNDO': {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] }
    }
    case 'REDO': {
      if (state.future.length === 0) return state
      const [next, ...rest] = state.future
      return { past: [...state.past, state.present], present: next, future: rest }
    }
    default:
      return state
  }
}

interface ClickCycle {
  point: { x: number; y: number }
  candidates: string[]
  index: number
}

function sameCandidates(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function usePosterEditor(season: SeasonDetail) {
  const [history, dispatch] = useReducer(historyReducer, null, () => {
    const stored = loadPosterLayout(season.id)
    return { past: [], present: stored ?? buildDefaultLayout(season), future: [] }
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoomState] = useState(1)
  const [preview, setPreview] = useState(false)
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })
  const clickCycleRef = useRef<ClickCycle | null>(null)
  const loadedSeasonRef = useRef(season.id)

  // Loading a *different* season resets history; re-fetches of the same season should not.
  useEffect(() => {
    if (loadedSeasonRef.current === season.id) return
    loadedSeasonRef.current = season.id
    const stored = loadPosterLayout(season.id)
    dispatch({ type: 'LOAD', layout: stored ?? buildDefaultLayout(season) })
    setSelectedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season.id])

  useEffect(() => {
    savePosterLayout(season.id, history.present)
  }, [season.id, history.present])

  const layout = history.present

  const commit = useCallback((next: PosterLayout) => dispatch({ type: 'COMMIT', layout: next }), [])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  const select = useCallback((id: string | null) => {
    setSelectedId(id)
    clickCycleRef.current = null
  }, [])

  const selectAtPoint = useCallback(
    (point: { x: number; y: number }) => {
      const candidates = hitTestOrder(layout.elements, point)
      if (candidates.length === 0) {
        setSelectedId(null)
        clickCycleRef.current = null
        return
      }
      const last = clickCycleRef.current
      const closeToLast = last && Math.hypot(last.point.x - point.x, last.point.y - point.y) < 2
      if (closeToLast && last && sameCandidates(last.candidates, candidates)) {
        const index = (last.index + 1) % candidates.length
        clickCycleRef.current = { point, candidates, index }
        setSelectedId(candidates[index])
      } else {
        clickCycleRef.current = { point, candidates, index: 0 }
        setSelectedId(candidates[0])
      }
    },
    [layout.elements],
  )

  const moveOrResize = useCallback(
    (id: string, rect: Rect) => {
      const element = layout.elements.find((candidate) => candidate.id === id)
      if (!element) return
      const next = element.type === 'divisions' ? transformDivisionsGroup(layout, id, rect) : updateElementOp(layout, id, { rect })
      commit(next)
    },
    [layout, commit],
  )

  const updateElement = useCallback(
    <T extends PosterElement>(id: string, patch: Partial<T>) => commit(updateElementOp(layout, id, patch)),
    [layout, commit],
  )

  const addElement = useCallback((element: PosterElement) => commit(addElementOp(layout, element)), [layout, commit])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    const element = layout.elements.find((candidate) => candidate.id === selectedId)
    if (!element || !element.removable) return
    commit(removeElementOp(layout, selectedId))
    setSelectedId(null)
  }, [layout, selectedId, commit])

  const setGlobalStyle = useCallback((patch: Partial<GlobalStyle>) => commit(setGlobalStyleOp(layout, patch)), [layout, commit])

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!selectedId) return
      const element = layout.elements.find((candidate) => candidate.id === selectedId)
      if (!element) return
      const rect = { ...element.rect, x: element.rect.x + dx, y: element.rect.y + dy }
      moveOrResize(selectedId, rect)
    },
    [layout, selectedId, moveOrResize],
  )

  const resetElement = useCallback(
    (id: string) => {
      const replacement = defaultElementFor(season, id, layout)
      if (!replacement) return
      commit(replaceElement(layout, id, replacement))
    },
    [season, layout, commit],
  )

  const resetAll = useCallback(() => {
    commit(buildDefaultLayout(season))
    setSelectedId(null)
  }, [season, commit])

  const setZoom = useCallback((value: number) => setZoomState(Math.min(3, Math.max(0.15, value))), [])

  const selected = useMemo(
    () => (selectedId ? layout.elements.find((element) => element.id === selectedId) ?? null : null),
    [layout.elements, selectedId],
  )

  return {
    layout,
    selectedId,
    selected,
    select,
    selectAtPoint,
    zoom,
    setZoom,
    preview,
    setPreview,
    snapGuides,
    setSnapGuides,
    canUndo,
    canRedo,
    undo,
    redo,
    moveOrResize,
    updateElement,
    addElement,
    deleteSelected,
    setGlobalStyle,
    nudgeSelected,
    resetElement,
    resetAll,
  }
}

export type PosterEditor = ReturnType<typeof usePosterEditor>
