// The core rulebook's derived values (CRB Hong Kong: Overflow p. 121, the +4 caps pp. 37 and 39, the 5D6 cap p. 39, the
// monitor floor p. 76, Matrix initiative p. 179, movement pp. 42 and 44, unarmed damage p. 94, spell Attack Rating
// p. 132, melee Attack Ratings p. 39, Edge from the ratings p. 45) and the Sixth World Companion's options on them
// (pp. 144, 150), on one invented runner. Every setting value, entry and number here is made up.
import { expect, test } from 'vitest'
import { ratingEdge, specFits, weaponSkill } from '../../src/sr6/engine/derive'
import { deriveSr6 } from '../../src/sr6/engine/derive'
import { sr6Data } from '../../src/sr6/engine/data'
import { bonusSources, bracketNotes } from '../../src/sr6/engine/bonuses'
import type { CreationValue } from '../../src/sr6/engine/creation'
import { blankSr6, type Bonus, type MagicKind, type Sr6Attr, type Sr6Character, type Sr6Purchase } from '../../src/sr6/model/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from './fixture'

const MORE: Record<string, string> = {
  'crb/skills.xml': `<skill id="crb.zapping" source="CRB" page="95" attr="agi" untrained="true"><name>Zapping</name><spec>Zappers</spec><spec>Fizzers</spec><text/></skill>
  <skill id="crb.close-combat" source="CRB" page="94" attr="agi" untrained="true"><name>Close Combat</name><spec>Swords</spec><text/></skill>
  <skill id="crb.oddments" source="CRB" page="95" attr="agi" untrained="false"><name>Exotic Weapons</name><text/></skill>`,
  'crb/weapons.xml': `<weapon id="crb.glitter-sword" source="CRB" page="250" category="Sword" dv="4P" ar="8/—/—/—/—" avail="2" cost="300"><name>Glitter Sword</name><text/></weapon>
  <weapon id="crb.noodle-whip" source="CRB" page="250" category="Noodle" dv="5P" ar="9/—/—/—/—" avail="2" cost="300"><name>Noodle Whip</name><note field="ar">Whips add the attacker’s Reaction instead of Strength</note><text/></weapon>
  <weapon id="crb.boomstick" source="CRB" page="250" category="Boom tube" dv="6P" modes="SS" ar="3/9/—/—/—" ammo="2(m)" avail="2" cost="300"><name>Boomstick</name><text/></weapon>`,
  'crb/electronics.xml': `<device id="crb.chatterbox" source="CRB" page="267" category="commlinks" rating="3" array="3/2" avail="2" cost="100"><name>Chatterbox</name><text/></device>`,
  'crb/qualities.xml': `<quality id="crb.lumpy-skin" source="CRB" page="71" kind="positive" karma="5"><name>Lumpy Skin</name><text/></quality>
  <quality id="crb.iron-bones" source="CRB" page="71" kind="positive" karma="5"><name>Iron Bones</name><effect target="derived:unarmed-dv" op="set" value="4"/><effect target="derived:unarmed-ar" op="add" value="2"/><text/></quality>
  <quality id="crb.centaur-body" source="CRB" page="71" kind="positive" karma="5"><name>Centaur Body</name><effect target="derived:movement" op="set" value="10/20/4"/><effect target="derived:movement" op="set" value="12/30/5" switch="conditional" when="galloping"/><text/></quality>
  <quality id="crb.drone-brain" source="CRB" page="71" kind="positive" karma="5"><name>Drone Brain</name><effect target="derived:initiative-dice" op="set" value="4" switch="activated"/><text/></quality>
  <quality id="crb.way-of-logic" source="CRB" page="71" kind="positive" karma="5"><name>Way of Logic</name><effect target="derived:adept-drain-attribute" op="set" value="log"/><text/></quality>
  <quality id="crb.way-of-any" source="CRB" page="71" kind="positive" karma="5"><name>Way of Any</name><effect target="derived:adept-drain-attribute" op="set" value="choice" switch="conditional" when="the Way"/><text/></quality>
  <quality id="crb.slow-legs" source="CRB" page="71" kind="positive" karma="5"><name>Slow Legs</name><effect target="derived:movement" op="set" value="8/16/2"/><text/></quality>
  <quality id="crb.hard-fists" source="CRB" page="71" kind="positive" karma="5"><name>Hard Fists</name><effect target="derived:unarmed-ar" op="set" value="6,0,0,0,0"/><effect target="derived:unarmed-dv" op="set" value="3P"/><text/></quality>
  <quality id="crb.fleet" source="CRB" page="71" kind="positive" karma="5"><name>Fleet</name><effect target="derived:movement" op="add" value="3"/><text/></quality>
  <quality id="crb.wings" source="CRB" page="71" kind="positive" karma="5"><name>Wings</name><effect target="derived:movement" op="add" value="-1/-1/0"/><effect target="derived:movement" op="add" value="R/R*2/1"/><effect target="derived:movement" op="add" value="10/30/3" switch="conditional" when="flying"/><effect target="derived:unarmed-ar" op="add" value="2,0,0,0,0"/><effect target="derived:unarmed-ar" op="add" value="1,1,0,0,0"/><text/></quality>`,
}
function setup(rules: Record<string, CreationValue> = {}) {
  const data = sr6Data(
    fixtureCatalog((f, x) => {
      const k = Object.keys(MORE).find(m => f.endsWith(m))
      return k ? x.replace('</sr6:data>', `${MORE[k]}\n</sr6:data>`) : x
    }),
  )
  const cr = fixtureCreation()
  for (const [key, value] of Object.entries(rules)) cr.set(key, { key, value })
  return { data, cr }
}
/** Glimmerkin, priority CABDA: BOD 4, AGI 3, REA 5, STR 2, WIL 3, LOG 4, INT 5, CHA 2, EDG 3 (as derive.test.ts). */
function runner(magic: MagicKind = 'mundane'): Sr6Character {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic })
  const pts: Partial<Record<Sr6Attr, number>> = { bod: 3, agi: 2, rea: 4, str: 1, wil: 2, log: 3, int: 4, cha: 1, edg: 2 }
  for (const [k, v] of Object.entries(pts)) ch.build.attributes[k as Sr6Attr].points = v
  return ch
}
let n = 0
const buy = (ch: Sr6Character, kind: Sr6Purchase['kind'], id: string | undefined, more: Partial<Sr6Purchase> = {}) =>
  ch.build.purchases.push({ uid: `p${++n}`, kind, id, qty: 1, accessories: [], ...more })
const boost = (ch: Sr6Character, bonuses: Bonus[]) => buy(ch, 'gear', undefined, { name: 'Made-up booster', bonuses })

test('Overflow is Body times overflowPerBody plus what adds to it; unset, Body counts nothing and the setting is listed', () => {
  const ch = runner()
  expect(deriveSr6(setup({ overflowPerBody: 3 }).data, setup({ overflowPerBody: 3 }).cr, ch).monitors.overflow).toBe(4 * 3)
  boost(ch, [{ target: 'overflow', value: 2 }])
  const { data, cr } = setup({ overflowPerBody: 3 })
  expect(deriveSr6(data, cr, ch).monitors.overflow).toBe(4 * 3 + 2)
  cr.delete('overflowPerBody')
  const d = deriveSr6(data, cr, ch)
  expect(d.monitors.overflow).toBe(2)
  expect(d.unset).toContain('overflowPerBody')
})

test('an augmented attribute stops at natural + attributeAugmentMax, the bracketed one too, and says what it left out', () => {
  const ch = runner()
  boost(ch, [
    { target: 'agi', value: 5 },
    { target: 'agi', value: 2, switch: 'wireless' },
    { target: 'str', value: -3 },
  ])
  const { data, cr } = setup({ attributeAugmentMax: 3 })
  const d = deriveSr6(data, cr, ch)
  expect(d.attrs.agi).toEqual({ natural: 3, augmented: 6 })
  expect(d.capped.agi).toBe(2)
  expect(d.on.attrs.agi.augmented).toBe(6)
  expect(d.on.capped.agi).toBe(4)
  expect(d.attrs.str.augmented).toBe(2 - 3) // (a penalty isn't capped)
  cr.delete('attributeAugmentMax')
  expect(deriveSr6(data, cr, ch).attrs.agi.augmented).toBe(3 + 5)
})

test('a skill pool’s bonuses stop at skillAugmentMax, the specialization’s bonus within it', () => {
  const ch = runner()
  ch.build.skills.push({ id: 'crb.gab', points: 2, karma: 0, spec: 'Haggling' })
  boost(ch, [
    { target: 'skill', skill: 'crb.gab', value: 3 },
    { target: 'skill', skill: 'crb.gab', value: 2, spec: 'Haggling' },
  ])
  const { data, cr } = setup({ skillAugmentMax: 4, specDice: 2 })
  const pool = deriveSr6(data, cr, ch).pools.find(p => p.skill === 'crb.gab')!
  expect(pool.dp).toBe(2 + 2 + 3)
  expect(pool.specDp).toBe(2 + 2 + 2 + 4) // 3 + 2 capped at 4
  expect(pool.capped).toBeUndefined()
  boost(ch, [{ target: 'skill', skill: 'crb.gab', value: 3 }])
  const capped = deriveSr6(data, cr, ch).pools.find(p => p.skill === 'crb.gab')!
  expect([capped.dp, capped.capped]).toEqual([2 + 2 + 4, 2])
})

test('the initiative dice stop at initiativeDiceMax; a lowered monitor stops at monitorMinimum', () => {
  const ch = runner()
  boost(ch, [
    { target: 'initDice', value: 6 },
    { target: 'stun', value: -20 },
  ])
  const { data, cr } = setup({ initiativeDiceMax: 4, monitorMinimum: 3, monitorBase: 9, monitorDivisor: 3 })
  const d = deriveSr6(data, cr, ch)
  expect(d.initiative.dice).toBe(4)
  expect(d.monitors.stun).toBe(3)
})

test('movement: a Move, a Sprint and its metres a hit, with what adds to movement; unset, none', () => {
  const ch = runner()
  ch.build.qualities.push({ uid: 'q1', id: 'crb.fleet', level: 1 })
  const { data, cr } = setup({ moveWalk: 7, moveSprint: 11, moveSprintPerHit: 2 })
  expect(deriveSr6(data, cr, ch).movement).toEqual({ walk: 7 + 3, sprint: 11 + 3, perHit: 2 })
  cr.delete('moveSprint')
  expect(deriveSr6(data, cr, ch).movement).toBeNull()
})

test('movement: an a/b/c effect adds to the Move, the Sprint and its metres a hit; a conditional one only in the bracketed total', () => {
  const ch = runner()
  ch.build.qualities.push({ uid: 'q1', id: 'crb.wings', level: 1 })
  const { data, cr } = setup({ moveWalk: 7, moveSprint: 11, moveSprintPerHit: 2 })
  const d = deriveSr6(data, cr, ch)
  // (-1/-1/0 and R/R*2/1 at rating 1: walk 0, sprint +1, +1 a hit; flying 10/30/3 on top, bracketed)
  expect(d.movement).toEqual({ walk: 7, sprint: 12, perHit: 3 })
  expect(d.on.movement).toEqual({ walk: 17, sprint: 42, perHit: 6 })
  // (a band list adds its first band only when the others add nothing: 2,0,0,0,0 yes, 1,1,0,0,0 never)
  expect(d.attackRatings.unarmed).toBe(5 + 2 + 2)
})

test('unarmed damage: the base Stun value; Physical with the Dermal Deposits quality the settings name or an effect setting it; plus high Strength with the option', () => {
  const ch = runner()
  const { data, cr } = setup({ unarmedDV: 3, dermalDepositsQuality: 'crb.lumpy-skin' })
  expect(deriveSr6(data, cr, ch).unarmedDamage).toEqual({ dv: 3, physical: false })
  ch.build.qualities.push({ uid: 'q1', id: 'crb.lumpy-skin', level: 1 })
  expect(deriveSr6(data, cr, ch).unarmedDamage).toEqual({ dv: 3, physical: true })
  ch.build.qualities = [{ uid: 'q2', id: 'crb.iron-bones', level: 1 }]
  const d = deriveSr6(data, cr, ch)
  expect(d.unarmedDamage).toEqual({ dv: 4, physical: true })
  expect(d.attackRatings.unarmed).toBe(5 + 2 + 2)
  // (STR 2 + 6 = 8: one step with the steps at 7 and 10)
  boost(ch, [{ target: 'str', value: 6 }])
  cr.set('highStrengthDamage', { key: 'highStrengthDamage', value: true })
  cr.set('strengthDamageStep1', { key: 'strengthDamageStep1', value: 7 })
  cr.set('strengthDamageStep2', { key: 'strengthDamageStep2', value: 10 })
  expect(deriveSr6(data, cr, ch).unarmedDamage?.dv).toBe(4 + 1)
  cr.delete('unarmedDV')
  expect(deriveSr6(data, cr, ch).unarmedDamage).toBeNull()
})

test('Matrix initiative: AR the physical one; VR Intuition + the best commlink’s Data Processing with the extra dice; a technomancer’s Logic', () => {
  const ch = runner()
  const { data, cr } = setup({ matrixColdDice: 2, matrixHotDice: 3, initiativeDiceMax: 5 })
  expect(deriveSr6(data, cr, ch).matrixInit).toBeUndefined()
  buy(ch, 'electronics', 'crb.chatterbox')
  const d = deriveSr6(data, cr, ch)
  // (initiativeDice 2 in the fixture; a wired booster's dice count only in AR)
  expect(d.matrixInit).toEqual({ ar: { base: 5 + 5, dice: 2 }, cold: { base: 5 + 3, dice: 2 + 2 }, hot: { base: 5 + 3, dice: 5 }, dataProcessing: 3 })
  boost(ch, [
    { target: 'initDice', value: 1 },
    { target: 'matrixInitDice', value: -1 },
  ])
  expect(deriveSr6(data, cr, ch).matrixInit?.ar.dice).toBe(3)
  expect(deriveSr6(data, cr, ch).matrixInit?.cold.dice).toBe(2 + 2 - 1)
  const tm = runner('technomancer')
  expect(deriveSr6(data, cr, tm).matrixInit?.dataProcessing).toBe(4)
})

test('a spellcaster’s Attack Rating is Magic + the tradition’s attribute; none for the others', () => {
  const ch = runner('full')
  ch.build.drainAttr = 'cha'
  const { data, cr } = setup()
  const d = deriveSr6(data, cr, ch)
  expect(d.spellAttackRating).toBe(d.attrs.mag.augmented + 2)
  expect(deriveSr6(data, cr, runner()).spellAttackRating).toBeUndefined()
})

test('a weapon’s skill, its dice pool (the specialization’s when it covers the weapon) and a melee weapon’s Attack Rating with Strength', () => {
  const { data, cr } = setup({ meleeArStrength: true, specDice: 2 })
  const e = (id: string) => data.entry('weapons', id)
  expect(weaponSkill(data, e('crb.zap-gun'))).toBe('crb.zapping') // its category names Zappers
  expect(weaponSkill(data, e('crb.glitter-sword'))).toBe('crb.close-combat') // Swords
  expect(weaponSkill(data, e('crb.boomstick'))).toBeUndefined() // no specialization names it and no Firearms skill
  expect(specFits('Light Pistols', 'Light pistol')).toBe(true)
  expect(specFits('Pistols', 'Heavy pistol')).toBe(true)
  expect(specFits('Rifles', 'Shotgun')).toBe(false)
  const ch = runner()
  ch.build.skills.push({ id: 'crb.zapping', points: 3, karma: 0, spec: 'Zappers' }, { id: 'crb.close-combat', points: 2, karma: 0 })
  buy(ch, 'weapons', 'crb.zap-gun')
  buy(ch, 'weapons', 'crb.fizz-rifle-70')
  buy(ch, 'weapons', 'crb.glitter-sword')
  buy(ch, 'weapons', 'crb.noodle-whip')
  const w = deriveSr6(data, cr, ch).attackRatings.weapons
  expect(w.map(x => x.pool)).toEqual([3 + 3 + 2, 3 + 3, 2 + 3, 2 + 3])
  expect(w[0].bands).toEqual([9, 7, null, null, null]) // a gun's as printed
  expect(w[2].bands[0]).toBe(8 + 2) // + STR
  expect(w[3].bands[0]).toBe(9 + 5) // a whip: + REA
  cr.set('meleeArStrength', { key: 'meleeArStrength', value: false })
  expect(deriveSr6(data, cr, ch).attackRatings.weapons[2].bands[0]).toBe(8)
})

test('the Sixth World Companion’s Strength in Close Combat: the pool rolls Strength, Agility goes into the melee and unarmed Attack Ratings', () => {
  const { data, cr } = setup({ meleeArStrength: true, strengthInCloseCombat: true })
  const ch = runner()
  ch.build.skills.push({ id: 'crb.close-combat', points: 2, karma: 0 })
  buy(ch, 'weapons', 'crb.glitter-sword')
  const d = deriveSr6(data, cr, ch)
  expect(d.pools.find(p => p.skill === 'crb.close-combat')).toMatchObject({ attr: 'str', dp: 2 + 2 })
  expect(d.attackRatings.unarmed).toBe(5 + 3)
  expect(d.attackRatings.weapons[0].bands[0]).toBe(8 + 3)
})

test('Edge from an Attack Rating against a Defense Rating: 1 to the side the gap ahead; 2 at twice it with Stacking Advantage', () => {
  const { cr } = setup({ arDrEdgeGap: 3 })
  expect([ratingEdge(10, 7, cr), ratingEdge(10, 8, cr), ratingEdge(4, 9, cr), ratingEdge(13, 7, cr), ratingEdge(null, 7, cr)]).toEqual([1, 0, -1, 1, null])
  cr.set('stackingAdvantage', { key: 'stackingAdvantage', value: true })
  expect([ratingEdge(13, 7, cr), ratingEdge(1, 7, cr), ratingEdge(12, 7, cr)]).toEqual([2, -2, 1])
  cr.delete('arDrEdgeGap')
  expect(ratingEdge(10, 2, cr)).toBeNull()
})

test('set effects: a movement set replaces the base, adds still apply, the highest set wins, a conditional one only in the bracketed total', () => {
  const ch = runner()
  ch.build.qualities.push(
    { uid: 'q1', id: 'crb.centaur-body', level: 1 },
    { uid: 'q2', id: 'crb.slow-legs', level: 1 },
    { uid: 'q3', id: 'crb.fleet', level: 1 },
  )
  const { data, cr } = setup({ moveWalk: 7, moveSprint: 11, moveSprintPerHit: 2 })
  const d = deriveSr6(data, cr, ch)
  // (10/20/4 beats 8/16/2; Fleet's +3 on top; the base 7/11/2 is replaced)
  expect(d.movement).toEqual({ walk: 10 + 3, sprint: 20 + 3, perHit: 4 })
  expect(d.on.movement).toEqual({ walk: 12 + 3, sprint: 30 + 3, perHit: 5 })
})

test('set effects: an unarmed Attack Rating set is the better of it and REA + STR, with adds on top; the Damage Value set reads 3P as 3', () => {
  const ch = runner()
  ch.build.qualities.push({ uid: 'q1', id: 'crb.hard-fists', level: 1 })
  const { data, cr } = setup({ unarmedDV: 2 })
  const d = deriveSr6(data, cr, ch)
  expect(d.attackRatings.unarmed).toBe(Math.max(5 + 2, 6)) // (REA 5 + STR 2 beats 6)
  expect(d.unarmedDamage).toEqual({ dv: 3, physical: true })
  ch.build.qualities.push({ uid: 'q2', id: 'crb.iron-bones', level: 1 })
  expect(deriveSr6(data, cr, ch).attackRatings.unarmed).toBe(7 + 2)
  ch.build.attributes.rea.points = 0
  expect(deriveSr6(data, cr, ch).attackRatings.unarmed).toBe(6 + 2) // (REA 1 + STR 2 = 3 < 6)
})

test('set effects: initiative dice set replaces the usual count only when switched on, adds stack, the cap applies', () => {
  const ch = runner()
  ch.build.qualities.push({ uid: 'q1', id: 'crb.drone-brain', level: 1 })
  const { data, cr } = setup({ initiativeDice: 1, initiativeDiceMax: 5 })
  let d = deriveSr6(data, cr, ch)
  expect(d.initiative.dice).toBe(1)
  expect(d.on.initiative.dice).toBe(4)
  boost(ch, [{ target: 'initDice', value: 3 }])
  d = deriveSr6(data, cr, ch)
  expect(d.on.initiative.dice).toBe(5) // (4 + 3, capped at 5)
})

test('adept drain (CRB Adepts, Street Wyrd p. 77): Body + Willpower, a Way swaps the Willpower; spell drain never changes; a full magician has none', () => {
  const { data, cr } = setup({})
  const way = { uid: 'q1', id: 'crb.way-of-logic', level: 1 }
  const mystic = runner('mystic-adept')
  mystic.build.drainAttr = 'cha'
  const spell = deriveSr6(data, cr, mystic).drain
  const w = deriveSr6(data, cr, mystic)
  expect(w.adeptDrain).toEqual({ value: w.attrs.bod.augmented + w.attrs.wil.augmented, attr: 'wil' })
  mystic.build.qualities.push(way)
  const m = deriveSr6(data, cr, mystic)
  expect(m.drain).toBe(spell) // (WIL + the tradition's CHA, unchanged)
  expect(m.adeptDrain).toEqual({ value: m.attrs.bod.augmented + m.attrs.log.augmented, attr: 'log' })
  const adept = runner('adept')
  const a = deriveSr6(data, cr, adept)
  expect(a.adeptDrain).toEqual({ value: a.attrs.bod.augmented + a.attrs.wil.augmented, attr: 'wil' })
  const full = runner('full')
  full.build.drainAttr = 'cha'
  full.build.qualities.push(way)
  const f = deriveSr6(data, cr, full)
  expect(f.adeptDrain).toBeUndefined()
  expect(f.drain).toBe(f.attrs.wil.augmented + f.attrs.cha.augmented)
  // a choice reads the note; a conditional one only in the bracketed total
  mystic.build.qualities = [{ uid: 'q2', id: 'crb.way-of-any', level: 1, note: 'Agility' }]
  const c = deriveSr6(data, cr, mystic)
  expect(c.adeptDrain?.attr).toBe('wil')
  expect(c.on.adeptDrain?.attr).toBe('agi')
})

test('set effects: the breakdown lists a set value, marked, apart from the adds', () => {
  const ch = runner()
  ch.build.qualities.push({ uid: 'q1', id: 'crb.hard-fists', level: 1 }, { uid: 'q2', id: 'crb.centaur-body', level: 1 })
  const { data } = setup({})
  expect(bonusSources(ch.build, data, 'unarmedAR')).toEqual([{ from: 'Hard Fists', kind: 'qualities', id: 'crb.hard-fists', value: 6, set: true }])
  expect(bracketNotes(ch.build, data, 'moveWalk').map(x => [x.value, !!x.set])).toEqual([[12, true]])
})
