import { useNavigate } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { listSeasons } from '../../api/seasons'
import { rememberSeasonId } from '../../context/SeasonContext'

export function SeasonSwitcher({ currentSeasonId }: { currentSeasonId: string }) {
  const navigate = useNavigate()
  const { data: seasons } = useFetch(listSeasons, [])

  return (
    <div className="season-switcher">
      <select
        aria-label="Switch season"
        value={currentSeasonId}
        onChange={(event) => {
          const seasonId = event.target.value
          if (seasonId === 'new') {
            navigate('/seasons')
            return
          }
          rememberSeasonId(seasonId)
          navigate(`/seasons/${seasonId}`)
        }}
      >
        {(seasons ?? []).map((season) => (
          <option key={season.id} value={season.id}>
            {season.league_name} — {season.name}
          </option>
        ))}
        <option value="new">+ Manage seasons…</option>
      </select>
    </div>
  )
}
