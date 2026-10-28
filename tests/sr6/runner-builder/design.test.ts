// Vehicle and drone design (src/sr6/runner-builder/domain/assets/design.ts; Double Clutch pp. 150-155, owner 2026-10-16 BUILDER Q1-Q4, Q6, Q8):
// the Design Points summed, the quality factors' multipliers multiplied, × 1,000 then the built-in mods' nuyen (2 DP a mod
// slot), do it yourself, every printed maximum's form, the final calculations (Top Speed from the powertrain's base Top
// Speed), the bought line and its GM approval, the design file. Invented parts, invented numbers.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { boughtDesign, designOf, maxProblems } from '../../../src/sr6/runner-builder/domain/assets/design'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { modsOf, mountsOf } from '../../../src/sr6/runner-builder/domain/assets/vehiclemods'
import { blankBuild, blankSr6, type Sr6Design } from '../../../src/sr6/formats/domain/character'
import { DESIGN_GEAR, DESIGN_PARTS, designWorld as world, NS } from './design-fixture'
import { fixtureCatalog, GLIM } from '../catalog/fixture'

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

test('a design that starts from a known vehicle takes its stats, price and Availability, with mods added on top (no Design Points)', () => {
  const { data, cr } = world()
  const s = designOf({ kind: 'vehicle', base: 'zz.grizzly', options: [], mods: [mod('glitter-paint')] }, data, cr)
  expect(s.stats).toMatchObject({ body: 12, armor: 10, handling: 4, offRoad: 3, accel: 7, interval: 20, topSpeed: 90, pilot: 3, sensor: 3, seats: 6 })
  expect(s.dp).toBe(0) // not a point-buy
  expect(s.mods).toEqual([{ uid: 'glitter-paint', slots: 0, dp: 0, nuyen: 4000 }])
  expect(s.price).toBe(44000) // 40,000¥ vehicle + 4,000¥ mod
  expect(s.avail).toBe('6(L)') // the vehicle's 6, the mod raising it to restricted
  // do it yourself halves the whole thing
  expect(designOf({ kind: 'vehicle', base: 'zz.grizzly', options: [], mods: [], diy: true }, data, cr).price).toBe(20000)
})

test('a based vehicle can be customised with options, modifications and quality factors: stats change, Design Points and the price multiplier apply', () => {
  const { data, cr } = world()
  const based = (over: Record<string, unknown>) => designOf({ kind: 'vehicle', base: 'zz.grizzly', options: [], mods: [], ...over }, data, cr)
  const s = based({ options: [opt('improved-body', 2)] })
  expect(s.stats.body).toBe(14) // the vehicle's 12 + 1 a level × 2
  expect(s.dp).toBe(8) // 4 Design Points a level × 2
  expect(based({ options: [opt('luxury')] }).price).toBe(60000) // 40,000¥ × 1.5
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
  // the Lug Frame's extra +4 CF counts in the starting CF (owner Q7): 4 + 4 = 8, at most 16
  expect(warn([opt('improved-cargo-space', 4)], { chassis: 'zz.lug-frame' })).toEqual(['Improved Cargo Space 4: at most 3 levels.'])
  expect(warn([opt('improved-cargo-space', 5)], { chassis: 'zz.lug-frame' })).toEqual([
    'Improved Cargo Space 5: at most 2 × the starting CF (16; it is 18).',
    'Improved Cargo Space 5: at most 3 levels.',
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
  // the design attribute taken out of the file (it still runs from its snapshot): still asks; a snapshot id is enough
  const asks = (x: typeof line) => validateSr6(data, cr, { ...ch, build: { ...b, purchases: [x] } }).some(y => y.code === 'vehicle.design')
  expect(asks({ ...line, design: undefined })).toBe(true)
  expect(asks({ ...line, design: undefined, id: undefined })).toBe(true)
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

test('Improved Handling on-road or off-road only: 3 DP a level, only that value, at most 3 levels; both: its own price (owner Q2)', () => {
  const { data, cr } = world()
  const at = (road?: 'on' | 'off', level = 2) => designOf(design({ options: [{ ...opt('improved-handling', level), ...(road ? { road } : {}) }] }), data, cr)
  // Handling 3: both 5 DP a level, both values; on-road or off-road 3 a level, that one
  expect([at().dp, at().stats.handling, at().stats.offRoad]).toEqual([22 + 10, 1, 1])
  expect([at('on').dp, at('on').stats.handling, at('on').stats.offRoad]).toEqual([22 + 6, 1, 3])
  expect([at('off').dp, at('off').stats.handling, at('off').stats.offRoad]).toEqual([22 + 6, 3, 1])
  expect(at('off', 4).warnings.map(w => w.message)).toEqual(['Improved Handling 4: at most 3 levels off-road only.'])
  expect(at('on', -3).warnings).toEqual([])
  // the file keeps it and validates; an unknown one: refused, in repair left out
  const doc = blankSr6('priority', 'des-3', '2026-10-16T00:00:00.000Z')
  doc.design = design({ options: [{ ...opt('improved-handling', 2), road: 'off' }] })
  const xml = sr6ToXml(doc)
  expect(xml).toContain('<option id="zz.improved-handling" level="2" road="off"/>')
  const back = xmlToSr6(xml)
  expect(back.ok && back.character).toEqual(doc)
  expect(xmlToSr6(xml.replace('road="off"', 'road="sky"')).ok).toBe(false)
  expect(xmlToSr6(xml.replace('level="2"', 'level="1.5"')).ok).toBe(false) // (a level is a whole number)
  const fix: string[] = []
  const r = xmlToSr6(xml.replace('road="off"', 'road="sky"'), { repair: fix })
  expect(r.ok && r.character.design!.options).toEqual([opt('improved-handling', 2)])
  expect(fix).toEqual([expect.stringMatching(/Improved Handling road “sky”/)])
})

test('Improved Size takes seats as built, never a vehicle below 1 seat; a drone has none to keep (owner Q5)', () => {
  const { data, cr } = world()
  // Zip Frame: 4 seats, half a level; Lug Frame: 2 seats
  expect(designOf(design({ options: [opt('improved-size', 1)] }), data, cr).stats.seats).toBe(6)
  expect(designOf(design({ options: [opt('improved-size', -1)] }), data, cr).stats.seats).toBe(2)
  expect(designOf(design({ options: [opt('improved-size', -2)] }), data, cr).stats.seats).toBe(1) // (not 0)
  expect(designOf(design({ chassis: 'zz.lug-frame', options: [opt('improved-size', -2)] }), data, cr).stats.seats).toBe(1)
  expect(designOf(design({ kind: 'drone', chassis: 'zz.gnat', options: [opt('improved-size', -1)] }), data, cr).stats.seats).toBe(0)
})

test('a mount built into a design is a fitting of the bought vehicle: it holds a weapon, uncharged (owner Q3)', () => {
  const { data, cr } = world()
  const doc = blankSr6('priority', 'des-4', '2026-10-16T00:00:00.000Z')
  doc.identity.streetName = 'Gun Zip'
  doc.design = design({ mods: [mod('zip-mount')] })
  const line = boughtDesign(doc, data, cr, 'v4')
  expect(mountsOf(line, data).map(m => [m.uid, m.name, m.builtin])).toEqual([['builtin:0', 'Zip Weapon Mount', true]])
  const b = blankBuild('karma')
  b.metatype = GLIM
  expect(apply(b, { op: 'design', line }, data, cr)).toEqual({ ok: true })
  const fit = () => apply(b, { op: 'accessory', host: b.purchases[0].uid, kind: 'weapons', id: 'crb.zap-gun', mount: 'builtin:0' }, data, cr)
  expect(fit()).toEqual({ ok: true })
  expect(b.purchases[0].accessories[0].mount).toBe('builtin:0')
})

test('the other modifications and quality factors by name, an option with no rule, parts and mods the app can’t read', () => {
  const at = 'source="ZZ" page="152"'
  const more = [
    `<design id="zz.heavy-duty" ${at} category="Modifications" dp="+10"><name>Heavy Duty</name></design>`,
    `<design id="zz.lightweight" ${at} category="Modifications" dp="-10"><name>Lightweight</name></design>`,
    `<design id="zz.mass-transit" ${at} category="Modifications" dp="15"><name>Mass Transit</name></design>`,
    `<design id="zz.cargo-hauler" ${at} category="Modifications" dp="10"><name>Cargo Hauler</name></design>`,
    `<design id="zz.off-road" ${at} category="Modifications" dp="5"><name>Off-Road Chassis</name></design>`,
    `<design id="zz.high-performance" ${at} category="Modifications" dp="15"><name>High Performance</name></design>`,
    `<design id="zz.economy" ${at} category="Modifications" dp="-5"><name>Economy Engines</name></design>`,
    `<design id="zz.mystery" ${at} category="Modifications" dp="lots"><name>Mystery Box</name></design>`,
    `<design id="zz.gizmo" ${at} category="Options" dp="3" perLevel="true"><name>Improved Gizmo</name></design>`,
    `<design id="zz.security" ${at} category="Quality Factors" multiplier="x2"><name>Security</name></design>`,
    `<design id="zz.superstructure" ${at} category="Quality Factors" multiplier="x1"><name>Superstructure</name></design>`,
    `<design id="zz.mud-frame" ${at} category="chassis type" body="10" armor="4" handling="3" seats="4" bp="7" sizeClass="6" special="-1 to off road handling"><name>Mud Frame</name></design>`,
  ].join('\n')
  const gear = `<gear id="zz.odd-mod" source="ZZ" page="1" category="Chassis mod" class="MOD_CHASSIS/MOD_HANDLING" slots="some" avail="1" cost="10"><name>Odd Mod</name></gear>`
  const data = sr6Data(
    fixtureCatalog(undefined, [
      { file: 'custom/sr6/imported/zz/vehicledesign.xml', xml: DESIGN_PARTS.replace('</sr6:data>', `${more}</sr6:data>`) },
      { file: 'custom/sr6/imported/zz/gear.xml', xml: DESIGN_GEAR.replace('</sr6:data>', `${gear}</sr6:data>`) },
    ]),
  )
  const { cr } = world()
  const of = (options: Sr6Design['options'], over: Partial<Sr6Design> = {}) => designOf(design({ options, ...over }), data, cr)
  // (the Zip Frame on the Roller: Body 10, Armor 4, speed modifier 9: Acceleration 10, Top Speed 160)
  expect(of([opt('heavy-duty')]).stats).toMatchObject({ body: 15, accel: 9, topSpeed: 140 })
  expect(of([opt('lightweight')]).stats).toMatchObject({ body: 5, accel: 12, topSpeed: 190 })
  expect(of([opt('mass-transit')]).stats.seats).toBe(12)
  // a Cargo Hauler: half the seats (2 at least), half the Armor in the speed modifier (7), cargo doubled; half the High
  // Performance bonus, Multi-Engine × 1.5
  expect(of([opt('cargo-hauler')]).stats).toMatchObject({ seats: 2, accel: 11, topSpeed: 180, cargo: 2, cargoText: '2 CF' })
  expect(of([opt('cargo-hauler'), opt('high-performance')]).stats).toMatchObject({ accel: 12, topSpeed: 205 })
  expect(of([opt('cargo-hauler'), opt('multi-engine')]).stats).toMatchObject({ accel: 16, topSpeed: 270 })
  expect(of([opt('high-performance')]).stats).toMatchObject({ accel: 13, topSpeed: 210 })
  expect(of([opt('economy')]).stats).toMatchObject({ accel: 7, topSpeed: 110 })
  // off-road: Handling 1 worse on-road, 1 better off-road, Top Speed −10; a chassis's printed off-road special
  expect(of([opt('off-road')]).stats).toMatchObject({ handling: 4, offRoad: 2, topSpeed: 150 })
  expect(of([], { chassis: 'zz.mud-frame' }).stats).toMatchObject({ handling: 3, offRoad: 2 })
  // a kilogram cargo: the extra Cargo Factors after it, a hauler's doubled
  expect(of([opt('cargo-hauler')], { kind: 'drone', chassis: 'zz.gnat' }).stats.cargoText).toBe('5 kg (doubled)')
  // Security: Availability +1(L); a mod's lower Availability doesn't lower it; Superstructure under Size Class 15
  expect(of([opt('security'), opt('military')], { mods: [mod('odd-mod')] }).avail).toBe('5(I)')
  const odd = of([opt('superstructure'), opt('gizmo', 2), opt('mystery'), opt('gone')], { mods: [mod('odd-mod')] })
  expect(odd.warnings.map(w => w.message)).toEqual([
    'The design part “zz.gone” is no longer in the catalog; left out.',
    'Mystery Box: its Design Points “lots” aren’t a number the app can read; counted 0.',
    'Odd Mod: its mod slots “some” aren’t a number the app can read; counted 0.',
    'Superstructure: the vehicle must be at least Size Class 15 (it is 6).',
  ])
  expect(odd.notes).toContain('Improved Gizmo 2: its Design Points count; the app has no rule for what it changes.')
  expect(odd.dp).toBe(22 + 6) // (the gizmo's 3 a level; the unreadable ones 0)
})

test('maxProblems: within each form nothing; a bare Stat in levels; another stat’s final value; reverse as far as the levels', () => {
  const e = (name: string, max: string, more: Record<string, string> = {}) =>
    ({ id: 'x', kind: 'vehicledesign', name, source: 'ZZ', page: 1, attrs: { max, ...more }, parts: [], text: '' }) as const
  expect(maxProblems(e('Improved Size', 'Size Class 20'), 2, { size: 6 }, { size: 8 })).toEqual([])
  expect(maxProblems(e('Improved Seating', '50% x Seat'), 2, { seats: 4 }, { seats: 6 })).toEqual([])
  expect(maxProblems(e('Easily Modified', 'min(4, Body)'), 3, { body: 2 }, {})).toEqual(['at most 2 levels.'])
  expect(maxProblems(e('Odd Thing', '2 x Body'), 5, {}, { body: 2 })).toEqual(['at most 2 × the Body (4; it is 5).'])
  expect(maxProblems(e('Improved Body', '4'), -5, {}, {})).toEqual(['at most 4 levels in reverse.'])
  expect(maxProblems(e('Improved Body', '4', { maxReverse: '1' }), -2, {}, {})).toEqual(['at most 1 level in reverse.'])
  // (a kilogram cargo: Cargo Factors not checked)
  expect(maxProblems(e('Improved Cargo Space', '2 x CF'), 1, {}, { cargo: 3 })).toEqual([])
})

test('bought from a design with no chassis, no name, a custom mod at a rating: still a line', () => {
  const { data, cr } = world()
  const doc = blankSr6('priority', 'des-5', '2026-10-16T00:00:00.000Z')
  doc.design = { kind: 'drone', options: [], mods: [{ uid: 'c1', kind: 'gear', name: 'Odd Box', rating: 2, qty: 1, accessories: [] }] }
  const line = boughtDesign(doc, data, cr, 'v5')
  expect(line.name).toBe('Custom design')
  expect(line.snapshot!.attrs.category).toBe('drone')
  expect(line.snapshot!.parts.map(p => p.attrs)).toEqual([{ name: 'Odd Box', rating: '2' }])
  expect(boughtDesign({ ...doc, design: { ...doc.design, kind: 'vehicle' } }, data, cr).snapshot!.attrs.category).toBe('Designed vehicle')
})
