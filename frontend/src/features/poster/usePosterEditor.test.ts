import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePosterEditor } from './usePosterEditor'
import type { SeasonDetail } from '../../api/types'

const season: SeasonDetail = {
  id: 'season-1',
  league_name: 'Test League',
  name: '2026/27',
  first_fixture_date: '2026-09-16',
  cadence_days: 7,
  generation_seed: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  divisions: [
    {
      id: 'div-a',
      season_id: 'season-1',
      name: 'Premier Division',
      position: 1,
      teams: [
        { id: 't1', division_id: 'div-a', name: 'Aces', position: 1, number: 1, venue_id: 'v1' },
        { id: 't2', division_id: 'div-a', name: 'Bullseyes', position: 2, number: 2, venue_id: 'v1' },
      ],
    },
  ],
  venues: [{ id: 'v1', season_id: 'season-1', name: 'The Anchor', board_capacity: 4 }],
  calendar_events: [],
}

beforeEach(() => {
  localStorage.clear()
})

describe('usePosterEditor', () => {
  it('builds a default layout with content when no layout has been saved', () => {
    const { result } = renderHook(() => usePosterEditor(season))
    expect(result.current.layout.elements.length).toBeGreaterThan(0)
    expect(result.current.selectedId).toBeNull()
  })

  it('moving an element changes its position, and undo/redo travel between the two states', () => {
    const { result } = renderHook(() => usePosterEditor(season))
    const division = result.current.layout.elements.find((element) => element.type === 'division')!
    const originalRect = division.rect

    act(() => {
      result.current.moveOrResize(division.id, { ...originalRect, x: originalRect.x + 30 })
    })
    expect(result.current.layout.elements.find((element) => element.id === division.id)!.rect.x).toBe(
      originalRect.x + 30,
    )
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())
    expect(result.current.layout.elements.find((element) => element.id === division.id)!.rect).toEqual(originalRect)
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.redo())
    expect(result.current.layout.elements.find((element) => element.id === division.id)!.rect.x).toBe(
      originalRect.x + 30,
    )
  })

  it('resizing an element changes its dimensions', () => {
    const { result } = renderHook(() => usePosterEditor(season))
    const rules = result.current.layout.elements.find((element) => element.type === 'rules')!
    act(() => {
      result.current.moveOrResize(rules.id, { ...rules.rect, width: rules.rect.width + 10, height: 60 })
    })
    const updated = result.current.layout.elements.find((element) => element.id === rules.id)!
    expect(updated.rect.width).toBe(rules.rect.width + 10)
    expect(updated.rect.height).toBe(60)
  })

  it('resets a single selected section back to its default without affecting others', () => {
    const { result } = renderHook(() => usePosterEditor(season))
    const division = result.current.layout.elements.find((element) => element.type === 'division')!
    const originalRect = division.rect
    const rules = result.current.layout.elements.find((element) => element.type === 'rules')!

    act(() => {
      result.current.moveOrResize(division.id, { ...originalRect, x: originalRect.x + 50 })
      result.current.updateElement(rules.id, { fontSize: 4 })
    })

    act(() => result.current.resetElement(division.id))

    expect(result.current.layout.elements.find((element) => element.id === division.id)!.rect).toEqual(originalRect)
    // Resetting one section must not touch an unrelated section's edits.
    expect((result.current.layout.elements.find((element) => element.id === rules.id) as { fontSize: number }).fontSize).toBe(4)
  })

  it('resets the entire poster, and that reset is itself undoable', () => {
    const { result } = renderHook(() => usePosterEditor(season))
    act(() => result.current.setGlobalStyle({ primaryColor: '#ff00ff' }))
    expect(result.current.layout.globalStyle.primaryColor).toBe('#ff00ff')

    act(() => result.current.resetAll())
    expect(result.current.layout.globalStyle.primaryColor).not.toBe('#ff00ff')

    act(() => result.current.undo())
    expect(result.current.layout.globalStyle.primaryColor).toBe('#ff00ff')
  })

  it('cycles through overlapping elements on repeated selection at the same point', () => {
    const { result } = renderHook(() => usePosterEditor(season))
    const header = result.current.layout.elements.find((element) => element.type === 'header')!
    const logo = result.current.layout.elements.find((element) => element.type === 'logo' && element.role === 'league')!
    // The default layout places the league logo inside the header band, so they overlap.
    const point = { x: logo.rect.x + 1, y: logo.rect.y + 1 }
    expect(point.x).toBeGreaterThanOrEqual(header.rect.x)
    expect(point.x).toBeLessThanOrEqual(header.rect.x + header.rect.width)

    act(() => result.current.selectAtPoint(point))
    const first = result.current.selectedId
    act(() => result.current.selectAtPoint(point))
    const second = result.current.selectedId

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
    expect([header.id, logo.id]).toContain(first)
    expect([header.id, logo.id]).toContain(second)
  })

  it('deletes a removable element but refuses to delete a required section', () => {
    const { result } = renderHook(() => usePosterEditor(season))
    const rules = result.current.layout.elements.find((element) => element.type === 'rules')!
    act(() => result.current.select(rules.id))
    act(() => result.current.deleteSelected())
    expect(result.current.layout.elements.some((element) => element.id === rules.id)).toBe(true)

    act(() => {
      result.current.addElement({
        id: 'image-1',
        type: 'image',
        name: 'Image',
        rect: { x: 0, y: 0, width: 20, height: 20 },
        visible: true,
        removable: true,
        src: null,
        aspectLocked: true,
        style: {},
      })
      result.current.select('image-1')
    })
    act(() => result.current.deleteSelected())
    expect(result.current.layout.elements.some((element) => element.id === 'image-1')).toBe(false)
  })

  it('persists the layout to localStorage and restores it on the next mount for the same season', () => {
    const { result, unmount } = renderHook(() => usePosterEditor(season))
    const division = result.current.layout.elements.find((element) => element.type === 'division')!
    act(() => {
      result.current.moveOrResize(division.id, { x: 5, y: 6, width: 40, height: 40 })
    })
    unmount()

    const { result: reloaded } = renderHook(() => usePosterEditor(season))
    expect(reloaded.current.layout.elements.find((element) => element.id === division.id)!.rect).toEqual({
      x: 5,
      y: 6,
      width: 40,
      height: 40,
    })
  })
})
