// NPC ammunition (src/sr6/runner-builder/domain/creation/npc.ts ammoFor), by the owner's ruling of 2026-10-21 ("NPC ammo"):
// two loads of regular ammo per firearm and the spare's container, a bow or crossbow 20, a printed ammo line wins, a thrown
// thing its printed quantity. A small invented catalog; no book text.
import { expect, test } from 'vitest'
import { buildSr6Catalog } from '../../../src/sr6/catalog/domain/load'
import { blankSr6Npc, npcCorrections, npcThings } from '../../../src/sr6/runner-builder/domain/creation/npc'
import { SR6_KINDS, type Sr6Kind } from '../../../src/sr6/formats/domain/types'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
type Row = [string, string, Record<string, string>?]
const file = (kind: Sr6Kind, rows: Row[]) => ({
  file: `${kind}.xml`,
  overlay: true,
  xml: `<sr6:data ${NS} kind="${kind}" version="1">${rows
    .map(([id, name, a = {}]) => {
      const attrs = Object.entries({ source: 'TST', page: '1', ...a })
        .map(([k, v]) => ` ${k}="${v}"`)
        .join('')
      return `<${SR6_KINDS[kind].tag} id="tst.${id}"${attrs}><name>${name}</name></${SR6_KINDS[kind].tag}>`
    })
    .join('')}</sr6:data>`,
})
const ammo = (cls: string) => ({ category: 'Ammo', class: `AMMUNITION/${cls}` })
const c = buildSr6Catalog([
  file('weapons', [
    ['pistol', 'Test Pistol', { category: 'Heavy pistol', ammo: '15(c)', class: 'WEAPON_FIREARMS/PISTOLS_HEAVY' }],
    ['smg', 'Test SMG', { category: 'Submachine gun', ammo: '30(c)', class: 'WEAPON_FIREARMS/SUBMACHINE_GUNS' }],
    ['rifle', 'Test Rifle', { category: 'Rifle', ammo: '38(c)', class: 'WEAPON_FIREARMS/RIFLE_ASSAULT' }],
    ['shotgun', 'Test Shotgun', { category: 'Shotgun', ammo: '8(m)', class: 'WEAPON_FIREARMS/SHOTGUNS' }],
    ['plain-shotgun', 'Plain Shotgun', { category: 'Shotgun', ammo: '6(m)', class: 'WEAPON_FIREARMS/SHOTGUNS' }],
    ['revolver', 'Test Revolver', { category: 'Heavy pistol', ammo: '6(cy)', class: 'WEAPON_FIREARMS/PISTOLS_HEAVY' }],
    ['mg', 'Test MG', { category: 'Machine gun', ammo: '100(belt)', class: 'WEAPON_FIREARMS/MACHINE_GUNS' }],
    ['drum-mg', 'Drum MG', { category: 'Machine gun', ammo: '24(d)', class: 'WEAPON_FIREARMS/MACHINE_GUNS' }],
    ['taser', 'Test Taser', { category: 'Taser', ammo: '4(m)', class: 'WEAPON_FIREARMS/TASERS' }],
    ['gl', 'Test Grenade Launcher', { category: 'Grenade launcher', ammo: '6(c)', class: 'WEAPON_SPECIAL/LAUNCHERS' }],
    ['rl', 'Test Rocket Launcher', { category: 'Rocket launcher', ammo: '1(br)', class: 'WEAPON_SPECIAL/LAUNCHERS' }],
    ['flame', 'Test Flamethrower', { category: 'Flamethrower', ammo: '20(tanks)', class: 'WEAPON_SPECIAL/THROWERS' }],
    ['bow', 'Test Bow', { category: 'Throwing weapon/projectile', class: 'WEAPON_RANGED/BOWS' }],
    ['xbow', 'Test Crossbow', { category: 'Throwing weapon/projectile', class: 'WEAPON_RANGED/CROSSBOWS' }],
    ['laser', 'Test Laser', { category: 'Energy weapon', ammo: '25(5c)', class: 'WEAPON_LASER/SUBMACHINE_GUNS_LIGHT' }],
    ['frag', 'Frag grenade', { category: 'Grenade', class: 'AMMUNITION/GRENADES' }],
    ['spare-clip', 'Spare clip', { category: 'Weapon accessory', class: 'ACCESSORY/WEAPON_ACCESSORY' }],
    ['loader', 'Speed loader', { category: 'Weapon accessory', class: 'ACCESSORY/WEAPON_ACCESSORY' }],
    ['arrow-1', 'Arrow 1', { ...ammo('BOWS'), level: '1' }],
    ['arrow-2', 'Arrow 2', { ...ammo('BOWS'), level: '2' }],
    ['bolt-1', 'Bolt 1', { ...ammo('CROSSBOWS'), level: '1' }],
    ['bolt-2', 'Bolt 2', { ...ammo('CROSSBOWS'), level: '2' }],
  ]),
  file('gear', [
    ['a-light', 'Holdout/Light Pistol/Machine Pistol', ammo('AMMUNITION')],
    ['a-heavy', 'Heavy Pistol/SMG', ammo('AMMUNITION')],
    ['a-rifle', 'Rifles', ammo('AMMUNITION')],
    ['a-shotgun', 'Shotgun', ammo('AMMUNITION')],
    ['a-mg', 'Machine Gun', ammo('AMMUNITION')],
    ['a-taser', 'Taser', ammo('AMMUNITION_SPECIAL')],
    ['a-gren', 'Fragmentation', ammo('GRENADES')],
    ['a-rocket', 'High explosive', ammo('ROCKETS')],
    ['a-fuel', 'Fuel Tank (small)', ammo('AMMUNITION_SPECIAL')],
    ['shotgun-mag', 'Test Shotgun spare magazine', { category: 'Supply', supplyOf: 'tst.shotgun' }],
  ]),
])

/** a grunt's weapons line -> [name, qty] of every thing it gets, and its corrections */
const run = (text: string) => {
  const ch = blankSr6Npc('grunt', 3)
  ch.npc!.lines = [{ part: 'weapons', text }]
  const things = npcThings(ch.npc!, c)
  return { all: things.map(t => [t.name, t.qty ?? 1] as const), things, corrections: npcCorrections(things) }
}

test('a clip-fed pistol, SMG and rifle: two loads and a spare clip, the printed count over the catalog’s', () => {
  expect(run('Test Pistol').all).toEqual([
    ['Test Pistol', 1],
    ['Heavy Pistol/SMG', 30],
    ['Spare clip', 1],
  ])
  expect(run('Test Pistol [Heavy Pistol, DV 3P, SA, 9/9/7/—/—, 12(c)]').all).toEqual([
    ['Test Pistol', 1],
    ['Heavy Pistol/SMG', 24],
    ['Spare clip', 1],
  ])
  expect(run('Test SMG').all.map(a => a[1])).toEqual([1, 60, 1])
  expect(run('Test Rifle').all).toEqual([
    ['Test Rifle', 1],
    ['Rifles', 76],
    ['Spare clip', 1],
  ])
})

test('the spare container is gear, not a weapon (the Foundry module rolls every weapons-kind item), with its catalog id', () => {
  const box = run('Test Pistol').things.find(t => t.spare)!
  expect([box.kind, box.entry?.kind, box.entry?.id, box.name]).toEqual(['gear', 'gear', 'tst.spare-clip', 'Spare clip'])
  expect(run('Test Pistol').things.find(t => t.name === 'Heavy Pistol/SMG')?.kind).toBe('gear')
})

test('a part named clip, magazine or belt, or a duration in rounds, is not a printed ammo line', () => {
  expect(run('Test Pistol [Heavy Pistol, DV 3P, SA, 9/9/7/—/—, 15(c), w/ extended clip, drum magazine, ammo belt, gel ammo]').all.map(a => a[0])).toEqual([
    'Test Pistol',
    'Heavy Pistol/SMG',
    'Spare clip',
  ])
  expect(run('Test Rifle [Rifle, DV 3P, SA, 9/9/7/—/—, 38(c), Dazed for 2 rounds if any damage taken]').all.map(a => a[0])).toEqual([
    'Test Rifle',
    'Rifles',
    'Spare clip',
  ])
  // a DV's `(e)` is no ammo type: the taser's `4(m)` is
  expect(run('Test Taser [Taser, DV 4(e), SS, 9/9/—/—/—, 4(m)]').all).toEqual([
    ['Test Taser', 1],
    ['Taser', 8],
    ['Spare clip', 1],
  ])
})

test('a magazine weapon: the weapon’s own spare magazine when the catalog has one, else a spare clip', () => {
  expect(run('Test Shotgun').all).toEqual([
    ['Test Shotgun', 1],
    ['Shotgun', 16],
    ['Test Shotgun spare magazine', 1],
  ])
  expect(run('Plain Shotgun').all).toEqual([
    ['Plain Shotgun', 1],
    ['Shotgun', 12],
    ['Spare clip', 1],
  ])
})

test('a revolver: two loads and a speed loader', () => {
  expect(run('Test Revolver').all).toEqual([
    ['Test Revolver', 1],
    ['Heavy Pistol/SMG', 12],
    ['Speed loader', 1],
  ])
})

test('a belt or drum: two belts or drums of rounds, no container', () => {
  expect(run('Test MG').all).toEqual([
    ['Test MG', 1],
    ['Machine Gun', 200],
  ])
  expect(run('Drum MG').all).toEqual([
    ['Drum MG', 1],
    ['Machine Gun', 48],
  ])
})

test('a bow or crossbow: 20 arrows or bolts (the lowest level), no container', () => {
  expect(run('Test Bow').all).toEqual([
    ['Test Bow', 1],
    ['Arrow 1', 20],
  ])
  expect(run('Test Crossbow').all).toEqual([
    ['Test Crossbow', 1],
    ['Bolt 1', 20],
  ])
})

test('a grenade launcher, rocket launcher, flamethrower and taser: one full load and one spare', () => {
  expect(run('Test Grenade Launcher').all).toEqual([
    ['Test Grenade Launcher', 1],
    ['Fragmentation', 12],
    ['Spare clip', 1],
  ])
  expect(run('Test Rocket Launcher').all).toEqual([
    ['Test Rocket Launcher', 1],
    ['High explosive', 2],
  ])
  // (a tank is one load)
  expect(run('Test Flamethrower').all).toEqual([
    ['Test Flamethrower', 1],
    ['Fuel Tank (small)', 2],
  ])
  expect(run('Test Taser').all).toEqual([
    ['Test Taser', 1],
    ['Taser', 8],
    ['Spare clip', 1],
  ])
})

test('a grenade shows its printed quantity and gets no ammunition; an energy weapon takes none', () => {
  expect(run('Frag grenade (x3)').all).toEqual([['Frag grenade', 3]])
  expect(run('Test Laser').all).toEqual([['Test Laser', 1]])
})

test('a stat block that prints its own ammunition wins: none is added', () => {
  expect(run('Test Pistol [Heavy Pistol, DV 3P, SA, 9/9/7/—/—, 15(c), w/ 30 rounds regular ammo]').all.map(a => a[0])).toEqual(['Test Pistol'])
  expect(run('Test Rifle [Rifle, DV 5P, SA/BF/FA, 4/11/9/6/2, 38(c), w/ gel ammo, 2 spare clips]').all.map(a => a[0])).toEqual(['Test Rifle'])
  expect(run('Test Grenade Launcher [Grenade Launcher, DV per ammo, SA, —/10/10/5/—, 6(c), w/ 6 frag grenades]').all.map(a => a[0])).toEqual([
    'Test Grenade Launcher',
  ])
})

test('the corrections say what was added', () => {
  expect(run('Test Pistol').corrections).toEqual([
    'Added: Heavy Pistol/SMG (regular ammo) ×30 (2 loads of 15) for Test Pistol',
    'Added: Spare clip (spare) for Test Pistol',
  ])
  expect(run('Test Bow').corrections).toEqual(['Added: Arrow 1 (regular ammo) ×20 for Test Bow'])
})
