// Vehicle decomposition Stage 3 gate: the committed Stage 2a table (importer/sr6/classes/vehicle_parts.json, which
// `embedmap --ours` holds to Commlink6's 996 placements) read through the domain. For every vehicle in it the stock
// vehicle's used-per-hook equals the sum of its parts' Commlink6 costs (host formulas worked out at a fixed Body 6, Armor
// 10, Sensor 3, Pilot 3), and taking a part off frees exactly its cost plus its children's. Only the vehicle stats are
// invented; the parts are the real table's.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { setPart } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { modsOf, partsOf } from '../../../src/sr6/runner-builder/domain/assets/vehiclemods'
import { fixtureCatalog } from '../catalog/fixture'
import type { Sr6Purchase } from '../../../src/sr6/formats/domain/character'

interface Row {
  vehicle: string
  id: string
  ref: string
  hook: string
  cost: string
  rating?: string
  parent?: string
}
const rows: Row[] = JSON.parse(readFileSync('importer/sr6/classes/vehicle_parts.json', 'utf8')).rows
const FORMULA: Record<string, (r: number) => number> = {
  '$$ARMOR*0.25': () => 2.5,
  '$RATING-$$SENSORS': r => Math.max(0, r - 3),
  '$$BODY/3': () => 2,
  '$$BODY/2': () => 3,
  '$RATING-$$PILOT': r => Math.max(0, r - 3),
}
const cost = (r: Row) => (/^[\d.]+$/.test(r.cost) ? Number(r.cost) : FORMULA[r.cost](Number(r.rating) || 1))

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const attrs = (r: Row) =>
  `id="${esc(r.id)}" ref="${r.ref}" hook="${r.hook}" cost="${esc(r.cost)}"${r.rating ? ` rating="${r.rating}"` : ''}${r.parent ? ` parent="${esc(r.parent)}"` : ''} origin="cl6" review="none"`
const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const byVehicle = Map.groupBy(rows, r => r.vehicle)
const vehicles = [...byVehicle].map(
  ([id, rs]) =>
    `<vehicle id="${id}" source="ZZ" page="1" category="Car" body="6" armor="10" sensor="3" pilot="3" cost="1"><name>${id}</name>${rs.map(r => `<part ${attrs(r)}/>`).join('')}</vehicle>`,
)
const gear = [...new Set(rows.map(r => r.ref))].map(id => `<gear id="${id}" source="ZZ" page="1" category="Chassis mod" cost="1"><name>${id}</name></gear>`)
const files = [
  { file: 'custom/sr6/imported/zz/vehicles.xml', xml: `<sr6:data ${NS} kind="vehicles" version="1">${vehicles.join('')}</sr6:data>` },
  { file: 'custom/sr6/imported/zz/gear.xml', xml: `<sr6:data ${NS} kind="gear" version="1">${gear.join('')}</sr6:data>` },
]
const data = sr6Data(fixtureCatalog(undefined, files))
// (with the rigger book present the hardpoint meter is on)
const dcData = sr6Data(
  fixtureCatalog(undefined, [
    ...files,
    {
      file: 'custom/sr6/imported/zz/sources.xml',
      xml: `<sr6:data ${NS} kind="sources" version="1"><source id="DC" publisher="Made up" canon="true"><name>Made-up rigger book</name></source></sr6:data>`,
    },
  ]),
)
const owned = (id: string, removedParts?: string[]): Sr6Purchase => ({
  uid: 'v',
  kind: 'vehicles',
  id,
  qty: 1,
  accessories: [],
  ...(removedParts ? { removedParts } : {}),
})
const sum = (rs: Row[]) => {
  const t: Record<string, number> = {}
  for (const r of rs) t[r.hook] = (t[r.hook] ?? 0) + cost(r)
  return t
}

test('every vehicle in the table: the stock vehicle takes of each hook what its parts cost', () => {
  expect(byVehicle.size).toBeGreaterThanOrEqual(200)
  for (const [id, rs] of byVehicle) {
    const m = modsOf(owned(id), data)
    expect(m.parts.length, id).toBe(rs.length)
    const want = sum(rs)
    expect(Object.keys(m.usedByHook).sort(), id).toEqual(Object.keys(want).sort())
    for (const [h, n] of Object.entries(want)) expect(m.usedByHook[h], `${id} ${h}`).toBeCloseTo(n, 9)
  }
})

test('the named cases: Hornet, Scorpion, a car with weapons', () => {
  const hornet = modsOf(owned('crb.mct-hornet'), data)
  expect(hornet.usedByHook).toEqual({ 'vehicle-chassis': 1, 'vehicle-body': 0.5 })
  // D6: the injector (vehicle-body 0.5) is on the hardpoint; taking it off frees 0.5 of the hardpoint meter, putting it back takes it
  const h = owned('crb.mct-hornet'),
    inj = partsOf(h, dcData).find(p => p.hook === 'vehicle-body')!,
    before = modsOf(h, dcData).hardpoints!.used
  const max = modsOf(h, dcData).hardpoints!.max
  expect(setPart(h, inj.id, false, dcData)).toEqual({ ok: true })
  expect(modsOf(h, dcData).hardpoints!.max).toBe(max) // (the body's capacity stays; only the use drops)
  expect(modsOf(h, dcData).hardpoints!.used).toBeCloseTo(before - 0.5, 9)
  expect(setPart(h, inj.id, true, dcData)).toMatchObject({ ok: true })
  expect(modsOf(h, dcData).hardpoints!.used).toBeCloseTo(before, 9)
  expect(modsOf(owned('crb.harley-davidson-scorpion'), data).usedByHook).toEqual({ 'vehicle-cf': 1 })
  expect(byVehicle.has('crb.gmc-bulldog')).toBe(false) // (CL6 gives the Bulldog capacity only: no part to show, synthesis is 2b)
})

test("every vehicle: taking one part off frees exactly its cost and its children's; putting it back restores the stock figures", () => {
  for (const [id, rs] of byVehicle) {
    const stock = owned(id),
      all = partsOf(stock, data)
    for (const p of all) {
      const x = owned(id)
      const kids = all.filter(k => k.parent === p.id)
      const r = setPart(x, p.id, false, data)
      expect(r, `${id} ${p.id}`).toEqual({ ok: true })
      const gone = partsOf(x, data).filter(k => k.removed)
      expect(
        gone.map(k => k.id),
        `${id} ${p.id}`,
      ).toEqual(expect.arrayContaining([p.id, ...kids.map(k => k.id)]))
      const want = sum(rs.filter((_, i) => !gone.some(k => k.id === all[i].id)))
      const got = modsOf(x, data).usedByHook
      for (const h of new Set([...Object.keys(want), ...Object.keys(got)])) expect(got[h] ?? 0, `${id} ${p.id} ${h}`).toBeCloseTo(want[h] ?? 0, 9)
      // putting it back: only refused when the hook had been filled (nothing was, here)
      expect(setPart(x, p.id, true, data), `${id} ${p.id}`).toMatchObject({ ok: true })
      expect(x.removedParts).toBeUndefined()
    }
  }
})
