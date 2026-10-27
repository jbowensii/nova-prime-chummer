// GM override (owner ruling 2026-10-27): the user can ADD a slot to a host instance so an item with no matching catalog
// host slot can be fitted, or to widen a budget. The added slot lives on the character (addedSlots), round-trips, and the
// add-time slot guard honours it. Invented entries.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { mountSlots } from '../../../src/sr6/catalog/domain/structure'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankBuild, blankSr6 } from '../../../src/sr6/formats/domain/character'
import type { Sr6Entry } from '../../../src/sr6/formats/domain/types'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
// a pistol host with ONE external slot; an under-barrel light that fits a slot the host does not carry
const WEAPONS = `<sr6:data ${NS} kind="weapons" version="1">
  <weapon id="zz.pistol" ${at} category="Pistol" dv="3P" avail="2" cost="100"><name>Zap Pistol</name><slot id="firearms-external"/></weapon>
  <weapon id="zz.light" ${at} category="Weapon accessory" avail="2" cost="50"><name>Zap Light</name><fits slot="under"/></weapon>
</sr6:data>`

const world = () => {
  const files = [{ file: 'custom/sr6/imported/zz/weapons.xml', xml: WEAPONS }]
  return { data: sr6Data(fixtureCatalog(undefined, files)), cr: fixtureCreation() }
}

test('mountSlots honours a host-instance extra slot the catalog entry lacks', () => {
  const he = { attrs: {}, parts: [{ tag: 'slot', attrs: { id: 'firearms-external' } }] } as unknown as Sr6Entry
  const light = { attrs: {}, parts: [{ tag: 'fits', attrs: { slot: 'under' } }] } as unknown as Sr6Entry
  const acc = [{ uid: 'a1', entry: light }]
  // no `under` slot on the host: the light can't be placed
  expect(mountSlots(he, acc).unplaced).toEqual(['a1'])
  // a GM-added `under` slot lets it place
  expect(mountSlots(he, acc, 1, [{ id: 'under' }]).unplaced).toEqual([])
})

test('the slot op adds a slot to a host, fitting then works, and it round-trips; remove takes it off', () => {
  const w = world()
  const b = blankBuild('priority')
  expect(apply(b, { op: 'purchase', kind: 'weapons', id: 'zz.pistol' }, w.data, w.cr)).toEqual({ ok: true })
  const host = b.purchases[0]
  // the light fits `under`, which the pistol does not offer: refused
  expect(apply(b, { op: 'accessory', host: host.uid, kind: 'weapons', id: 'zz.light' }, w.data, w.cr)).toEqual({
    ok: false,
    reason: 'No compatible mount slot remaining.',
  })
  // GM adds an `under` slot to the host instance
  expect(apply(b, { op: 'slot', uid: host.uid, id: 'under' }, w.data, w.cr)).toEqual({ ok: true })
  expect(host.addedSlots).toEqual([{ id: 'under' }])
  // now fitting works
  expect(apply(b, { op: 'accessory', host: host.uid, kind: 'weapons', id: 'zz.light' }, w.data, w.cr)).toEqual({ ok: true })
  // round-trip
  const ch = { ...blankSr6('priority', 'made-up-slot', '2026-10-27T00:00:00.000Z'), build: b }
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.build.purchases[0].addedSlots).toEqual([{ id: 'under' }])
  // a valued slot round-trips too
  expect(apply(b, { op: 'slot', uid: host.uid, id: 'vehicle-chassis', value: '4' }, w.data, w.cr)).toEqual({ ok: true })
  const back2 = xmlToSr6(sr6ToXml({ ...ch, build: b }))
  expect(back2.ok && back2.character.build.purchases[0].addedSlots).toEqual([{ id: 'under' }, { id: 'vehicle-chassis', value: '4' }])
  // remove the first
  expect(apply(b, { op: 'slot', uid: host.uid, remove: 0 }, w.data, w.cr)).toEqual({ ok: true })
  expect(host.addedSlots).toEqual([{ id: 'vehicle-chassis', value: '4' }])
  expect(apply(b, { op: 'slot', uid: host.uid, remove: 9 }, w.data, w.cr)).toEqual({ ok: false, reason: 'no-slot' })
  expect(apply(b, { op: 'slot', uid: 'nope', id: 'x' }, w.data, w.cr)).toEqual({ ok: false, reason: 'unknown-line' })
})
