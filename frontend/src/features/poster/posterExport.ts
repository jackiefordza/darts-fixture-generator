import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { Fixture, SeasonDetail } from '../../api/types'
import { PosterExportView } from './PosterExportView'
import { mmToPx } from './geometry'
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, type PosterLayout } from './posterTypes'

/**
 * Target print resolution for both export formats. `96` is the fixed CSS px-per-inch
 * reference that the whole poster's mm-to-px conversion is built on (geometry.ts's
 * PX_PER_MM = 96 / 25.4), so this ratio - never the interactive editor's `zoom` state -
 * is what actually controls exported pixel density. Rendering the same mm-based layout
 * at this fixed zoom instead of at editor zoom is what makes the export dimensions and
 * content independent of on-screen zoom, window size, or screen resolution.
 */
export const EXPORT_DPI = 300
export const EXPORT_ZOOM = EXPORT_DPI / 96

export function exportPixelSize(layout: Pick<PosterLayout, 'pageWidth' | 'pageHeight'>): {
  width: number
  height: number
} {
  return {
    width: Math.round(mmToPx(layout.pageWidth, EXPORT_ZOOM)),
    height: Math.round(mmToPx(layout.pageHeight, EXPORT_ZOOM)),
  }
}

function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  ).then(() => undefined)
}

/**
 * Renders the current poster layout at true print resolution into an off-screen canvas.
 * This is a snapshot of `layout`/`season`/`fixtures` as passed in at call time - nothing
 * here fetches fresh data or re-validates the schedule; callers only export once the
 * season's schedule is already known-valid (see PosterEditorPage, which gates the whole
 * editor - and therefore every export entry point - on the backend validator's result).
 *
 * Uses html2canvas rather than an SVG-<foreignObject>-based capture (the more common
 * choice, e.g. html-to-image): that approach loads a serialised SVG into an <img> and
 * draws it to a canvas, and Chromium silently rasterises <foreignObject> HTML content as
 * blank when an SVG reaches a canvas through the <img> element's image-decode pipeline
 * (confirmed directly - the exact SVG produced from this poster's DOM, containing real
 * "Division 1"/"Team 1"/fixture text, draws as a blank white canvas via that path, in
 * this browser/Chromium version). html2canvas instead walks the live DOM and reconstructs
 * each element with direct Canvas 2D drawing calls, so it never goes through that image
 * pipeline and reliably captures the poster's real content.
 */
export async function renderPosterCanvas(
  layout: PosterLayout,
  season: SeasonDetail,
  fixtures: Fixture[],
): Promise<HTMLCanvasElement> {
  const { width: targetWidth, height: targetHeight } = exportPixelSize(layout)
  const naturalWidth = Math.round(mmToPx(layout.pageWidth, 1))
  const naturalHeight = Math.round(mmToPx(layout.pageHeight, 1))

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-100000px'
  container.style.width = `${naturalWidth}px`
  container.style.height = `${naturalHeight}px`
  container.style.overflow = 'hidden'
  container.setAttribute('aria-hidden', 'true')
  document.body.appendChild(container)

  const root = createRoot(container)
  try {
    // flushSync forces React to render and commit synchronously, so the container holds
    // the complete DOM the instant this call returns - no heuristic frame-count wait needed.
    flushSync(() => {
      root.render(createElement(PosterExportView, { layout, season, fixtures, zoom: 1 }))
    })
    await waitForImages(container)

    const rendered = await html2canvas(container, {
      width: naturalWidth,
      height: naturalHeight,
      scale: EXPORT_ZOOM,
      backgroundColor: layout.globalStyle.backgroundColor,
      useCORS: true,
      logging: false,
    })

    // html2canvas's own width*scale rounding can land a pixel or two off the documented
    // target (both derived from the same mm values, but independently rounded); a cheap
    // canvas-to-canvas draw locks the final output to the exact size TEST 2 checks for.
    if (rendered.width === targetWidth && rendered.height === targetHeight) {
      return rendered
    }
    const exact = document.createElement('canvas')
    exact.width = targetWidth
    exact.height = targetHeight
    const ctx = exact.getContext('2d')
    if (!ctx) return rendered
    ctx.drawImage(rendered, 0, 0, targetWidth, targetHeight)
    return exact
  } finally {
    root.unmount()
    container.remove()
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not render the poster image'))),
      'image/png',
    )
  })
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function exportPosterPng(
  layout: PosterLayout,
  season: SeasonDetail,
  fixtures: Fixture[],
  filename: string,
): Promise<void> {
  const canvas = await renderPosterCanvas(layout, season, fixtures)
  const blob = await canvasToPngBlob(canvas)
  downloadBlob(blob, filename)
}

/**
 * PNG (not JPEG) is embedded into the PDF deliberately: the poster is mostly text, thin
 * borders and a fixture-grid table, and JPEG's lossy compression visibly softens/ringing-
 * artefacts sharp edges like those. A true A3 page size ([297, 420] in mm, not the
 * built-in "a3" format constant which jsPDF derives via a pt roundtrip and does not land
 * on exactly 297x420) keeps the PDF's page dimensions exact.
 *
 * `addImage`'s `compression: 'SLOW'` is essential, not cosmetic: jsPDF otherwise embeds the
 * image as a *raw*, uncompressed bitmap (3508x4961 RGB @ ~52MB) regardless of the source
 * PNG already being compressed - 'SLOW' runs it through zlib (deflate level 9) before
 * embedding, which a mostly-flat-colour/text poster compresses extremely well (in testing,
 * a real four-division poster went from a ~52MB uncompressed PDF to under 1MB), while
 * staying fully lossless.
 */
export async function exportPosterPdf(
  layout: PosterLayout,
  season: SeasonDetail,
  fixtures: Fixture[],
  filename: string,
): Promise<void> {
  const canvas = await renderPosterCanvas(layout, season, fixtures)
  const imageData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PAGE_WIDTH_MM, PAGE_HEIGHT_MM], compress: true })
  pdf.addImage(imageData, 'PNG', 0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM, undefined, 'SLOW')
  pdf.save(filename)
}
