// Ammunition of a material (purchases.ts materialOf; owner to-do 2026-10-13: silver and other materials on any ammunition,
// costing more and carrying the material's effect): invented materials and factors on the made-up fixture.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { validateXML } from 'xmllint-wasm'
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { materialOf, priced } from '../../src/sr6/engine/budgets'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6Data } from '../../src/sr6/engine/data'
import { exportSr6Runners } from '../../src/sr6/engine/export'
import { effectNotes } from '../../src/sr6/print/view'
import { blankSr6, type Sr6Purchase } from '../../src/sr6/model/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from './fixture'

// (as the importer writes a material row, catalog.py variants: an ammunition type priced `H*N`)
const MATERIALS = {
  file: 'custom/sr6/imported/zz/ammotypes.xml',
  xml:
    '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="ammotypes" version="1">' +
    '<ammotype id="zz.glow-slugs-tin" source="ZZ" page="3" category="Ammunition accessory" cost="x3"><name>Glow Slugs (tin)</name><formula field="cost">H*3</formula></ammotype>' +
    '<ammotype id="zz.glow-slugs-moonstone" source="ZZ" page="3" category="Ammunition accessory" cost="x7"><name>Glow Slugs (moonstone)</name><formula field="cost">H*7</formula></ammotype>' +
    '</sr6:data>',
}
const world = () => {
  const c = fixtureCatalog(undefined, [MATERIALS])
  return { c, data: sr6Data(c), cr: fixtureCreation() }
}
const pellets = (more: Partial<Sr6Purchase> = {}): Sr6Purchase => ({ uid: 'a', kind: 'gear', id: 'crb.zap-pellets', qty: 2, accessories: [], ...more })
const fizz = (more: Partial<Sr6Purchase> = {}): Sr6Purchase => ({ uid: 't', kind: 'ammotypes', id: 'crb.fizz-rounds', qty: 1, accessories: [], ...more })

test('ammo-material: the materials are the catalog’s material rows, each its name in brackets and its factor', () => {
  const { data } = world()
  expect(data.materials.map(e => e.id)).toEqual(['zz.glow-slugs-tin', 'zz.glow-slugs-moonstone'])
  expect(materialOf(data, 'zz.glow-slugs-moonstone')).toMatchObject({ name: 'moonstone', times: 7 })
  expect(materialOf(data, 'crb.fizz-rounds')).toBeUndefined() // (an ammunition type, no material)
})

test('ammo-material: the line costs the factor times as much, its ammunition types with it, wherever the material is set', () => {
  const { data, cr } = world()
  expect(priced(pellets(), data, cr).cost).toBe(42) // (21 each)
  expect(priced(pellets({ material: 'zz.glow-slugs-tin' }), data, cr).cost).toBe(126)
  // a type's `x2` and the material's `x3` multiply: on the ammunition line or on the type fitted to it
  expect(priced(pellets({ material: 'zz.glow-slugs-tin', accessories: [fizz()] }), data, cr).cost).toBe(252)
  expect(priced(pellets({ accessories: [fizz({ material: 'zz.glow-slugs-tin' })] }), data, cr).cost).toBe(252)
  // an id that is no material counts as none
  expect(priced(pellets({ material: 'crb.fizz-rounds' }), data, cr).cost).toBe(42)
})

test('ammo-material: a material row fitted as an add-on (its cost `H*N`) makes its line cost N × the host, never host + N × host', () => {
  const { data, cr } = world(),
    slug = (id: string): Sr6Purchase => ({ uid: 'm', kind: 'ammotypes', id, qty: 1, accessories: [] })
  expect(priced(pellets({ accessories: [slug('zz.glow-slugs-tin')] }), data, cr).cost).toBe(126) // (42 × 3; it was 42 + 126)
  expect(priced(pellets({ accessories: [slug('zz.glow-slugs-moonstone')] }), data, cr).cost).toBe(294) // (42 × 7)
  // the same as the material option on the line
  expect(priced(pellets({ material: 'zz.glow-slugs-moonstone' }), data, cr).cost).toBe(294)
})

test('ammo-material: set on ammunition only, refused elsewhere, and taken off with the plain price back', () => {
  const { data, cr } = world(),
    b = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  b.purchases.push(pellets({ accessories: [fizz()] }), { uid: 'w', kind: 'weapons', id: 'crb.zap-gun', qty: 1, accessories: [] })
  const act = (uid: string, material: string | null) => apply(b, { op: 'material', uid, material }, data, cr)
  const before = priced(b.purchases[0], data, cr).cost
  expect(act('a', 'zz.glow-slugs-moonstone')).toEqual({ ok: true })
  expect(priced(b.purchases[0], data, cr).cost).toBe(before * 7)
  expect(act('t', 'zz.glow-slugs-tin')).toEqual({ ok: true }) // (the ammunition type fitted to it)
  expect(act('w', 'zz.glow-slugs-tin')).toEqual({ ok: false, reason: 'no-material' })
  expect(act('a', 'crb.fizz-rounds')).toEqual({ ok: false, reason: 'no-material' })
  expect(act('a', null)).toEqual({ ok: true })
  expect(act('t', null)).toEqual({ ok: true })
  expect(b.purchases[0]).not.toHaveProperty('material')
  expect(priced(b.purchases[0], data, cr).cost).toBe(before)
})

test('ammo-material: set and taken off on an ammunition type two levels down (weapon → ammunition → type), the price back', () => {
  const { data, cr } = world(),
    b = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  const gun: Sr6Purchase = { uid: 'w', kind: 'weapons', id: 'crb.zap-gun', qty: 1, accessories: [pellets({ accessories: [fizz()] })] }
  b.purchases.push(gun)
  const before = priced(gun, data, cr).cost
  expect(apply(b, { op: 'material', uid: 't', material: 'zz.glow-slugs-tin' }, data, cr)).toEqual({ ok: true })
  expect(gun.accessories[0].accessories[0].material).toBe('zz.glow-slugs-tin')
  expect(priced(gun, data, cr).cost).toBeGreaterThan(before)
  expect(apply(b, { op: 'material', uid: 't', material: null }, data, cr)).toEqual({ ok: true })
  expect(gun.accessories[0].accessories[0]).not.toHaveProperty('material')
  expect(priced(gun, data, cr).cost).toBe(before)
  // (the other line ops reach it too: a bonus on it, then taken off)
  expect(apply(b, { op: 'bonus', uid: 't', bonuses: [{ target: 'defense', value: 1 }] }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'bonus', uid: 't', bonuses: [] }, data, cr)).toEqual({ ok: true })
  expect(gun.accessories[0].accessories[0]).not.toHaveProperty('bonuses')
})

test('ammo-material: the effect is the runner’s effect note; the file keeps the material', async () => {
  const { data } = world(),
    ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build.purchases.push(pellets({ material: 'zz.glow-slugs-moonstone' }))
  const note = effectNotes(ch.build, data).find(x => x.from === 'Zap Pellets')
  expect(note?.text).toMatch(/^of moonstone \(×7 the price\): .*Allergy or Vulnerability to moonstone.*Immunity to Normal Weapons doesn't apply/)
  const xml = sr6ToXml(ch, 1)
  expect(xml).toContain('material="zz.glow-slugs-moonstone"')
  const XSD = readFileSync('public/data/sr6/schema/character.xsd', 'utf8')
  const v = await validateXML({ xml: { fileName: 'r.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: XSD } })
  expect(v.errors).toEqual([])
  const back = xmlToSr6(xml)
  expect(back.ok && back.character.build.purchases[0].material).toBe('zz.glow-slugs-moonstone')
})

test('ammo-material: the export carries the material and the price with it, valid against the schema', () => {
  const { c, data, cr } = world(),
    ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build.purchases.push(pellets({ material: 'zz.glow-slugs-tin' }))
  const f = exportSr6Runners(c, data, cr, [ch], { descriptions: false, now: '2026-10-04T09:00:00.000Z', appVersion: '0.9.0' })
  const x = f.runners![0].purchases[0]
  expect(x.material).toMatchObject({ id: 'zz.glow-slugs-tin', name: 'tin', times: 3 })
  expect(x.material?.effect).toContain('Allergy or Vulnerability to tin')
  expect(x.values.cost).toBe(63) // (one unit's: 21 × 3)
  const schema = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('public/data/schema/sr6-export.schema.json', 'utf8')))
  expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
})
