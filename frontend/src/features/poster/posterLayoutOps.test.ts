import { describe, expect, it } from 'vitest'
import {
  addElement,
  removeElement,
  setGlobalStyle,
  transformDivisionsGroup,
  updateElement,
} from './posterLayoutOps'
import { DEFAULT_GLOBAL_STYLE } from './defaultLayout'
import type { DivisionElement, DivisionsContainerElement, PosterLayout, RulesElement } from './posterTypes'

function makeLayout(elements: PosterLayout['elements']): PosterLayout {
  return { version: 1, pageWidth: 297, pageHeight: 420, globalStyle: DEFAULT_GLOBAL_STYLE, elements }
}

const container: DivisionsContainerElement = {
  id: 'divisions-1',
  type: 'divisions',
  name: 'Divisions',
  rect: { x: 10, y: 10, width: 100, height: 100 },
  visible: true,
  removable: false,
  style: {},
}

function divisionAt(id: string, x: number, y: number, width: number, height: number): DivisionElement {
  return { id, type: 'division', divisionId: `div-${id}`, name: id, rect: { x, y, width, height }, visible: true, removable: false, style: {} }
}

describe('updateElement', () => {
  it('shallow-merges a patch into only the matching element', () => {
    const rules: RulesElement = {
      id: 'rules-1',
      type: 'rules',
      name: 'Rules',
      rect: { x: 0, y: 0, width: 50, height: 50 },
      visible: true,
      removable: false,
      rules: [],
      columns: 2,
      fontSize: 2.6,
      style: {},
    }
    const layout = makeLayout([rules])
    const next = updateElement(layout, 'rules-1', { columns: 3 })
    expect((next.elements[0] as RulesElement).columns).toBe(3)
    expect(next.elements[0].rect).toEqual(rules.rect)
  })
})

describe('addElement / removeElement', () => {
  it('appends and removes elements by id without touching others', () => {
    const layout = makeLayout([container])
    const added = addElement(layout, divisionAt('a', 0, 0, 10, 10))
    expect(added.elements).toHaveLength(2)
    const removed = removeElement(added, 'divisions-1')
    expect(removed.elements.map((e) => e.id)).toEqual(['a'])
  })
})

describe('setGlobalStyle', () => {
  it('merges into the global style only', () => {
    const layout = makeLayout([])
    const next = setGlobalStyle(layout, { primaryColor: '#123456' })
    expect(next.globalStyle.primaryColor).toBe('#123456')
    expect(next.globalStyle.textColor).toBe(DEFAULT_GLOBAL_STYLE.textColor)
  })
})

describe('transformDivisionsGroup', () => {
  it('moves and proportionally resizes division rows and their sponsor logos with the container', () => {
    const rowA = divisionAt('a', 10, 10, 100, 25)
    const rowB = divisionAt('b', 10, 35, 100, 25)
    const sponsor = {
      id: 'sponsor-a',
      type: 'logo' as const,
      role: 'division-sponsor' as const,
      divisionId: 'div-a',
      name: 'Sponsor A',
      rect: { x: 90, y: 12, width: 15, height: 10 },
      visible: true,
      removable: false,
      src: null,
      aspectLocked: true,
      style: {},
    }
    const groupContainer: DivisionsContainerElement = { ...container, rect: { x: 10, y: 10, width: 100, height: 50 } }
    const layout = makeLayout([groupContainer, rowA, rowB, sponsor])

    // Double the container's width and move it: children should scale/translate with it.
    const next = transformDivisionsGroup(layout, 'divisions-1', { x: 20, y: 20, width: 200, height: 50 })

    const nextRowA = next.elements.find((e) => e.id === 'a')!
    expect(nextRowA.rect).toEqual({ x: 20, y: 20, width: 200, height: 25 })

    const nextSponsor = next.elements.find((e) => e.id === 'sponsor-a')!
    // sponsor was at x=90 (80 into the old 100-wide container) -> scaled by 2x -> 160 into the new container
    expect(nextSponsor.rect.x).toBeCloseTo(20 + 80 * 2, 5)
  })

  it('leaves elements that are not divisions or sponsor logos untouched', () => {
    const rules: RulesElement = {
      id: 'rules-1',
      type: 'rules',
      name: 'Rules',
      rect: { x: 200, y: 200, width: 50, height: 50 },
      visible: true,
      removable: false,
      rules: [],
      columns: 2,
      fontSize: 2.6,
      style: {},
    }
    const layout = makeLayout([container, rules])
    const next = transformDivisionsGroup(layout, 'divisions-1', { x: 0, y: 0, width: 50, height: 50 })
    expect(next.elements.find((e) => e.id === 'rules-1')!.rect).toEqual(rules.rect)
  })
})
