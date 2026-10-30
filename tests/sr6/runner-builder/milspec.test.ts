// Deadly Arts' mil-spec design options (pp. 151-153; src/sr6/runner-builder/domain/assets/milspec.ts, owner ruling (c)
// 2026-10-30): Design Points as printed, plate's DV reduction and Speed Interval penalty offset by the frame, the frame's
// Body cap and its clash with Increased Structural Integrity, airframe plate's dice and DP, one specialty armor,
// hardpoint Grades and mounts, comms' commlinks. Invented chassis numbers.
import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { boughtDesign, designOf, partDp } from '../../../src/sr6/runner-builder/domain/assets/design'
import { hardpointCheck } from '../../../src/sr6/runner-builder/domain/assets/milspec'
import { blankSr6, type Sr6Design } from '../../../src/sr6/formats/domain/character'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { DESIGN_GEAR, DESIGN_PARTS, NS } from './design-fixture'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'

const at = 'source="DA" page="151" category="Mil-spec Design Options"'
const MILSPEC = DESIGN_PARTS.replace(
  '</sr6:data>',
  `<design id="zz.airframe" ${at} dp="2 x Armor Rating"><name>Airframe Ceramic Plate</name></design>
   <design id="zz.heavy" ${at} dp="5 x Rating"><name>Heavy Mil-Spec Plate</name></design>
   <design id="zz.frame" ${at} rating="1-12" dp="10+5 x Rating"><name>Mil-Spec Frame</name></design>
   <design id="zz.comms-1" ${at} dp="5"><name>Mil-spec Comms I</name></design>
   <design id="zz.comms-3" ${at} dp="30"><name>Mil-spec Comms III</name></design>
   <design id="zz.quad" ${at} dp="+5"><name>Quad Linked</name></design>
</sr6:data>`,
)
const GEAR = DESIGN_GEAR.replace(
  '</sr6:data>',
  `<gear id="zz.isi" source="DC" page="125" category="Chassis mod" class="MOD_CHASSIS/MOD_CORE" slots="1" avail="4" cost="5000"><name>Increased Structural Integrity</name></gear></sr6:data>`,
)
const ELEC = `<sr6:data ${NS} kind="electronics" version="1"><device id="zz.ranger" source="DA" page="69" category="Mil-spec commlink" cost="1"><name>Microdeck Ranger</name></device></sr6:data>`
const data = sr6Data(
  fixtureCatalog(undefined, [
    { file: 'custom/sr6/imported/zz/vehicledesign.xml', xml: MILSPEC },
    { file: 'custom/sr6/imported/zz/gear.xml', xml: GEAR },
    { file: 'custom/sr6/imported/zz/electronics.xml', xml: ELEC },
  ]),
)
const cr = fixtureCreation()
// a big chassis (Body 30) so the frame and hardpoints fit
const big = (over: Partial<Sr6Design> = {}): Sr6Design => ({
  kind: 'vehicle',
  customChassis: { name: 'Tank', dp: 10, body: 30, armor: 10, handling: 3, seats: 2, sizeClass: 10 },
  powertrain: 'zz.roller',
  console: 'zz.brainbox',
  options: [],
  mods: [],
  ...over,
})
const o = (id: string, level = 1) => ({ id: `zz.${id}`, level })
const warns = (d: Sr6Design) =>
  designOf(d, data, cr)
    .warnings.map(w => w.message)
    .join(' | ')

test('Design Points as the book prints them (DA pp. 151-153)', () => {
  const dp = (id: string, level = 1) => partDp(data.entry('vehicledesign', `zz.${id}`)!, level)
  expect(dp('frame', 3)).toBe(25) // 10 + 5 × Rating
  expect(dp('heavy', 5)).toBe(25) // 5 × Rating
  expect([dp('comms-1'), dp('comms-3'), dp('quad')]).toEqual([5, 30, 5])
  const base = designOf(big(), data, cr).dp
  // airframe: 2 × the final Armor, whatever its level
  expect(designOf(big({ options: [o('airframe')] }), data, cr).dp).toBe(base + 20)
  expect(designOf(big({ options: [o('frame', 2)] }), data, cr).dp).toBe(base + 20)
})

test('mil-spec plate reduces DV by its Rating and Speed Interval by 5 a level, every 2 frame points carrying a level', () => {
  const plain = designOf(big(), data, cr).stats.interval
  const p = designOf(big({ options: [o('heavy', 4)] }), data, cr)
  expect(p.milspec.damageReduction).toBe(4)
  expect(p.stats.interval).toBe(plain - 20)
  expect(designOf(big({ options: [o('heavy', 4), o('frame', 4)] }), data, cr).stats.interval).toBe(plain - 10)
  expect(designOf(big({ options: [o('heavy', 4), o('frame', 8)] }), data, cr).stats.interval).toBe(plain)
  expect(warns(big({ options: [o('heavy', 3)] }))).toMatch(/Rating 4 to 6/)
})

test('the frame: +Rating Body resisting damage, capped at half the base Body, never with Increased Structural Integrity', () => {
  expect(designOf(big({ options: [o('frame', 6)] }), data, cr).milspec.resistBody).toBe(6)
  const capped = designOf(big({ options: [o('frame', 12)] }), data, cr)
  expect(capped.milspec.resistBody).toBe(12) // (cap 15)
  const small = { ...big().customChassis!, body: 10 }
  const s = designOf(big({ customChassis: small, options: [o('frame', 8)] }), data, cr)
  expect(s.milspec.resistBody).toBe(5)
  expect(s.warnings.map(w => w.message).join()).toMatch(/50% of the base Body/)
  expect(warns(big({ options: [o('frame', 2)], mods: [{ uid: 'i', kind: 'gear', id: 'zz.isi', qty: 1, accessories: [] }] }))).toMatch(
    /Increased Structural Integrity may not be combined/,
  )
})

test('airframe plate: half the Armor as dice, a no-field-repair note; one specialty armor only', () => {
  const a = designOf(big({ options: [o('airframe')] }), data, cr)
  expect(a.milspec.armorPool).toBe(5)
  expect(a.notes.join()).toMatch(/no field repair/)
  expect(warns(big({ options: [o('airframe'), o('heavy', 4)] }))).toMatch(/Only one layer of one specialty armor/)
})

test('a hardpoint: required Grade by mount, Body 5 + 5 × Grade (dedicated one Grade smaller), DP, reasons and notes', () => {
  expect(hardpointCheck({ grade: 3, size: 3 }, 20)).toMatchObject({ need: 3, minBody: 20, dp: 15, ok: true })
  expect(hardpointCheck({ grade: 3, size: 3 }, 19).reasons.join()).toMatch(/needs Body 20/)
  expect(hardpointCheck({ grade: 3, size: 3, dedicated: true }, 15)).toMatchObject({ minBody: 15, ok: true })
  expect(hardpointCheck({ grade: 1, size: 3, mount: 'inline' }, 50)).toMatchObject({ need: 1, ok: true })
  expect(hardpointCheck({ grade: 1, size: 3, mount: 'open' }, 50).notes.join()).toMatch(/no protection/)
  expect(hardpointCheck({ grade: 3, size: 3, popOut: true }, 50)).toMatchObject({ need: 4, dp: 30, ok: false })
  expect(hardpointCheck({ grade: 4, size: 3, link: 'twin' }, 50)).toMatchObject({ need: 4, dp: 23, ok: true })
  expect(hardpointCheck({ grade: 4, size: 3, link: 'quad' }, 50)).toMatchObject({ need: 5, dp: 25, ok: false })
  expect(hardpointCheck({ grade: 4, size: 3, mount: 'inline', popOut: true }, 50).reasons.join()).toMatch(/open or turreted/)
  expect(hardpointCheck({ grade: 4, weapon: 'x' }, 50).reasons.join()).toMatch(/Size is not entered/)
  // its Design Points count on the design, and it round-trips the file
  const d = big({ hardpoints: [{ grade: 2, size: 2, link: 'twin', mount: 'open' }] })
  expect(designOf(d, data, cr).dp).toBe(designOf(big(), data, cr).dp + 13)
  const ch = { ...blankSr6('priority'), design: d }
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.design?.hardpoints).toEqual(d.hardpoints)
})

test("Mil-spec Comms: the in-console commlink, the catalog's where it has one, built into the bought design", () => {
  const d = big({ options: [o('comms-1')] })
  const sheet = designOf(d, data, cr)
  expect(sheet.milspec.comms.map(c => [c.name, c.entry?.id])).toEqual([
    ['Microdeck Ranger', 'zz.ranger'],
    ['M-TOC Fob (part)', undefined],
  ])
  const bought = boughtDesign({ ...blankSr6('priority'), design: d }, data, cr)
  expect(bought.snapshot!.parts.filter(p => p.tag === 'builtin').map(p => p.attrs.ref ?? p.attrs.name)).toEqual(['zz.ranger', 'M-TOC Fob (part)'])
})
