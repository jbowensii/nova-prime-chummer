// SR6 budget functions in their less-travelled corners (src/sr6/runner-builder/domain/creation/budgets.ts): the free spell slots by method, a
// cargo factor, point-buy power points, the contacts' pair cap, Sensitive System, a purchase priced by a missing formula,
// the highest Magic by grade. Invented numbers on the made-up fixture.
import { expect, test } from 'vitest'
import {
  allBudgets,
  cargoFactor,
  contactPoints,
  essenceBudget,
  freeSpellSlots,
  magicCap,
  powerCost,
  powerPoints,
  priced,
  seatsOf,
  sensitiveFactor,
} from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { buildOf, GLIM, made } from '../catalog/fixture'
import type { Sr6Purchase } from '../../../src/sr6/formats/domain/character'

const world = (b: ReturnType<typeof buildOf>, over?: Parameters<typeof made>[0]) => {
  const { data, cr } = made(over)
  return { data, cr, p: makeProvider(b.method, data, cr) }
}
const line = (id: string, kind: Sr6Purchase['kind'], more: Partial<Sr6Purchase> = {}): Sr6Purchase => ({ uid: id, kind, id, qty: 1, accessories: [], ...more })

test('free spell slots: point buy gives the character points bought; others the rating times the setting, a technomancer’s forms, a mundane none', () => {
  const pb = buildOf('pointbuy', { metatype: GLIM, magic: 'full' })
  pb.cp.spells = 4
  pb.cp.complexForms = 2
  const w = world(pb)
  expect(freeSpellSlots(pb, w.data, w.cr, w.p)).toBe(4)
  const tm = buildOf('pointbuy', { metatype: GLIM, magic: 'technomancer' })
  tm.cp.complexForms = 2
  expect(freeSpellSlots(tm, w.data, w.cr, w.p)).toBe(2)
  const mundane = buildOf('pointbuy', { metatype: GLIM })
  mundane.cp.spells = 3
  expect(freeSpellSlots(mundane, w.data, w.cr, w.p)).toBe(0)
  const karma = buildOf('karma', { metatype: GLIM, magic: 'technomancer' })
  const wk = world(karma)
  expect(freeSpellSlots(karma, wk.data, wk.cr, wk.p)).toBe(1 * 1) // Resonance 1 × karmaBuild.freeFormsPerResonance
  const plain = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const wp = world(plain)
  expect(freeSpellSlots(plain, wp.data, wp.cr, wp.p)).toBe(0)
})

test('free spell slots: a mystic adept casts with its actual Magic less the power points bought', () => {
  const ma = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mystic-adept' })
  ma.powerPointsBought = 4
  const w = world(ma, { rules: { freeSpellsPerMagic: 2 } })
  ma.attributes.mag.adjust = 6 - w.p.magicRating(ma) // raised to Magic 6
  expect(freeSpellSlots(ma, w.data, w.cr, w.p)).toBe(4)
  const mundane = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  expect(freeSpellSlots(mundane, w.data, w.cr, w.p)).toBe(0)
})

test('power points: point buy takes the character points, a mystic adept the ones bought (half a point under the alternate rule), a non-adept none', () => {
  const pb = buildOf('pointbuy', { metatype: GLIM, magic: 'adept' })
  pb.cp.powerPoints = 5
  const w = world(pb)
  expect(powerPoints(pb, w.data, w.cr, w.p)).toMatchObject({ max: 5, spent: 0, left: 5 })
  const ma = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mystic-adept' })
  ma.powerPointsBought = 3
  const wm = world(ma)
  expect(powerPoints(ma, wm.data, wm.cr, wm.p).max).toBe(3)
  const alt = world(ma, { rules: { alternateMysticAdept: true } })
  expect(powerPoints(ma, alt.data, alt.cr, alt.p).max).toBe(1.5)
  const full = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'full' })
  const wf = world(full)
  expect(powerPoints(full, wf.data, wf.cr, wf.p).max).toBe(0)
})

test('a power costs its level times its price; a combat skill’s Improved Ability price applies to a skill its note names', () => {
  const { data } = made({
    data: d => {
      d.powers['crb.quick-step'] = { ...d.powers['crb.quick-step'], cost: 0.5, costCombat: 1, perLevel: true }
    },
  })
  expect(powerCost(data, { id: 'crb.quick-step', level: 3 })).toBe(1.5)
  expect(powerCost(data, { id: 'crb.quick-step' })).toBe(0.5)
  expect(powerCost(data, { id: 'crb.nope', level: 2 })).toBe(0)
  expect(powerCost(data, { id: 'crb.quick-step', level: 2, note: 'Tinkering' })).toBe(1)
})

test('contacts: the expanded rule’s pair cap makes karma only past the pair; without the pair setting there is no pair cap', () => {
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  b.contacts.push({ uid: 'c', name: 'Mo', archetype: 'fixer', connection: 3, loyalty: 3 })
  const w = world(b, { rules: { contactKarma: 2, contactRatingMax: 6 } })
  const open = contactPoints(b, w.data, w.cr, w.p)
  expect(open).toMatchObject({ ratingCap: 6 })
  expect(open.karma).toBe(6) // 6 points spent, 3 in the pool: the 3 past it cost 2 karma each
  const pair = world(b, { rules: { contactKarma: 2, contactPairPerCha: 1 } })
  const capped = contactPoints(b, pair.data, pair.cr, pair.p)
  expect(capped.karma).toBe(16) // the 3 past the pool, and the 5 a pair of 6 has past one Charisma
  const off = world(b, { unset: ['expandedContacts'], rules: { contactKarma: 2 } })
  expect(contactPoints(b, off.data, off.cr, off.p).karma).toBeUndefined()
})

test('the highest Magic: magicMax, plus the grade only as an option; none when magicMax is unset', () => {
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'full' })
  b.initiation = 2
  b.submersion = 1
  const { cr } = made()
  expect([magicCap(b, cr, 'mag'), magicCap(b, cr, 'res')]).toEqual([7, 7])
  const on = made({ rules: { magicAboveSixByGrade: true } }).cr
  expect([magicCap(b, on, 'mag'), magicCap(b, on, 'res')]).toEqual([9, 8])
  expect(magicCap(b, made({ unset: ['magicMax'] }).cr, 'mag')).toBeUndefined()
})

test('cargo: a vehicle’s seats, a motorcycle’s smaller share, a truck’s four more, and seats taken out; none printed is none', () => {
  const { data } = made()
  const putt = data.entry('vehicles', 'crb.putt-putt')!,
    buzz = data.entry('vehicles', 'crb.hover-buzzer')!
  expect(seatsOf(putt)).toBe(1)
  expect(seatsOf({ ...putt, attrs: { ...putt.attrs, seats: '2/4' } })).toBe(4)
  expect(seatsOf(undefined)).toBe(0)
  expect(cargoFactor(line('v', 'vehicles'), buzz)).toBeNull()
  expect(cargoFactor(line('v', 'vehicles'), putt)).toEqual({ seats: 1, cargo: 1 + 0 })
  const bike = { ...putt, attrs: { ...putt.attrs, seats: '4', category: 'motorcycles' } }
  expect(cargoFactor(line('v', 'vehicles'), bike)).toEqual({ seats: 4, cargo: 5 })
  expect(cargoFactor(line('v', 'vehicles', { seatsRemoved: 9 }), bike)).toEqual({ seats: 0, cargo: 10 })
  const truck = { ...putt, attrs: { ...putt.attrs, seats: '2', category: 'trucks' } }
  expect(cargoFactor(line('v', 'vehicles', { seatsRemoved: 1 }), truck)).toEqual({ seats: 1, cargo: 5 + 4 }) // (4.5 rounded half up, as Commlink6)
})

test('Sensitive System doubles the Essence of cyberware, bioware and nanoware only; without the setting or the quality it is 1', () => {
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const rules = { sensitiveSystemQuality: 'crb.knack', sensitiveSystemEssence: 2 }
  const w = world(b, { rules })
  const cyber = line('crb.glow-eyes.1', 'augmentations')
  expect(sensitiveFactor(b, w.data, w.cr, cyber)).toBe(1)
  b.qualities.push({ uid: 'q', id: 'crb.knack', level: 1 })
  expect(sensitiveFactor(b, w.data, w.cr, cyber)).toBe(2)
  expect(sensitiveFactor(b, w.data, w.cr, line('crb.zap-gun', 'weapons'))).toBe(1)
  expect(sensitiveFactor(b, w.data, w.cr, line('x', 'gear'))).toBe(1)
  expect(sensitiveFactor(b, world(b).data, world(b).cr, cyber)).toBe(1)
  b.purchases.push(cyber)
  const plain = essenceBudget(b, w.data, world(b).cr).left,
    doubled = essenceBudget(b, w.data, w.cr).left
  expect(doubled).toBeLessThan(plain)
})

test('a line priced by a formula that needs what is not there is unpriced, never 0 cost passed off as read; a custom line uses its own numbers', () => {
  const xml = (f: string) => ({
    data: (d: ReturnType<typeof made>['data']) => {
      const old = d.entry
      d.entry = (k, id) => (id === 'crb.zap-scope' ? { ...old(k, id)!, formulas: [{ field: 'cost', expr: f }] } : old(k, id))
    },
  })
  const { data, cr } = made(xml('ref(gear:crb.gone, cost)'))
  const r = priced(line('crb.zap-scope', 'gear'), data, cr)
  expect(r).toMatchObject({ ok: false, unpriced: true, cost: 0 })
  const custom = priced({ uid: 'c', kind: 'gear', name: 'Mine', cost: 40, avail: 3, essence: 0.5, qty: 2, accessories: [] }, data, cr)
  expect(custom).toMatchObject({ cost: 80, avail: 3, essence: 1, ok: true })
  const ok = made(xml('Q * 10'))
  expect(priced(line('crb.zap-scope', 'gear', { qty: 3 }), ok.data, ok.cr).cost).toBe(30) // Q in the formula: the line's whole price
})

test('an add-on priced as a multiple of its host adds the host’s price times one less; a grade changes cost, Essence and Availability', () => {
  const { data, cr } = made()
  const gun = line('crb.zap-gun', 'weapons', { accessories: [line('crb.fizz-rounds', 'ammotypes', { uid: 'r' })] })
  const plain = priced(line('crb.zap-gun', 'weapons'), data, cr)
  const loaded = priced(gun, data, cr)
  expect(loaded.cost).toBeGreaterThan(plain.cost)
  const g = priced(line('crb.glow-eyes.2', 'augmentations', { grade: 'alpha' }), data, cr)
  const s = priced(line('crb.glow-eyes.2', 'augmentations'), data, cr)
  expect(g.cost).toBe(s.cost * 1.5)
  expect(g.essence).toBeCloseTo(s.essence * 0.7)
  expect(g.avail).toBe(s.avail + 3)
})

test('allBudgets reports a point-buy runner’s character points beside the others', () => {
  const pb = buildOf('pointbuy', { metatype: GLIM })
  const w = world(pb)
  expect(allBudgets(pb, w.data, w.cr, w.p).characterPoints).toBeDefined()
  const pr = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const wp = world(pr)
  expect(allBudgets(pr, wp.data, wp.cr, wp.p).characterPoints).toBeUndefined()
})
