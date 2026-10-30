// The Vehicles and Drones tabs (owner 2026-10-16: two tabs) and each one's Modify panel: the core rulebook's weapon mounts
// or Double Clutch's slots and hardpoints, mods, a weapon in a mount, a drone's autosofts, the mods built in, the
// do-it-yourself box (never on an accessory), Undo; Review's warning linking to Drones; after finalising, a fit on the
// Ledger. Made-up runner, items and prices on the made-up fixture.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { currentBuild, record } from '../../../src/sr6/runner-builder/domain/career/career'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import type { Sr6Catalog } from '../../../src/sr6/formats/domain/types'
import { Sr6EditorView } from '../../../src/sr6/shell/ui/EditorView'
import { fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'
import { button, change, click, fakeStore, field, mount, option, pageText, stubFetch } from '../../ui/dom'

const dialog = () => document.querySelector('dialog[open]')!
const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const MODS =
  '<gear id="crb.zap-mount" source="CRB" page="295" category="Vehicle modification" class="MOD_HARD/MOD_MOUNT" avail="4(I)" cost="2000"><name>Zap Weapon Mount</name><text/></gear>' +
  '<gear id="crb.zap-grip" source="CRB" page="295" category="Chassis mod" class="MOD_CHASSIS/MOD_HANDLING" slots="2" avail="4" cost="1000"><name>Zap Grip</name><text/></gear>' +
  '<gear id="crb.zap-bars" source="CRB" page="295" category="Accessory equipment" class="ACCESSORY/VEHICLE_ACCESSORY" avail="2" cost="800"><name>Zap Bars</name><text/></gear>'
const BUILTIN = '<builtin name="Zap horn"/><builtin name="2 additional Chassis mod slots" slots="2" category="Chassis"/>'
const catalog = (dc = false, builtin = BUILTIN) =>
  fixtureCatalog(
    (f, x) =>
      f.endsWith('crb/gear.xml')
        ? x.replace('</sr6:data>', `${MODS}\n</sr6:data>`)
        : f.endsWith('crb/vehicles.xml')
          ? x.replace('<name>Putt-Putt</name>', `<name>Putt-Putt</name>${builtin}`)
          : f.endsWith('crb/programs.xml')
            ? x.replace(
                '</sr6:data>',
                '<program id="crb.zap-pilot" source="CRB" page="201" type="autosoft" avail="2" cost="50"><name>Zap Pilot</name><text/></program>\n</sr6:data>',
              )
            : x,
    dc
      ? [
          {
            file: 'custom/sr6/imported/dc/sources.xml',
            xml: `<sr6:data ${NS} kind="sources" version="1"><source id="DC" publisher="Made up" canon="true"><name>Made-up rigger book</name></source></sr6:data>`,
          },
        ]
      : [],
  )

async function open(ch: Sr6Character, tab: string, c: Sr6Catalog = catalog()) {
  const store = fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  await mount(createElement(Sr6EditorView, { c, data: sr6Data(c), cr: fixtureCreation(), id: ch.id, tab }))
  return async () => {
    await click(button('Save'))
    const r = xmlToSr6(store.rows.get(ch.id)!.xml)
    if (!r.ok) throw new Error(r.reason)
    return r.character
  }
}
const runner = () => {
  const ch = blankSr6('karma', 'made-up-v', '2026-10-16T00:00:00.000Z')
  ch.build.metatype = GLIM
  ch.build.purchases = [
    { uid: 'v1', kind: 'vehicles', id: 'crb.putt-putt', qty: 1, accessories: [] },
    { uid: 'd1', kind: 'vehicles', id: 'crb.hover-buzzer', qty: 1, accessories: [] },
  ]
  return ch
}

test('Vehicles lists the vehicle, Drones the drone; Modify fits a mount, a weapon into it, a mod done yourself (undoable), an accessory with no such box', async () => {
  const saved = await open(runner(), 'vehicles')
  const main = () => pageText(document.querySelector('main')!) // (the budgets beside it list every line)
  expect(main()).toMatch(/Putt-Putt/)
  expect(main()).not.toMatch(/Hover Buzzer/)
  expect(pageText()).toMatch(/Core rulebook: weapon mounts up to Body \/ 3/)
  expect(pageText()).toMatch(/Weapon mounts 0\/1/)
  expect(pageText()).toMatch(/Built in \(already paid for\):Zap horn ×2 more chassis mod slots ×/)
  await click(button('Add a mod to Putt-Putt'))
  await click(option('Zap Weapon Mount'))
  expect(pageText()).toMatch(/Weapon mounts 1\/1/)
  await click(button('Add a weapon to Putt-Putt'))
  await click(option('Fizz Rifle 70'))
  const mountUid = (await saved()).build.purchases[0].accessories[0].uid
  expect(field<HTMLSelectElement>('Fizz Rifle 70 on Putt-Putt: weapon mount').value).toBe(mountUid) // (into the free mount)
  await click(button('Add a mod to Putt-Putt'))
  await click(option('Zap Grip'))
  await change(field('Zap Grip on Putt-Putt: do it yourself'), true)
  expect(pageText()).toMatch(/Zap Grip · chassis · 500¥/)
  expect((await saved()).build.purchases[0].accessories.find(a => a.id === 'crb.zap-grip')!.diy).toBe(true)
  await click(button('Undo'))
  expect(pageText()).toMatch(/Zap Grip · chassis · 1,000¥/)
  await click(button('Add a mod to Putt-Putt'))
  await click(option('Zap Bars'))
  expect(document.querySelector('[aria-label="Zap Bars on Putt-Putt: do it yourself"]')).toBeNull()
  // the weapon out of its mount, and back
  await change(field('Fizz Rifle 70 on Putt-Putt: weapon mount'), '')
  expect((await saved()).build.purchases[0].accessories.find(a => a.kind === 'weapons')!.mount).toBeUndefined()
})

test('a built-in weapon mount: in the mount picker as built in, a new weapon goes into it, counted among the mounts (DESIGNER Q3)', async () => {
  const saved = await open(runner(), 'vehicles', catalog(false, '<builtin name="Zap Weapon Mount" ref="crb.zap-mount"/>'))
  expect(pageText()).toMatch(/Weapon mounts 1\/1/)
  await click(button('Add a weapon to Putt-Putt'))
  await click(option('Fizz Rifle 70'))
  const pick = field<HTMLSelectElement>('Fizz Rifle 70 on Putt-Putt: weapon mount')
  expect([pick.value, [...pick.options].map(o => o.textContent)]).toEqual(['builtin:0', ['In no mount', 'In Zap Weapon Mount (built in)']])
  expect((await saved()).build.purchases[0].accessories[0].mount).toBe('builtin:0')
})

test('Drones lists the drone with its autosofts (half its Pilot)', async () => {
  await open(runner(), 'drones')
  const main = () => pageText(document.querySelector('main')!)
  expect(main()).toMatch(/Hover Buzzer/)
  expect(main()).not.toMatch(/Putt-Putt/)
  expect(pageText()).toMatch(/Autosofts 0\/2/) // (Pilot 3)
  await click(button('Add an autosoft to Hover Buzzer'))
  await click(option('Zap Pilot'))
  expect(pageText()).toMatch(/Autosofts 1\/2/)
})

test('with Double Clutch among the books: mod slots per category and hardpoints, a built-in mod’s slots added', async () => {
  const ch = runner()
  ch.build.purchases[0].accessories = [{ uid: 'g1', kind: 'gear', id: 'crb.zap-grip', qty: 1, accessories: [] }]
  await open(ch, 'vehicles', catalog(true))
  expect(pageText()).toMatch(/Double Clutch: mod slots per category/)
  expect(pageText()).toMatch(/Chassis slots 2\/7 · Powertrain slots 0\/5 · Electronics slots 0\/5 · Hardpoints 0\/1/) // (Body 5, 2 built in)
})

test('Review: a drone’s weapon in no mount is a warning (not an error) linking to Drones', async () => {
  const ch = runner()
  ch.build.purchases[1].accessories = [{ uid: 'w1', kind: 'weapons', id: 'crb.fizz-rifle-70', qty: 1, accessories: [] }]
  await open(ch, 'review')
  const link = [...document.querySelectorAll('a')].find(a => /Fizz Rifle 70 isn’t in a weapon mount/.test(a.textContent ?? ''))
  expect(link?.getAttribute('href')).toBe('#/sr6/c/made-up-v/drones')
  expect(link?.closest('.viol')?.querySelector('.sev.warn')).not.toBeNull()
})

test('Ledger: after finalising, a mod is fitted (done yourself, half price) and taken off as spends', async () => {
  const ch = runner()
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00.000Z', final: { karma: 0, nuyen: 5000 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00.000Z', type: 'finalize', karma: 0, nuyen: 5000 }]
  const saved = await open(ch, 'ledger')
  await change(field('What'), 'fit')
  await change(field('Fit to'), 'v1')
  await click(button('Pick from the catalog…'))
  await click(option('Zap Grip'))
  await change(field('Do it yourself'), true)
  expect(pageText()).toMatch(/Fit: Zap Grip, do it yourself on Putt-Putt · 500¥/)
  await click(button('Record'))
  await click(button('Record it'))
  const after = await saved()
  expect(after.ledger.at(-1)).toMatchObject({ advance: { op: 'fit', target: 'v1', line: { id: 'crb.zap-grip', diy: true } }, nuyen: 500 })
  const uid = (after.ledger.at(-1) as { advance: { line: { uid: string } } }).advance.line.uid
  await change(field('What'), 'unfit')
  await change(field('Fitted item'), uid)
  expect(pageText()).toMatch(/Removed: Zap Grip from Putt-Putt/)
  await click(button('Record'))
  await click(button('Record it'))
  expect((await saved()).ledger.at(-1)).toMatchObject({ advance: { op: 'unfit', target: uid }, nuyen: 0 })
})

test('with Double Clutch: slots are shifted two for one between categories, shown in the meters, kept in the file, undone with ×', async () => {
  const ch = runner()
  ch.build.purchases[0].accessories = [{ uid: 'g1', kind: 'gear', id: 'crb.zap-grip', qty: 1, accessories: [] }]
  const saved = await open(ch, 'vehicles', catalog(true))
  const meters = () => pageText().match(/Chassis slots \S+ · Powertrain slots \S+ · Electronics slots \S+/)![0]
  expect(meters()).toBe('Chassis slots 2/7 · Powertrain slots 0/5 · Electronics slots 0/5')
  await change(field('Shift to on Putt-Putt'), 'electronics')
  await click(button('Shift slots on Putt-Putt'))
  expect(meters()).toBe('Chassis slots 2/5 · Powertrain slots 0/5 · Electronics slots 0/6')
  expect(pageText()).toMatch(/2 chassis → 1 electronics/)
  expect((await saved()).build.purchases[0].slotShifts).toEqual([{ from: 'chassis', to: 'electronics' }])
  // (chassis has 3 slots free, then 1: no second shift of two)
  await click(button('Shift slots on Putt-Putt'))
  expect(meters()).toBe('Chassis slots 2/3 · Powertrain slots 0/5 · Electronics slots 0/7')
  expect(button('Shift slots on Putt-Putt').disabled).toBe(true)
  await click(button('Undo shift 2 on Putt-Putt'))
  expect(meters()).toBe('Chassis slots 2/5 · Powertrain slots 0/5 · Electronics slots 0/6')
  await click(button('Undo shift 1 on Putt-Putt'))
  expect(meters()).toBe('Chassis slots 2/7 · Powertrain slots 0/5 · Electronics slots 0/5')
  expect((await saved()).build.purchases[0].slotShifts).toBeUndefined()
})

test('Ledger: after finalising, slots are shifted and a weapon moved to another mount, free, each voidable', async () => {
  const ch = runner()
  ch.build.purchases[0].accessories = [
    { uid: 'm1', kind: 'gear', id: 'crb.zap-mount', qty: 1, accessories: [] },
    { uid: 'm2', kind: 'gear', id: 'crb.zap-mount', qty: 1, accessories: [] },
    { uid: 'w1', kind: 'weapons', id: 'crb.fizz-rifle-70', qty: 1, mount: 'm1', accessories: [] },
  ]
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00.000Z', final: { karma: 0, nuyen: 5000 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00.000Z', type: 'finalize', karma: 0, nuyen: 5000 }]
  const saved = await open(ch, 'ledger', catalog(true))
  await change(field('What'), 'shift')
  await change(field('Shift on'), 'v1')
  await change(field('Shift to'), 'electronics')
  expect(pageText()).toMatch(/Shift mod slots: 2 chassis → 1 electronics on Putt-Putt/)
  await click(button('Record'))
  await click(button('Record it'))
  expect((await saved()).ledger.at(-1)).toMatchObject({ advance: { op: 'shift', target: 'v1', from: 'chassis', to: 'electronics' }, nuyen: 0 })
  await change(field('What'), 'move')
  await change(field('Weapon to move'), 'w1')
  await change(field('Move to mount'), 'm2')
  expect(pageText()).toMatch(/Moved: Fizz Rifle 70 from Zap Weapon Mount to Zap Weapon Mount on Putt-Putt/)
  await click(button('Record'))
  await click(button('Record it'))
  const after = await saved()
  expect(after.ledger.at(-1)).toMatchObject({ advance: { op: 'move', target: 'w1', mount: 'm2' }, nuyen: 0 })
  // the newest voided first: the weapon goes back to its first mount
  await click(button(/^Void Moved:/))
  await change(field('Why'), 'wrong mount')
  await click(button('Void', dialog()))
  const voided = await saved()
  expect(voided.ledger.at(-1)).toMatchObject({ type: 'void', eventId: after.ledger.at(-1)!.id })
  expect(currentBuild(voided).purchases[0].accessories.find(a => a.uid === 'w1')!.mount).toBe('m1')
})

test('a weapon in a vehicle mount takes accessories: creation shows its picker, career fits and removes one on it', async () => {
  const ch = runner()
  ch.build.purchases[0].accessories = [{ uid: 'w1', kind: 'weapons', id: 'crb.fizz-rifle-70', qty: 1, accessories: [] }]
  await open(structuredClone(ch), 'vehicles')
  expect(document.querySelector('[aria-label="Add an accessory to Fizz Rifle 70 on Putt-Putt"]')).not.toBeNull()
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00.000Z', final: { karma: 0, nuyen: 5000 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00.000Z', type: 'finalize', karma: 0, nuyen: 5000 }]
  const c = catalog(),
    data = sr6Data(c),
    cr = fixtureCreation()
  const fit = record(ch, { op: 'fit', target: 'w1', line: { uid: 'a1', kind: 'gear', id: 'crb.zap-bars', qty: 1, accessories: [] } }, data, cr)
  if (!fit.ok) throw new Error(fit.reason)
  expect(currentBuild(fit.ch, data, cr).purchases[0].accessories[0].accessories.map(a => a.id)).toEqual(['crb.zap-bars'])
  const off = record(fit.ch, { op: 'unfit', target: 'a1' }, data, cr)
  if (!off.ok) throw new Error(off.reason)
  expect(currentBuild(off.ch, data, cr).purchases[0].accessories[0].accessories).toEqual([])
})
