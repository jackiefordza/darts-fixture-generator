import type { CalendarEvent } from '../../api/types'
import type { CompetitionEntry } from './posterTypes'

export interface MergedCompetitionItem {
  id: string
  source: 'calendar' | 'poster'
  calendarEventId?: string
  title: string
  detail?: string
  visible: boolean
  order: number
}

/**
 * Merges the season's calendar events flagged `appears_on_poster` with poster-only
 * entries into one ordered list. A calendar event's title/dates always come live
 * from the season - the poster layout only ever overlays *visibility* and *order*
 * for it (materialised lazily the first time a user touches it in the panel).
 */
export function mergeCompetitions(calendarEvents: CalendarEvent[], entries: CompetitionEntry[]): MergedCompetitionItem[] {
  const overlays = new Map(
    entries.filter((entry) => entry.source === 'calendar' && entry.calendarEventId).map((entry) => [entry.calendarEventId as string, entry]),
  )
  const eligible = calendarEvents.filter((event) => event.appears_on_poster)

  const calendarItems: MergedCompetitionItem[] = eligible.map((event, index) => {
    const overlay = overlays.get(event.id)
    return {
      id: overlay?.id ?? `calendar-${event.id}`,
      source: 'calendar',
      calendarEventId: event.id,
      title: event.name,
      detail:
        event.end_date && event.end_date !== event.start_date
          ? `${event.start_date} to ${event.end_date}`
          : event.start_date,
      visible: overlay?.visible ?? true,
      order: overlay?.order ?? 1000 + index,
    }
  })

  const posterItems: MergedCompetitionItem[] = entries
    .filter((entry) => entry.source === 'poster')
    .map((entry) => ({
      id: entry.id,
      source: 'poster' as const,
      title: entry.title ?? '',
      detail: entry.detail,
      visible: entry.visible,
      order: entry.order,
    }))

  return [...calendarItems, ...posterItems].sort((a, b) => a.order - b.order)
}
