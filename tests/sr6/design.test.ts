// Vehicle and drone design (src/sr6/engine/design.ts; Double Clutch pp. 150-155, owner 2026-10-16 BUILDER Q1-Q4, Q6, Q8):
// the Design Points summed, the quality factors' multipliers multiplied, × 1,000 then the built-in mods' nuyen (2 DP a mod
// slot), do it yourself, every printed maximum's form, the final calculations (Top Speed from the powertrain's base Top
// Speed), the bought line and its GM approval, the design file. Invented parts, invented numbers.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { apply } from '../../src/sr6/engine/actions'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6Data } from '../../src/sr6/engine/data'
import { boughtDesign, designOf, maxProblems } from '../../src/sr6/engine/design'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { modsOf } from '../../src/sr6/engine/vehiclemods'
import { blankBuild, blankSr6, type Sr6Design } from '../../src/sr6/model/character'
import { fixtureCatalog, fixtureCreation, GLIM } from './fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="150"'
export const DESIGN_PARTS = `<sr6:data ${NS} kind="vehicledesign" version="1">
  <design id="zz.zip-frame" ${at} category="chassis type" body="10" armor="4" handling="3" seats="4" bp="7" sizeClass="6"><name>Zip Frame</name></design>
  <design id="zz.lug-frame" ${at} category="chassis type" body="14" armor="12" handling="4" seats="2" bp="8" sizeClass="7" special="Extra cargo (+4 CF)"><name>Lug Frame</name></design>
  <design id="zz.gnat" ${at} category="chassis type" body="2" armor="1" handling="3" seats="0" bp="8" sizeClass="2"><name>Gnat Drone, Small</name></design>
  <design id="zz.roller" ${at} category="powertrain type" accel="15" interval="20" topSpeed="250" bp="10"><name>Roller</name></design>
  <design id="zz.stomper" ${at} category="powertrain type" accel="10" interval="15" topSpeed="30" bp="15" special="No Top Speed loss for Body &amp; Armor"><name>Stomper</name></design>
  <design id="zz.floater" ${at} category="powertrain type" accel="15" interval="45" topSpeed="120" bp="12" special="-2 handling"><name>Floater</name></design>
  <design id="zz.flapper" ${at} category="powertrain type" accel="15" interval="25" topSpeed="300" bp="50"><name>Flapper (Air)</name></design>
  <design id="zz.brainbox" ${at} category="console type" pilot="2" sensor="2" bp="5" special="12"><name>Brainbox</name></design>
  <design id="zz.size-2" ${at} category="size class" cargo="5 kg"><name>Size Class 2</name></design>
  <design id="zz.size-6" ${at} category="size class" cargo="1 CF"><name>Size Class 6</name></design>
  <design id="zz.size-7" ${at} category="size class" cargo="4 CF"><name>Size Class 7</name></design>
  <design id="zz.improved-body" source="ZZ" page="151" category="Options" dp="4" perLevel="true" max="4"><name>Improved Body</name></design>
  <design id="zz.improved-armor" source="ZZ" page="151" category="Options" dp="2" perLevel="true" max="2 x Body"><name>Improved Armor</name></design>
  <design id="zz.improved-seating" source="ZZ" page="151" category="Options" dp="2" perLevel="true" max="50% x Seat"><name>Improved Seating</name></design>
  <design id="zz.improved-size" source="ZZ" page="151" category="Options" dp="4" perLevel="true" max="Size Class 20" maxReverse="2"><name>Improved Size</name></design>
  <design id="zz.improved-speed-interval" source="ZZ" page="151" category="Options" dp="5" perLevel="true" max="3"><name>Improved Speed Interval</name></design>
  <design id="zz.improved-cargo-space" source="ZZ" page="151" category="Options" dp="2" perLevel="true" max="min(3, 2 x CF)"><name>Improved Cargo Space</name></design>
  <design id="zz.easily-modified" source="ZZ" page="151" category="Options" dp="4" perLevel="true" max="min(4, Body)"><name>Easily Modified</name></design>
  <design id="zz.racing" source="ZZ" page="152" category="Modifications" dp="+25"><name>Racing</name></design>
  <design id="zz.integrated-armor" source="ZZ" page="152" category="Modifications" dp="20"><name>Integrated Armor</name></design>
  <design id="zz.multi-engine" source="ZZ" page="153" category="Modifications" dp="25"><name>Multi-Engine</name></design>
  <design id="zz.underpowered" source="ZZ" page="153" category="Modifications" dp="-20"><name>Underpowered</name></design>
  <design id="zz.one-off" source="ZZ" page="153" category="Quality Factors" multiplier="x2"><name>One-off Custom</name></design>
  <design id="zz.drone" source="ZZ" page="153" category="Quality Factors" multiplier="x0.5"><name>Drone</name></design>
  <design id="zz.luxury" source="ZZ" page="154" category="Quality Factors" multiplier="x1.5"><name>Luxury</name></design>
  <design id="zz.military" source="ZZ" page="154" category="Quality Factors" multiplier="x3"><name>Military</name></design>
</sr6:data>`
export const DESIGN_GEAR = `<sr6:data ${NS} kind="gear" version="1">
  <gear id="zz.zap-grip" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_HANDLING" slots="2" avail="4" cost="1000"><name>Zap Grip</name></gear>
  <gear id="zz.glitter-paint" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_SKIN" slots="0" avail="6(L)" cost="4000"><name>Glitter Paint</name></gear>
</sr6:data>`
const world = () => ({
  data: sr6Data(
    fixtureCatalog(undefined, [
      { file: 'custom/sr6/imported/zz/vehicledesign.xml', xml: DESIGN_PARTS },
      { file: 'custom/sr6/imported/zz/gear.xml', xml: DESIGN_GEAR },
    ]),
  ),
  cr: fixtureCreation(),
})
const design = (over: Partial<Sr6Design> = {}): Sr6Design => ({
  kind: 'vehicle',
  chassis: 'zz.zip-frame',
  powertrain: 'zz.roller',
  console: 'zz.brainbox',
  options: [],
  mods: [],
  ...over,
})
const opt = (id: string, level = 1) => ({ id: `zz.${id}`, level })
const mod = (id: string, uid = id) => ({ uid, kind: 'gear' as const, id: `zz.${id}`, qty: 1, accessories: [] })

test('the Design Points summed, the final calculations (Top Speed from the powertrain’s base Top Speed), a mod built in at 0 slots adds its nuyen', () => {
  const { data, cr } = world()
  const s = designOf(design({ options: [opt('improved-body', -1), opt('improved-speed-interval', 2), opt('racing')], mods: [mod('glitter-paint')] }), data, cr)
  // 7 + 10 + 5 parts, Body taken in reverse -4, Speed Interval 2 levels +10, Racing +25
  expect(s.dp).toBe(53)
  expect(s.multiplier).toBe(1)
  // speed modifier (9/2 + 4) = 8, rounded down: Acceleration 15 - 4 + 6; Top Speed 250 - 80 + 100 (the formula, not a
  // worked example's)
  expect(s.stats).toMatchObject({ body: 9, armor: 4, handling: 3, seats: 4, size: 6, accel: 17, interval: 30, topSpeed: 270, pilot: 2, sensor: 2, cargo: 1 })
  expect(s.price).toBe(57000) // 53 × 1,000 + 4,000¥ of mods
  expect(s.avail).toBe('6(L)') // (the mod's, higher than the vehicle's 2)
  expect(s.notes).toContain('Brainbox: special 12 (as printed; no rule here reads it).')
  expect(s.warnings).toEqual([])
})

test('the quality factors’ multipliers multiply together, then × 1,000; a built-in mod 2 DP a slot (multiplied), its nuyen after (not); do it yourself halves the price', () => {
  const { data, cr } = world()
  const d = design({ options: [opt('one-off'), opt('drone')], mods: [mod('zap-grip')] })
  const s = designOf(d, data, cr)
  expect(s.multiplier).toBe(1) // ×2 × ×0.5
  expect(s.mods).toEqual([{ uid: 'zap-grip', slots: 2, dp: 4, nuyen: 1000 }])
  expect(s.dp).toBe(26) // 22 + 2 slots × 2
  expect(s.price).toBe(27000)
  const lux = designOf({ ...d, options: [...d.options, opt('luxury')] }, data, cr)
  expect(lux.multiplier).toBe(1.5)
  expect(lux.dpv).toBe(39)
  expect(lux.price).toBe(40000) // 26 × 1.5 × 1,000 + 1,000¥, the mod's nuyen not multiplied
  expect(lux.avail).toBe('4') // 2 + 1 Luxury, the mod's 4 higher
  expect(designOf({ ...d, options: [...d.options, opt('luxury')], diy: true }, data, cr).price).toBe(20000)
  expect(designOf(design({ options: [opt('military')] }), data, cr).avail).toBe('4(I)')
  expect(designOf(design({ powertrain: 'zz.flapper' }), data, cr).avail).toBe('3') // an aircraft
})

test('a walker loses no Top Speed; Integrated Armor counts half the Armor; a small drone’s Acceleration × 0.75; Multi-Engine doubles, Underpowered halves Top Speed', () => {
  const { data, cr } = world()
  // Body 10, Armor 4 + 2: speed modifier 5 + 3 = 8 → Acceleration 10 - 4; Top Speed stays 30
  expect(designOf(design({ powertrain: 'zz.stomper', options: [opt('integrated-armor'), opt('improved-armor', 2)] }), data, cr).stats).toMatchObject({
    accel: 6,
    topSpeed: 30,
  })
  // Body 2, Armor 1: speed modifier 2 → Acceleration floor((15 - 1) × 0.75) = 10; Top Speed 230
  const drone = designOf(design({ kind: 'drone', chassis: 'zz.gnat' }), data, cr)
  expect(drone.stats).toMatchObject({ accel: 10, topSpeed: 230, cargo: null, cargoText: '5 kg' })
  expect(drone.drone).toBe(true)
  const me = designOf(design({ options: [opt('multi-engine')] }), data, cr).stats
  expect([me.accel, me.topSpeed]).toEqual([20, 320]) // speed modifier 5 + 4 = 9: (15 - 4.5, rounded down) × 2, (250 - 90) × 2
  expect(designOf(design({ options: [opt('underpowered')] }), data, cr).stats.topSpeed).toBe(80)
  // a powertrain's printed special: -2 handling; a chassis's extra cargo (size class 7: 4 CF + 4)
  expect(designOf(design({ powertrain: 'zz.floater' }), data, cr).stats.handling).toBe(1)
  expect(designOf(design({ chassis: 'zz.lug-frame' }), data, cr).stats.cargoText).toBe('8 CF')
})

test('each printed maximum: a number (and in reverse), Size Class N, k x Stat, P% x Stat, Stat alone, min(…): warnings, never refused', () => {
  const { data, cr } = world()
  const warn = (options: Sr6Design['options'], over: Partial<Sr6Design> = {}) =>
    designOf(design({ options, ...over }), data, cr)
      .warnings.map(w => w.message)
      .filter(m => /^(Improved|Easily)/.test(m)) // (the stats a big level throws below 0 warn too)
  expect(warn([opt('improved-body', 5)])).toEqual(['Improved Body 5: at most 4 levels.'])
  expect(warn([opt('improved-body', -5)])).toEqual(['Improved Body -5: at most 4 levels in reverse.'])
  expect(warn([opt('improved-size', 15)])).toEqual(['Improved Size 15: the Size Class may not go past 20 (it is 21).'])
  expect(warn([opt('improved-size', -3)])).toEqual(['Improved Size -3: at most 2 levels in reverse.'])
  // Armor 4 + 17 = 21 > 2 × Body 10
  expect(warn([opt('improved-armor', 17)])).toEqual(['Improved Armor 17: at most 2 × the Body (20; it is 21).'])
  expect(warn([opt('improved-armor', 16)])).toEqual([])
  // Seats 4: at most 2 more
  expect(warn([opt('improved-seating', 3)])).toEqual(['Improved Seating 3: at most 50% of the starting Seat (2 levels).'])
  // 1 CF to start: at most double it (2), and at most 3 levels
  expect(warn([opt('improved-cargo-space', 1)])).toEqual(['Improved Cargo Space 1: at most 2 × the starting CF (2; it is 3).'])
  expect(warn([opt('improved-cargo-space', 4)], { chassis: 'zz.lug-frame' })).toEqual([
    'Improved Cargo Space 4: at most 2 × the starting CF (8; it is 16).',
    'Improved Cargo Space 4: at most 3 levels.',
  ])
  // at most 4 or the starting Body, the lower
  expect(warn([opt('easily-modified', 3)], { kind: 'drone', chassis: 'zz.gnat' })).toEqual(['Easily Modified 3: at most 2 levels.'])
  expect(
    maxProblems({ id: 'x', kind: 'vehicledesign', name: 'Odd', source: 'ZZ', page: 1, attrs: { max: 'twice the moon' }, parts: [], text: '' }, 1, {}, {}),
  ).toEqual(['its maximum “twice the moon” isn’t one the app can read; not checked.'])
})

test('bought: a vehicles line with the design as its snapshot; a player’s design is a Review warning a GM approves, a GM’s none; the built-in mods and universal slots carried', () => {
  const { data, cr } = world()
  const doc = blankSr6('priority', 'des-1', '2026-10-16T00:00:00.000Z')
  doc.identity.streetName = 'Red Zip'
  doc.design = design({ options: [opt('easily-modified', 2)], mods: [mod('zap-grip')] })
  const line = boughtDesign(doc, data, cr, 'v1')
  expect(line).toMatchObject({ uid: 'v1', kind: 'vehicles', id: 'design.des-1', design: 'des-1', name: 'Red Zip' })
  expect(line.snapshot!.attrs).toMatchObject({ body: '10', accel: '10', topSpeed: '160', cost: '35000', avail: '4', dp: '34', category: 'Zip Frame' })
  expect(line.snapshot!.parts.map(p => p.attrs)).toEqual([
    { name: 'Zap Grip', ref: 'zz.zap-grip' },
    { name: 'Easily Modified', slots: '4', category: 'universal' },
  ])
  const b = blankBuild('karma')
  b.metatype = GLIM
  expect(apply(b, { op: 'design', line }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'design', line: { ...line, design: undefined } }, data, cr)).toEqual({ ok: false, reason: 'not-a-design' })
  const ch = { ...blankSr6('karma', 'r1'), build: b }
  const v = validateSr6(data, cr, ch)
  expect(v.filter(x => x.code === 'vehicle.design').map(x => [x.severity, x.message])).toEqual([['warning', 'Custom design: needs GM approval (Red Zip).']])
  expect(v.some(x => x.code === 'catalog.missing')).toBe(false)
  const path = v.find(x => x.code === 'vehicle.design')!.path
  expect(validateSr6(data, cr, { ...ch, overrides: [{ code: 'vehicle.design', path, note: 'fine' }] }).find(x => x.code === 'vehicle.design')!.approved).toBe(
    true,
  )
  // a GM's (approved) design: nothing to approve
  const gm = boughtDesign({ ...doc, design: { ...doc.design, approved: true } }, data, cr)
  expect(validateSr6(data, cr, { ...ch, build: { ...b, purchases: [gm] } }).some(x => x.code === 'vehicle.design')).toBe(false)
  // the universal slots take what a category goes past (DC's rules: 10 chassis slots, 4 universal)
  const dc = sr6Data(
    fixtureCatalog(undefined, [
      { file: 'custom/sr6/imported/zz/gear.xml', xml: DESIGN_GEAR.replace('slots="2"', 'slots="14"') },
      {
        file: 'custom/sr6/imported/dc/sources.xml',
        xml: `<sr6:data ${NS} kind="sources" version="1"><source id="DC" publisher="Made up" canon="true"><name>Made-up rigger book</name></source></sr6:data>`,
      },
    ]),
  )
  const fitted = { ...line, accessories: [mod('zap-grip', 'g1')] }
  expect(modsOf(fitted, dc).warnings).toEqual([])
  expect(modsOf({ ...fitted, accessories: [...fitted.accessories, mod('zap-grip', 'g2')] }, dc).warnings.map(w => w.message)).toEqual([
    'Red Zip: its chassis mods take 28 mod slots; it has 10 (and 4 universal).',
  ])
})

test('the design file: <design> first, reads back equal and validates; the bought line’s design attribute too', async () => {
  const { data, cr } = world()
  const doc = blankSr6('priority', 'des-2', '2026-10-16T00:00:00.000Z')
  doc.identity.streetName = 'Gnat Mk II'
  doc.design = design({
    kind: 'drone',
    chassis: 'zz.gnat',
    options: [opt('improved-body', -1), opt('drone')],
    mods: [mod('zap-grip')],
    diy: true,
    approved: true,
  })
  const xml = sr6ToXml(doc)
  expect(xml).toMatch(/<sr6:character [^>]*>\s*<design kind="drone" chassis="zz.gnat" powertrain="zz.roller" console="zz.brainbox" diy="true" approved="true">/)
  const back = xmlToSr6(xml)
  expect(back.ok && back.character).toEqual(doc)
  const runner = blankSr6('karma', 'r2', '2026-10-16T00:00:00.000Z')
  runner.build.purchases = [boughtDesign(doc, data, cr, 'v9')]
  const rx = sr6ToXml(runner),
    rback = xmlToSr6(rx)
  expect(rback.ok && rback.character.build.purchases[0]).toEqual(runner.build.purchases[0])
  const XSD = readFileSync('public/data/sr6/schema/character.xsd', 'utf8')
  for (const x of [xml, rx])
    expect(
      (await validateXML({ xml: { fileName: 'd.xml', contents: x }, schema: { fileName: 'character.xsd', contents: XSD } })).errors.map(e => e.message),
    ).toEqual([])
})
