import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RulesPanel } from './RulesPanel'
import { DEFAULT_GLOBAL_STYLE } from '../defaultLayout'
import type { RulesElement } from '../posterTypes'

function makeElement(overrides: Partial<RulesElement> = {}): RulesElement {
  return {
    id: 'rules-1',
    type: 'rules',
    name: 'Rules',
    rect: { x: 0, y: 0, width: 100, height: 100 },
    visible: true,
    removable: false,
    columns: 2,
    fontSize: 2.6,
    rules: [
      { id: 'r1', text: 'First rule', order: 0 },
      { id: 'r2', text: 'Second rule', order: 1 },
    ],
    style: {},
    ...overrides,
  }
}

describe('RulesPanel', () => {
  it('adds a new rule', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <RulesPanel
        element={makeElement()}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        onChange={onChange}
        onStyleChange={vi.fn()}
        onReset={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    expect(onChange).toHaveBeenCalledWith({
      rules: [
        { id: 'r1', text: 'First rule', order: 0 },
        { id: 'r2', text: 'Second rule', order: 1 },
        expect.objectContaining({ text: '', order: 2 }),
      ],
    })
  })

  it('edits rule text on blur', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <RulesPanel
        element={makeElement()}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        onChange={onChange}
        onStyleChange={vi.fn()}
        onReset={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    )

    const textarea = screen.getByLabelText('Rule 1')
    await user.clear(textarea)
    await user.type(textarea, 'Updated rule')
    textarea.blur()

    expect(onChange).toHaveBeenCalledWith({
      rules: expect.arrayContaining([expect.objectContaining({ id: 'r1', text: 'Updated rule' })]),
    })
  })

  it('deletes a rule and renumbers the remaining ones', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <RulesPanel
        element={makeElement()}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        onChange={onChange}
        onStyleChange={vi.fn()}
        onReset={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Delete rule 1' }))

    expect(onChange).toHaveBeenCalledWith({
      rules: [{ id: 'r2', text: 'Second rule', order: 0 }],
    })
  })

  it('reorders rules with the move-down control', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <RulesPanel
        element={makeElement()}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        onChange={onChange}
        onStyleChange={vi.fn()}
        onReset={vi.fn()}
        onToggleVisible={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Move rule 1 down' }))

    expect(onChange).toHaveBeenCalledWith({
      rules: [
        { id: 'r2', text: 'Second rule', order: 0 },
        { id: 'r1', text: 'First rule', order: 1 },
      ],
    })
  })

  it('toggles the whole section visible/hidden', async () => {
    const onToggleVisible = vi.fn()
    const user = userEvent.setup()
    render(
      <RulesPanel
        element={makeElement({ visible: true })}
        globalStyle={DEFAULT_GLOBAL_STYLE}
        onChange={vi.fn()}
        onStyleChange={vi.fn()}
        onReset={vi.fn()}
        onToggleVisible={onToggleVisible}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Show rules section on the poster' }))
    expect(onToggleVisible).toHaveBeenCalledWith(false)
  })
})
