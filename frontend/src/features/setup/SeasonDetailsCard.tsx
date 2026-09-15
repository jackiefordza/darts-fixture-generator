import { useSeason } from '../../context/SeasonContext'
import { useAction } from '../../hooks/useAction'
import { updateSeason } from '../../api/seasons'
import { SeasonForm, type SeasonFormValues } from '../seasons/SeasonForm'

export function SeasonDetailsCard() {
  const { season, refetch } = useSeason()
  const update = useAction((values: SeasonFormValues) => updateSeason(season.id, values))

  async function handleSubmit(values: SeasonFormValues) {
    const result = await update.run(values)
    if (result) refetch()
  }

  return (
    <section className="card">
      <h2>Season details</h2>
      <SeasonForm initial={season} submitLabel="Save details" busy={update.loading} error={update.error} onSubmit={handleSubmit} />
    </section>
  )
}
