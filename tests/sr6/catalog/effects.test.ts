// The runner's own effects used throughout creation (budgets.ts lineBonuses/augmentBonus/attrMax/magicLoss, derive.ts):
// contact and knowledge points from the augmented attribute, the Sixth World Companion's expanded contacts, Exceptional
// (Attribute), Charismatic Defense, a cyberlimb's Physical box, Essence loss on power points and free spells, a player's
// bonus over the catalog's effect, an expertise's own specialization. Made-up fixture, invented numbers.
import { expect, test } from 'vitest'
import type { Sr6Build } from '../../../src/sr6/formats/domain/character'
import { allBudgets, attrMax, attrRating, augmentBonus } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { deriveSr6 } from '../../../src/sr6/runner-builder/domain/creation/derive'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made } from './fixture'

type Over = Parameters<typeof made>[0]
const runner = (magic: Sr6Build['magic'] = 'mundane') => buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic })
function world(b: Sr6Build, over?: Over) {
  const { data, cr } = made(over),
    p = makeProvider(b.method, data, cr)
  return { data, cr, p, budgets: allBudgets(b, data, cr, p), ch: { ...blankSr6(b.method, 't'), build: b } }
}
let n = 0
const charm = (b: Sr6Build, value: number) =>
  b.purchases.push({ uid: `x${++n}`, kind: 'gear', name: 'Charm gland', qty: 1, accessories: [], bonuses: [{ target: 'cha', value }] })

test('contact and knowledge points count the augmented Charisma and Logic', () => {
  const b = runner(),
    before = world(b).budgets
  charm(b, 2)
  b.purchases.push({ uid: 'l1', kind: 'gear', name: 'Logic chip', qty: 1, accessories: [], bonuses: [{ target: 'log', value: 1 }] })
  const { budgets, cr } = world(b)
  expect(budgets.contactPoints.max).toBe(before.contactPoints.max + 2 * (cr.get('contactPointsPerCha')!.value as number))
  expect(budgets.knowledgePoints.max).toBe(before.knowledgePoints.max + (cr.get('knowledgePerLog')!.value as number))
})

test('expanded contacts: karma buys points past the pool and a pair past its cap; ratings go to the hard cap', () => {
  const b = runner(),
    rules = { contactKarma: 2, contactPairPerCha: 1, contactRatingMax: 7 }
  const cha = attrRating(b, 'cha', world(b).p)
  b.contacts.push({ uid: 'c1', name: 'Fence', archetype: 'Fence', connection: cha + 2, loyalty: 1 })
  const { budgets, data, cr, ch } = world(b, { rules })
  const pool = budgets.contactPoints.max,
    spend = cha + 3,
    past = Math.max(0, spend - pool),
    pair = Math.max(0, spend - cha)
  expect(budgets.contactPoints.karma).toBe((past + pair) * 2)
  expect(budgets.contactPoints.ratingCap).toBe(7)
  expect(budgets.karma.breakdown).toContainEqual(expect.objectContaining({ key: 'contacts', amount: (past + pair) * 2 }))
  expect(validateSr6(data, cr, ch).filter(v => v.code === 'contact.ratingCap' || v.code === 'contact.budget')).toEqual([])
  // off (the fixture's own rules): the rating above Charisma is an error
  const off = world(b)
  expect(validateSr6(off.data, off.cr, off.ch).map(v => v.code)).toContain('contact.ratingCap')
})

test('Exceptional (Attribute) raises the maximum of the attribute its note names, for the caps and one-at-max', () => {
  const b = runner(),
    { data, cr } = world(b),
    top = attrMax(data, cr, b, 'agi')!
  b.qualities.push({ uid: 'q1', id: 'crb.made-up-prodigy', level: 1, note: 'Agility' })
  expect(attrMax(data, cr, b, 'agi')).toBe(top + 1)
  expect(attrMax(data, cr, b, 'str')).toBe(data.metatypes[GLIM].ranges.str[1])
})

test('Charismatic Defense bases the Defense Rating on Charisma', () => {
  const b = runner()
  b.attributes.cha.points = 4
  const plain = world(b),
    d0 = deriveSr6(plain.data, plain.cr, plain.ch)
  b.qualities.push({ uid: 'q2', id: 'crb.made-up-charm', level: 1 })
  const w = world(b),
    d = deriveSr6(w.data, w.cr, w.ch)
  expect(d.defenseRating - d0.defenseRating).toBe(d.attrs.cha.augmented - d.attrs.bod.augmented)
})

test('a line’s Physical box bonus (a full cyberlimb) adds to the Physical monitor', () => {
  const b = runner(),
    w0 = world(b),
    before = deriveSr6(w0.data, w0.cr, w0.ch).monitors.physical!
  b.purchases.push({ uid: 'a1', kind: 'augmentations', id: 'crb.limb-synthetic', qty: 1, accessories: [], bonuses: [{ target: 'physical', value: 1 }] })
  const w = world(b)
  expect(deriveSr6(w.data, w.cr, w.ch).monitors.physical).toBe(before + 1)
})

test('Essence spent takes Magic off the adept’s power points and the magician’s free spells', () => {
  const adept = runner('adept'),
    a0 = world(adept).budgets.powerPoints.max
  adept.purchases.push({ uid: 'e1', kind: 'augmentations', id: 'crb.limb-synthetic', qty: 1, accessories: [] }) // Essence 1
  expect(world(adept).budgets.powerPoints.max).toBe(a0 - 1)
  const mage = runner('full'),
    s0 = world(mage).budgets.spellSlots.max
  mage.purchases.push({ uid: 'e2', kind: 'augmentations', id: 'crb.limb-synthetic', qty: 1, accessories: [] })
  expect(world(mage).budgets.spellSlots.max).toBeLessThan(s0)
})

test('a player’s entered bonus overrides the catalog entry’s effects; without one the entry’s apply', () => {
  const b = runner(),
    { data } = world(b)
  data.entry('augmentations', 'crb.glow-eyes')!.parts.push({ tag: 'effect', attrs: { target: 'attr:int', op: 'add', value: '1' }, text: '' })
  b.purchases.push({ uid: 'g1', kind: 'augmentations', id: 'crb.glow-eyes', rating: 1, qty: 1, accessories: [] })
  expect(augmentBonus(b, data, 'int')).toBe(1)
  b.purchases[0].bonuses = [{ target: 'rea', value: 2 }]
  expect([augmentBonus(b, data, 'int'), augmentBonus(b, data, 'rea')]).toEqual([0, 2])
})

test('an expertise of its specialization’s name rolls as the expertise only', () => {
  const b = runner()
  b.skills.push({ id: 'crb.gab', points: 5, karma: 0, spec: 'Fast Talk', expertise: 'Fast Talk' })
  const w = world(b),
    pool = deriveSr6(w.data, w.cr, w.ch).pools.find(x => x.skill === 'crb.gab')!
  expect([pool.spec, pool.expertise]).toEqual([undefined, 'Fast Talk'])
  expect(validateSr6(w.data, w.cr, w.ch).map(v => v.code)).not.toContain('skill.expertiseSpec')
})

test('an expertise at creation is bought with the customization karma at its advancement price, unless the table gives it skill points', () => {
  const b = runner()
  b.skills.push({ id: 'crb.gab', points: 2, karma: 0, spec: 'Fast Talk', expertise: 'Fast Talk' }) // 2 + 3 + 5 points fit
  const priced = world(b, { unset: ['skillPointsExpertise'], rules: { 'advance.expertise': 7 } }).budgets
  expect(priced.karma.breakdown).toContainEqual(expect.objectContaining({ key: 'expertise', label: '1 expertise bought with karma', amount: 7 }))
  const points = world(b, { rules: { 'advance.expertise': 7 } }).budgets // the fixture gives an expertise skill points
  expect(points.karma.breakdown?.some(l => l.key === 'expertise')).toBe(false)
})

test('Many Talents and Many Skills allow a second attribute and skill at the maximum (SWC p. 134)', () => {
  const b = runner(),
    { data, cr } = world(b)
  b.attributes.agi.points = attrMax(data, cr, b, 'agi')! - 1
  b.attributes.cha.points = attrMax(data, cr, b, 'cha')! - 1
  const cap = cr.get('skillCap')!.value as number
  b.skills.push({ id: 'crb.gab', points: cap, karma: 0 }, { id: 'crb.tinkering', points: cap, karma: 0 })
  const rules = { oneSkillAtMax: true },
    codes = () => {
      const w = world(b, { rules })
      return validateSr6(w.data, w.cr, w.ch).map(v => v.code)
    }
  expect(codes()).toEqual(expect.arrayContaining(['attr.oneAtMax', 'skill.oneAtMax']))
  b.qualities.push({ uid: 'm1', id: 'crb.made-up-polymath', level: 1 }, { uid: 'm2', id: 'crb.made-up-dabbler', level: 1 })
  expect(codes()).not.toContain('attr.oneAtMax')
  expect(codes()).not.toContain('skill.oneAtMax')
})

test('the Availability cap on illegal gear only, as the core rulebook’s first printing has it', () => {
  const b = runner(),
    cap = made().cr.get('maxAvailability')!.value as number
  b.purchases.push({ uid: 'v1', kind: 'gear', name: 'Legal bauble', avail: cap + 2, qty: 1, accessories: [] })
  const v = (rules = {}) => {
    const w = world(b, { rules })
    return validateSr6(w.data, w.cr, w.ch).filter(x => x.code === 'gear.availCap')
  }
  expect(v()).toHaveLength(1)
  expect(v({ availabilityCapIllegalOnly: true })).toHaveLength(0) // a custom item prints no legality: legal
  b.purchases.push({ uid: 'v2', kind: 'augmentations', id: 'crb.glow-eyes', rating: 1, qty: 1, accessories: [] })
  const w = world(b, { rules: { availabilityCapIllegalOnly: true } })
  w.data.entry('augmentations', 'crb.glow-eyes')!.attrs.avail = `${cap + 1}(I)`
  expect(
    validateSr6(w.data, w.cr, w.ch)
      .filter(x => x.code === 'gear.availCap')
      .map(x => x.path),
  ).toEqual(['augmentations.v2'])
})

test('a quality whose text says it is outside the six-quality limit isn’t counted', () => {
  const b = runner(),
    { data, cr } = world(b),
    most = cr.get('qualityMaxCount')!.value as number
  for (let i = 0; i <= most; i++) b.qualities.push({ uid: `u${i}`, id: i ? 'crb.butterfingers' : 'crb.lucky-streak', level: 1 })
  const codes = (d = data) => validateSr6(d, cr, { ...blankSr6(b.method, 't'), build: b }).map(v => v.code)
  expect(codes()).toContain('quality.maxCount')
  data.qualities['crb.lucky-streak'].uncounted = true
  expect(codes()).not.toContain('quality.maxCount')
})
