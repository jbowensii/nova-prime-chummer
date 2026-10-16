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
import { modsOf, mountsOf } from '../../src/sr6/engine/vehiclemods'
import { blankBuild, blankSr6, type Sr6Design } from '../../src/sr6/model/character'
import { DESIGN_GEAR, designWorld as world, NS } from './design-fixture'
import { fixtureCatalog, GLIM } from './fixture'

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
