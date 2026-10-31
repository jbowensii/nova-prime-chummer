// The Budgets panel: spells past the free ones are bought with Karma under karmaSpellsAtCreation, so the free-spell row
// is not an overspend (no error colour, no "over by"); with the rule off it still is.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { allBudgets } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { Budgets } from '../../../src/sr6/runner-builder/ui/Budgets'
import { Sr6Editor, type Sr6Ctx } from '../../../src/sr6/runner-builder/ui/editor'
import { buildOf, GLIM, made } from '../catalog/fixture'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

function panel(rule: boolean) {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CBADA', metatype: GLIM, magic: 'full' }) // 12 free spells
  for (let i = 0; i < 14; i++) ch.build.picks.push({ uid: `s${i}`, kind: 'spells', id: 'crb.glow-ward' })
  const { data, cr } = made({ rules: { karmaSpellsAtCreation: rule } })
  const budgets = allBudgets(ch.build, data, cr, makeProvider(ch.build.method, data, cr))
  expect(budgets.spellSlots.left).toBe(-2)
  const ctx = { ch, data, cr, budgets, v: [], career: false } as unknown as Sr6Ctx
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  act(() => root!.render(createElement(Sr6Editor.Provider, { value: ctx }, createElement(Budgets))))
  return host
}
const spellsRow = (host: HTMLElement) => [...host.querySelectorAll('.budget')].find(r => /Free spells/.test(r.textContent ?? ''))

test('rule on: the free-spell row is not shown as over by', () => {
  const row = spellsRow(panel(true))
  expect(row?.textContent).toContain('left of 12')
  expect(row?.querySelector('.neg')).toBeNull()
})

test('rule off: the same row is an overspend', () => {
  const row = spellsRow(panel(false))
  expect(row?.textContent).toContain('over by')
  expect(row?.querySelector('.neg')).not.toBeNull()
})
