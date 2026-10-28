// Vehicle decomposition Stage 4, ruling D5: the motivating case. Take the Hornet's injector off (frees vehicle-body 0.5), then a GM
// derives a jammer mod from a jammer, set to vehicle-body 0.5, into that freed room. Invented entries, invented numbers.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { currentBuild, record } from '../../../src/sr6/runner-builder/domain/career/career'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { modsOf, partsOf } from '../../../src/sr6/runner-builder/domain/assets/vehiclemods'
import { priced } from '../../../src/sr6/runner-builder/domain/creation/purchases'
import { blankBuild, blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const part = (id: string, ref: string, hook: string, cost: string) =>
  `<part id="${id}" ref="${ref}" hook="${hook}" cost="${cost}" origin="cl6" review="${ref.includes('injector') ? 'needs-owner' : 'none'}" removable="true"/>`
const VEHICLES = `<sr6:data ${NS} kind="vehicles" version="1">
  <vehicle id="zz.hornet" ${at} category="Minidrone" class="DRONE_MINI/AIR" body="1" pilot="2" avail="2" cost="2100"><name>Zap Hornet</name>
    <slot id="vehicle-cf"/>${part('p1', 'zz.realistic', 'vehicle-chassis', '1')}${part('p2', 'zz.hornet-injector', 'vehicle-body', '0.5')}
  </vehicle>
</sr6:data>`
const GEAR = `<sr6:data ${NS} kind="gear" version="1">
  <gear id="zz.realistic" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_CORE" slots="1" avail="2" cost="100"><name>Zap Realistic</name></gear>
  <gear id="zz.jammer" ${at} category="Electronics accessories" rating="1-6" avail="6(I)" cost="1000" class="ELECTRONICS/COMMUNICATION"><name>Zap Jammer</name><text>Jams radio signals.</text></gear>
</sr6:data>`
const WEAPONS = `<sr6:data ${NS} kind="weapons" version="1"><weapon id="zz.hornet-injector" ${at} category="Blade" dv="1P" avail="2" cost="0" modonly="true"><name>Zap Hornet Injector</name></weapon></sr6:data>`
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
const own = () => {
  const b = blankBuild('priority')
  expect(apply(b, { op: 'purchase', kind: 'vehicles', id: 'zz.hornet' }, data, cr)).toEqual({ ok: true })
  return { b, x: b.purchases[0] }
}
const jammer = (host: string, size = 0.5) => ({ op: 'derive', host, kind: 'gear', id: 'zz.jammer', hook: 'vehicle-body', size, rating: 1 }) as const
const FULL = { ok: false, reason: 'Not enough room freed in that part of the vehicle.' }

test('Hornet: take the injector off, derive a jammer into the freed vehicle-body 0.5; a second does not fit; the injector cannot return', () => {
  const { b, x } = own()
  expect(apply(b, jammer(x.uid), data, cr)).toEqual(FULL) // nothing is free yet
  expect(modsOf(x, data).usedByHook['vehicle-body']).toBe(0.5)
  expect(modsOf(x, data).hardpoints).toEqual({ used: 0.5, max: 0.5 }) // D6: the injector is on the hardpoint at 0.5
  expect(apply(b, { op: 'part', uid: x.uid, remove: 'p2' }, data, cr)).toEqual({ ok: true })
  expect(modsOf(x, data).hardpoints).toEqual({ used: 0, max: 0.5 })
  expect(modsOf(x, data).usedByHook['vehicle-body']).toBeUndefined()
  expect(modsOf(x, data).freedByHook).toEqual({ 'vehicle-body': 0.5 })
  expect(apply(b, jammer(x.uid), data, cr)).toEqual({ ok: true })
  const j = x.accessories[0]
  expect(j.derived).toEqual({ from: 'zz.jammer', kind: 'gear', hook: 'vehicle-body', size: 0.5, review: 'needs-owner' })
  expect(j.snapshot).toMatchObject({ text: 'Jams radio signals.', attrs: { cost: '1000', avail: '6(I)', origin: 'synth', review: 'needs-owner' } })
  expect(priced(j, data, cr).cost).toBe(1000) // the source's price carries
  expect(modsOf(x, data).usedByHook['vehicle-body']).toBe(0.5)
  expect(modsOf(x, data).warnings.map(w => w.message)).toEqual([expect.stringContaining('a GM must review it')])
  expect(apply(b, jammer(x.uid), data, cr)).toEqual(FULL)
  expect(apply(b, { op: 'part', uid: x.uid, restore: 'p2' }, data, cr)).toEqual({ ok: false, reason: 'no-room' })
  x.accessories.length = 0 // the jammer taken off: the injector fits again
  expect(apply(b, { op: 'part', uid: x.uid, restore: 'p2' }, data, cr)).toEqual({ ok: true })
  expect(partsOf(x, data).map(p => p.removed)).toEqual([false, false])
})

test('the resulting structure round-trips; career: remove the part, then fit the derived mod as a ledger entry', () => {
  const { b, x } = own()
  apply(b, { op: 'part', uid: x.uid, remove: 'p2' }, data, cr)
  apply(b, jammer(x.uid), data, cr)
  const back = xmlToSr6(sr6ToXml({ ...blankSr6('priority', 'made-up-d', '2026-10-28T00:00:00.000Z'), build: b }))
  expect(back.ok && back.character.build.purchases[0]).toMatchObject({
    removedParts: ['p2'],
    accessories: [
      { id: 'custom.zz.jammer@vehicle-body', derived: { from: 'zz.jammer', hook: 'vehicle-body', size: 0.5 }, snapshot: { attrs: { origin: 'synth' } } },
    ],
  })
  const when = '2026-10-28T00:00:00.000Z'
  const fresh = own()
  let c: Sr6Character = { ...blankSr6('priority', 'made-up-e', when), build: fresh.b, finalizedAt: when }
  c.ledger = [{ id: 'f1', at: when, type: 'finalize', karma: 0, nuyen: 10000 }]
  const line = { ...x.accessories[0], uid: '' }
  expect(record(c, { op: 'fit', target: fresh.x.uid, line }, data, cr)).toMatchObject({ ok: false }) // nothing freed yet
  for (const a of [
    { op: 'part', target: fresh.x.uid, part: 'p2' },
    { op: 'fit', target: fresh.x.uid, line },
  ] as const) {
    const r = record(c, a, data, cr)
    if (!r.ok) throw new Error(r.reason)
    c = r.ch
  }
  const v = currentBuild(c).purchases[0]
  expect(v.removedParts).toEqual(['p2'])
  expect(v.accessories.map(a => a.derived?.hook)).toEqual(['vehicle-body'])
  expect(c.ledger.at(-1)).toMatchObject({ nuyen: 1000 })
})
