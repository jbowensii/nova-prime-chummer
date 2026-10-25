import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { allBudgets } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { knowledgeNuyenAvailable } from '../../../src/sr6/runner-builder/domain/creation/rule-markers'

function setup(active = true) {
  const catalog = fixtureCatalog()
  catalog.entries.qualities.set('scholastic', {
    id: 'scholastic',
    kind: 'qualities',
    name: 'Scholastic Mage',
    source: 'CRB',
    page: 1,
    attrs: { kind: 'positive', karma: '5' },
    text: '',
    parts: [{ tag: 'modifier', attrs: { kind: 'itemmod', type: 'RULE', ref: 'KNOWLEDGE_COST2_AT_GEN' }, text: '' }],
  })
  const data = sr6Data(catalog),
    cr = fixtureCreation()
  cr.set('karmaKnowledge', { key: 'karmaKnowledge', value: 1 })
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'full' })
  if (active) b.qualities.push({ uid: 'q', id: 'scholastic', level: 1 })
  b.knowledge.push({ uid: 'k', name: 'Lore', kind: 'knowledge', points: 0, karma: 0 })
  const act = (op: Parameters<typeof apply>[1]) => apply(b, op, data, cr)
  const budgets = () => allBudgets(b, data, cr, makeProvider(b.method, data, cr))
  return { b, act, budgets, data }
}

test('Scholastic Mage buys Knowledge for starting nuyen, switches both ways and round-trips', () => {
  const { b, act, budgets } = setup()
  const start = budgets()
  expect(act({ op: 'knowledgePayment', uid: 'k', payment: 'nuyen' })).toEqual({ ok: true })
  expect(act({ op: 'knowledgeRank', uid: 'k', pool: 'karma', delta: 1 })).toEqual({ ok: true })
  expect(budgets().nuyen.left).toBe(start.nuyen.left - 1000)
  expect(budgets().karma.left).toBe(start.karma.left)
  expect(budgets().nuyen.breakdown).toContainEqual(expect.objectContaining({ key: 'knowledge:k', amount: 1000, tab: 'skills' }))
  const ch = blankSr6('priority', 'test', '2026-10-24T00:00:00Z')
  ch.build = b
  const loaded = xmlToSr6(sr6ToXml(ch))
  expect(loaded.ok).toBe(true)
  if (loaded.ok) expect(loaded.character.build.knowledge).toEqual(b.knowledge)
  expect(act({ op: 'knowledgePayment', uid: 'k', payment: 'karma' })).toEqual({ ok: true })
  expect(budgets().nuyen.left).toBe(start.nuyen.left)
  expect(budgets().karma.left).toBe(start.karma.left - 2)
  act({ op: 'knowledgePayment', uid: 'k', payment: 'nuyen' })
  expect(budgets().nuyen.left).toBe(start.nuyen.left - 1000)
  b.qualities = []
  expect(budgets().nuyen.left).toBe(start.nuyen.left)
  expect(budgets().karma.breakdown?.find(x => x.key === 'knowledge')?.amount).toBe(1)
  b.qualities.push({ uid: 'q', id: 'scholastic', level: 1 })
  act({ op: 'knowledgeRank', uid: 'k', pool: 'karma', delta: -1 })
  expect(budgets().nuyen.left).toBe(start.nuyen.left)
})

test('without the rule nuyen is unavailable; languages cannot use it', () => {
  const { b, act, data } = setup(false)
  expect(knowledgeNuyenAvailable(b, data)).toBe(false)
  expect(act({ op: 'knowledgePayment', uid: 'k', payment: 'nuyen' }).ok).toBe(false)
  expect(b.knowledge[0].payment).toBeUndefined()
  b.qualities.push({ uid: 'q', id: 'scholastic', level: 1 })
  b.knowledge[0].kind = 'language'
  expect(act({ op: 'knowledgePayment', uid: 'k', payment: 'nuyen' }).ok).toBe(false)
})
