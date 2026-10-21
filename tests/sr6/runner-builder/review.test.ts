// Finalize and Back to draft (src/sr6/runner-builder/domain/career/finalize.ts) on the made-up fixture: finalize sets exactly finalizedAt, the
// karma and nuyen left and a finalize ledger entry, refuses while an error isn't approved; back to draft clears exactly
// those two and notes it in the ledger (the career rules for it are in career.test.ts).
import { expect, test } from 'vitest'
import { allBudgets } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { draftAgain, finalizeSr6 } from '../../../src/sr6/runner-builder/domain/career/finalize'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { buildOf, made, STONE } from '../catalog/fixture'

const NOW = '2026-10-03T12:00:00.000Z'
function setup() {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'ACDBE', metatype: STONE })
  ch.identity.metatype = STONE
  const { data, cr } = made()
  const budgets = () => allBudgets(ch.build, data, cr, makeProvider(ch.build.method, data, cr))
  return { ch, data, cr, budgets, v: () => validateSr6(data, cr, ch) }
}

test('finalize sets finalizedAt, the karma and nuyen left and a finalize entry, nothing else', () => {
  const { ch, budgets } = setup()
  const b = budgets()
  const out = finalizeSr6(ch, b, [], NOW)
  expect(out).not.toBeNull()
  const final = { karma: b.karma.left, nuyen: b.nuyen.left }
  expect(out).toEqual({ ...ch, finalizedAt: NOW, final, ledger: [{ id: out!.ledger[0].id, at: NOW, type: 'finalize', ...final }] })
  expect(ch.finalizedAt).toBeUndefined()
})

test('finalize refuses while an error isn’t approved; an approved one lets it through', () => {
  const { ch, budgets, v } = setup()
  ch.build.priorities.resources = null
  const errors = v().filter(x => x.severity === 'error')
  expect(errors.length).toBeGreaterThan(0)
  expect(finalizeSr6(ch, budgets(), v(), NOW)).toBeNull()
  ch.overrides = errors.map(x => ({ code: x.code, path: x.path, note: 'Table agreed' }))
  expect(finalizeSr6(ch, budgets(), v(), NOW)?.finalizedAt).toBe(NOW)
})

test('back to draft clears exactly finalizedAt and final, and notes it', () => {
  const { ch, budgets } = setup()
  const done = finalizeSr6(ch, budgets(), [], NOW)!
  const back = draftAgain(done, NOW)!
  expect({ ...back, ledger: [] }).toEqual(ch)
  expect(back.ledger.map(e => e.type)).toEqual(['finalize', 'note'])
})
