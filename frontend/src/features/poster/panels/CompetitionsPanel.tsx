import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { mergeCompetitions, type MergedCompetitionItem } from '../competitionsMerge'
import type { CompetitionEntry, CompetitionsElement, GlobalStyle } from '../posterTypes'
import type { SeasonDetail } from '../../../api/types'
import { StyleOverrideFields } from './StyleOverrideFields'

function toEntries(items: MergedCompetitionItem[]): CompetitionEntry[] {
  return items.map((item, index) =>
    item.source === 'calendar'
      ? { id: item.id, source: 'calendar', calendarEventId: item.calendarEventId, visible: item.visible, order: index }
      : { id: item.id, source: 'poster', title: item.title, detail: item.detail, visible: item.visible, order: index },
  )
}

export function CompetitionsPanel({
  element,
  season,
  globalStyle,
  onChange,
  onStyleChange,
  onReset,
  onToggleVisible,
}: {
  element: CompetitionsElement
  season: SeasonDetail
  globalStyle: GlobalStyle
  onChange: (patch: Partial<CompetitionsElement>) => void
  onStyleChange: (patch: CompetitionsElement['style']) => void
  onReset: () => void
  onToggleVisible: (visible: boolean) => void
}) {
  const merged = mergeCompetitions(season.calendar_events, element.entries)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDetail, setDraftDetail] = useState('')

  function persist(next: MergedCompetitionItem[]) {
    onChange({ entries: toEntries(next) })
  }

  function toggleItemVisible(id: string) {
    persist(merged.map((item) => (item.id === id ? { ...item, visible: !item.visible } : item)))
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= merged.length) return
    const next = [...merged]
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  function deleteItem(id: string) {
    persist(merged.filter((item) => item.id !== id))
  }

  function editItem(id: string, patch: Partial<MergedCompetitionItem>) {
    persist(merged.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function addEntry() {
    if (!draftTitle.trim()) return
    persist([
      ...merged,
      {
        id: crypto.randomUUID(),
        source: 'poster',
        title: draftTitle.trim(),
        detail: draftDetail.trim() || undefined,
        visible: true,
        order: merged.length,
      },
    ])
    setDraftTitle('')
    setDraftDetail('')
  }

  return (
    <div className="poster-panel">
      <h3>Competitions</h3>

      <label className="checkbox-field">
        <input type="checkbox" checked={element.visible} onChange={(event) => onToggleVisible(event.target.checked)} />
        <span>Show competitions section on the poster</span>
      </label>

      <p className="muted">
        Season calendar events flagged "appears on poster" show automatically. Add poster-only entries below for
        anything that isn't a scheduling event.
      </p>

      <ul className="poster-competitions-edit-list">
        {merged.map((item, index) => (
          <li key={item.id}>
            <div className="poster-competitions-edit-row">
              {item.source === 'poster' ? (
                <input
                  value={item.title}
                  onChange={(event) => editItem(item.id, { title: event.target.value })}
                  aria-label={`Competition ${index + 1} title`}
                />
              ) : (
                <span className="row-title">{item.title}</span>
              )}
              {item.source === 'calendar' && <StatusBadge tone="info">Calendar</StatusBadge>}
            </div>
            {item.source === 'poster' && (
              <input
                value={item.detail ?? ''}
                onChange={(event) => editItem(item.id, { detail: event.target.value })}
                placeholder="Optional detail (e.g. a date or venue)"
                aria-label={`Competition ${index + 1} detail`}
              />
            )}
            <div className="poster-rules-edit-actions">
              <label className="checkbox-field">
                <input type="checkbox" checked={item.visible} onChange={() => toggleItemVisible(item.id)} />
                <span>Visible</span>
              </label>
              <Button variant="ghost" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move competition ${index + 1} up`}>
                Up
              </Button>
              <Button variant="ghost" onClick={() => move(index, 1)} disabled={index === merged.length - 1} aria-label={`Move competition ${index + 1} down`}>
                Down
              </Button>
              {item.source === 'poster' && (
                <Button variant="ghost" onClick={() => deleteItem(item.id)} aria-label={`Delete competition ${index + 1}`}>
                  Delete
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="poster-add-competition">
        <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="New competition title" aria-label="New competition title" />
        <input value={draftDetail} onChange={(event) => setDraftDetail(event.target.value)} placeholder="Detail (optional)" aria-label="New competition detail" />
        <Button variant="secondary" onClick={addEntry} disabled={!draftTitle.trim()}>
          Add competition
        </Button>
      </div>

      <h4>Appearance</h4>
      <StyleOverrideFields style={element.style} global={globalStyle} onChange={(patch) => onStyleChange({ ...element.style, ...patch })} />

      <div className="form-actions">
        <Button variant="ghost" onClick={onReset}>
          Reset competitions
        </Button>
      </div>
    </div>
  )
}
