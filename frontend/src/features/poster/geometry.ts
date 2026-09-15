import type { Rect } from './posterTypes'

/** CSS px per mm at 96dpi (96 / 25.4). Only used for on-screen rendering, never stored. */
export const PX_PER_MM = 96 / 25.4

export function mmToPx(mm: number, zoom: number): number {
  return mm * PX_PER_MM * zoom
}

export function pxToMm(px: number, zoom: number): number {
  return px / (PX_PER_MM * zoom)
}

export const SNAP_THRESHOLD_MM = 3
export const GRID_STEP_MM = 5

function rectEdgesX(r: Rect): number[] {
  return [r.x, r.x + r.width / 2, r.x + r.width]
}

function rectEdgesY(r: Rect): number[] {
  return [r.y, r.y + r.height / 2, r.y + r.height]
}

function gridLines(max: number, step: number): number[] {
  const lines: number[] = []
  for (let v = 0; v <= max; v += step) lines.push(v)
  return lines
}

interface AxisSnap {
  value: number
  guide: number | null
}

function bestSnapAxis(pos: number, size: number, targets: number[], threshold: number): AxisSnap {
  let best: { value: number; guide: number; dist: number } | null = null
  for (const offset of [0, size / 2, size]) {
    const edge = pos + offset
    for (const target of targets) {
      const dist = Math.abs(target - edge)
      if (dist <= threshold && (!best || dist < best.dist)) {
        best = { value: target - offset, guide: target, dist }
      }
    }
  }
  return best ? { value: best.value, guide: best.guide } : { value: pos, guide: null }
}

export interface SnapResult {
  x: number
  y: number
  guideX: number | null
  guideY: number | null
}

/**
 * Snaps a candidate rect's position against page edges, the page centre, other
 * elements' edges/centres, and a 5mm grid - whichever candidate is closest within
 * SNAP_THRESHOLD_MM wins independently on each axis. Intentionally simple: this is
 * "make it easy to line things up," not a professional vector alignment engine.
 */
export function computeSnap(
  rect: Rect,
  others: Rect[],
  pageWidth: number,
  pageHeight: number,
  threshold = SNAP_THRESHOLD_MM,
): SnapResult {
  const targetsX = [0, pageWidth / 2, pageWidth, ...others.flatMap(rectEdgesX), ...gridLines(pageWidth, GRID_STEP_MM)]
  const targetsY = [
    0,
    pageHeight / 2,
    pageHeight,
    ...others.flatMap(rectEdgesY),
    ...gridLines(pageHeight, GRID_STEP_MM),
  ]
  const snappedX = bestSnapAxis(rect.x, rect.width, targetsX, threshold)
  const snappedY = bestSnapAxis(rect.y, rect.height, targetsY, threshold)
  return { x: snappedX.value, y: snappedY.value, guideX: snappedX.guide, guideY: snappedY.guide }
}

export function pointInRect(point: { x: number; y: number }, rect: Rect): boolean {
  return (
    point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
  )
}

/** Returns element ids under `point`, topmost (last in z-order) first. */
export function hitTestOrder<T extends { id: string; rect: Rect; visible: boolean }>(
  elements: T[],
  point: { x: number; y: number },
): string[] {
  return elements
    .filter((element) => element.visible && pointInRect(point, element.rect))
    .map((element) => element.id)
    .reverse()
}

export function clampRect(rect: Rect, pageWidth: number, pageHeight: number): Rect {
  const width = Math.min(Math.max(rect.width, 5), pageWidth)
  const height = Math.min(Math.max(rect.height, 5), pageHeight)
  const x = Math.min(Math.max(rect.x, 0), pageWidth - width)
  const y = Math.min(Math.max(rect.y, 0), pageHeight - height)
  return { x, y, width, height }
}
