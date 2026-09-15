import type { DateFormatId } from './posterTypes'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const DATE_FORMAT_OPTIONS: { id: DateFormatId; label: string; example: string }[] = [
  { id: 'short', label: '14/10/26', example: '14/10/26' },
  { id: 'medium', label: '14 Oct 26', example: '14 Oct 26' },
  { id: 'long', label: '14 October 2026', example: '14 October 2026' },
]

/**
 * Formats an ISO (YYYY-MM-DD) date purely for display; it never changes the
 * underlying date stored on the fixture. Parses the string directly rather than
 * via `new Date(iso)` to avoid local-timezone shifting a date-only value.
 */
export function formatPosterDate(iso: string, format: DateFormatId): string {
  const [yearStr, monthStr, dayStr] = iso.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!year || !month || !day) return iso

  const dd = String(day).padStart(2, '0')
  const mm = String(month).padStart(2, '0')
  const yy = String(year).slice(-2)

  switch (format) {
    case 'short':
      return `${dd}/${mm}/${yy}`
    case 'medium':
      return `${day} ${MONTHS_SHORT[month - 1]} ${yy}`
    case 'long':
      return `${day} ${MONTHS_LONG[month - 1]} ${year}`
    default:
      return iso
  }
}
