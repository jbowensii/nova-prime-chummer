// Nested optional rules (creation.ts RULE_DEPS): a rule that needs a parent applies only while the parent is on (its
// stored value kept), two rules that can't be on together keep one (the locked one, else the runner's own, else the one
// listed first), through runnerRules so the engine never sees the other; Review notes a runner's choice set aside.
// Made-up fixture, invented values.
import { expect, test } from 'vitest'
import { applyDeps, blockedBy, mergeRules, nested, runnerRules, type CreationRules, type CreationValue } from '../../src/sr6/table-setup/domain/creation'
import { makeProvider } from '../../src/sr6/engine/providers'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6 } from '../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made } from './catalog/fixture'

const rules = (r: Record<string, CreationValue>) => made({ rules: r })
const vals = (cr: CreationRules, ...keys: string[]) => keys.map(k => cr.get(k)?.value)

test('a nested rule applies only while its parent is on; off, its stored value stays but it is left out', () => {
  const { cr } = rules({ expandedContacts: false, contactKarma: 3, twentyQuestions: true, twentyQuestionsKarma: 7 })
  const eff = applyDeps(cr)
  expect(eff.has('contactKarma')).toBe(false)
  expect(blockedBy(eff, 'contactKarma')).toEqual({ needs: 'expandedContacts' })
  expect(cr.get('contactKarma')?.value).toBe(3) // (the stored one, untouched)
  expect(vals(eff, 'twentyQuestionsKarma')).toEqual([7])
  // a parent that isn't true/false is on while set: Stacking Advantage needs the core lead
  expect(applyDeps(rules({ stackingAdvantage: true, arDrEdgeGap: 3 }).cr).get('stackingAdvantage')?.value).toBe(true)
  const { cr: noGap } = made({ rules: { stackingAdvantage: true }, unset: ['arDrEdgeGap'] })
  expect(applyDeps(noGap).has('stackingAdvantage')).toBe(false)
})

test('the engine never applies a child whose parent is off: Twenty Questions’ karma only with the rule', () => {
  const { data, cr } = rules({ twentyQuestions: false, twentyQuestionsKarma: 7 })
  const karma = (r: CreationRules) => makeProvider('priority', data, r).startingKarma()
  const base = karma(runnerRules(cr))
  expect(karma(runnerRules(cr, [{ key: 'twentyQuestions', value: 'true' }]))).toBe(base + 7)
  // the runner turns the parent off: the child's own value is kept on the runner but doesn't count
  const own = [
    { key: 'twentyQuestions', value: 'false' },
    { key: 'twentyQuestionsKarma', value: '9' },
  ]
  expect(karma(runnerRules(cr, own))).toBe(base)
  expect(mergeRules(cr, own).get('twentyQuestionsKarma')).toMatchObject({ value: 9, from: 'runner' })
  expect(runnerRules(cr, own).has('twentyQuestionsKarma')).toBe(false)
})

test('two rules that can’t be on together keep one: the locked, else the runner’s own, else the first listed', () => {
  const { data, cr } = rules({ levelPrime: true, levelSwcStreet: true, 'swcStreet.pointBuy': 61 })
  const flags = (r: CreationRules) => vals(r, 'levelPrime', 'levelSwcStreet')
  expect(flags(runnerRules(cr))).toEqual([true, undefined]) // the table's both: the first listed
  expect(runnerRules(cr).get('pointBuy.total')?.value).toBe(cr.get('pointBuy.total')?.value) // the level's numbers not applied
  const table = new Map(cr)
  table.delete('levelSwcStreet')
  const own = [{ key: 'levelSwcStreet', value: 'true' }]
  const mine = runnerRules(table, own)
  expect(flags(mine)).toEqual([undefined, true]) // the runner's own over the table's
  expect(mine.get('pointBuy.total')?.value).toBe(61)
  expect(makeProvider('priority', data, mine).startingKarma()).toBe(
    makeProvider('priority', data, runnerRules(table, [{ key: 'levelPrime', value: '' }])).startingKarma(),
  )
  expect(flags(runnerRules(table, own, [{ key: 'levelPrime', by: 'Gil' }]))).toEqual([true, undefined]) // a lock wins
})

test('Review notes a runner’s choice set aside, and two rules on together that never went through runnerRules', () => {
  const { data, cr } = rules({ expandedContacts: false, levelPrime: true })
  const ch = { ...blankSr6('priority', 'r1'), build: buildOf('priority', { letters: 'CABDA', metatype: GLIM }) }
  ch.rules = [
    { key: 'contactKarma', value: '2' },
    { key: 'levelSwcElite', value: 'true' },
  ]
  const lockedPrime = runnerRules(cr, ch.rules, [{ key: 'levelPrime', by: 'Gil' }])
  const notes = validateSr6(data, lockedPrime, ch)
    .filter(v => v.code === 'rules.setAside')
    .map(v => v.message)
  expect(notes).toEqual([expect.stringMatching(/needs Expanded contacts.*which is off/), expect.stringMatching(/can’t be on with Prime runner/)])
  const raw = new Map(cr).set('levelSwcElite', { key: 'levelSwcElite', value: true })
  expect(validateSr6(data, raw, { ...ch, rules: undefined }).find(v => v.code === 'rules.conflict')?.message).toMatch(
    /Prime runner.*Elite.*can’t be on together/,
  )
})

test('nested puts each child right under its parent, a level deeper', () => {
  const items = ['contactRatingMax', 'expandedContacts', 'startingKarma', 'contactKarma'].map(key => ({ key }))
  expect(nested(items).map(o => `${o.item.key}:${o.depth}:${o.root.key}`)).toEqual([
    'expandedContacts:0:expandedContacts',
    'contactRatingMax:1:expandedContacts',
    'contactKarma:1:expandedContacts',
    'startingKarma:0:startingKarma',
  ])
})
