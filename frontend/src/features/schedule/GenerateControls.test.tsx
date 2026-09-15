import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateControls } from './GenerateControls'

vi.mock('../../api/fixtures', () => ({
  generateSchedule: vi.fn(),
  regenerateSchedule: vi.fn(),
}))

import { regenerateSchedule } from '../../api/fixtures'

describe('GenerateControls regenerate confirmation', () => {
  beforeEach(() => {
    vi.mocked(regenerateSchedule).mockReset()
  })

  it('shows a confirmation dialog before regenerating unlocked fixtures', async () => {
    const user = userEvent.setup()
    render(<GenerateControls seasonId="season-1" hasFixtures onComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate unlocked fixtures' }))

    expect(await screen.findByRole('dialog', { name: 'Regenerate unlocked fixtures' })).toBeInTheDocument()
    expect(regenerateSchedule).not.toHaveBeenCalled()
  })

  it('does not regenerate when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    render(<GenerateControls seasonId="season-1" hasFixtures onComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate unlocked fixtures' }))
    const dialog = await screen.findByRole('dialog', { name: 'Regenerate unlocked fixtures' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(regenerateSchedule).not.toHaveBeenCalled()
  })

  it('regenerates on confirmation and refreshes the caller', async () => {
    vi.mocked(regenerateSchedule).mockResolvedValue({
      success: true,
      seed: 123,
      fixtures: [],
      validation: { is_valid: true, issues: [] },
      diagnostics: [],
      statistics: { fixture_count: 4, weeks_used: 2, soft_score: 0, pairing_attempts: 1 },
    })
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<GenerateControls seasonId="season-1" hasFixtures onComplete={onComplete} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate unlocked fixtures' }))
    const dialog = await screen.findByRole('dialog', { name: 'Regenerate unlocked fixtures' })
    await user.click(within(dialog).getByRole('button', { name: 'Regenerate unlocked' }))

    expect(regenerateSchedule).toHaveBeenCalledWith('season-1', undefined)
    expect(await screen.findByText('Generation succeeded')).toBeInTheDocument()
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
