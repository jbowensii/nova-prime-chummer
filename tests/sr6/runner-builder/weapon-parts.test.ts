// A weapon's standard upgrades (owner ruling 2026-10-30): its catalog <part>s fill their slots, come off and go back like a
// vehicle's parts; their effects are already in the printed stats (owner ruling on PR #207), so only removing one changes a
// number. Invented entries, invented numbers.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { hostBonus } from '../../../src/sr6/runner-builder/domain/creation/bonuses'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankBuild } from '../../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const WEAPONS = `<sr6:data ${NS} kind="weapons" version="1">
  <weapon id="zz.grip" ${at} category="Weapon accessory" class="ACCESSORY/WEAPON_ACCESSORY" avail="2" cost="100"><name>Zap Grip</name>
    <effect target="derived:defense" op="add" value="1"/></weapon>
  <weapon id="zz.rifle" ${at} category="Assault rifle" dv="4P" avail="2" cost="500"><name>Zap Rifle</name>
    <part id="grip" ref="zz.grip" hook="under" cost="0" included="true" removable="true" origin="cl6" review="none"/></weapon>
</sr6:data>`
const data = sr6Data(fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/weapons.xml', xml: WEAPONS }]))
const cr = fixtureCreation()

test("a standard upgrade's effect is already in the printed stats; removing it takes it off; restore puts it back", () => {
  const b = blankBuild('priority')
  expect(apply(b, { op: 'purchase', kind: 'weapons', id: 'zz.rifle' }, data, cr)).toEqual({ ok: true })
  const x = b.purchases[0]
  // (owner ruling on PR #207: the book's printed stats include the factory part, so fitted it adds nothing)
  expect(hostBonus(x, data)['defense' as never]).toBeUndefined()
  expect(apply(b, { op: 'part', uid: x.uid, remove: 'grip' }, data, cr)).toEqual({ ok: true })
  expect(hostBonus(x, data)['defense' as never]).toBe(-1)
  expect(apply(b, { op: 'part', uid: x.uid, restore: 'grip' }, data, cr)).toEqual({ ok: true })
  expect(x.removedParts).toBeUndefined()
})
