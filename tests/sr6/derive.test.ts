// Derived values (src/sr6/engine/derive.ts) on one invented runner. The formulas are code; their constants are
// creation settings with invented values here (monitor base 9, divided by 3, 2 initiative dice, +4 for a
// specialization, +5 for an expertise, 2 off an untrained skill), none of them the book's.
import { expect, test } from 'vitest'
import { allBudgets } from '../../src/sr6/engine/budgets'
import { deriveSr6 } from '../../src/sr6/engine/derive'
import { makeProvider } from '../../src/sr6/engine/providers'
import { blankSr6, type MagicKind, type Sr6Attr, type Sr6Character, type Sr6Purchase } from '../../src/sr6/model/character'
import { buildOf, GLIM, made } from './fixture'

type Over = Parameters<typeof made>[0]
const DERIVED = { monitorBase: 9, monitorDivisor: 3, initiativeDice: 2, astralInitiativeDice: 3, specDice: 4, expertiseDice: 5, untrainedPenalty: 2 }
/** Glimmerkin, priority CABDA (magic B): BOD 4, AGI 3, REA 5, STR 2, WIL 3, LOG 4, INT 5, CHA 2, EDG 3. */
function runner(magic: MagicKind = 'mundane'): Sr6Character {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic })
  const pts: Partial<Record<Sr6Attr, number>> = { bod: 3, agi: 2, rea: 4, str: 1, wil: 2, log: 3, int: 4, cha: 1, edg: 2 }
  for (const [k, v] of Object.entries(pts)) ch.build.attributes[k as Sr6Attr].points = v
  return ch
}
function derive(ch: Sr6Character, over: Over = {}) {
  const { data, cr } = made({ ...over, rules: { ...DERIVED, ...over.rules } })
  return { d: deriveSr6(data, cr, ch), data, cr }
}
let n = 0
const buy = (ch: Sr6Character, kind: Sr6Purchase['kind'], id: string | undefined, more: Partial<Sr6Purchase> = {}) => {
  const p: Sr6Purchase = { uid: `p${++n}`, kind, id, qty: 1, accessories: [], ...more }
  ch.build.purchases.push(p)
  return p
}

test('each formula on one invented runner', () => {
  const ch = runner(), { d, data, cr } = derive(ch)
  expect(d.attrs.rea).toEqual({ natural: 5, augmented: 5 })
  expect(d.initiative).toEqual({ base: 5 + 5, dice: 2 })
  expect(d.monitors).toEqual({ physical: 9 + Math.ceil(4 / 3), stun: 9 + Math.ceil(3 / 3), overflow: 4 })
  expect(d.defenseRating).toBe(4)
  expect(d.attackRatings).toEqual({ unarmed: 5 + 2, weapons: [] })
  expect([d.composure, d.judgeIntentions, d.memory, d.liftCarry]).toEqual([3 + 2, 3 + 5, 4 + 5, 4 + 3])
  expect(d.edge).toBe(3)
  expect(d.essence).toBe(5)
  expect(d.magicMax).toBe(7)
  expect([d.drain, d.fading, d.astralInit]).toEqual([undefined, undefined, undefined])
  const p = makeProvider('priority', data, cr), bud = allBudgets(ch.build, data, cr, p)
  expect([d.karmaLeft, d.nuyenLeft]).toEqual([bud.karma.left, bud.nuyen.left])
  expect(d.unset).toEqual([])
})

test('no bonus leaves the attributes alone; a power bonus is augmented, not natural; a rated ware bonus scales by rating', () => {
  const plain = derive(runner()).d
  for (const a of Object.values(plain.attrs)) expect(a.augmented).toBe(a.natural)
  const ch = runner('adept')
  ch.build.picks.push({ uid: 'k1', kind: 'adeptpowers', id: 'crb.quick-step', level: 2, bonuses: [{ target: 'agi', value: 1 }, { target: 'initDice', value: 1 }] })
  buy(ch, 'augmentations', 'crb.glow-eyes', { rating: 2, bonuses: [{ target: 'int', value: 1, perRating: true }] })
  const { d } = derive(ch)
  expect(d.attrs.agi).toEqual({ natural: 3, augmented: 4 })
  expect(d.attrs.int).toEqual({ natural: 5, augmented: 7 })
  expect(d.initiative).toEqual({ base: 5 + 7, dice: 2 + 1 })
  expect(d.judgeIntentions).toBe(3 + 7)
})

test('the initiative dice cap, when set, holds the dice (an invented cap of 2); unset, no cap and nothing listed as unset', () => {
  const ch = runner('adept')
  ch.build.picks.push({ uid: 'k1', kind: 'adeptpowers', id: 'crb.quick-step', level: 2, bonuses: [{ target: 'initDice', value: 1 }] })
  expect(derive(ch, { rules: { initiativeDiceMax: 2 } }).d.initiative.dice).toBe(2)
  expect(derive(ch, { rules: { initiativeDiceMax: 4 } }).d.initiative.dice).toBe(2 + 1)
  const free = derive(ch).d
  expect(free.initiative.dice).toBe(2 + 1)
  expect(free.unset).not.toContain('initiativeDiceMax')
})

test('the Built Tough quality (set to a made-up one) adds a Physical box per level; unset, none', () => {
  const ch = runner()
  ch.build.qualities.push({ uid: 'q1', id: 'crb.lucky-streak', level: 2 })
  const plain = derive(ch).d.monitors.physical!
  expect(derive(ch, { rules: { builtToughQuality: 'crb.lucky-streak' } }).d.monitors).toMatchObject({ physical: plain + 2, stun: 9 + 1 })
})

test('a Defense Rating bonus (a made-up plating at rating 2) adds to the Defense Rating', () => {
  const ch = runner()
  buy(ch, 'augmentations', 'crb.glow-eyes', { rating: 2, bonuses: [{ target: 'defense', value: 1, perRating: true }] })
  expect(derive(ch).d.defenseRating).toBe(derive(runner()).d.defenseRating + 2)
})

test('worn armor adds its defense; armor not worn doesn’t', () => {
  const ch = runner(), vest = buy(ch, 'armor', 'crb.padded-vest')
  expect(derive(ch).d.defenseRating).toBe(4)
  vest.worn = true
  expect(derive(ch).d.defenseRating).toBe(4 + 2)
})

test('a weapon AR of 4/10/8/—/— gives three bands', () => {
  const ch = runner(), rifle = buy(ch, 'weapons', 'crb.fizz-rifle-70')
  const custom = buy(ch, 'weapons', undefined, { name: 'Pipe' })
  expect(derive(ch).d.attackRatings.weapons).toEqual([
    { uid: rifle.uid, name: 'Fizz Rifle 70', bands: [4, 10, 8, null, null] },
    { uid: custom.uid, name: 'Pipe', bands: [null, null, null, null, null] }])
})

test('dice pools: rank plus the augmented attribute, a spec and an expertise on top, untrained skills at the attribute less the penalty', () => {
  const ch = runner()
  ch.build.skills.push({ id: 'crb.gab', points: 3, karma: 1, spec: 'Haggling', expertise: 'Fibbing' })
  const { d } = derive(ch)
  expect(d.pools).toEqual([
    { skill: 'crb.gab', label: 'Gab', rank: 4, attr: 'cha', dp: 4 + 2, spec: 'Haggling', specDp: 6 + 4, expertise: 'Fibbing', expertiseDp: 6 + 5 },
    { skill: 'crb.tinkering', label: 'Tinkering', rank: 0, attr: 'log', dp: 4 - 2 },
  ])
})

test('an essence loss of 0.3 lowers the highest Magic and the Magic by 1', () => {
  const ch = runner('full')
  buy(ch, 'augmentations', 'crb.glow-eyes', { rating: 3 })
  const { d } = derive(ch)
  expect(d.essence).toBe(4.7)
  expect(d.magicLoss).toBe(1)
  expect(d.magicMax).toBe(7 - 1)
  expect(d.attrs.mag.natural).toBe(3 - 1)
})

test('drain, fading and astral initiative by magic kind', () => {
  const mage = runner('full')
  mage.build.drainAttr = 'log'
  const m = derive(mage).d
  expect(m.drain).toBe(3 + 4)
  expect(m.astralInit).toEqual({ base: 4 + 5, dice: 3 }) // LOG + INT
  expect(derive(runner('adept')).d.astralInit).toBeUndefined()
  expect(derive(runner('technomancer')).d.fading).toBe(3 + 4)
})

test('an unset constant leaves its value empty and is listed; nothing is NaN', () => {
  const ch = runner()
  ch.build.skills.push({ id: 'crb.gab', points: 2, karma: 0, spec: 'Haggling' })
  const { d } = derive(ch, { unset: ['monitorBase', 'initiativeDice', 'specDice', 'untrainedPenalty', 'magicMax'] })
  expect(d.monitors).toEqual({ physical: null, stun: null, overflow: 4 })
  expect(d.initiative.dice).toBeNull()
  expect(d.magicMax).toBeNull()
  expect(d.pools).toEqual([{ skill: 'crb.gab', label: 'Gab', rank: 2, attr: 'cha', dp: 4, spec: 'Haggling' }])
  expect(d.unset.sort()).toEqual(['initiativeDice', 'magicMax', 'monitorBase', 'specDice', 'untrainedPenalty'])
})
