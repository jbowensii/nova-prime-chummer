// Vehicle decomposition Stage 3 (docs/analysis/sr6-vehicle-decomposition.md 3.3-3.4, rulings D1/D4/D8): a vehicle's catalog
// <part>s occupy their hooks, come off and go back (creation op and career entry), their children follow them, and a
// character saved with the old removedBuiltins still loads. Invented entries, invented numbers.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { currentBuild, record, voidEntry } from '../../../src/sr6/runner-builder/domain/career/career'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { modsOf, mountsOf, partRefund, partsOf } from '../../../src/sr6/runner-builder/domain/assets/vehiclemods'
import { blankBuild, blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const part = (id: string, ref: string, hook: string, cost: string, more = '') =>
  `<part id="${id}" ref="${ref}" hook="${hook}" cost="${cost}" origin="cl6" review="none" removable="true"${more}/>`
const VEHICLES = `<sr6:data ${NS} kind="vehicles" version="1">
  <vehicle id="zz.stock" ${at} category="Zap car" body="6" armor="8" pilot="2" avail="2" cost="20000"><name>Zap Stock</name>
    <slot id="vehicle-chassis" value="5"/><slot id="vehicle-electronics" value="2"/>
    ${part('p1', 'zz.plate', 'vehicle-chassis', '2')}
    ${part('p2', 'zz.eyes', 'vehicle-electronics', '1')}
    ${part('p3', 'zz.zap-mount', 'vehicle-hardpoint', '1')}
    ${part('p4', 'zz.zap-smg', 'vehicle-weapon', '1', ' parent="p3"')}
    ${part('p5', 'zz.armor-plate', 'vehicle-chassis', '$$ARMOR*0.25')}
  </vehicle>
  <vehicle id="zz.twin" ${at} category="Zap car" body="3" pilot="2" avail="2" cost="9000"><name>Zap Twin</name>
    ${part('p1', 'zz.eyes', 'vehicle-electronics', '1')}${part('p1', 'zz.plate', 'vehicle-chassis', '1')}
    <builtin name="2 additional Chassis mod slots" slots="2" category="Chassis"/>
  </vehicle>
</sr6:data>`
const GEAR = `<sr6:data ${NS} kind="gear" version="1">
  <gear id="zz.plate" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_CORE" slots="2" avail="2" cost="100"><name>Zap Plate</name></gear>
  <gear id="zz.armor-plate" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_CORE" slots="1" avail="2" cost="100"><name>Zap Armor Plate</name></gear>
  <gear id="zz.eyes" ${at} category="Electronics mod" class="MOD_ELEC/MOD_CORE" slots="1" avail="2" cost="100"><name>Zap Eyes</name></gear>
  <gear id="zz.zap-mount" ${at} category="Weapon mount" class="MOD_HARD/MOD_MOUNT" hardpoint="standard" avail="4(I)" cost="2000"><name>Zap Standard Weapon Mount</name></gear>
  <gear id="zz.bulk" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_CORE" slots="3" avail="2" cost="100"><name>Zap Bulk</name></gear>
</sr6:data>`
const WEAPONS = `<sr6:data ${NS} kind="weapons" version="1"><weapon id="zz.zap-smg" ${at} category="Submachine gun" dv="3P" avail="2" cost="100"><name>Zap SMG</name></weapon></sr6:data>`
const SOURCES = `<sr6:data ${NS} kind="sources" version="1"><source id="DC" publisher="Made up" canon="true"><name>Made-up rigger book</name></source></sr6:data>`

const data = sr6Data(
  fixtureCatalog(
    undefined,
    [
      ['vehicles', VEHICLES],
      ['gear', GEAR],
      ['weapons', WEAPONS],
      ['sources', SOURCES],
    ].map(([k, xml]) => ({ file: `custom/sr6/imported/zz/${k}.xml`, xml })),
  ),
)
const cr = fixtureCreation()
function own(id: string) {
  const b = blankBuild('priority')
  expect(apply(b, { op: 'purchase', kind: 'vehicles', id }, data, cr)).toEqual({ ok: true })
  return { b, x: b.purchases[0] }
}

test('parts occupy their hooks; a host formula cost is worked out; removing a part frees exactly its cost', () => {
  const { b, x } = own('zz.stock')
  let m = modsOf(x, data)
  // chassis: plate 2 + armor plate 8*0.25 = 2; electronics: eyes 1; hardpoint: the mount's 1 of floor(6/3) = 2
  expect(m.slots).toMatchObject({ chassis: { used: 4, max: 5 }, electronics: { used: 1, max: 2 } })
  expect(m.hardpoints).toEqual({ used: 1, max: 2 })
  expect(m.usedByHook).toEqual({ 'vehicle-chassis': 4, 'vehicle-electronics': 1, 'vehicle-hardpoint': 1, 'vehicle-weapon': 1 })
  expect(apply(b, { op: 'part', uid: x.uid, remove: 'p1' }, data, cr)).toEqual({ ok: true })
  m = modsOf(x, data)
  expect(m.slots!.chassis).toEqual({ used: 2, max: 5 })
  expect(x.removedParts).toEqual(['p1'])
  expect(partRefund(x, partsOf(x, data)[0])).toBe(0)
  expect(apply(b, { op: 'part', uid: x.uid, remove: 'p1' }, data, cr)).toEqual({ ok: false, reason: 'already-removed' })
  expect(apply(b, { op: 'part', uid: x.uid, remove: 'nope' }, data, cr)).toEqual({ ok: false, reason: 'not-a-part' })
  expect(apply(b, { op: 'part', uid: x.uid, restore: 'p1' }, data, cr)).toEqual({ ok: true })
  expect(x.removedParts).toBeUndefined()
  expect(modsOf(x, data).slots!.chassis.used).toBe(4)
  expect(apply(b, { op: 'part', uid: x.uid, restore: 'p1' }, data, cr)).toEqual({ ok: false, reason: 'not-removed' })
})

test('restoring fails when the freed hook was filled with something else', () => {
  const { b, x } = own('zz.stock')
  expect(apply(b, { op: 'part', uid: x.uid, remove: 'p1' }, data, cr)).toEqual({ ok: true })
  // 3 free chassis slots now: a 3-slot mod fits (the add-time guard), then p1 (2) no longer does
  expect(apply(b, { op: 'accessory', host: x.uid, kind: 'gear', id: 'zz.bulk' }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'accessory', host: x.uid, kind: 'gear', id: 'zz.plate' }, data, cr)).toEqual({ ok: false, reason: 'Not enough remaining mod slots.' })
  expect(apply(b, { op: 'part', uid: x.uid, restore: 'p1' }, data, cr)).toEqual({ ok: false, reason: 'no-room' })
  expect(x.removedParts).toEqual(['p1'])
})

test("a part's children go with it and return with it; a factory weapon holds its mount", () => {
  const { b, x } = own('zz.stock')
  expect(mountsOf(x, data).map(m => [m.uid, m.taken])).toEqual([['part:p3', true]])
  expect(apply(b, { op: 'part', uid: x.uid, remove: 'p4' }, data, cr)).toEqual({ ok: true })
  expect(mountsOf(x, data).map(m => [m.uid, m.taken])).toEqual([['part:p3', undefined]])
  expect(apply(b, { op: 'part', uid: x.uid, restore: 'p4' }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'part', uid: x.uid, remove: 'p3' }, data, cr)).toEqual({ ok: true })
  expect(
    partsOf(x, data)
      .filter(p => p.removed)
      .map(p => p.id),
  ).toEqual(['p3', 'p4'])
  expect(x.removedParts).toEqual(['p3'])
  expect(modsOf(x, data).hardpoints).toEqual({ used: 0, max: 2 })
  expect(modsOf(x, data).usedByHook['vehicle-weapon']).toBeUndefined()
  expect(mountsOf(x, data)).toEqual([])
  // the child can't be put back on its own while its parent is off; the parent brings it back
  expect(apply(b, { op: 'part', uid: x.uid, restore: 'p4' }, data, cr)).toEqual({ ok: false, reason: 'parent-removed' })
  expect(apply(b, { op: 'part', uid: x.uid, restore: 'p3' }, data, cr)).toEqual({ ok: true })
  expect(partsOf(x, data).some(p => p.removed)).toBe(false)
})

test('a repeated part id is two parts (the second #2), so a removal names one', () => {
  const { b, x } = own('zz.twin')
  expect(partsOf(x, data).map(p => p.id)).toEqual(['p1', 'p1#2'])
  expect(apply(b, { op: 'part', uid: x.uid, remove: 'p1#2' }, data, cr)).toEqual({ ok: true })
  expect(partsOf(x, data).map(p => p.removed)).toEqual([false, true])
})

test('an old character: builtin:<n> removals on a vehicle that now has parts are kept and reported, never applied to another builtin; it round-trips', () => {
  const { b, x } = own('zz.twin')
  x.removedBuiltins = ['builtin:0']
  // its one remaining builtin is slot-builtin:0 now: the old removal does not hit it (3 Body + 2)
  expect(modsOf(x, data).slots!.chassis.max).toBe(5)
  expect(modsOf(x, data).warnings.map(w => w.message)).toEqual([expect.stringContaining('removed before the factory parts were listed')])
  expect(apply(b, { op: 'builtin', uid: x.uid, remove: 'slot-builtin:0' }, data, cr)).toEqual({ ok: true })
  expect(modsOf(x, data).slots!.chassis.max).toBe(3)
  x.removedParts = ['p1#2']
  const ch = { ...blankSr6('priority', 'made-up-p', '2026-10-28T00:00:00.000Z'), build: b }
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.build.purchases[0]).toMatchObject({ removedBuiltins: ['builtin:0', 'slot-builtin:0'], removedParts: ['p1#2'] })
})

test('career: a part comes off and goes back as a free ledger entry; a void undoes it; it round-trips', () => {
  const { b, x } = own('zz.stock')
  const at = '2026-10-28T00:00:00.000Z'
  let ch: Sr6Character = { ...blankSr6('priority', 'made-up-c', at), build: b, finalizedAt: at }
  ch.ledger = [{ id: 'f1', at, type: 'finalize', karma: 0, nuyen: 10000 }]
  const go = (a: Parameters<typeof record>[1]) => {
    const r = record(ch, a, data, cr)
    if (!r.ok) throw new Error(r.reason)
    ch = r.ch
    return ch.ledger.at(-1)!
  }
  const why = (a: Parameters<typeof record>[1]) => (r => (r.ok ? 'ok' : r.reason))(record(ch, a, data, cr))
  expect(go({ op: 'part', target: x.uid, part: 'p1' })).toMatchObject({ label: 'Removed factory part: Zap Plate from Zap Stock', karma: 0, nuyen: 0 })
  expect(currentBuild(ch).purchases[0].removedParts).toEqual(['p1'])
  expect(why({ op: 'part', target: x.uid, part: 'p1' })).toBe('already-removed')
  expect(why({ op: 'part', target: 'nope', part: 'p1' })).toBe('unknown-host')
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.ledger.at(-1)).toMatchObject({ advance: { op: 'part', target: x.uid, part: 'p1' } })
  const restored = go({ op: 'part', target: x.uid, part: 'p1', restore: true })
  expect(currentBuild(ch).purchases[0].removedParts).toBeUndefined()
  const v = voidEntry(ch, restored.id)
  expect(v.ok && currentBuild(v.ch).purchases[0].removedParts).toEqual(['p1'])
})
