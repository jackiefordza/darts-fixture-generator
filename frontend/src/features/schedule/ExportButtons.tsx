import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { InlineError } from '../../components/ui/InlineError'
import { useAction } from '../../hooks/useAction'
import { downloadDivisionCsv, downloadSeasonCsv } from '../../api/fixtures'
import type { Division } from '../../api/types'

export function ExportButtons({ seasonId, divisions }: { seasonId: string; divisions: Division[] }) {
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? '')
  const exportSeason = useAction(() => downloadSeasonCsv(seasonId))
  const exportDivision = useAction((id: string) => downloadDivisionCsv(seasonId, id))

  return (
    <div className="export-controls">
      <Button variant="secondary" busy={exportSeason.loading} onClick={() => exportSeason.run()}>
        Export complete season CSV
      </Button>
      <InlineError error={exportSeason.error} />

      {divisions.length > 0 && (
        <div className="export-division">
          <select value={divisionId} onChange={(event) => setDivisionId(event.target.value)} aria-label="Division to export">
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            busy={exportDivision.loading}
            onClick={() => exportDivision.run(divisionId)}
            disabled={!divisionId}
          >
            Export division CSV
          </Button>
        </div>
      )}
      <InlineError error={exportDivision.error} />
    </div>
  )
}
