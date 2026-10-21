// The Karma build option's shipped numbers (public/data/sr6/creation-defaults.xml: Commlink6's defaults, since no SR6 book
// prints a Karma build; owner's one-off exception, 2026-10-11) price an invented runner sensibly. The runners here are
// made up; the catalog is the fixture's.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  applyDeps,
  flag,
  levelRules,
  missingFor,
  num,
  parseCreation,
  rulesFrom,
  runnerRules,
  type CreationRules,
} from '../../../src/sr6/table-setup/domain/creation'
import { allBudgets, freeSpellSlots } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import type { MagicKind, Sr6Build } from '../../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made } from '../catalog/fixture'

const SHIPPED = parseCreation(readFileSync('public/data/sr6/creation-defaults.xml', 'utf8')).rules
/** the shipped rules with the Karma build option on, plus what a test adds: the table's (a runner can't set most of these) */
const rules = (...own: [string, string][]): CreationRules =>
  runnerRules(new Map([...SHIPPED, ...rulesFrom([['karmaBuildMethod', 'true'], ...own].map(([key, value]) => ({ key, value }))).rules]))
const { data } = made()

/** A Karma-build runner, all made up: attributes 2 ranks of Body (1 to 3), 1 of Edge, a skill with 3 ranks and a
 *  specialization, 2 knowledge ranks, 3 spells; the metatype (a variant) at 5 Karma; 3 Karma turned into nuyen. */
function runner(magic: MagicKind) {
  const b: Sr6Build = buildOf('karma', { metatype: GLIM, magic })
  b.attributes.bod.karma = 2
  b.attributes.edg.karma = 1
  b.skills.push({ id: 'made-up.skill', points: 0, karma: 3, spec: 'Made-up' })
  b.knowledge.push({ uid: 'k1', name: 'Made-up lore', kind: 'knowledge', points: 0, karma: 2 })
  b.karmaToNuyen = 3
  return b
}
const price = (b: Sr6Build, cr: CreationRules) => allBudgets(b, data, cr, makeProvider('karma', data, cr))
const line = (b: ReturnType<typeof price>, key: string) => b.karma.breakdown.find(l => l.key === key)?.amount

test('the option ships off, and its numbers ship set: Commlink6’s defaults', () => {
  expect(flag(SHIPPED, 'karmaBuildMethod')).toBe(false)
  expect(missingFor('karma', SHIPPED, { priorities: {}, metatypes: {}, lifemodules: {} }).includes('karmaBuild.start')).toBe(false)
  const cr = rules()
  expect([
    num(cr, 'karmaBuild.start'),
    num(cr, 'karmaBuild.startRating'),
    num(cr, 'karmaBuild.freeSpellsPerMagic'),
    num(cr, 'karmaBuild.freeFormsPerResonance'),
  ]).toEqual([1000, 1, 0, 0])
  expect(['full', 'aspected', 'mystic-adept', 'adept', 'technomancer'].map(k => num(cr, `magicKarma:${k}`))).toEqual([60, 45, 75, 45, 45])
  // the Karma prices (and the nuyen rates) it uses are the printed ones, which are the same numbers
  expect(
    ['karmaAttrPerRank', 'karmaSkillPerRank', 'karmaSpec', 'karmaKnowledge', 'karmaSpell', 'karmaForm', 'karmaToNuyenRate', 'karmaToNuyenRateInDebt'].map(k =>
      num(cr, k),
    ),
  ).toEqual([5, 5, 5, 3, 5, 5, 2000, 5000])
})

test('with the option off its numbers do not apply', () => {
  const off = runnerRules(SHIPPED)
  expect(['karmaBuild.start', 'magicKarma:full', 'swcStreet.karmaBuild', 'karmaBuild.freeSpellsPerMagic'].filter(k => off.has(k))).toEqual([])
})

test('the starting karma is 1000, 800 at the Companion’s street level and 1200 at its elite level, only with the option on', () => {
  expect(num(rules(), 'karmaBuild.start')).toBe(1000)
  expect(num(rules(['levelSwcStreet', 'true']), 'karmaBuild.start')).toBe(800)
  expect(num(rules(['levelSwcElite', 'true']), 'karmaBuild.start')).toBe(1200)
  const noOption = levelRules(applyDeps(new Map([...SHIPPED, ['levelSwcStreet', { key: 'levelSwcStreet', value: true }]])))
  expect(noOption.has('karmaBuild.start')).toBe(false)
  // the prime runner and the core rulebook's street level have no Karma build number of their own
  expect(num(rules(['levelPrime', 'true']), 'karmaBuild.start')).toBe(1000)
  expect(num(rules(['levelStreet', 'true']), 'karmaBuild.start')).toBe(1000)
})

test('a mundane Karma-build runner: every Karma cost at the printed prices, nothing free', () => {
  const b = runner('mundane'),
    p = price(b, rules(['metatypeKarma:crb.glimmerkin', '5']))
  expect(p.karma.max).toBe(1000)
  // Body 1 to 3: 2 × 5 + 3 × 5; Edge 1 to 2: 2 × 5
  expect([line(p, 'attr:bod'), line(p, 'attr:edg')]).toEqual([25, 10])
  // 3 ranks: 3 × 5 + 2 × 5 + 1 × 5, and a specialization 5
  expect(line(p, 'skills')).toBe(35)
  expect(line(p, 'knowledge')).toBe(6)
  expect(line(p, 'metatype')).toBe(5)
  expect(line(p, 'magic')).toBeUndefined()
  expect(line(p, 'toNuyen')).toBe(3)
  expect(p.karma.spent).toBe(25 + 10 + 35 + 6 + 5 + 3)
  expect(p.karma.left).toBe(1000 - 84)
  // everything else comes from Karma: no point pools, nuyen only from the Karma turned into it
  expect([p.attributePoints.max, p.skillPoints.max, p.adjustmentPoints.max]).toEqual([0, 0, 0])
  expect(p.nuyen.max).toBe(3 * 2000)
})

test('a full magician pays 60 Karma to be one, starts at Magic 1 and pays 5 for every spell', () => {
  const b = runner('full'),
    cr = rules(['metatypeKarma:crb.glimmerkin', '5'])
  b.attributes.mag.karma = 1
  for (const id of ['a', 'b', 'c']) b.picks.push({ uid: id, kind: 'spells', id })
  const p = price(b, cr)
  expect(line(p, 'magic')).toBe(60)
  expect(line(p, 'attr:mag')).toBe(10) // Magic 1 to 2
  expect(freeSpellSlots(b, data, cr, makeProvider('karma', data, cr))).toBe(0)
  expect(p.spellSlots).toEqual({ max: 0, spent: 3, left: -3 })
  expect(line(p, 'spells')).toBe(15)
  expect(p.karma.spent).toBe(25 + 10 + 10 + 35 + 6 + 5 + 60 + 15 + 3)
  expect(p.karma.left).toBeGreaterThan(0)
})

test('each magic kind costs its own Karma; a technomancer’s complex forms cost 5 each too', () => {
  const cr = rules()
  expect(['full', 'aspected', 'mystic-adept', 'adept', 'technomancer'].map(k => line(price(runner(k as MagicKind), cr), 'magic'))).toEqual([60, 45, 75, 45, 45])
  const t = runner('technomancer')
  for (const id of ['a', 'b']) t.picks.push({ uid: id, kind: 'complexforms', id })
  expect(line(price(t, cr), 'complexForms')).toBe(10)
})

test('the Karma build’s free spells are its own setting; the other methods keep theirs', () => {
  const b = runner('full'),
    cr = rules(['karmaBuild.freeSpellsPerMagic', '2'])
  expect(freeSpellSlots(b, data, cr, makeProvider('karma', data, cr))).toBe(2)
  const prio = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'full' })
  const p = makeProvider('priority', data, cr)
  expect(freeSpellSlots(prio, data, cr, p)).toBe(p.magicRating(prio) * num(cr, 'freeSpellsPerMagic')!)
})
