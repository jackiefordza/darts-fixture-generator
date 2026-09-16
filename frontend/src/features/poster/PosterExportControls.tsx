import { Button } from '../../components/ui/Button'
import { InlineError } from '../../components/ui/InlineError'
import { useAction } from '../../hooks/useAction'
import type { Fixture, SeasonDetail } from '../../api/types'
import type { PosterLayout } from './posterTypes'

/**
 * jsPDF and html-to-image are only needed by the poster editor's two export buttons, yet
 * jsPDF alone adds ~135KB gzip to whatever bundle it's part of. Every other route (schedule,
 * calendar, setup, dashboard) would otherwise pay that cost on first load for a feature they
 * never touch, so this module - and its dependencies - are fetched on demand, the first time
 * an export is actually requested, rather than imported at the top of the module graph.
 */
async function loadExporters() {
  return import('./posterExport')
}

function posterFilename(season: SeasonDetail, extension: string): string {
  const slug = `${season.league_name}-${season.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'poster'}.${extension}`
}

/**
 * The only poster-editor controls this phase adds. Exporting reads whatever `layout`/
 * `fixtures` the caller currently has in memory - it is a snapshot of the poster/schedule
 * at the moment the button is clicked, not a separate "published" state.
 */
export function PosterExportControls({
  layout,
  season,
  fixtures,
}: {
  layout: PosterLayout
  season: SeasonDetail
  fixtures: Fixture[]
}) {
  const exportPdf = useAction(async () => {
    const { exportPosterPdf } = await loadExporters()
    return exportPosterPdf(layout, season, fixtures, posterFilename(season, 'pdf'))
  })
  const exportPng = useAction(async () => {
    const { exportPosterPng } = await loadExporters()
    return exportPosterPng(layout, season, fixtures, posterFilename(season, 'png'))
  })
  const busy = exportPdf.loading || exportPng.loading

  return (
    <div className="poster-toolbar-group poster-export-controls">
      <div className="poster-export-buttons">
        <Button variant="secondary" busy={exportPdf.loading} disabled={busy && !exportPdf.loading} onClick={() => exportPdf.run()}>
          Export PDF
        </Button>
        <Button variant="secondary" busy={exportPng.loading} disabled={busy && !exportPng.loading} onClick={() => exportPng.run()}>
          Export PNG
        </Button>
      </div>
      <InlineError error={exportPdf.error ?? exportPng.error} />
    </div>
  )
}
