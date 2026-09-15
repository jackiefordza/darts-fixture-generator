import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { SeasonDetail, Fixture } from '../../api/types'
import { PosterElementView } from './PosterElementView'
import { clampRect, computeSnap, mmToPx, pxToMm } from './geometry'
import type { PosterEditor } from './usePosterEditor'
import type { PosterElement, Rect } from './posterTypes'

const HANDLES = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'] as const
type HandleId = (typeof HANDLES)[number]

function applyHandleDelta(start: Rect, handle: HandleId, dx: number, dy: number): Rect {
  let { x, y, width, height } = start
  if (handle.includes('n')) {
    y += dy
    height -= dy
  }
  if (handle.includes('s')) height += dy
  if (handle.includes('w')) {
    x += dx
    width -= dx
  }
  if (handle.includes('e')) width += dx
  return { x, y, width, height }
}

function resizeRect(start: Rect, handle: HandleId, dx: number, dy: number, aspectLocked: boolean): Rect {
  if (!aspectLocked || handle.length !== 2) return applyHandleDelta(start, handle, dx, dy)
  const ratio = start.width / start.height
  const widthDelta = handle.includes('w') ? -dx : dx
  const newWidth = Math.max(5, start.width + widthDelta)
  const newHeight = newWidth / ratio
  const heightDelta = handle.includes('n') ? start.height - newHeight : newHeight - start.height
  return applyHandleDelta(start, handle, dx, heightDelta)
}

interface DragState {
  id: string
  kind: 'move' | 'resize'
  handle?: HandleId
  startClientX: number
  startClientY: number
  startRect: Rect
  rect: Rect
}

export interface PosterCanvasProps {
  editor: PosterEditor
  season: SeasonDetail
  fixtures: Fixture[]
}

export function PosterCanvas({ editor, season, fixtures }: PosterCanvasProps) {
  const { layout, zoom, setZoom, selectedId, preview, moveOrResize, selectAtPoint } = editor
  const pageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })

  /**
   * Ctrl/Cmd+wheel is how both a mouse (explicit zoom shortcut) and a trackpad (browsers
   * report pinch-to-zoom as a wheel event with ctrlKey set, regardless of the real key
   * state) request zoom here - a plain wheel/two-finger scroll is left alone so it keeps
   * panning natively via the container's scroll. Registered as a native, non-passive
   * listener because React's onWheel is passive by default and can't preventDefault
   * (which is required here to stop the browser page from zooming instead).
   */
  useEffect(() => {
    const scrollEl = scrollRef.current
    const page = pageRef.current
    if (!scrollEl || !page) return
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey) return
      event.preventDefault()
      const pageRect = page!.getBoundingClientRect()
      const pointerXPx = event.clientX - pageRect.left
      const pointerYPx = event.clientY - pageRect.top
      const anchorMmX = pxToMm(pointerXPx, zoom)
      const anchorMmY = pxToMm(pointerYPx, zoom)
      const factor = Math.exp(-event.deltaY * 0.01)
      const nextZoom = Math.min(3, Math.max(0.15, zoom * factor))
      setZoom(nextZoom)
      scrollEl!.scrollLeft += mmToPx(anchorMmX, nextZoom) - pointerXPx
      scrollEl!.scrollTop += mmToPx(anchorMmY, nextZoom) - pointerYPx
    }
    scrollEl.addEventListener('wheel', handleWheel, { passive: false })
    return () => scrollEl.removeEventListener('wheel', handleWheel)
  }, [zoom, setZoom])

  const clientToMm = useCallback(
    (clientX: number, clientY: number) => {
      const page = pageRef.current
      if (!page) return { x: 0, y: 0 }
      const rect = page.getBoundingClientRect()
      return { x: pxToMm(clientX - rect.left, zoom), y: pxToMm(clientY - rect.top, zoom) }
    },
    [zoom],
  )

  const beginMove = useCallback(
    (event: ReactPointerEvent, element: PosterElement) => {
      if (preview) return
      event.stopPropagation()
      selectAtPoint(clientToMm(event.clientX, event.clientY))
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      setDrag({
        id: element.id,
        kind: 'move',
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect: element.rect,
        rect: element.rect,
      })
    },
    [preview, selectAtPoint, clientToMm],
  )

  const beginResize = useCallback(
    (event: ReactPointerEvent, element: PosterElement, handle: HandleId) => {
      if (preview) return
      event.stopPropagation()
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      setDrag({
        id: element.id,
        kind: 'resize',
        handle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect: element.rect,
        rect: element.rect,
      })
    },
    [preview],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!drag) return
      const dxMm = pxToMm(event.clientX - drag.startClientX, zoom)
      const dyMm = pxToMm(event.clientY - drag.startClientY, zoom)
      const element = layout.elements.find((candidate) => candidate.id === drag.id)
      if (!element) return

      let candidate: Rect
      if (drag.kind === 'move') {
        candidate = { ...drag.startRect, x: drag.startRect.x + dxMm, y: drag.startRect.y + dyMm }
      } else {
        const aspectLocked = (element.type === 'logo' || element.type === 'image') && element.aspectLocked
        candidate = resizeRect(drag.startRect, drag.handle as HandleId, dxMm, dyMm, aspectLocked)
      }

      const others = layout.elements.filter((other) => other.id !== drag.id).map((other) => other.rect)
      const snapped = computeSnap(candidate, others, layout.pageWidth, layout.pageHeight)
      const finalRect = clampRect(
        drag.kind === 'move' ? { ...candidate, x: snapped.x, y: snapped.y } : candidate,
        layout.pageWidth,
        layout.pageHeight,
      )
      setGuides({ x: drag.kind === 'move' ? snapped.guideX : null, y: drag.kind === 'move' ? snapped.guideY : null })
      setDrag({ ...drag, rect: finalRect })
    },
    [drag, zoom, layout],
  )

  const onPointerUp = useCallback(() => {
    if (!drag) return
    moveOrResize(drag.id, drag.rect)
    setDrag(null)
    setGuides({ x: null, y: null })
  }, [drag, moveOrResize])

  const onBackgroundPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (preview) return
      if (event.target !== event.currentTarget) return
      selectAtPoint(clientToMm(event.clientX, event.clientY))
    },
    [preview, selectAtPoint, clientToMm],
  )

  const pageWidthPx = mmToPx(layout.pageWidth, zoom)
  const pageHeightPx = mmToPx(layout.pageHeight, zoom)

  return (
    <div className="poster-canvas-scroll" ref={scrollRef}>
      <div
        ref={pageRef}
        className="poster-page"
        data-testid="poster-page"
        style={{
          width: pageWidthPx,
          height: pageHeightPx,
          background: layout.globalStyle.backgroundColor,
          fontFamily: layout.globalStyle.fontFamily,
          color: layout.globalStyle.textColor,
        }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {layout.elements
          .filter((element) => element.visible)
          .map((element) => {
            const isDragging = drag?.id === element.id
            const rect = isDragging ? drag.rect : element.rect
            const isSelected = !preview && selectedId === element.id
            return (
              <div
                key={element.id}
                className={`poster-element poster-element-${element.type}${isSelected ? ' selected' : ''}`}
                data-testid={`poster-element-${element.id}`}
                data-element-name={element.name}
                style={{
                  position: 'absolute',
                  left: mmToPx(rect.x, zoom),
                  top: mmToPx(rect.y, zoom),
                  width: mmToPx(rect.width, zoom),
                  height: mmToPx(rect.height, zoom),
                }}
                onPointerDown={(event) => beginMove(event, element)}
              >
                <PosterElementView element={element} season={season} fixtures={fixtures} globalStyle={layout.globalStyle} zoom={zoom} />
                {isSelected && (
                  <>
                    {HANDLES.map((handle) => (
                      <span
                        key={handle}
                        className={`poster-handle poster-handle-${handle}`}
                        data-testid={`poster-handle-${handle}`}
                        onPointerDown={(event) => beginResize(event, element, handle)}
                      />
                    ))}
                  </>
                )}
              </div>
            )
          })}
        {guides.x !== null && (
          <div className="poster-guide poster-guide-x" style={{ left: mmToPx(guides.x, zoom) }} />
        )}
        {guides.y !== null && (
          <div className="poster-guide poster-guide-y" style={{ top: mmToPx(guides.y, zoom) }} />
        )}
      </div>
    </div>
  )
}
