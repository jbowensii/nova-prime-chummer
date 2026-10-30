// A weapon's integral matrix device and the program factory-installed on it (Krime Katalog's Junior carbine: Meta Link
// with a Firearms tutorsoft): child parts of the device, named with their pick, removed with it. Invented entries.
import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { instructionPools, instructionText, partsOf } from '../../../src/sr6/runner-builder/domain/assets/vehiclemods'
import { fixtureCatalog } from '../catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const WEAPONS = `<sr6:data ${NS} kind="weapons" version="1">
  <weapon id="zz.gun" ${at} category="Firearm" dv="3P" avail="2" cost="1000"><name>Zap Gun</name>
    <part id="zap-link" ref="zz.zap-link" hook="internal" cost="0" included="true" removable="true" origin="book" review="none"/>
    <part id="tutorsoft" ref="zz.tutorsoft" hook="software" parent="zap-link" rating="1" choice="Firearms" cost="0" included="true" removable="true" origin="book" review="none"/>
  </weapon>
</sr6:data>`
const GEAR = `<sr6:data ${NS} kind="gear" version="1">
  <gear id="zz.zap-link" ${at} category="Commlink" avail="1" cost="100" class="ELECTRONICS/COMMLINK"><name>Zap Link</name><slot id="software"/></gear>
  <gear id="zz.tutorsoft" ${at} category="Software" rating="1-6" avail="1" cost="400" class="SOFTWARE/OTHER_PROGRAMS"><name>Tutorsoft</name></gear>
</sr6:data>`
const data = sr6Data(
  fixtureCatalog(
    undefined,
    [
      ['weapons', WEAPONS],
      ['gear', GEAR],
    ].map(([k, xml]) => ({ file: `custom/sr6/imported/zz/${k}.xml`, xml })),
  ),
)
const gun = (removedParts?: string[]) => ({
  uid: 'g',
  kind: 'weapons' as const,
  id: 'zz.gun',
  qty: 1,
  accessories: [],
  ...(removedParts ? { removedParts } : {}),
})

test('a factory program is a child part of its device, named with its pick, and goes with the device', () => {
  expect(partsOf(gun(), data).map(p => [p.name, p.parent, p.rating, p.removed])).toEqual([
    ['Zap Link', undefined, undefined, false],
    ['Tutorsoft (Firearms)', 'zap-link', '1', false],
  ])
  expect(partsOf(gun(['tutorsoft']), data).map(p => p.removed)).toEqual([false, true])
  expect(partsOf(gun(['zap-link']), data).map(p => p.removed)).toEqual([true, true])
})

test('a factory tutorsoft: an Instruction pool of rating x 2 for its skill, on its switch only, never a skill bonus (CRB p. 273)', () => {
  expect(instructionPools(gun(), data).map(i => [i.key, i.skill, i.pool, i.on])).toEqual([['part:tutorsoft', 'Firearms', 2, false]])
  const on = { ...gun(), sit: { 'part:tutorsoft': 1 } }
  expect(instructionPools(on, data).map(instructionText)).toEqual(['Instruction pool (Firearms): 2'])
  expect(instructionPools(on, data)[0].on).toBe(true)
  expect(instructionPools({ ...on, removedParts: ['zap-link'] }, data)).toEqual([])
})
