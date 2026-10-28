// Vehicle decomposition Stage 2b (ruling D3): the synthesized powerplant is a removable part on vehicle-powertrain. It is not on the
// powertrain meter (a stock vehicle's Review is unchanged), removing it frees its size, and a vehicle that has lost it with nothing
// derived in its place gets the Review note. Invented entries, invented numbers.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { modsOf, partsOf } from '../../../src/sr6/runner-builder/domain/assets/vehiclemods'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankBuild } from '../../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const VEHICLES = `<sr6:data ${NS} kind="vehicles" version="1">
  <vehicle id="zz.bulldog" ${at} category="Van" body="16" accel="10" topSpeed="100" avail="2" cost="35000"><name>Zap Bulldog</name>
    <slot id="vehicle-powertrain" value="2"/>
    <part id="pp" ref="zz.zap-bulldog-powerplant" hook="vehicle-powertrain" cost="5" origin="synth" review="needs-owner" removable="true"/>
  </vehicle>
</sr6:data>`
const GEAR = `<sr6:data ${NS} kind="gear" version="1">
  <gear id="zz.zap-bulldog-powerplant" ${at} category="Vehicle modification" class="MOD_POWER/MOD_PROPULSION" modonly="true" avail="2" cost="0"><name>Zap Bulldog Powerplant</name></gear>
  <gear id="zz.engine" ${at} category="Vehicle modification" class="MOD_POWER/MOD_PROPULSION" avail="4" cost="3000"><name>Zap Engine</name></gear>
</sr6:data>`
const SOURCES = `<sr6:data ${NS} kind="sources" version="1"><source id="DC" publisher="Made up" canon="true"><name>Made-up rigger book</name></source></sr6:data>`
const data = sr6Data(
  fixtureCatalog(
    undefined,
    [
      ['vehicles', VEHICLES],
      ['gear', GEAR],
      ['sources', SOURCES],
    ].map(([k, xml]) => ({ file: `custom/sr6/imported/zz/${k}.xml`, xml })),
  ),
)
const cr = fixtureCreation()
const NOPOWER = 'no powerplant installed — vehicle cannot move under own power'
const note = (x: Parameters<typeof modsOf>[0]) => modsOf(x, data).warnings.some(w => w.message.includes(NOPOWER))

test('the powerplant is a removable synthesized part; it is not on the powertrain meter; removing it frees its size and notes the loss', () => {
  const b = blankBuild('priority')
  expect(apply(b, { op: 'purchase', kind: 'vehicles', id: 'zz.bulldog' }, data, cr)).toEqual({ ok: true })
  const x = b.purchases[0]
  expect(partsOf(x, data)[0]).toMatchObject({ id: 'pp', hook: 'vehicle-powertrain', cost: 5, origin: 'synth', review: 'needs-owner', removed: false })
  // size 5 on a meter of 2 would be over; it is not counted, so the stock Review is what it was
  expect(modsOf(x, data).slots!.powertrain).toEqual({ used: 0, max: 2 })
  expect(modsOf(x, data).warnings).toEqual([])
  expect(apply(b, { op: 'part', uid: x.uid, remove: 'pp' }, data, cr)).toEqual({ ok: true })
  expect(modsOf(x, data).freedByHook).toEqual({ 'vehicle-powertrain': 5 })
  expect(note(x)).toBe(true)
  // reversible
  expect(apply(b, { op: 'part', uid: x.uid, restore: 'pp' }, data, cr)).toEqual({ ok: true })
  expect(note(x)).toBe(false)
})

test('a replacement derived into the powertrain hook clears the note', () => {
  const b = blankBuild('priority')
  apply(b, { op: 'purchase', kind: 'vehicles', id: 'zz.bulldog' }, data, cr)
  const x = b.purchases[0]
  apply(b, { op: 'part', uid: x.uid, remove: 'pp' }, data, cr)
  expect(apply(b, { op: 'derive', host: x.uid, kind: 'gear', id: 'zz.engine', hook: 'vehicle-powertrain', size: 2 }, data, cr)).toEqual({ ok: true })
  expect(note(x)).toBe(false)
  expect(modsOf(x, data).slots!.powertrain.used).toBe(2) // the replacement is a real mod on the meter
})
