import { describe, expect, it } from 'vitest'
import { formatPosterDate } from './dateFormat'

describe('formatPosterDate', () => {
  it('formats the short style as dd/mm/yy', () => {
    expect(formatPosterDate('2026-10-14', 'short')).toBe('14/10/26')
  })

  it('formats the medium style as "d Mon yy"', () => {
    expect(formatPosterDate('2026-10-14', 'medium')).toBe('14 Oct 26')
  })

  it('formats the long style as "d Month yyyy"', () => {
    expect(formatPosterDate('2026-10-14', 'long')).toBe('14 October 2026')
  })

  it('never changes which underlying date is being displayed, only its presentation', () => {
    const iso = '2026-01-05'
    expect(formatPosterDate(iso, 'short')).toContain('05/01/26')
    expect(formatPosterDate(iso, 'long')).toContain('5 January 2026')
  })
})
