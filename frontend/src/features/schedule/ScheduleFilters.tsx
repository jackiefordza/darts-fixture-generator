import type { Division } from '../../api/types'

export interface ScheduleFilterState {
  divisionId: string
  week: string
  date: string
}

export function ScheduleFilters({
  divisions,
  weeks,
  filters,
  onChange,
}: {
  divisions: Division[]
  weeks: number[]
  filters: ScheduleFilterState
  onChange: (filters: ScheduleFilterState) => void
}) {
  return (
    <div className="schedule-filters">
      <label className="field">
        <span>Division</span>
        <select
          value={filters.divisionId}
          onChange={(event) => onChange({ ...filters, divisionId: event.target.value })}
        >
          <option value="">All divisions</option>
          {divisions.map((division) => (
            <option key={division.id} value={division.id}>
              {division.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Week</span>
        <select value={filters.week} onChange={(event) => onChange({ ...filters, week: event.target.value })}>
          <option value="">All weeks</option>
          {weeks.map((week) => (
            <option key={week} value={week}>
              Week {week}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Date</span>
        <input
          type="date"
          value={filters.date}
          onChange={(event) => onChange({ ...filters, date: event.target.value })}
        />
      </label>
      {(filters.divisionId || filters.week || filters.date) && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onChange({ divisionId: '', week: '', date: '' })}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
