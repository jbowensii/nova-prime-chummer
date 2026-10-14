// The Sixth World Companion's optional Transhumanism (p. 146), on the made-up fixture: a mundane's transhumanist grades cost
// the initiation price in Karma and each makes an Essence hole of 1.0 that augmentations' Essence is paid from first; off by
// default, and with it off nothing changes. The grade cap at creation, Review, and the save format.
import { expect, test } from 'vitest'
import { apply, setMagic } from '../../src/sr6/engine/actions'
import { essenceBudget, essenceHole } from '../../src/sr6/engine/essence'
import { karmaBudget } from '../../src/sr6/engine/karma'
import { makeProvider } from '../../src/sr6/engine/providers'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6, type Sr6Purchase } from '../../src/sr6/model/character'
import { n0, presetChanges } from '../../src/sr6/engine/creation'
import { buildOf, GLIM, made } from './fixture'

const line = (id: string, kind: Sr6Purchase['kind']): Sr6Purchase => ({ uid: id, kind, id, qty: 1, accessories: [] })
const on = { rules: { transhumanism: true } }
const mundane = () => buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })

test('with the rule off a transhumanist grade is refused, and a build without one is as it always was', () => {
  const { data, cr } = made()
  const b = mundane()
  expect(apply(b, { op: 'transhuman', delta: 1 }, data, cr)).toEqual({ ok: false, reason: 'rule-off' })
  expect(b.transhuman).toBe(0)
  expect(essenceHole(b, cr)).toBe(0)
  const p = makeProvider(b.method, data, cr)
  expect(karmaBudget(b, data, cr, p).breakdown.some(l => l.key === 'transhuman')).toBe(false)
})

test('a mundane buys grades up to 20 with the rule on; an awakened runner cannot', () => {
  const { data, cr } = made(on)
  const b = mundane()
  expect(apply(b, { op: 'transhuman', delta: 2 }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'transhuman', delta: -3 }, data, cr)).toEqual({ ok: false, reason: 'below-zero' })
  expect(apply(b, { op: 'transhuman', delta: 19 }, data, cr)).toEqual({ ok: false, reason: 'at-maximum' })
  const mage = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'full' })
  expect(apply(mage, { op: 'transhuman', delta: 1 }, data, cr)).toEqual({ ok: false, reason: 'not-mundane' })
})

test('a grade costs the initiation price, 10 + the grade, and its hole pays the first Essence of augmentations', () => {
  const { data, cr } = made(on)
  const b = mundane()
  b.purchases.push(line('crb.glow-eyes.1', 'augmentations'))
  const plain = essenceBudget(b, data, cr)
  expect(plain.spent).toBeGreaterThan(0)
  apply(b, { op: 'transhuman', delta: 2 }, data, cr)
  const p = makeProvider(b.method, data, cr)
  const grade = karmaBudget(b, data, cr, p).breakdown.find(l => l.key === 'transhuman')!
  expect(grade.amount).toBe(2 * n0(cr, 'karmaInitiationBase') + 3 * n0(cr, 'karmaInitiationPerGrade')) // (grades 1 and 2: base + grade × per grade)
  expect(essenceHole(b, cr)).toBe(2)
  const held = essenceBudget(b, data, cr)
  expect(held.spent).toBe(Math.max(0, plain.spent - 2))
  expect(held.left).toBeCloseTo(plain.left + Math.min(2, plain.spent))
})

test('going to an awakened kind clears the grades; Review flags a grade the rule or the kind does not allow', () => {
  const { data, cr } = made(on)
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = mundane()
  apply(ch.build, { op: 'transhuman', delta: 1 }, data, cr)
  expect(validateSr6(data, cr, ch).some(v => v.code === 'magic.transhuman')).toBe(false)
  const off = made({ rules: { transhumanism: false } })
  expect(validateSr6(off.data, off.cr, ch).some(v => v.code === 'magic.transhuman')).toBe(true)
  setMagic(ch, 'full', data, cr)
  expect(ch.build.transhuman).toBe(0)
})

test('the creation grade cap covers it, and Shadowrun Missions sets it to 1 with the rule on', () => {
  const { data, cr } = made({
    rules: { transhumanism: true, gradeCapAtCreation: true, 'gradeCap.initiation': 1, 'gradeCap.submersion': 2, 'gradeCap.transhuman': 1 },
  })
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = mundane()
  apply(ch.build, { op: 'transhuman', delta: 2 }, data, cr)
  expect(validateSr6(data, cr, ch).some(v => v.code === 'magic.gradeCapCreationTranshuman')).toBe(true)
  const missions = Object.fromEntries(presetChanges('missions').set)
  expect([missions.transhumanism, missions['gradeCap.transhuman']]).toEqual([true, 1])
})
