// The Sixth World Companion's optional rules on creation and career, each a switch, off by default: Alternate Mystic
// Adept (p. 148), Twenty Questions (p. 25), Working for the Man and for the People (p. 153). The numbers here are made up.
import { expect, test } from 'vitest'
import { allBudgets } from '../../src/sr6/engine/budgets'
import { preview } from '../../src/sr6/engine/career'
import { makeProvider } from '../../src/sr6/engine/providers'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6, type MagicKind, type Sr6Character } from '../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made } from './catalog/fixture'

function runner(magic: MagicKind = 'mundane'): Sr6Character {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic }) // magic B: mystic adept 3
  return ch
}

test('Alternate Mystic Adept: half a power point for each point given to powers and each Magic raised; no Conjuring or Enchanting', () => {
  const ch = runner('mystic-adept')
  ch.build.powerPointsBought = 2
  ch.build.attributes.mag.adjust = 1
  const pp = (on: boolean) => {
    const { data, cr } = made({ rules: { alternateMysticAdept: on } })
    return allBudgets(ch.build, data, cr, makeProvider('priority', data, cr)).powerPoints.max
  }
  expect(pp(false)).toBe(2)
  expect(pp(true)).toBe((2 + 1) / 2)
  const { data, cr } = made({
    rules: { alternateMysticAdept: true },
    data: d => {
      d.skills['crb.glowcraft'] = { ...d.skills['crb.glowcraft'], name: 'Conjuring' }
    },
  })
  ch.build.skills.push({ id: 'crb.glowcraft', points: 1, karma: 0 })
  expect(validateSr6(data, cr, ch).map(v => v.code)).toContain('magic.alternateMysticAdept')
})

test('Twenty Questions adds its karma at creation', () => {
  const { data, cr } = made({ rules: { twentyQuestions: true, twentyQuestionsKarma: 2 } })
  expect(makeProvider('priority', data, cr).startingKarma()).toBe(40 + 2)
  cr.set('twentyQuestions', { key: 'twentyQuestions', value: false })
  expect(makeProvider('priority', data, cr).startingKarma()).toBe(40)
})

test('Working for the Man and for the People: each conversion only with its switch', () => {
  const ch = runner()
  ch.finalizedAt = '2026-10-03T00:00:00Z'
  ch.final = { karma: 10, nuyen: 5000 }
  ch.ledger = [{ id: 'f1', at: '2026-10-03T00:00:00Z', type: 'finalize', karma: 10, nuyen: 5000 }]
  const { data, cr } = made({
    rules: { workingForTheMan: false, workingForThePeople: false, 'advance.karmaToNuyenRate': 900, 'advance.nuyenToKarmaRate': 900 },
  })
  expect(preview(ch, { op: 'convert', karma: 1 }, data, cr)).toEqual({ ok: false, reason: 'optional-rule-off' })
  expect(preview(ch, { op: 'convert', karma: -1 }, data, cr)).toEqual({ ok: false, reason: 'optional-rule-off' })
  cr.set('workingForTheMan', { key: 'workingForTheMan', value: true })
  expect(preview(ch, { op: 'convert', karma: 1 }, data, cr)).toMatchObject({ ok: true, nuyen: -900 })
})
