import { describe, expect, it } from 'vitest'
import { clampRect, computeSnap, hitTestOrder, mmToPx, pxToMm } from './geometry'

describe('mm/px conversion', () => {
  it('round-trips through mmToPx and pxToMm at a given zoom', () => {
    const px = mmToPx(50, 1.5)
    expect(pxToMm(px, 1.5)).toBeCloseTo(50, 5)
  })
})

describe('computeSnap', () => {
  const pageWidth = 297
  const pageHeight = 420

  it('snaps a rect near the page centre onto the exact centre', () => {
    // An odd width and a 0.3mm offset keep both edges far from any 5mm grid line,
    // so the page-centre target is unambiguously the closest candidate.
    const width = 41
    const rect = { x: pageWidth / 2 - width / 2 + 0.3, y: 100, width, height: 20 }
    const snapped = computeSnap(rect, [], pageWidth, pageHeight)
    expect(snapped.x).toBeCloseTo(pageWidth / 2 - width / 2, 5)
    expect(snapped.guideX).toBeCloseTo(pageWidth / 2, 5)
  })

  it('snaps to a nearby element edge', () => {
    const other = { x: 50, y: 50, width: 30, height: 30 }
    const rect = { x: 81, y: 200, width: 20, height: 20 }
    const snapped = computeSnap(rect, [other], pageWidth, pageHeight)
    expect(snapped.x).toBeCloseTo(80, 5)
  })

  it('does not snap when nothing is within the threshold', () => {
    const rect = { x: 123.4, y: 156.7, width: 20, height: 20 }
    const snapped = computeSnap(rect, [], pageWidth, pageHeight, 0.5)
    expect(snapped.guideX).toBeNull()
    expect(snapped.x).toBe(123.4)
  })
})

describe('hitTestOrder', () => {
  const elements = [
    { id: 'back', rect: { x: 0, y: 0, width: 100, height: 100 }, visible: true },
    { id: 'front', rect: { x: 10, y: 10, width: 50, height: 50 }, visible: true },
    { id: 'hidden', rect: { x: 0, y: 0, width: 100, height: 100 }, visible: false },
  ]

  it('returns overlapping elements topmost-first, skipping hidden ones', () => {
    expect(hitTestOrder(elements, { x: 20, y: 20 })).toEqual(['front', 'back'])
  })

  it('returns an empty array when nothing is under the point', () => {
    expect(hitTestOrder(elements, { x: 200, y: 200 })).toEqual([])
  })
})

describe('clampRect', () => {
  it('keeps a rect within the page bounds', () => {
    const clamped = clampRect({ x: -10, y: 400, width: 50, height: 50 }, 297, 420)
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBe(370)
  })

  it('enforces a minimum size', () => {
    const clamped = clampRect({ x: 10, y: 10, width: 1, height: 1 }, 297, 420)
    expect(clamped.width).toBe(5)
    expect(clamped.height).toBe(5)
  })
})
