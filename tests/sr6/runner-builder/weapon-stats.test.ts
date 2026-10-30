// A weapon line's stats with its fittings (assets/weapons.ts weaponOf), a cyberlimb's Attribute increase on the limb
// (bonuses.ts hostBonus) and the export's computed values. Invented entries, invented numbers.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { expect, test } from 'vitest'
import { exportSr6Runners } from '../../../src/sr6/foundry/domain/export'
import { weaponOf, modesIn } from '../../../src/sr6/runner-builder/domain/assets/weapons'
import { hostBonus } from '../../../src/sr6/runner-builder/domain/creation/bonuses'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankSr6, type Sr6Purchase } from '../../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'

const schema = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('public/data/schema/sr6-export.schema.json', 'utf8')))

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const acc = (id: string, name: string, fx: string, extra = '') =>
  `<weapon id="zz.${id}" ${at} category="Weapon accessory" class="ACCESSORY/WEAPON_ACCESSORY" avail="1" cost="100"${extra}><name>${name}</name>${fx}</weapon>`
const WEAPONS = `<sr6:data ${NS} kind="weapons" version="1">
  ${acc('laser', 'Zap Laser', '<effect target="item:ar" op="add" value="1"/><effect target="item:ar" op="add" value="1" switch="wireless"/>')}
  ${acc('smart', 'Zap Smartgun', '<effect target="item:ar" op="add" value="2" switch="conditional" when="if you\'re using a smartlink"/><effect target="test:combat" op="add" value="1" switch="wireless"/>')}
  ${acc('clip', 'Zap Clip', '<effect target="item:ammo" op="add" value="R*5"/><effect target="item:concealability" op="add" value="-R"/>', ' rating="1–2"')}
  ${acc('vent', 'Zap Vent', '<effect target="item:recoil-sa" op="set" value="0"/><effect target="item:recoil-bf" op="set" value="-2"/>')}
  ${acc('pads', 'Zap Pads', '<effect target="item:ar" op="add" value="1" when="semi-auto, burst fire"/>')}
  ${acc('bipod', 'Zap Bipod', '<effect target="item:ar" op="add" value="2" switch="conditional" when="when properly deployed"/>')}
  ${acc('stock', 'Zap Stock', '<effect target="item:ar" op="add" value="-1,2,1,0,x"/>')}
  ${acc('drum', 'Zap Drum', '<effect target="item:ammo" op="set" value="x2"/>')}
  <weapon id="zz.rifle" ${at} category="Assault rifle" dv="4P" ar="4/10/8/6/2" modes="SA/BF/FA" ammo="30(c)" avail="2" cost="500"><name>Zap Rifle</name>
    <part id="laser" ref="zz.laser" hook="top" cost="0" included="true" removable="true" origin="cl6" review="none"/></weapon>
</sr6:data>`
const data = sr6Data(fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/weapons.xml', xml: WEAPONS }]))

let n = 0
const line = (id: string, extra: Partial<Sr6Purchase> = {}): Sr6Purchase => ({ uid: `u${++n}`, kind: 'weapons', id, qty: 1, accessories: [], ...extra })
const rifle = (accs: Sr6Purchase[] = [], extra: Partial<Sr6Purchase> = {}) => line('zz.rifle', { accessories: accs, ...extra })

test('the printed stats are the base; a standard part adds only its switched effects', () => {
  const w = weaponOf(rifle(), data)
  expect(w.base.ar).toEqual([4, 10, 8, 6, 2])
  expect(w.now.ar).toEqual([4, 10, 8, 6, 2]) // (the laser's always-on +1 is in the printed AR, CRB p. 261)
  expect(w.on.ar).toEqual([5, 11, 9, 7, 3]) // (its wireless +1, bracketed)
  expect(w.base.recoil).toEqual({ SA: -2, BF: -4, FA: -6 })
})

test('a removed factory part takes its always-on effect off', () => {
  const w = weaponOf(rifle([], { removedParts: ['laser'] }), data)
  expect(w.now.ar).toEqual([3, 9, 7, 5, 1])
  expect(w.on.ar).toEqual([3, 9, 7, 5, 1])
})

test('a fitted laser sight adds +1, +2 wireless', () => {
  const w = weaponOf(rifle([line('zz.laser')], { removedParts: ['laser'] }), data)
  expect(w.now.ar).toEqual([4, 10, 8, 6, 2])
  expect(w.on.ar).toEqual([5, 11, 9, 7, 3])
  expect(w.from).toContain('Zap Laser')
})

test("a smartgun's wireless die is the attack pool's, switched on by the player's sit", () => {
  const off = weaponOf(rifle([line('zz.smart')]), data)
  expect(off.now.pool).toBe(0)
  expect(off.on.pool).toBe(1)
  expect(off.on.ar).toEqual([6, 12, 10, 8, 4].map(v => v + 1)) // (+2 smartlink, +1 the standard laser's wireless)
  const on = weaponOf(rifle([line('zz.smart', { sit: { 'test:combat||': 1 } })]), data)
  expect(on.now.pool).toBe(1)
})

test('an extended clip adds rounds and lowers concealability by its rating', () => {
  const w = weaponOf(rifle([line('zz.clip', { rating: 2 })]), data)
  expect(w.now.ammo).toBe('40(c)')
  expect(w.now.concealability).toBe(-2)
  expect(weaponOf(rifle([line('zz.drum')]), data).now.ammo).toBe('60(c)')
})

test('a gas vent and shock pads move the firing-mode adjustments, not the Attack Ratings', () => {
  const w = weaponOf(rifle([line('zz.vent'), line('zz.pads')]), data)
  expect(w.now.recoil).toEqual({ SA: 0, BF: -1, FA: -6 })
  expect(w.now.ar).toEqual([4, 10, 8, 6, 2])
  expect(modesIn('Full-Auto, properly deployed')).toBeUndefined()
  expect(modesIn('Burst Fire (reduces its AR penalty)')).toEqual(['BF'])
})

test('a bipod counts when the player switches it deployed', () => {
  const folded = weaponOf(rifle([line('zz.bipod')]), data)
  expect(folded.now.ar).toEqual([4, 10, 8, 6, 2])
  expect(folded.on.ar[0]).toBe(7) // (+2 deployed, +1 the standard laser's wireless)
  const deployed = weaponOf(rifle([line('zz.bipod', { sit: { 'item:ar||when properly deployed': 1 } })]), data)
  expect(deployed.now.ar).toEqual([6, 12, 10, 8, 4])
})

test('a per-band modification stops at zero and drops a band marked x', () => {
  const w = weaponOf(rifle([line('zz.stock')], { removedParts: ['laser'] }), data)
  expect(w.now.ar).toEqual([2, 11, 8, 5, null])
})

const AUGS = `<sr6:data ${NS} kind="augmentations" version="1">
  <augmentation id="zz.arm" ${at} type="cyberware" category="Cyberlimb" essence="1" avail="2" cost="15000"><name>Zap Arm</name></augmentation>
  <augmentation id="zz.inc" ${at} type="cyberware" category="Cyberlimb accessory" rating="1–6" avail="2" cost="5000" class="ACCESSORY/CYBER_LIMB_ENHANCEMENT"><name>Zap Increase</name>
    <effect target="limb-attr:choice" op="add" value="R"/></augmentation>
</sr6:data>`
const cyber = sr6Data(fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/augmentations.xml', xml: AUGS }]))

test("an Attribute increase raises the limb's chosen attribute, always on", () => {
  const arm: Sr6Purchase = {
    uid: 'arm',
    kind: 'augmentations',
    id: 'zz.arm',
    qty: 1,
    accessories: [{ uid: 'inc', kind: 'augmentations', id: 'zz.inc', qty: 1, rating: 3, note: 'Strength', accessories: [] }],
  }
  expect(hostBonus(arm, cyber).str).toBe(3)
  expect(hostBonus(arm, cyber).agi).toBeUndefined()
})

test("an Attribute increase set to Armor adds to Defense, not to a limb attribute; Agility still raises the limb's (owner ruling 2026-10-30)", () => {
  const arm = (note: string): Sr6Purchase => ({
    uid: 'arm',
    kind: 'augmentations',
    id: 'zz.arm',
    qty: 1,
    accessories: [{ uid: 'inc', kind: 'augmentations', id: 'zz.inc', qty: 1, rating: 2, note, accessories: [] }],
  })
  expect(hostBonus(arm('Armor'), cyber)).toEqual({ defense: 2 })
  expect(hostBonus(arm('Agility'), cyber)).toEqual({ agi: 2 })
})

test("the Foundry export carries a weapon's computed stats, the printed ones under printed", () => {
  const c = fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/weapons.xml', xml: WEAPONS }]),
    d = sr6Data(c),
    ch = blankSr6('priority', 'r1', '2026-10-30T00:00:00.000Z')
  ch.build.purchases.push(rifle([line('zz.clip', { rating: 1 }), line('zz.vent')], { uid: 'w1', removedParts: ['laser'] }))
  const f = exportSr6Runners(c, d, fixtureCreation(), [ch], { descriptions: false, now: '2026-10-30T00:00:00.000Z', appVersion: '0.0.0' })
  expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  const v = f.runners![0].purchases.find(p => p.uid === 'w1')!.values
  expect(v).toMatchObject({ dv: 4, ar: [3, 9, 7, 5, 1], ammo: 35, recoil: { SA: 0, BF: -2, FA: -6 }, concealability: -1 })
  expect(v.printed).toEqual({ dv: 4, ar: [4, 10, 8, 6, 2], modes: ['SA', 'BF', 'FA'], ammo: 30 })
})
