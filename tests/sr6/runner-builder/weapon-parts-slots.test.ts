// A weapon's standard upgrades (its <part>s) fill their slots: a second foregrip can't go in the under-barrel slot the
// factory foregrip takes; removing the factory one frees it. Invented entries.
import { expect, test } from 'vitest'
import { accessoryProblem, apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankBuild } from '../../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const WEAPONS = `<sr6:data ${NS} kind="weapons" version="1">
  <weapon id="zz.gun" ${at} category="Rifle" dv="4P" avail="2" cost="500"><name>Zap Gun</name><slot id="under" value="1"/>
    <part id="grip" ref="zz.grip" hook="under" cost="0" included="true" removable="true" origin="book" review="none"/></weapon>
  <weapon id="zz.grip" ${at} category="Accessory" class="ACCESSORY/WEAPON_ACCESSORY" avail="2" cost="100"><name>Zap Grip</name><fits slot="under"/></weapon>
</sr6:data>`
const data = sr6Data(fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/weapons.xml', xml: WEAPONS }]))
const cr = fixtureCreation()

test('a factory foregrip fills the under-barrel slot; removed, it frees it', () => {
  const b = blankBuild('priority')
  expect(apply(b, { op: 'purchase', kind: 'weapons', id: 'zz.gun' }, data, cr)).toEqual({ ok: true })
  const gun = b.purchases[0]
  const grip = { uid: 'g2', kind: 'weapons', id: 'zz.grip', qty: 1, accessories: [] } as unknown as Parameters<typeof accessoryProblem>[1]
  expect(accessoryProblem(gun, grip, data)).toBe('No compatible mount slot remaining.')
  expect(apply(b, { op: 'part', uid: gun.uid, remove: 'grip' }, data, cr)).toEqual({ ok: true })
  expect(accessoryProblem(gun, grip, data)).toBeUndefined()
})
