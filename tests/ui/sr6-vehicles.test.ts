// The Vehicles and Drones tabs (owner 2026-10-16: two tabs) and each one's Modify panel: the core rulebook's weapon mounts
// or Double Clutch's slots and hardpoints, mods, a weapon in a mount, a drone's autosofts, the mods built in, the
// do-it-yourself box (never on an accessory), Undo; Review's warning linking to Drones; after finalising, a fit on the
// Ledger. Made-up runner, items and prices on the made-up fixture.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6Data } from '../../src/sr6/engine/data'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import type { Sr6Catalog } from '../../src/sr6/model/types'
import { Sr6EditorView } from '../../src/sr6/ui/EditorView'
import { fixtureCatalog, fixtureCreation, GLIM } from '../sr6/fixture'
import { button, change, click, fakeStore, field, mount, option, pageText, stubFetch } from './dom'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const MODS =
  '<gear id="crb.zap-mount" source="CRB" page="295" category="Vehicle modification" class="MOD_HARD/MOD_MOUNT" avail="4(I)" cost="2000"><name>Zap Weapon Mount</name><text/></gear>' +
  '<gear id="crb.zap-grip" source="CRB" page="295" category="Chassis mod" class="MOD_CHASSIS/MOD_HANDLING" slots="2" avail="4" cost="1000"><name>Zap Grip</name><text/></gear>' +
  '<gear id="crb.zap-bars" source="CRB" page="295" category="Accessory equipment" class="ACCESSORY/VEHICLE_ACCESSORY" avail="2" cost="800"><name>Zap Bars</name><text/></gear>'
const BUILTIN = '<builtin name="Zap horn"/><builtin name="2 additional Chassis mod slots" slots="2" category="Chassis"/>'
const catalog = (dc = false) =>
  fixtureCatalog(
    (f, x) =>
      f.endsWith('crb/gear.xml')
        ? x.replace('</sr6:data>', `${MODS}\n</sr6:data>`)
        : f.endsWith('crb/vehicles.xml')
          ? x.replace('<name>Putt-Putt</name>', `<name>Putt-Putt</name>${BUILTIN}`)
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
  expect(pageText()).toMatch(/Built in \(already paid for\): Zap horn, 2 more chassis mod slots/)
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
