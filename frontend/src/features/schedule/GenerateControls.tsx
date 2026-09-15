import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAction } from '../../hooks/useAction'
import { generateSchedule, regenerateSchedule } from '../../api/fixtures'
import type { GenerationResult } from '../../api/types'

function ResultSummary({ result, onDismiss }: { result: GenerationResult; onDismiss: () => void }) {
  return (
    <div className={`card result-panel ${result.success ? 'result-success' : 'result-failure'}`}>
      <div className="result-panel-header">
        <StatusBadge tone={result.success ? 'success' : 'danger'}>
          {result.success ? 'Generation succeeded' : 'Generation failed'}
        </StatusBadge>
        <button type="button" className="modal-close" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      </div>
      <p className="muted">Seed: {result.seed}</p>
      {result.statistics && (
        <ul className="result-stats">
          <li>{result.statistics.fixture_count} fixtures</li>
          <li>{result.statistics.weeks_used} weeks used</li>
          <li>{result.statistics.pairing_attempts} pairing attempt(s)</li>
        </ul>
      )}
      {!result.validation.is_valid && (
        <div className="inline-error">
          <p>Validation issues:</p>
          <ul>
            {result.validation.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
      {result.diagnostics.length > 0 && (
        <div className="result-diagnostics">
          <p>Diagnostics:</p>
          <ul>
            {result.diagnostics.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function GenerateControls({
  seasonId,
  hasFixtures,
  onComplete,
}: {
  seasonId: string
  hasFixtures: boolean
  onComplete: () => void
}) {
  const [confirmingGenerate, setConfirmingGenerate] = useState(false)
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false)
  const [seedInput, setSeedInput] = useState('')
  const [result, setResult] = useState<GenerationResult | null>(null)

  const generate = useAction(() => generateSchedule(seasonId, seedInput ? Number(seedInput) : undefined))
  const regenerate = useAction(() => regenerateSchedule(seasonId, seedInput ? Number(seedInput) : undefined))

  async function handleGenerate() {
    const outcome = await generate.run()
    if (outcome) {
      setResult(outcome)
      setConfirmingGenerate(false)
      onComplete()
    }
  }

  async function handleRegenerate() {
    const outcome = await regenerate.run()
    if (outcome) {
      setResult(outcome)
      setConfirmingRegenerate(false)
      onComplete()
    }
  }

  return (
    <div className="generate-controls">
      <div className="generate-buttons">
        <Button variant="primary" onClick={() => setConfirmingGenerate(true)}>
          {hasFixtures ? 'Regenerate entire schedule' : 'Generate schedule'}
        </Button>
        {hasFixtures && (
          <Button variant="secondary" onClick={() => setConfirmingRegenerate(true)}>
            Regenerate unlocked fixtures
          </Button>
        )}
      </div>

      {result && <ResultSummary result={result} onDismiss={() => setResult(null)} />}

      {confirmingGenerate && (
        <ConfirmDialog
          title={hasFixtures ? 'Replace the entire schedule' : 'Generate the complete schedule'}
          description={
            hasFixtures
              ? 'This regenerates every fixture across all divisions from scratch and will fail if any fixture has already been manually locked. This cannot be undone.'
              : 'This creates the complete fixture schedule across all divisions using the configured divisions, teams, venues and calendar.'
          }
          confirmLabel={hasFixtures ? 'Replace schedule' : 'Generate schedule'}
          variant="danger"
          busy={generate.loading}
          error={generate.error}
          onConfirm={handleGenerate}
          onCancel={() => setConfirmingGenerate(false)}
        />
      )}

      {confirmingRegenerate && (
        <ConfirmDialog
          title="Regenerate unlocked fixtures"
          description="Locked and manually moved fixtures are preserved exactly as they are. Only the remaining, still-unlocked fixtures will be recomputed - this can change their dates, opponents' orientation, or venues."
          confirmLabel="Regenerate unlocked"
          variant="danger"
          busy={regenerate.loading}
          error={regenerate.error}
          onConfirm={handleRegenerate}
          onCancel={() => setConfirmingRegenerate(false)}
        />
      )}

      <label className="field seed-field">
        <span>Seed (optional)</span>
        <input
          type="number"
          placeholder="Random"
          value={seedInput}
          onChange={(event) => setSeedInput(event.target.value)}
        />
        <small>Reuse a seed to reproduce a previous result.</small>
      </label>
    </div>
  )
}
