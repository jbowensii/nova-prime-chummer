// Itemized creation budgets (src/sr6/engine/budgets.ts) on the made-up fixture and its invented creation rules: each SR6
// Forge budget test's idea re-expressed with invented numbers (karma 40, 3 karma per attribute rank, 1,500¥ per karma…).
import { expect, test } from 'vitest'
import type { MagicKind, PurchaseKind, Sr6Build, Sr6Purchase } from '../../src/sr6/model/character'
import { allBudgets, attrRating, augmentBonus, augmentedRating, priced, skillRank } from '../../src/sr6/engine/budgets'
import { makeProvider } from '../../src/sr6/engine/providers'
import { buildOf, GLIM, made, STONE } from './fixture'

type Over = Parameters<typeof made>[0]
/** A priority runner: Glimmerkin at C, attributes A (22), magic B, skills D (11), resources A (420,000¥). */
function runner(o: { letters?: string; magic?: MagicKind; metatype?: string } = {}) {
  return buildOf('priority', { letters: o.letters ?? 'CABDA', metatype: o.metatype ?? GLIM, magic: o.magic ?? 'mundane' })
}
function budgets(b: Sr6Build, over?: Over) {
  const { data, cr } = made(over), p = makeProvider(b.method, data, cr)
  return { ...allBudgets(b, data, cr, p), p, data, cr }
}
let n = 0
const buy = (b: Sr6Build, kind: PurchaseKind, id: string | undefined, more: Partial<Sr6Purchase> = {}): Sr6Purchase => {
  const p: Sr6Purchase = { uid: `p${++n}`, kind, id, qty: 1, accessories: [], ...more }
  b.purchases.push(p)
  return p
}
const quality = (b: Sr6Build, id: string, level = 1, free?: true) =>
  b.qualities.push({ uid: `q${++n}`, id, level, ...(free ? { free } : {}) })
const pick = (b: Sr6Build, kind: Sr6Build['picks'][number]['kind'], id: string, more: object = {}) =>
  b.picks.push({ uid: `k${++n}`, kind, id, ...more })

// attributes and augmentations
test('a natural rating is 1 plus points, adjustment and karma; Magic starts at the priority rating', () => {
  const b = runner({ magic: 'full' }), { p } = budgets(b)
  b.attributes.rea = { points: 2, adjust: 1, karma: 1 }
  expect(attrRating(b, 'rea', p)).toBe(5)
  b.attributes.mag.adjust = 1
  expect(attrRating(b, 'mag', p)).toBe(3 + 1)
  expect(attrRating(b, 'res', p)).toBe(0)
  b.magic = 'technomancer'
  expect([attrRating(b, 'res', p), attrRating(b, 'mag', p)]).toEqual([3, 1])
})

test('a power bonus shows as augmented and not natural; a rated ware bonus scales by rating; no bonus leaves it alone', () => {
  const b = runner({ magic: 'adept' }), { p } = budgets(b)
  const natural = attrRating(b, 'rea', p)
  pick(b, 'adeptpowers', 'crb.quick-step', { level: 3, bonuses: [{ target: 'rea', value: 1, perRating: true }] })
  expect(augmentBonus(b, 'rea')).toBe(3)
  expect(augmentedRating(b, 'rea', p)).toBe(natural + 3)
  expect(attrRating(b, 'rea', p)).toBe(natural)
  buy(b, 'augmentations', 'crb.spring-tendons', { rating: 2, bonuses: [{ target: 'agi', value: 1, perRating: true }] })
  buy(b, 'gear', undefined, { name: 'Lucky charm', qty: 2, bonuses: [{ target: 'initDice', value: 1 }] })
  expect(augmentBonus(b, 'agi')).toBe(2)
  expect(augmentBonus(b, 'initDice')).toBe(2)
  expect(augmentBonus(b, 'cha')).toBe(0)
})

// karma
test('karma on an attribute costs the per-rank price times each new rating, named in the breakdown', () => {
  const b = runner()
  b.attributes.edg = { points: 0, adjust: 2, karma: 1 }
  b.attributes.log = { points: 1, adjust: 0, karma: 2 }
  const { karma } = budgets(b)
  expect(karma.spent).toBe(4 * 3 + (4 + 3) * 3)
  expect(karma.breakdown).toContainEqual({ key: 'attr:edg', label: 'EDG 3 → 4 (1 rank by karma)', amount: 12, sign: 'spend', tab: 'attributes' })
  expect(karma.breakdown?.find(l => l.key === 'attr:log')?.label).toBe('LOG 2 → 4 (2 ranks by karma)')
  expect(karma.max).toBe(40)
  expect(karma.left).toBe(40 - 33)
})

// skills
test('a specialization costs skill points; an expertise its own; karma ranks are priced per new rank', () => {
  const b = runner()
  b.skills.push({ id: 'crb.gab', points: 3, karma: 0, spec: 'Haggling' }, { id: 'crb.tinkering', points: 2, karma: 2, expertise: 'Clockwork' })
  const { skillPoints, karma } = budgets(b)
  // 5 ranks and the specialization's 3 fit the 11; the expertise's 5 don't, so it's bought with karma (7)
  expect(skillPoints).toEqual({ max: 11, spent: 3 + 3 + 2, left: 3 })
  expect(skillRank(b.skills[1])).toBe(4)
  expect(karma.spent).toBe((4 + 3) * 3 + 7)
  expect(karma.breakdown).toContainEqual({ key: 'skills', label: 'Skill ranks bought with karma', amount: 28, sign: 'spend', tab: 'skills' })
})

test('a specialization the skill points left over can’t cover is bought with karma, never overspending the points', () => {
  const b = runner() // 11 skill points; a specialization 3 of them, or 7 karma
  b.skills.push({ id: 'crb.gab', points: 6, karma: 0, spec: 'Haggling' }, { id: 'crb.tinkering', points: 3, karma: 0, spec: 'Gizmos' })
  let { skillPoints, karma } = budgets(b)
  expect(skillPoints).toEqual({ max: 11, spent: 9, left: 2 }) // 9 ranks: 2 points left, neither specialization fits
  expect(karma.spent).toBe(2 * 7)
  b.skills[1].points = 2;
  ({ skillPoints, karma } = budgets(b))
  expect(skillPoints).toEqual({ max: 11, spent: 8 + 3, left: 0 }) // 3 left: the first takes them, the second is karma's
  expect(karma.spent).toBe(7)
})

test('a specialization on a skill with only karma ranks is bought with karma', () => {
  const b = runner()
  b.skills.push({ id: 'crb.gab', points: 0, karma: 1, spec: 'Fibbing' })
  const { skillPoints, karma } = budgets(b)
  expect(skillPoints.spent).toBe(0)
  expect(karma.spent).toBe(1 * 3 + 7)
})

// qualities and karma
test('a quality priced in a range costs the karma it was taken for, kept within the range; unset, the lowest', () => {
  const b = runner(), ranged: Over = { data: d => { d.qualities['crb.butterfingers'].karmaMax = 14 } }
  quality(b, 'crb.butterfingers')
  expect(budgets(b, ranged).karma.max).toBe(40 + 8)
  b.qualities[0].karma = 11
  expect(budgets(b, ranged).karma.max).toBe(40 + 11)
  b.qualities[0].karma = 99
  expect(budgets(b, ranged).karma.max).toBe(40 + 14)
  expect(budgets(b).karma.max).toBe(40 + 8) // no range: its own karma, whatever the line says
})

test('free traits cost nothing; negatives add karma and positives spend it, level times karma', () => {
  const b = runner()
  quality(b, 'crb.stoneskin', 1, true)
  quality(b, 'crb.lucky-streak', 3, true)
  expect(budgets(b).karma).toMatchObject({ max: 40, spent: 0 })
  quality(b, 'crb.butterfingers')
  quality(b, 'crb.lucky-streak', 2)
  quality(b, 'crb.knack')
  const { karma } = budgets(b)
  expect(karma).toMatchObject({ max: 48, spent: 8 + 13, left: 48 - 21 })
  expect(karma.breakdown).toContainEqual({ key: 'qualityNeg', label: 'Negative qualities', amount: 8, sign: 'gain', tab: 'qualities' })
  expect(budgets(b, { rules: { positiveQualityFactor: 2 } }).karma.spent).toBe(42)
})

test('a quality gone from the catalog counts nothing (Review reports it)', () => {
  const b = runner()
  quality(b, 'crb.gone', 2)
  expect(budgets(b).karma.spent).toBe(0)
})

test('karma turns into nuyen at the rate, at the in-debt rate with the quality, up to the most', () => {
  const b = runner()
  b.karmaToNuyen = 5
  let r = budgets(b)
  expect(r.karma.spent).toBe(5)
  expect(r.nuyen.max).toBe(420000 + 5 * 1500)
  expect(r.nuyen.breakdown).toContainEqual({ key: 'fromKarma', label: '5 karma turned into nuyen', amount: 7500, sign: 'gain', tab: 'contacts' })
  quality(b, 'crb.deep-pockets-debt')
  expect(budgets(b).nuyen.max).toBe(420000 + 5 * 3500)
  b.karmaToNuyen = 9
  r = budgets(b)
  expect(r.karma.spent).toBe(7)
  expect(r.nuyen.max).toBe(420000 + 7 * 3500)
})

// magic
test('free spells are the priority Magic times the setting; extras and rituals past them cost karma', () => {
  const b = runner({ letters: 'CBADA', magic: 'full' }) // magic A: full 4
  const { spellSlots } = budgets(b)
  expect(spellSlots).toEqual({ max: 12, spent: 0, left: 12 })
  for (let i = 0; i < 12; i++) pick(b, 'spells', 'crb.glow-ward')
  expect(budgets(b).karma.spent).toBe(0)
  pick(b, 'rituals', 'crb.moon-circle')
  const r = budgets(b)
  expect(r.karma.spent).toBe(7)
  expect(r.spellSlots.left).toBe(-1)
  expect(r.karma.breakdown?.find(l => l.key === 'spells')).toMatchObject({ amount: 7, tab: 'magic' })
})

test('the priority Magic, not the adjusted rating, sets the allotment', () => {
  const b = runner({ letters: 'CBADA', magic: 'full' })
  b.attributes.mag.adjust = 2
  expect(budgets(b).spellSlots.max).toBe(12)
})

test('an adept gets power points equal to Magic, raised Magic included (CRB p.157); a leveled power costs per level', () => {
  const b = runner({ magic: 'adept' }) // magic B: adept 5
  pick(b, 'adeptpowers', 'crb.quick-step', { level: 3 })
  expect(budgets(b).powerPoints).toEqual({ max: 5, spent: 0.75, left: 4.25, cap: 5 })
  expect(budgets(b).karma.spent).toBe(0)
})
test('Magic raised with adjustment points or karma raises an adept’s power points too', () => {
  const b = runner({ magic: 'adept' }) // magic B: adept 5
  b.attributes.mag.adjust = 1
  b.attributes.mag.karma = 1
  expect(budgets(b).powerPoints).toMatchObject({ max: 7, cap: 7 })
})

test('a mystic adept splits its Magic between power points and spells; a technomancer gets forms', () => {
  const b = runner({ magic: 'mystic-adept' }) // magic B: mystic adept 3
  b.powerPointsBought = 1
  const r = budgets(b)
  expect(r.powerPoints).toMatchObject({ max: 1, cap: 3 })
  expect(r.spellSlots.max).toBe((3 - 1) * 3)
  expect(r.karma.spent).toBe(0)
  const t = runner({ letters: 'CBADA', magic: 'technomancer' })
  pick(t, 'complexforms', 'crb.static-veil')
  expect(budgets(t).spellSlots).toEqual({ max: 12, spent: 1, left: 11 })
})

test('initiation grades are bought with karma, base plus grade times the per-grade price', () => {
  const b = runner({ magic: 'full' })
  b.initiation = 2
  const { karma } = budgets(b)
  expect(karma.spent).toBe((9 + 3) + (9 + 6))
  expect(karma.breakdown).toContainEqual({ key: 'initiation', label: 'Initiation grade 2', amount: 27, sign: 'spend', tab: 'magic' })
})

// knowledge
test('knowledge: Logic times the setting free, a native language free, karma ranks at the flat price', () => {
  const b = runner()
  b.attributes.log.points = 2
  b.knowledge.push({ uid: 'k1', name: 'Rooftops', kind: 'knowledge', points: 2, karma: 2 },
    { uid: 'k2', name: 'Cant', kind: 'language', native: true, points: 0, karma: 0 })
  const r = budgets(b)
  expect(r.knowledgePoints).toEqual({ max: 3 * 2, spent: 2, left: 4 })
  expect(r.karma.spent).toBe(2 * 3)
  b.knowledge[0].karma = 0
  b.skills.push({ id: 'crb.gab', points: 0, karma: 2 })
  expect(budgets(b).karma.spent).toBeGreaterThan(2 * 3) // an active skill's two karma ranks cost more
})

// gear (the Zap Gun costs 290: the fixture's edit)
test('rated gear costs, weighs Essence and rises in Availability by rating; unrated gear keeps its flat price', () => {
  const { data, cr } = made()
  const line = (kind: PurchaseKind, id: string, rating?: number): Sr6Purchase => ({ uid: 'x', kind, id, rating, qty: 1, accessories: [] })
  expect(priced(line('augmentations', 'crb.glow-eyes', 2), data, cr)).toMatchObject({ cost: 1000, avail: 3, essence: 0.2, ok: true })
  expect(priced(line('electronics', 'crb.buzz-box', 4), data, cr)).toMatchObject({ cost: 600, avail: 4, essence: 0, ok: true })
  expect(priced(line('weapons', 'crb.zap-gun'), data, cr)).toMatchObject({ cost: 290, avail: 2, essence: 0, ok: true })
  expect(priced(line('gear', 'crb.tangle-rope'), data, cr).cost).toBe(50) // no rating: the lowest it comes in
})

test('an accessory adds its cost; a grade multiplies Essence and cost and raises Availability', () => {
  const { data, cr } = made()
  const gun: Sr6Purchase = { uid: 'g', kind: 'weapons', id: 'crb.zap-gun', qty: 1, accessories: [
    { uid: 'a', kind: 'gear', id: 'crb.zap-scope', qty: 1, accessories: [] }] }
  expect(priced(gun, data, cr)).toMatchObject({ cost: 290 + 350, avail: 2 })
  const eyes: Sr6Purchase = { uid: 'e', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2, grade: 'alpha', qty: 1, accessories: [] }
  const r = priced(eyes, data, cr)
  expect(r.cost).toBe(1500)
  expect(r.essence).toBeCloseTo(0.14)
  expect(r.avail).toBe(6)
})

test('a custom item costs what the player says; a stacked line costs per unit', () => {
  const { data, cr } = made()
  expect(priced({ uid: 'c', kind: 'gear', name: 'Lucky charm', cost: 75, avail: 1, qty: 1, accessories: [] }, data, cr))
    .toMatchObject({ cost: 75, avail: 1, essence: 0, ok: true })
  expect(priced({ uid: 's', kind: 'gear', id: 'crb.zap-pellets', qty: 3, accessories: [] }, data, cr).cost).toBe(63)
})

test('a value the app can’t read counts 0 and says so; totals stay numbers', () => {
  const b = runner()
  buy(b, 'weapons', 'crb.zap-gun')
  buy(b, 'weapons', 'crb.fizz-rifle-70')
  const r = budgets(b, { data: d => { d.entry('weapons', 'crb.zap-gun')!.attrs.cost = '12x' } })
  expect(priced(b.purchases[0], r.data, r.cr)).toMatchObject({ cost: 0, avail: 2, essence: 0, ok: false })
  expect(r.nuyen.spent).toBe(1150)
  expect(Number.isFinite(r.nuyen.left)).toBe(true)
})

test('Essence: the setting less what augmentations take, and the Magic it costs', () => {
  const b = runner()
  buy(b, 'augmentations', 'crb.glow-eyes', { rating: 3 })
  buy(b, 'augmentations', 'crb.spring-tendons', { rating: 1 })
  const { essence } = budgets(b)
  expect(essence).toEqual({ max: 5, spent: 0.5, left: 4.5, magicLoss: 1 })
})

// nuyen
test('nuyen: an empty breakdown with nothing bought', () => {
  const { nuyen } = budgets(runner({ letters: 'CABDE' }))
  expect(nuyen).toEqual({ max: 8200, spent: 0, left: 8200, breakdown: [] })
})

test('nuyen: gear per line, lifestyle times months, a fake SIN and licences by rating, a real SIN free', () => {
  const b = runner({ letters: 'CABDE' })
  buy(b, 'weapons', 'crb.zap-gun')
  b.sins.push({ uid: 's1', name: 'Jo Nobody', kind: 'fake', rating: 2, licences: [{ name: 'Zapper', rating: 1 }], lifestyles: [{ uid: 'l1', id: 'crb.cozy', months: 2 }] },
    { uid: 's2', name: 'Me', kind: 'real', licences: [{ name: 'Driving', rating: 2 }], lifestyles: [{ uid: 'l2', id: 'crb.cozy', months: 1 }] })
  const { nuyen } = budgets(b)
  expect(nuyen.breakdown).toEqual([
    { key: `purchase:${b.purchases[0].uid}`, label: 'Zap Gun', amount: 290, sign: 'spend', tab: 'gear' },
    { key: 'lifestyle:l1', label: 'Cozy lifestyle × 2 months (Jo Nobody)', amount: 5000, sign: 'spend', tab: 'contacts' },
    { key: 'lifestyle:l2', label: 'Cozy lifestyle × 1 month (Me)', amount: 2500, sign: 'spend', tab: 'contacts' },
    { key: 'sin:s1', label: 'Jo Nobody (fake SIN, rating 2) · 1 licence', amount: 3000 + 300, sign: 'spend', tab: 'contacts' },
    { key: 'sin:s2', label: 'Me (real SIN) · 1 licence', amount: 600, sign: 'spend', tab: 'contacts' },
  ])
  expect(nuyen.spent).toBe(290 + 5000 + 2500 + 3300 + 600)
  expect(nuyen.left).toBe(8200 - nuyen.spent)
})

test('nuyen: augmentations and vehicles link to their own tabs', () => {
  const b = runner()
  buy(b, 'augmentations', 'crb.glow-eyes', { rating: 1 })
  buy(b, 'vehicles', 'crb.hover-buzzer')
  expect(budgets(b).nuyen.breakdown?.map(l => [l.label, l.tab])).toEqual([['Glow Eyes (rating 1)', 'augmentations'], ['Hover Buzzer', 'vehicles']])
})

// contacts
test('contacts: Charisma times the setting, rating cap Charisma; three contacts spend it exactly', () => {
  const b = runner()
  b.attributes.cha.points = 2
  for (const name of ['Fixer', 'Doc', 'Decker']) b.contacts.push({ uid: name, name, archetype: name, connection: 2, loyalty: 1 })
  expect(budgets(b).contactPoints).toEqual({ max: 9, spent: 9, left: 0, ratingCap: 3 })
})

// the bag
test('allBudgets: every budget; character points only for point buy, attribute points from the provider', () => {
  const pr = budgets(runner())
  expect(Object.keys(pr).filter(k => !['p', 'data', 'cr'].includes(k)).sort()).toEqual(['adjustmentPoints', 'attributePoints',
    'contactPoints', 'essence', 'karma', 'knowledgePoints', 'nuyen', 'powerPoints', 'skillPoints', 'spellSlots'])
  const b = buildOf('pointbuy', { metatype: STONE })
  b.cp.attribute = 2
  b.attributes.bod.points = 4
  const r = budgets(b)
  expect(r.characterPoints).toEqual({ max: 90, spent: 6, left: 84 })
  expect(r.attributePoints).toEqual({ max: 5, spent: 4, left: 1 })
  expect(r.karma.breakdown).toContainEqual({ key: 'metatype', label: 'Stonefolk', amount: 11, sign: 'spend', tab: 'method' })
})

test('karma build: the metatype and magic kind are charged from its pool', () => {
  const b = buildOf('karma', { metatype: GLIM, magic: 'adept' })
  const { karma } = budgets(b)
  expect(karma).toMatchObject({ max: 900, spent: 7 + 19 })
  expect(karma.breakdown).toContainEqual({ key: 'magic', label: 'Adept', amount: 19, sign: 'spend', tab: 'method' })
})
