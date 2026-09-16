import type { Fixture, SeasonDetail } from '../../api/types'
import { PosterElementView } from './PosterElementView'
import { mmToPx } from './geometry'
import type { PosterLayout } from './posterTypes'

/**
 * Renders the poster exactly as the live editor's canvas would, minus every editor-only
 * affordance (drag handles, selection outline, snap guides, pointer handlers, the
 * floating-page drop shadow). It reuses the same per-element renderer (PosterElementView)
 * and the same mm-to-px conversion as PosterCanvas, so a print/export capture of this
 * component can never visually diverge from what the user sees in the editor - the only
 * difference is the `zoom` passed in, which the caller sets to the print resolution
 * instead of the interactive on-screen zoom.
 */
export function PosterExportView({
  layout,
  season,
  fixtures,
  zoom,
}: {
  layout: PosterLayout
  season: SeasonDetail
  fixtures: Fixture[]
  zoom: number
}) {
  return (
    <div
      data-testid="poster-export-page"
      style={{
        position: 'relative',
        width: mmToPx(layout.pageWidth, zoom),
        height: mmToPx(layout.pageHeight, zoom),
        background: layout.globalStyle.backgroundColor,
        fontFamily: layout.globalStyle.fontFamily,
        color: layout.globalStyle.textColor,
        overflow: 'hidden',
      }}
    >
      {layout.elements
        .filter((element) => element.visible)
        .map((element) => (
          <div
            key={element.id}
            data-testid={`poster-export-element-${element.id}`}
            data-element-name={element.name}
            style={{
              position: 'absolute',
              left: mmToPx(element.rect.x, zoom),
              top: mmToPx(element.rect.y, zoom),
              width: mmToPx(element.rect.width, zoom),
              height: mmToPx(element.rect.height, zoom),
            }}
          >
            <PosterElementView
              element={element}
              season={season}
              fixtures={fixtures}
              globalStyle={layout.globalStyle}
              zoom={zoom}
            />
          </div>
        ))}
    </div>
  )
}
