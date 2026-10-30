// The weapon and cyberware builders (assets/builders.ts; owner rulings, weapon-cyber-builders): fitting through the
// engine changes a weapon's numbers, a custom cyberlimb's price and Essence from the core rulebook's table (p. 288), a
// player's own add-on waits for a GM on Review, a career removal refunds what the GM types (a factory part nothing), and
// a saved design bought onto a runner (approved or not). Invented entries, invented numbers; the limb table is the book's.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import Ajv2020 from 'ajv/dist/2020'
import { exportSr6Runners } from '../../../src/sr6/foundry/domain/export'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { weaponOf } from '../../../src/sr6/runner-builder/domain/assets/weapons'
import {
  accessoryState,
  boughtItemDesign,
  customAddon,
  customLimb,
  itemDesignOf,
  limbOf,
  lineAt,
  removalAdvance,
} from '../../../src/sr6/runner-builder/domain/assets/builders'
import { priced } from '../../../src/sr6/runner-builder/domain/creation/purchases'
import { hostBonus } from '../../../src/sr6/runner-builder/domain/creation/bonuses'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { balances, currentBuild, preview, record } from '../../../src/sr6/runner-builder/domain/career/career'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { blankSr6, type Sr6Character, type Sr6Purchase } from '../../../src/sr6/formats/domain/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM, made } from '../catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const WEAPONS = `<sr6:data ${NS} kind="weapons" version="1">
  <weapon id="zz.laser" ${at} category="Weapon accessory" class="ACCESSORY/WEAPON_ACCESSORY" avail="1" cost="100"><name>Zap Laser</name><effect target="item:ar" op="add" value="1"/><fits slot="top"/></weapon>
  <weapon id="zz.scope" ${at} category="Weapon accessory" class="ACCESSORY/WEAPON_ACCESSORY" avail="3" cost="300"><name>Zap Scope</name><effect target="item:ar" op="add" value="0,0,2,2,2"/><fits slot="top"/></weapon>
  <weapon id="zz.rifle" ${at} category="Assault rifle" dv="4P" ar="4/10/8/6/2" modes="SA/BF/FA" ammo="30(c)" avail="2" cost="500"><name>Zap Rifle</name>
    <slot id="top" unit="one" value="1"/><slot id="barrel" unit="one" value="1"/>
    <part id="laser" ref="zz.laser" hook="top" cost="0" included="true" removable="true" origin="cl6" review="none"/></weapon>
</sr6:data>`
const world = () => ({ data: sr6Data(fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/weapons.xml', xml: WEAPONS }])), cr: fixtureCreation() })
const build = (purchases: Sr6Purchase[]) => ({ ...buildOf('priority', { metatype: GLIM }), purchases })
const rifle = (): Sr6Purchase => ({ uid: 'r1', kind: 'weapons', id: 'zz.rifle', qty: 1, accessories: [] })

test('the weapon builder: fitting through the engine changes the numbers; the full mount greys the next one', () => {
  const { data, cr } = world()
  const b = build([rifle()])
  // the factory laser holds the top mount: the scope is refused, and the picker says why
  expect(apply(b, { op: 'accessory', host: 'r1', kind: 'weapons', id: 'zz.scope' }, data, cr)).toEqual({
    ok: false,
    reason: 'No compatible mount slot remaining.',
  })
  // the laser comes off (ruling 8: its +1 comes off the printed AR) and the scope goes on
  expect(apply(b, { op: 'part', uid: 'r1', remove: 'laser' }, data, cr).ok).toBe(true)
  expect(weaponOf(b.purchases[0], data).now.ar).toEqual([3, 9, 7, 5, 1])
  expect(apply(b, { op: 'accessory', host: 'r1', kind: 'weapons', id: 'zz.scope' }, data, cr).ok).toBe(true)
  const w = weaponOf(b.purchases[0], data)
  expect(w.base.ar).toEqual([4, 10, 8, 6, 2])
  expect(w.now.ar).toEqual([3, 9, 9, 7, 3])
  expect(priced(b.purchases[0], data, cr).cost).toBe(800)
  // the mount is full again: accessoryState counts it
  const st = accessoryState(b.purchases[0], data, { isAccessory: () => true })
  expect(st.slots.remaining.get('top')).toBe(0)
  expect(st.slots.occupied.get(b.purchases[0].accessories[0].uid)).toBe('top')
})

test('a weapon built into a cyberarm takes its own accessories (the nested line, ruling 5)', () => {
  const { data, cr } = world()
  const arm = customLimb('arm', 'obvious')
  arm.accessories.push({ ...rifle(), uid: 'w1' })
  const b = build([arm])
  expect(lineAt(b, `${arm.uid}/w1`)?.id).toBe('zz.rifle')
  expect(apply(b, { op: 'part', uid: 'w1', remove: 'laser' }, data, cr).ok).toBe(true)
  expect(apply(b, { op: 'accessory', host: 'w1', kind: 'weapons', id: 'zz.scope' }, data, cr).ok).toBe(true)
  expect(lineAt(b, 'w1')!.accessories.map(a => a.id)).toEqual(['zz.scope'])
})

test('a custom cyberlimb: cost, Essence, Availability and Capacity from the core rulebook table (p. 288), increases at 5,000¥ a point', () => {
  const { data, cr } = world()
  const arm = customLimb('arm', 'obvious', { str: 2, agi: 1 })
  // obvious arm 15,000¥ (15), Essence 1, Avail 4; Strength 2 and Agility 1: [2] and [1], 15,000¥, Avail 2
  expect(priced(arm, data, cr)).toMatchObject({ cost: 30000, essence: 1, avail: 4 })
  expect(priced(customLimb('lowerleg', 'synthetic'), data, cr)).toMatchObject({ cost: 12000, essence: 0.45, avail: 4 })
  expect(limbOf(arm)).toEqual({ part: 'arm', look: 'obvious', inc: { str: 2, agi: 1 } })
  // the increases are the limb's own Strength and Agility (hostBonus), not the runner's
  expect(hostBonus(arm, data)).toMatchObject({ str: 2, agi: 1 })
  const b = build([])
  expect(apply(b, { op: 'custom', line: arm }, data, cr).ok).toBe(true)
  expect(apply(b, { op: 'custom', line: { ...arm, id: 'crb.zap-gun' } }, data, cr)).toEqual({ ok: false, reason: 'not-custom' })
  // a custom limb is no missing catalog entry for Review
  expect(validateSr6(data, cr, { ...blankSr6('priority'), build: b }).some(v => v.code === 'catalog.missing')).toBe(false)
})

test("a player's own add-on: Review asks a GM until one approves it (ruling 6)", () => {
  const { data, cr } = world()
  const b = build([{ ...rifle(), removedParts: ['laser'] }])
  const mine = customAddon(b.purchases[0], { name: 'Grip tape', cost: 50, avail: 1, capacity: 0, slot: 'top', effects: [{ target: 'item:ar', value: '2' }] })
  expect(apply(b, { op: 'custom', host: 'r1', line: mine }, data, cr).ok).toBe(true)
  const added = b.purchases[0].accessories[0]
  expect(weaponOf(b.purchases[0], data).now.ar).toEqual([5, 11, 9, 7, 3])
  const ch: Sr6Character = { ...blankSr6('priority'), build: b }
  const v = validateSr6(data, cr, ch).find(x => x.code === 'gear.custom')!
  expect(v).toMatchObject({ severity: 'warning', path: `gear.${added.uid}` })
  expect(validateSr6(data, cr, { ...ch, overrides: [{ code: 'gear.custom', path: v.path, note: 'ok' }] }).find(x => x.code === 'gear.custom')!.approved).toBe(
    true,
  )
})

test('career: removing a bought add-on refunds what the GM types (default 0); a factory part comes off free (rulings 7, 8)', () => {
  const { data, cr } = made()
  const ch = blankSr6('karma', 'c1', '2026-10-30T00:00:00.000Z')
  ch.build = buildOf('karma', { metatype: GLIM })
  ch.build.purchases = [{ uid: 'g1', kind: 'weapons', id: 'crb.zap-gun', qty: 1, accessories: [] }]
  ch.finalizedAt = '2026-10-30T00:00:00.000Z'
  ch.final = { karma: 0, nuyen: 1000 }
  ch.ledger = [{ id: 'f1', at: ch.finalizedAt, type: 'finalize', karma: 0, nuyen: 1000 }]
  const host = currentBuild(ch).purchases[0]
  const tape = customAddon(host, { name: 'Grip tape', cost: 200, avail: 1, capacity: 0, effects: [] })
  const fitted = record(ch, { op: 'fit', target: 'g1', line: tape }, data, cr)
  if (!fitted.ok) throw new Error(fitted.reason)
  expect(balances(fitted.ch).nuyen).toBe(800)
  const uid = currentBuild(fitted.ch).purchases[0].accessories[0].uid
  expect(removalAdvance(host, uid, false, null)).toBeNull() // (the prompt cancelled: nothing happens)
  expect(removalAdvance(host, uid, false, '')).toEqual({ op: 'unfit', target: uid }) // (blank: 0)
  const sold = removalAdvance(host, uid, false, '150')!
  expect(sold).toEqual({ op: 'unfit', target: uid, refund: 150 })
  const r = record(fitted.ch, sold, data, cr)
  if (!r.ok) throw new Error(r.reason)
  expect(balances(r.ch).nuyen).toBe(950)
  expect(currentBuild(r.ch).purchases[0].accessories).toEqual([])
  // a factory part: the part step, which prices nothing
  expect(removalAdvance(host, 'laser', true, '999')).toEqual({ op: 'part', target: 'g1', part: 'laser' })
  expect(preview(fitted.ch, { op: 'unfit', target: uid }, data, cr)).toMatchObject({ ok: true, nuyen: 0 })
})

test('a saved design: bought onto any runner, Review asks a GM unless a GM approved it; the file round-trips (ruling 2)', async () => {
  const { data, cr } = world()
  const line = { ...rifle(), removedParts: ['laser'], accessories: [{ uid: 'a1', kind: 'weapons' as const, id: 'zz.scope', qty: 1, accessories: [] }] }
  const doc = blankSr6('priority')
  doc.identity.streetName = 'Long gun'
  doc.itemDesign = itemDesignOf(line)
  const b = build([])
  expect(apply(b, { op: 'design', line: boughtItemDesign(doc) }, data, cr).ok).toBe(true)
  const bought = b.purchases[0]
  expect([bought.design, bought.accessories[0].id, bought.accessories[0].uid === 'a1']).toEqual([doc.id, 'zz.scope', false])
  const asks = (p: Sr6Purchase) => validateSr6(data, cr, { ...blankSr6('priority'), build: build([p]) }).some(v => v.code === 'vehicle.design')
  expect(asks(bought)).toBe(true)
  const gm = boughtItemDesign({ ...doc, itemDesign: { ...doc.itemDesign!, approved: true } })
  expect(gm.approved).toBe(true)
  expect(asks(gm)).toBe(false)
  // the design file and the bought line keep their marks
  const back = xmlToSr6(sr6ToXml({ ...doc, itemDesign: { ...doc.itemDesign!, approved: true } }))
  if (!back.ok) throw new Error(back.reason)
  expect(back.character.itemDesign).toMatchObject({ kind: 'weapon', approved: true, line: { id: 'zz.rifle', removedParts: ['laser'] } })
  const run = { ...blankSr6('priority'), build: build([gm]) }
  const rb = xmlToSr6(sr6ToXml(run))
  if (!rb.ok) throw new Error(rb.reason)
  expect(rb.character.build.purchases[0].approved).toBe(true)
  const XSD = readFileSync('public/data/sr6/schema/character.xsd', 'utf8')
  for (const x of [sr6ToXml(doc), sr6ToXml(run)])
    expect(
      (await validateXML({ xml: { fileName: 'd.xml', contents: x }, schema: { fileName: 'character.xsd', contents: XSD } })).errors.map(e => e.message),
    ).toEqual([])
})

test('the Foundry export carries a bought design line and a custom limb, schema-valid', () => {
  const c = fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/weapons.xml', xml: WEAPONS }]),
    d = sr6Data(c),
    doc = blankSr6('priority')
  doc.itemDesign = { ...itemDesignOf(rifle())!, approved: true }
  const ch = blankSr6('priority', 'r1', '2026-10-30T00:00:00.000Z')
  ch.build.purchases.push({ ...boughtItemDesign(doc), uid: 'w1' }, { ...customLimb('arm', 'obvious', { armor: 1 }), uid: 'l1' })
  const schema = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('public/data/schema/sr6-export.schema.json', 'utf8')))
  const f = exportSr6Runners(c, d, fixtureCreation(), [ch], { descriptions: false, now: '2026-10-30T00:00:00.000Z', appVersion: '0.0.0' })
  expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  const ps = f.runners![0].purchases
  expect(ps.find(p => p.uid === 'w1')).toMatchObject({ design: doc.id, approved: true })
  expect(ps.find(p => p.uid === 'l1')!.values).toMatchObject({ cost: 15000, essence: 1 })
})
