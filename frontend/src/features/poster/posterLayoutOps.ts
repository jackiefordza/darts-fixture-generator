import type { GlobalStyle, PosterElement, PosterLayout, Rect } from './posterTypes'

export function findElement(layout: PosterLayout, id: string): PosterElement | undefined {
  return layout.elements.find((element) => element.id === id)
}

export function updateElement<T extends PosterElement>(
  layout: PosterLayout,
  id: string,
  patch: Partial<T>,
): PosterLayout {
  return {
    ...layout,
    elements: layout.elements.map((element) =>
      element.id === id ? ({ ...element, ...patch } as PosterElement) : element,
    ),
  }
}

export function addElement(layout: PosterLayout, element: PosterElement): PosterLayout {
  return { ...layout, elements: [...layout.elements, element] }
}

export function removeElement(layout: PosterLayout, id: string): PosterLayout {
  return { ...layout, elements: layout.elements.filter((element) => element.id !== id) }
}

export function replaceElement(layout: PosterLayout, id: string, replacement: PosterElement): PosterLayout {
  return {
    ...layout,
    elements: layout.elements.map((element) => (element.id === id ? replacement : element)),
  }
}

export function setGlobalStyle(layout: PosterLayout, patch: Partial<GlobalStyle>): PosterLayout {
  return { ...layout, globalStyle: { ...layout.globalStyle, ...patch } }
}

/**
 * Moving/resizing the divisions container carries its division rows and their
 * sponsor logos along with it, proportionally - so a division a user has already
 * nudged independently stays in the same relative place within the group instead
 * of resetting. This is the "one group that still allows internal adjustment"
 * behaviour called for in the design brief, without a general parent/child layout
 * engine.
 */
export function transformDivisionsGroup(layout: PosterLayout, containerId: string, newRect: Rect): PosterLayout {
  const container = findElement(layout, containerId)
  if (!container || container.type !== 'divisions') return layout
  const old = container.rect
  const sx = old.width === 0 ? 1 : newRect.width / old.width
  const sy = old.height === 0 ? 1 : newRect.height / old.height

  return {
    ...layout,
    elements: layout.elements.map((element) => {
      if (element.id === containerId) return { ...element, rect: newRect }
      const isChild =
        element.type === 'division' || (element.type === 'logo' && element.role === 'division-sponsor')
      if (!isChild) return element
      const rect: Rect = {
        x: newRect.x + (element.rect.x - old.x) * sx,
        y: newRect.y + (element.rect.y - old.y) * sy,
        width: element.rect.width * sx,
        height: element.rect.height * sy,
      }
      return { ...element, rect }
    }),
  }
}
