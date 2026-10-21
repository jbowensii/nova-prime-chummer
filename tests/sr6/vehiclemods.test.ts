// Owned vehicles and drones (owner 2026-10-16, BUILDER Q5-Q7): Double Clutch's mod slots and hardpoints when DC is among
// the table's books, the core rulebook's Body / 3 weapon mounts otherwise; weapons in mounts, a drone's autosofts, the
// mods built in, the do-it-yourself half price (never an accessory's), the file and the career ledger. Invented entries,
// invented numbers.
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { priced } from '../../src/sr6/engine/budgets'
import { currentBuild, record, voidEntry } from '../../src/sr6/engine/career'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { modsOf, mountsOf, weaponSize } from '../../src/sr6/engine/vehiclemods'
import { vehicleNotes } from '../../src/sr6/print/view'
import { blankBuild, blankSr6, type SlotKind, type Sr6Build, type Sr6Character, type Sr6Purchase } from '../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from './catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const VEHICLES = `<sr6:data ${NS} kind="vehicles" version="1">
  <vehicle id="zz.zap-van" ${at} category="Zap van" body="7" pilot="2" avail="2" cost="20000"><name>Zap Van</name><builtin name="Zap plating" rating="2"/><builtin name="3 additional Chassis mod slots" slots="3" category="Chassis"/><note field="builtin">As the Zap Car, with a zap horn.</note></vehicle>
  <vehicle id="zz.zap-drone" ${at} category="Medium drone" class="DRONE_MEDIUM/GROUND" body="6" pilot="3" avail="2" cost="5000"><name>Zap Drone</name></vehicle>
  <vehicle id="zz.zap-mite" ${at} category="Small drone" class="DRONE_SMALL/AIR" body="4" pilot="2" avail="2" cost="3000"><name>Zap Mite</name></vehicle>
  <vehicle id="zz.zap-speck" ${at} category="Small drone" class="DRONE_SMALL/AIR" body="3" pilot="2" avail="2" cost="2000"><name>Zap Speck</name></vehicle>
  <vehicle id="zz.zap-fleck" ${at} category="Small drone" class="DRONE_SMALL/AIR" body="2" pilot="2" avail="2" cost="1500"><name>Zap Fleck</name></vehicle>
  <vehicle id="zz.zap-tank" ${at} category="Zap tank" body="9" pilot="2" avail="2" cost="30000"><name>Zap Tank</name><builtin name="Zap Standard Weapon Mount" ref="zz.zap-mount"/><builtin name="Large hardpoint" ref="zz.large-hardpoint"/></vehicle>
  <vehicle id="zz.zap-dot" ${at} category="Microdrones" body="1" pilot="1" avail="2" cost="500"><name>Zap Dot</name></vehicle>
</sr6:data>`
const GEAR = `<sr6:data ${NS} kind="gear" version="1">
  <gear id="zz.zap-grip" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_HANDLING" slots="2 x Rating" rating="1–2" avail="4" cost="1000 x Rating"><name>Zap Grip</name><formula field="cost">1000*R</formula><formula field="slots">2*R</formula></gear>
  <gear id="zz.zap-motor" ${at} category="Powertrain mod" class="MOD_POWER/MOD_SPEED" slots="3" avail="4" cost="4000"><name>Zap Motor</name></gear>
  <gear id="zz.zap-eye" ${at} category="Electronics mod" slots="1" avail="2" cost="600"><name>Zap Eye</name></gear>
  <gear id="zz.zap-bars" ${at} category="Accessory equipment" class="ACCESSORY/VEHICLE_ACCESSORY" avail="2" cost="800"><name>Zap Bars</name></gear>
  <gear id="zz.zap-bracket" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_CORE" slots="1/3 body (rounded up)" avail="2" cost="300"><name>Zap Bracket</name></gear>
  <gear id="zz.small-hardpoint" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_CORE" slots="0.5" avail="2" cost="500"><name>Small hardpoint</name></gear>
  <gear id="zz.large-hardpoint" ${at} category="Chassis mod" class="MOD_CHASSIS/MOD_CORE" slots="2" avail="3" cost="2500"><name>Large hardpoint</name></gear>
  <gear id="zz.zap-mount" ${at} category="Weapon mount" class="MOD_HARD/MOD_MOUNT" hardpoint="standard" avail="4(I)" cost="2000"><name>Zap Standard Weapon Mount</name></gear>
  <gear id="zz.zap-small-mount" ${at} category="Weapon mount" class="MOD_HARD/MOD_MOUNT" hardpoint="small" avail="3(I)" cost="1000"><name>Zap Small Weapon Mount</name></gear>
  <gear id="zz.zap-heavy-mount" ${at} category="Vehicle modification" class="MOD_HARD/MOD_MOUNT" avail="5(I)" cost="4000"><name>Zap Heavy Weapon Mount</name></gear>
</sr6:data>`
const WEAPONS = `<sr6:data ${NS} kind="weapons" version="1">
  <weapon id="zz.zap-smg" ${at} category="Submachine gun" dv="3P" avail="2" cost="100"><name>Zap SMG</name></weapon>
  <weapon id="zz.zap-rifle" ${at} category="Assault rifle" dv="5P" avail="3" cost="200"><name>Zap Rifle</name></weapon>
  <weapon id="zz.zap-cannon" ${at} category="Assault cannon" dv="9P" avail="6" cost="900"><name>Zap Cannon</name></weapon>
</sr6:data>`
const PROGRAMS = `<sr6:data ${NS} kind="programs" version="1">
  <program id="zz.zap-pilot" ${at} type="autosoft" avail="2" cost="50"><name>Zap Pilot</name></program>
</sr6:data>`
const DC_SOURCE = `<sr6:data ${NS} kind="sources" version="1"><source id="DC" publisher="Made up" canon="true"><name>Made-up rigger book</name></source></sr6:data>`

const world = (dc: boolean) => {
  const files = [['vehicles', VEHICLES], ['gear', GEAR], ['weapons', WEAPONS], ['programs', PROGRAMS], ...(dc ? [['sources', DC_SOURCE]] : [])].map(
    ([k, xml]) => ({ file: `custom/sr6/imported/zz/${k}.xml`, xml }),
  )
  return { data: sr6Data(fixtureCatalog(undefined, files)), cr: fixtureCreation() }
}
/** A build owning `vehicle`, the accessories fitted in order (id, rating), and the world it was built in. */
function owning(dc: boolean, vehicle: string, fits: [string, string, number?][] = []) {
  const w = world(dc),
    b = blankBuild('priority')
  expect(apply(b, { op: 'purchase', kind: 'vehicles', id: vehicle }, w.data, w.cr)).toEqual({ ok: true })
  const host = b.purchases[0]
  for (const [kind, id, rating] of fits)
    expect(apply(b, { op: 'accessory', host: host.uid, kind: kind as Sr6Purchase['kind'], id, rating }, w.data, w.cr)).toEqual({ ok: true })
  return { ...w, b, host, uid: (id: string) => host.accessories.find(a => a.id === id || a.id?.startsWith(`${id}.`))!.uid }
}
const messages = (x: Sr6Purchase, data: ReturnType<typeof world>['data']) => modsOf(x, data).warnings.map(w => `${w.source} ${w.page}: ${w.message}`)

test('DC: mod slots per category are the Body, a built-in mod adds its own; a mod takes its slots at its rating, an accessory none', () => {
  const { host, data } = owning(true, 'zz.zap-van', [
    ['gear', 'zz.zap-grip', 2],
    ['gear', 'zz.zap-motor'],
    ['gear', 'zz.zap-eye'],
    ['gear', 'zz.zap-bars'],
  ])
  const m = modsOf(host, data)
  expect(m.dc).toBe(true)
  expect(m.slots).toEqual({ chassis: { used: 4, max: 10 }, powertrain: { used: 3, max: 7 }, electronics: { used: 1, max: 7 } })
  expect(m.mounts).toBeUndefined()
  expect(m.builtin).toEqual([
    { uid: 'builtin:0', name: 'Zap plating', rating: '2' },
    { uid: 'builtin:1', name: '3 additional Chassis mod slots', slots: 3, category: 'chassis' },
  ])
  expect(m.notes).toEqual(['As the Zap Car, with a zap horn.'])
  expect(m.warnings).toEqual([])
})

test('DC: slots past the Body, and a slot count the app can’t read, are warnings (counted 0)', () => {
  const { host, data } = owning(true, 'zz.zap-van', [
    ['gear', 'zz.zap-motor'],
    ['gear', 'zz.zap-motor'],
    ['gear', 'zz.zap-motor'],
    ['gear', 'zz.zap-bracket'],
  ])
  expect(modsOf(host, data).slots!.powertrain).toEqual({ used: 9, max: 7 })
  expect(messages(host, data)).toEqual([
    'DC 120: Zap Van: Zap Bracket’s mod slots “1/3 body (rounded up)” aren’t a number the app can read; counted 0.',
    'DC 120: Zap Van: its powertrain mods take 9 mod slots; it has 7.',
  ])
})

test('DC: free hardpoints are Body / 3 standard ones (a small drone of Body 3 or more one small, under 3 none, a micro none); hardpoint mods add theirs', () => {
  const van = owning(true, 'zz.zap-van', [
    ['gear', 'zz.zap-mount'],
    ['gear', 'zz.zap-heavy-mount'],
  ])
  expect(modsOf(van.host, van.data).hardpoints).toEqual({ used: 3, max: 2 })
  expect(messages(van.host, van.data)).toEqual(['DC 124: Zap Van: what is on its hardpoints takes 3 standard hardpoints; it has 2.'])
  apply(van.b, { op: 'accessory', host: van.host.uid, kind: 'gear', id: 'zz.large-hardpoint' }, van.data, van.cr)
  expect(modsOf(van.host, van.data).hardpoints).toEqual({ used: 3, max: 4 })
  expect(modsOf(van.host, van.data).slots!.chassis.used).toBe(2) // (the hardpoint mod's chassis slots)
  expect(modsOf(van.host, van.data).warnings).toEqual([])

  const of = (id: string) => (o => modsOf(o.host, o.data).hardpoints!.max)(owning(true, id))
  // (Zap Speck, Body exactly 3: the owner reads DC p. 124 "a Body over three" as 3 and up, 2026-10-16)
  expect([of('zz.zap-drone'), of('zz.zap-mite'), of('zz.zap-speck'), of('zz.zap-fleck'), of('zz.zap-dot')]).toEqual([2, 0.5, 0.5, 0, 0])
  const mite = owning(true, 'zz.zap-mite', [['gear', 'zz.large-hardpoint']])
  expect(messages(mite.host, mite.data)).toContain('DC 124: Zap Mite: a small drone may only add a small hardpoint (Large hardpoint).')
  const dot = owning(true, 'zz.zap-dot', [['gear', 'zz.small-hardpoint']])
  expect(messages(dot.host, dot.data)).toContain('DC 124: Zap Dot: a micro drone can’t add a hardpoint (Small hardpoint).')
})

test('without DC: the core rulebook’s weapon mounts, up to Body / 3, a heavy one counting two; no slots', () => {
  const { host, data } = owning(false, 'zz.zap-van', [
    ['gear', 'zz.zap-mount'],
    ['gear', 'zz.zap-heavy-mount'],
    ['gear', 'zz.zap-motor'],
  ])
  const m = modsOf(host, data)
  expect(m.dc).toBe(false)
  expect(m.slots).toBeUndefined()
  expect(m.hardpoints).toBeUndefined()
  expect(m.mounts).toEqual({ used: 3, max: 2 })
  expect(messages(host, data)).toEqual(['CRB 295: Zap Van: 3 weapon mounts (a heavy one counts two); its Body allows 2.'])
})

test('do it yourself halves a mod’s nuyen, on and off again; never an accessory’s', () => {
  const o = owning(true, 'zz.zap-van', [
    ['gear', 'zz.zap-grip', 1],
    ['gear', 'zz.zap-bars'],
  ])
  const cost = () => priced(o.host, o.data, o.cr).cost
  expect(cost()).toBe(20000 + 1000 + 800)
  expect(apply(o.b, { op: 'diy', uid: o.uid('zz.zap-grip'), diy: true }, o.data, o.cr)).toEqual({ ok: true })
  expect(cost()).toBe(20000 + 500 + 800)
  expect(apply(o.b, { op: 'diy', uid: o.uid('zz.zap-bars'), diy: true }, o.data, o.cr)).toEqual({ ok: false, reason: 'no-diy' })
  expect(apply(o.b, { op: 'accessory', host: o.host.uid, kind: 'gear', id: 'zz.zap-bars', diy: true }, o.data, o.cr)).toEqual({ ok: false, reason: 'no-diy' })
  // (a file saying so anyway: the accessory's price stays whole)
  o.host.accessories.find(a => a.id === 'zz.zap-bars')!.diy = true
  expect(cost()).toBe(20000 + 500 + 800)
  expect(apply(o.b, { op: 'diy', uid: o.uid('zz.zap-grip'), diy: false }, o.data, o.cr)).toEqual({ ok: true })
  expect(o.host.accessories[0].diy).toBeUndefined()
  expect(cost()).toBe(20000 + 1000 + 800)
})

test('weapons sit in one mount each, no bigger than it holds; a mount taken off leaves its weapon in none', () => {
  const o = owning(true, 'zz.zap-drone', [
    ['gear', 'zz.zap-small-mount'],
    ['gear', 'zz.zap-mount'],
    ['weapons', 'zz.zap-smg'],
    ['weapons', 'zz.zap-rifle'],
    ['weapons', 'zz.zap-cannon'],
  ])
  const small = o.uid('zz.zap-small-mount'),
    std = o.uid('zz.zap-mount')
  expect(weaponSize(o.data.entry('weapons', 'zz.zap-smg'))).toBe(0)
  expect(apply(o.b, { op: 'mount', uid: o.uid('zz.zap-smg'), mount: small }, o.data, o.cr)).toEqual({ ok: true })
  expect(apply(o.b, { op: 'mount', uid: o.uid('zz.zap-rifle'), mount: small }, o.data, o.cr)).toEqual({ ok: true })
  expect(apply(o.b, { op: 'mount', uid: o.uid('zz.zap-cannon'), mount: o.uid('zz.zap-smg') }, o.data, o.cr)).toEqual({ ok: false, reason: 'not-a-mount' })
  expect(apply(o.b, { op: 'mount', uid: small, mount: std }, o.data, o.cr)).toEqual({ ok: false, reason: 'not-a-weapon' })
  expect(messages(o.host, o.data)).toEqual([
    'DC 142: Zap Drone: Zap Rifle is too big for its Zap Small Weapon Mount (it holds an SMG or smaller).',
    'DC 142: Zap Drone: Zap Cannon isn’t in a weapon mount.',
    'DC 142: Zap Drone: 2 weapons in one Zap Small Weapon Mount.',
  ])
  expect(vehicleNotes(o.host, o.data)).toEqual([
    'Mods: Zap Small Weapon Mount, Zap Standard Weapon Mount',
    'Weapons: Zap SMG (in Zap Small Weapon Mount), Zap Rifle (in Zap Small Weapon Mount), Zap Cannon (in no mount)',
  ])
  expect(apply(o.b, { op: 'mount', uid: o.uid('zz.zap-rifle'), mount: std }, o.data, o.cr)).toEqual({ ok: true })
  expect(apply(o.b, { op: 'accessory', host: o.host.uid, remove: std }, o.data, o.cr)).toEqual({ ok: true })
  expect(o.host.accessories.find(a => a.id === 'zz.zap-rifle')!.mount).toBeUndefined()
  // (a new weapon straight into a mount)
  expect(apply(o.b, { op: 'accessory', host: o.host.uid, kind: 'weapons', id: 'zz.zap-smg', mount: small }, o.data, o.cr)).toEqual({ ok: true })
  expect(o.host.accessories.at(-1)!.mount).toBe(small)
})

test('a drone runs half its Pilot in autosofts and programs, rounded up; more is a warning', () => {
  const o = owning(false, 'zz.zap-drone', [
    ['programs', 'zz.zap-pilot'],
    ['programs', 'zz.zap-pilot'],
  ])
  expect(modsOf(o.host, o.data).autosofts).toEqual({ used: 2, max: 2 })
  apply(o.b, { op: 'accessory', host: o.host.uid, kind: 'programs', id: 'zz.zap-pilot' }, o.data, o.cr)
  expect(messages(o.host, o.data)).toEqual(['CRB 201: Zap Drone: 3 autosofts and programs; its Pilot runs 2 (more when slaved to a rigger command console).'])
  expect(modsOf(owning(false, 'zz.zap-van').host, o.data).autosofts).toBeUndefined() // (a vehicle: none counted)
})

test('the file keeps mounts and do-it-yourself; an older file reads as it was; a mount naming none of its vehicle’s is cleared, noted', () => {
  const o = owning(true, 'zz.zap-van', [
    ['gear', 'zz.zap-mount'],
    ['weapons', 'zz.zap-rifle'],
    ['gear', 'zz.zap-grip', 1],
  ])
  apply(o.b, { op: 'mount', uid: o.uid('zz.zap-rifle'), mount: o.uid('zz.zap-mount') }, o.data, o.cr)
  apply(o.b, { op: 'diy', uid: o.uid('zz.zap-grip'), diy: true }, o.data, o.cr)
  const ch = { ...blankSr6('priority', 'made-up-v', '2026-10-16T00:00:00.000Z'), build: o.b }
  const xml = sr6ToXml(ch)
  expect(xml).toMatch(/mount="[^"]+"/)
  expect(xml).toMatch(/diy="true"/)
  const back = xmlToSr6(xml)
  expect(back.ok && back.character.build.purchases).toEqual(o.b.purchases)
  // (before this: no mount, no diy; read unchanged)
  const old = xml.replace(/ mount="[^"]+"/, '').replace(/ diy="true"/, '')
  const r = xmlToSr6(old)
  expect(r.ok && r.character.build.purchases[0].accessories.map(a => [a.mount, a.diy])).toEqual([
    [undefined, undefined],
    [undefined, undefined],
    [undefined, undefined],
  ])
  const notes: string[] = []
  const dangling = xmlToSr6(xml.replace(/mount="[^"]+"/, 'mount="gone"'), { repair: notes })
  expect(dangling.ok && dangling.character.build.purchases[0].accessories[1].mount).toBeUndefined()
  expect(notes).toEqual(['Zap Rifle: its weapon mount isn’t on Zap Van, so it’s in none (put it in one on the Vehicles or Drones tab).'])
})

test('career: fitting a mod (do it yourself), a weapon into a mount, and taking one off are ledger spends, voidable', () => {
  const o = owning(true, 'zz.zap-van', [['gear', 'zz.zap-mount']])
  const final: Sr6Build = o.b
  let ch = { ...blankSr6('priority', 'made-up-c', '2026-10-16T00:00:00.000Z'), build: final, finalizedAt: '2026-10-16T00:00:00.000Z' }
  ch.ledger = [{ id: 'f1', at: ch.finalizedAt, type: 'finalize', karma: 0, nuyen: 10000 }]
  const line = (kind: Sr6Purchase['kind'], id: string, more: Partial<Sr6Purchase> = {}): Sr6Purchase => ({
    uid: '',
    kind,
    id,
    qty: 1,
    accessories: [],
    ...more,
  })
  const go = (a: Parameters<typeof record>[1]) => {
    const r = record(ch, a, o.data, o.cr)
    if (!r.ok) throw new Error(r.reason)
    ch = r.ch
    return ch.ledger.at(-1)!
  }
  expect(go({ op: 'fit', target: o.host.uid, line: line('gear', 'zz.zap-grip.2', { diy: true }) })).toMatchObject({
    label: 'Fit: Zap Grip 2, do it yourself on Zap Van',
    nuyen: 1000,
  })
  const mount = o.uid('zz.zap-mount')
  expect(go({ op: 'fit', target: o.host.uid, line: line('weapons', 'zz.zap-rifle', { mount }) })).toMatchObject({
    label: 'Fit: Zap Rifle on Zap Van',
    nuyen: 200,
  })
  expect(record(ch, { op: 'fit', target: o.host.uid, line: line('gear', 'zz.zap-bars', { diy: true }) }, o.data, o.cr)).toEqual({ ok: false, reason: 'no-diy' })
  expect(record(ch, { op: 'fit', target: o.host.uid, line: line('weapons', 'zz.zap-smg', { mount: 'nope' }) }, o.data, o.cr)).toEqual({
    ok: false,
    reason: 'not-a-mount',
  })
  let now = currentBuild(ch).purchases[0]
  expect(now.accessories.map(a => [a.id, a.mount === mount, a.diy])).toEqual([
    ['zz.zap-mount', false, undefined],
    ['zz.zap-grip.2', false, true],
    ['zz.zap-rifle', true, undefined],
  ])
  const off = go({ op: 'unfit', target: mount })
  expect(off).toMatchObject({ label: 'Removed: Zap Standard Weapon Mount from Zap Van', nuyen: 0 })
  now = currentBuild(ch).purchases[0]
  expect(now.accessories.map(a => [a.id, a.mount])).toEqual([
    ['zz.zap-grip.2', undefined],
    ['zz.zap-rifle', undefined],
  ])
  // (the file keeps both entries; voiding the newest puts the mount back, the rifle in it)
  const xml = xmlToSr6(sr6ToXml(ch))
  expect(xml.ok && xml.character.ledger.slice(1).map(e => e.type === 'advance' && e.advance.op)).toEqual(['fit', 'fit', 'unfit'])
  const v = voidEntry(ch, off.id, 'changed my mind')
  expect(v.ok).toBe(true)
  if (v.ok) expect(currentBuild(v.ch).purchases[0].accessories.find(a => a.id === 'zz.zap-rifle')!.mount).toBe(mount)
})

test('DC p. 120: two slots of one category shift to one of another, both ways; only slots not in use, only with DC; undone by removing the shift', () => {
  const o = owning(true, 'zz.zap-van', [['gear', 'zz.zap-motor']]) // (Body 7, 3 built-in chassis slots; a motor takes 3 powertrain)
  const slots = () => modsOf(o.host, o.data).slots!
  const shift = (from: SlotKind, to: SlotKind) => apply(o.b, { op: 'shift', uid: o.host.uid, from, to }, o.data, o.cr)
  expect(slots()).toEqual({ chassis: { used: 0, max: 10 }, powertrain: { used: 3, max: 7 }, electronics: { used: 0, max: 7 } })
  expect(shift('chassis', 'powertrain')).toEqual({ ok: true })
  expect(slots()).toEqual({ chassis: { used: 0, max: 8 }, powertrain: { used: 3, max: 8 }, electronics: { used: 0, max: 7 } })
  expect(shift('electronics', 'chassis')).toEqual({ ok: true }) // (and the other way round)
  expect(slots()).toEqual({ chassis: { used: 0, max: 9 }, powertrain: { used: 3, max: 8 }, electronics: { used: 0, max: 5 } })
  expect(modsOf(o.host, o.data).shifts).toHaveLength(2)
  expect(modsOf(o.host, o.data).warnings).toEqual([])
  // limits: two different categories, and two slots not in use in the one given up
  expect(shift('chassis', 'chassis')).toEqual({ ok: false, reason: 'same-slot' })
  expect(shift('powertrain', 'chassis')).toEqual({ ok: true }) // (8 - 3 = 5 free)
  expect(shift('powertrain', 'chassis')).toEqual({ ok: true }) // (6 - 3 = 3 free)
  expect(shift('powertrain', 'electronics')).toEqual({ ok: false, reason: 'no-free-slots' }) // (4 - 3 = 1 free)
  expect(slots().powertrain).toEqual({ used: 3, max: 4 })
  expect(apply(o.b, { op: 'shift', uid: 'nope', from: 'chassis', to: 'powertrain' }, o.data, o.cr)).toEqual({ ok: false, reason: 'unknown-line' })
  // a shift removed gives its slots back
  expect(apply(o.b, { op: 'shift', uid: o.host.uid, remove: 3 }, o.data, o.cr)).toEqual({ ok: true })
  expect(slots().powertrain).toEqual({ used: 3, max: 6 })
  expect(apply(o.b, { op: 'shift', uid: o.host.uid, remove: 9 }, o.data, o.cr)).toEqual({ ok: false, reason: 'not-shifted' })
  for (let i = o.host.slotShifts!.length; i > 0; i--) apply(o.b, { op: 'shift', uid: o.host.uid, remove: 0 }, o.data, o.cr)
  expect(o.host.slotShifts).toBeUndefined()
  expect(slots().chassis.max).toBe(10)
  // without DC: no slots to shift, none shown
  const core = owning(false, 'zz.zap-van')
  expect(apply(core.b, { op: 'shift', uid: core.host.uid, from: 'chassis', to: 'powertrain' }, core.data, core.cr)).toEqual({ ok: false, reason: 'no-slots' })
  core.host.slotShifts = [{ from: 'chassis', to: 'powertrain' }]
  expect(modsOf(core.host, core.data).shifts).toBeUndefined()
  // a file that shifted slots in use: counted, warned, not refused; the sheet says what was shifted
  o.host.slotShifts = Array(3).fill({ from: 'powertrain', to: 'chassis' })
  expect(messages(o.host, o.data)).toEqual(['DC 120: Zap Van: its powertrain mods take 3 mod slots; it has 1.'])
  expect(vehicleNotes(o.host, o.data).at(-1)).toBe('Mod slots shifted: 2 powertrain → 1 chassis, 2 powertrain → 1 chassis, 2 powertrain → 1 chassis')
})

test('the file keeps slot shifts in order, an older file has none, a shift between no two categories is left out, noted', () => {
  const o = owning(true, 'zz.zap-van')
  apply(o.b, { op: 'shift', uid: o.host.uid, from: 'chassis', to: 'powertrain' }, o.data, o.cr)
  apply(o.b, { op: 'shift', uid: o.host.uid, from: 'electronics', to: 'chassis' }, o.data, o.cr)
  const xml = sr6ToXml({ ...blankSr6('priority', 'made-up-s', '2026-10-16T00:00:00.000Z'), build: o.b })
  expect(xml).toMatch(/slotShifts="chassis&gt;powertrain electronics&gt;chassis"/)
  const back = xmlToSr6(xml)
  expect(back.ok && back.character.build.purchases[0].slotShifts).toEqual([
    { from: 'chassis', to: 'powertrain' },
    { from: 'electronics', to: 'chassis' },
  ])
  const old = xmlToSr6(xml.replace(/ slotShifts="[^"]*"/, ''))
  expect(old.ok && old.character.build.purchases[0].slotShifts).toBeUndefined()
  const notes: string[] = []
  const bad = xmlToSr6(xml.replace(/slotShifts="[^"]*"/, 'slotShifts="chassis&gt;chassis chassis&gt;powertrain wings&gt;chassis"'), { repair: notes })
  expect(bad.ok && bad.character.build.purchases[0].slotShifts).toEqual([{ from: 'chassis', to: 'powertrain' }])
  expect(notes).toHaveLength(2)
  expect(xmlToSr6(xml.replace(/slotShifts="[^"]*"/, 'slotShifts="wings&gt;chassis"')).ok).toBe(false)
})

test('career: shifting slots is a free ledger spend and moving a weapon to another mount costs nothing; voiding either puts it back', () => {
  const o = owning(true, 'zz.zap-van', [
    ['gear', 'zz.zap-mount'],
    ['gear', 'zz.zap-small-mount'],
    ['weapons', 'zz.zap-rifle'],
  ])
  const std = o.uid('zz.zap-mount'),
    small = o.uid('zz.zap-small-mount'),
    rifle = o.uid('zz.zap-rifle')
  o.b.purchases[0].accessories.find(a => a.uid === rifle)!.mount = std
  const at = '2026-10-16T00:00:00.000Z'
  let ch: Sr6Character = { ...blankSr6('priority', 'made-up-m', at), build: o.b, finalizedAt: at }
  ch.ledger = [{ id: 'f1', at, type: 'finalize', karma: 0, nuyen: 10000 }]
  const go = (a: Parameters<typeof record>[1]) => {
    const r = record(ch, a, o.data, o.cr)
    if (!r.ok) throw new Error(r.reason)
    ch = r.ch
    return ch.ledger.at(-1)!
  }
  const why = (a: Parameters<typeof record>[1]) => {
    const r = record(ch, a, o.data, o.cr)
    return r.ok ? 'ok' : r.reason
  }
  const now = () => currentBuild(ch).purchases[0]
  const host = o.host.uid
  const sh = go({ op: 'shift', target: host, from: 'chassis', to: 'electronics' })
  expect(sh).toMatchObject({ label: 'Shift mod slots: 2 chassis → 1 electronics on Zap Van', karma: 0, nuyen: 0 })
  expect(modsOf(now(), o.data).slots).toMatchObject({ chassis: { max: 8 }, electronics: { max: 8 } })
  expect(why({ op: 'shift', target: host, from: 'chassis', to: 'chassis' })).toBe('same-slot')
  expect(why({ op: 'shift', target: 'nope', from: 'chassis', to: 'electronics' })).toBe('unknown-host')
  expect(why({ op: 'shift', target: host, from: 'chassis', to: 'electronics' })).toBe('ok')
  const mv = go({ op: 'move', target: rifle, mount: small })
  expect(mv).toMatchObject({ label: 'Moved: Zap Rifle from Zap Standard Weapon Mount to Zap Small Weapon Mount on Zap Van', karma: 0, nuyen: 0 })
  expect(now().accessories.find(a => a.uid === rifle)!.mount).toBe(small)
  // (too big for the small mount: Review's warning, the move is allowed)
  expect(modsOf(now(), o.data).warnings.map(w => w.message)).toEqual([
    'Zap Van: Zap Rifle is too big for its Zap Small Weapon Mount (it holds an SMG or smaller).',
  ])
  expect(why({ op: 'move', target: rifle, mount: small })).toBe('same-mount')
  expect(why({ op: 'move', target: rifle, mount: rifle })).toBe('not-a-mount')
  expect(why({ op: 'move', target: std, mount: small })).toBe('not-a-weapon')
  expect(why({ op: 'move', target: 'nope', mount: small })).toBe('not-fitted')
  // the file keeps both entries
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.ledger.slice(1).map(e => e.type === 'advance' && e.advance.op)).toEqual(['shift', 'move'])
  // voiding the move puts the rifle back in its old mount; then voiding the shift gives the slots back
  const v1 = voidEntry(ch, mv.id, 'wrong mount')
  expect(v1.ok).toBe(true)
  if (v1.ok) ch = v1.ch
  expect(now().accessories.find(a => a.uid === rifle)!.mount).toBe(std)
  const v2 = voidEntry(ch, sh.id, 'oops')
  expect(v2.ok).toBe(true)
  if (v2.ok) ch = v2.ch
  expect(now().slotShifts).toBeUndefined()
  expect(modsOf(now(), o.data).slots!.chassis.max).toBe(10)
})

test('built-in mods are fittings already paid for (DESIGNER Q3): a built-in mount holds a weapon and takes its hardpoints, a built-in hardpoint adds; never charged; the file and the ledger keep the mount', () => {
  const o = owning(true, 'zz.zap-tank', [
    ['weapons', 'zz.zap-rifle'],
    ['weapons', 'zz.zap-cannon'],
  ])
  const rifle = o.uid('zz.zap-rifle'),
    cannon = o.uid('zz.zap-cannon')
  expect(mountsOf(o.host, o.data).map(m => [m.uid, m.name, m.builtin])).toEqual([['builtin:0', 'Zap Standard Weapon Mount', true]])
  expect(apply(o.b, { op: 'mount', uid: rifle, mount: 'builtin:0' }, o.data, o.cr)).toEqual({ ok: true })
  expect(apply(o.b, { op: 'mount', uid: cannon, mount: 'builtin:1' }, o.data, o.cr)).toEqual({ ok: false, reason: 'not-a-mount' }) // (a hardpoint, no mount)
  // Body 9: 3 free standard hardpoints, + 2 the built-in large one; the built-in mount takes 1
  expect(modsOf(o.host, o.data).hardpoints).toEqual({ used: 1, max: 5 })
  expect(messages(o.host, o.data)).toEqual(['DC 142: Zap Tank: Zap Cannon isn’t in a weapon mount.'])
  expect(apply(o.b, { op: 'mount', uid: cannon, mount: 'builtin:0' }, o.data, o.cr)).toEqual({ ok: true })
  expect(messages(o.host, o.data)).toEqual([
    'DC 142: Zap Tank: Zap Cannon is too big for its Zap Standard Weapon Mount (it holds an assault rifle or smaller).',
    'DC 142: Zap Tank: 2 weapons in one Zap Standard Weapon Mount.',
  ])
  expect(vehicleNotes(o.host, o.data)[0]).toBe(
    'Weapons: Zap Rifle (in Zap Standard Weapon Mount (built in)), Zap Cannon (in Zap Standard Weapon Mount (built in))',
  )
  expect(priced(o.host, o.data, o.cr).cost).toBe(30000 + 200 + 900) // (the built-in ones cost nothing)
  // core rulebook: the built-in mount counts among the Body / 3
  expect(modsOf(o.host, world(false).data).mounts).toEqual({ used: 1, max: 3 })
  // the file keeps it (no repair note); one naming a built-in mount the vehicle hasn't: in none, warned
  const ch = { ...blankSr6('priority', 'made-up-t', '2026-10-16T00:00:00.000Z'), build: o.b }
  const notes: string[] = []
  const back = xmlToSr6(sr6ToXml(ch), { repair: notes })
  expect(back.ok && back.character.build.purchases).toEqual(o.b.purchases)
  expect(notes).toEqual([])
  o.host.accessories[0].mount = 'builtin:7'
  expect(messages(o.host, o.data)[0]).toBe('DC 142: Zap Tank: Zap Rifle isn’t in a weapon mount.')
  // the ledger: fitted straight into it, moved out of and back into it
  o.host.accessories = [{ uid: 'm1', kind: 'gear', id: 'zz.zap-mount', qty: 1, accessories: [] }]
  const at = '2026-10-16T00:00:00.000Z'
  let c: Sr6Character = { ...blankSr6('priority', 'made-up-l', at), build: o.b, finalizedAt: at }
  c.ledger = [{ id: 'f1', at, type: 'finalize', karma: 0, nuyen: 10000 }]
  const go = (a: Parameters<typeof record>[1]) => {
    const r = record(c, a, o.data, o.cr)
    if (!r.ok) throw new Error(r.reason)
    c = r.ch
    return c.ledger.at(-1)!
  }
  go({ op: 'fit', target: o.host.uid, line: { uid: 'w1', kind: 'weapons', id: 'zz.zap-rifle', qty: 1, accessories: [], mount: 'builtin:0' } })
  expect(go({ op: 'move', target: 'w1', mount: 'm1' })).toMatchObject({
    label: 'Moved: Zap Rifle from Zap Standard Weapon Mount (built in) to Zap Standard Weapon Mount on Zap Tank',
  })
  go({ op: 'move', target: 'w1', mount: 'builtin:0' })
  expect(currentBuild(c).purchases[0].accessories.find(a => a.uid === 'w1')!.mount).toBe('builtin:0')
})

test('career fit refusals: a host, an entry, a rating in range, a mount only for a weapon, critter gear on a critter only', () => {
  const o = owning(true, 'zz.zap-van', [['gear', 'zz.zap-mount']])
  const at = '2026-10-16T00:00:00.000Z'
  const ch: Sr6Character = { ...blankSr6('priority', 'made-up-r', at), build: o.b, finalizedAt: at }
  ch.ledger = [{ id: 'f1', at, type: 'finalize', karma: 0, nuyen: 10000 }]
  const line = (kind: Sr6Purchase['kind'], id: string, more: Partial<Sr6Purchase> = {}): Sr6Purchase => ({
    uid: '',
    kind,
    id,
    qty: 1,
    accessories: [],
    ...more,
  })
  const why = (a: Parameters<typeof record>[1]) => (r => (r.ok ? 'ok' : r.reason))(record(ch, a, o.data, o.cr))
  const mount = o.uid('zz.zap-mount')
  expect(why({ op: 'fit', target: 'nope', line: line('gear', 'zz.zap-motor') })).toBe('unknown-host')
  expect(why({ op: 'fit', target: o.host.uid, line: line('gear', 'zz.nothing') })).toBe('unknown-entry')
  expect(why({ op: 'fit', target: o.host.uid, line: line('gear', 'zz.zap-grip', { rating: 9 }) })).toBe('rating-range')
  expect(why({ op: 'fit', target: o.host.uid, line: line('gear', 'zz.zap-motor', { mount }) })).toBe('not-a-weapon')
  expect(why({ op: 'fit', target: o.host.uid, line: line('gear', 'zz.zap-motor', { name: 'Zap Motor' }) })).toBe('ok')
  expect(why({ op: 'unfit', target: 'nope' })).toBe('not-fitted')
})
