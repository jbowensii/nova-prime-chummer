// The Designer (owner 2026-10-16, BUILDER): a player's design (chassis, powertrain, console; options by level, a
// modification, a quality factor; a mod built in; do it yourself) with its live totals, a maximum passed warned, Undo, the
// saved <design> file; the list's New design, Copy and Delete; buying the design on a runner's Vehicles tab (its line,
// the mod built in), Review's "Custom design: needs GM approval" warning and a GM approving it. Made-up parts and prices.
import { createElement, type ReactElement } from 'react'
import { expect, test } from 'vitest'
import { Me, type User } from '../../../src/core/ui-kit/auth'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { boughtDesign } from '../../../src/sr6/runner-builder/domain/assets/design'
import { blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { Sr6DesignEditor, Sr6Designs } from '../../../src/sr6/designer/ui/Designer'
import { Sr6EditorView } from '../../../src/sr6/shell/ui/EditorView'
import { DESIGN_GEAR, DESIGN_PARTS, designCatalog } from '../runner-builder/design-fixture'
import { fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'
import { button, change, click, fakeStore, field, mount, option, pageText, settle, stubFetch } from '../../ui/dom'

const c = designCatalog(),
  data = sr6Data(c),
  cr = fixtureCreation()
const PLAYER = { id: 'u2', username: 'pat', role: 'player', name: 'Pat' } as User
const asPlayer = (el: ReactElement) => createElement(Me.Provider, { value: PLAYER }, el)
const read = (xml: string) => {
  const r = xmlToSr6(xml)
  if (!r.ok) throw new Error(r.reason)
  return r.character
}
/** Red Zip: Zip Frame, Roller, Brainbox; Body in reverse, Speed Interval 2, Racing; Glitter Paint built in. */
function redZip(): Sr6Character {
  const d = blankSr6('priority', 'd1', '2026-10-16T00:00:00.000Z')
  d.identity.streetName = 'Red Zip'
  d.design = {
    kind: 'vehicle',
    chassis: 'zz.zip-frame',
    powertrain: 'zz.roller',
    console: 'zz.brainbox',
    options: [
      { id: 'zz.improved-body', level: -1 },
      { id: 'zz.improved-speed-interval', level: 2 },
      { id: 'zz.racing', level: 1 },
    ],
    mods: [{ uid: 'm1', kind: 'gear', id: 'zz.glitter-paint', qty: 1, accessories: [] }],
  }
  return d
}

test('a player designs a vehicle: the parts, options by level, a modification, a mod built in, a quality factor, do it yourself, live totals; Undo; saved as a <design> file', async () => {
  const blank = blankSr6('priority', 'd1', '2026-10-16T00:00:00.000Z')
  blank.identity.streetName = 'Red Zip'
  blank.design = { kind: 'vehicle', options: [], mods: [] }
  const store = fakeStore('sr6/designs', { d1: sr6ToXml(blank) })
  stubFetch([store.route])
  await mount(asPlayer(createElement(Sr6DesignEditor, { c, data, cr, id: 'd1' })))
  expect(pageText()).toMatch(/No chassis picked yet\./)
  await change(field<HTMLSelectElement>('Chassis'), 'zz.zip-frame')
  expect([...field<HTMLSelectElement>('Chassis').options].map(o => o.textContent)).not.toContain('Gnat Drone, Small (8 DP)') // (a drone's)
  await change(field<HTMLSelectElement>('Powertrain'), 'zz.roller')
  await change(field<HTMLSelectElement>('Console'), 'zz.brainbox')
  await click(button('Lower Improved Body level'))
  await click(button('Raise Improved Speed Interval level'))
  await click(button('Raise Improved Speed Interval level'))
  await change(field('Racing'), true)
  await click(button('Add a mod…'))
  await click(option('Glitter Paint'))
  expect(pageText()).toMatch(/Glitter Paint · 0 slots, 0 DP · 4,000¥/)
  // the worked-out vehicle, as the stat-cell grid (label then value, no separators)
  expect(pageText()).toMatch(/Body9Armor4Handling3Seats4Size Class6Acceleration17Speed interval30Top speed270Pilot2Sensor2Cargo1 CF/)
  expect(pageText()).toMatch(/Design Points 53 · Price 53 × 1,000¥ \+ 4,000¥ of mods = 57,000¥ · Availability 6\(L\)/)
  expect(pageText()).toMatch(/Brainbox: special 12 \(as printed; no rule here reads it\)\./)
  // a quality factor multiplies the Design Points, not the mods' nuyen; do it yourself halves the price
  await change(field('One-off Custom'), true)
  expect(pageText()).toMatch(/Design Points 53 × 2 = 106 · Price 106 × 1,000¥ \+ 4,000¥ of mods = 110,000¥/)
  await change(field(/^Do it yourself/), true)
  expect(pageText()).toMatch(/halved \(do it yourself\) = 55,000¥/)
  // past a maximum: a warning, never refused; Undo takes the level back
  await click(button('Raise Improved Speed Interval level'))
  expect(pageText()).not.toMatch(/Improved Speed Interval 3:/) // (3: the most, no warning)
  await click(button('Raise Improved Speed Interval level'))
  expect(pageText()).toMatch(/Improved Speed Interval 4: at most 3 levels\. \(ZZ p\. 151\)/)
  await click(button('Undo'))
  expect(pageText()).not.toMatch(/at most 3 levels/)
  // only a GM approves a design
  expect(field(/^Approved by a GM/).disabled).toBe(true)
  await click(button('Save'))
  const d = read(store.rows.get('d1')!.xml).design!
  expect(d).toMatchObject({ chassis: 'zz.zip-frame', powertrain: 'zz.roller', console: 'zz.brainbox', diy: true })
  expect(d.approved).toBeUndefined()
  expect(d.options).toEqual([
    { id: 'zz.improved-body', level: -1 },
    { id: 'zz.improved-speed-interval', level: 3 },
    { id: 'zz.racing', level: 1 },
    { id: 'zz.one-off', level: 1 },
  ])
  expect(d.mods.map(m => m.id)).toEqual(['zz.glitter-paint'])
})

test("a design's custom chassis can be edited (the form reopens filled in) and removed (back to None yet)", async () => {
  const d0 = redZip()
  delete d0.design!.chassis
  d0.design!.customChassis = { name: 'Box', dp: 7, body: 5, armor: 2, handling: 3, seats: 2, sizeClass: 4 }
  const store = fakeStore('sr6/designs', { d1: sr6ToXml(d0) })
  stubFetch([store.route])
  await mount(asPlayer(createElement(Sr6DesignEditor, { c, data, cr, id: 'd1' })))
  // Cargo: by its seats (2 x 1.5) by default
  expect(pageText()).toMatch(/Cargo3 CF/)
  await click(button('Edit custom chassis'))
  expect(field<HTMLInputElement>('Chassis DP').value).toBe('7')
  await change(field('Chassis name'), 'Crate')
  await change(field<HTMLSelectElement>('Chassis Cargo from'), 'size')
  await click(button('Save chassis'))
  expect(pageText()).not.toMatch(/Cargo3 CF/) // (the size class table's row now)
  await click(button('Edit custom chassis'))
  expect(field<HTMLSelectElement>('Chassis Cargo from').value).toBe('size')
  await change(field('Chassis Cargo (CF, over either)'), '9')
  await click(button('Save chassis'))
  expect(pageText()).toMatch(/Cargo9 CF/)
  await click(button('Save'))
  expect(read(store.rows.get('d1')!.xml).design!.customChassis).toMatchObject({ name: 'Crate', dp: 7, sizeClass: 4, cargoFrom: 'size', cargo: 9 })
  await click(button('Remove custom chassis'))
  expect(field<HTMLSelectElement>('Chassis').value).toBe('')
  await click(button('Save'))
  expect(read(store.rows.get('d1')!.xml).design!.customChassis).toBeUndefined()
})

test('a custom powertrain: picked from the Powertrain list, its columns feed the stats and DP, saved, edited and removed', async () => {
  const store = fakeStore('sr6/designs', { d1: sr6ToXml(redZip()) })
  stubFetch([store.route])
  await mount(asPlayer(createElement(Sr6DesignEditor, { c, data, cr, id: 'd1' })))
  await change(field<HTMLSelectElement>('Powertrain'), '__custom')
  for (const [k, v] of [
    ['Powertrain name', 'Jet'],
    ['Powertrain DP', '40'],
    ['Powertrain Acceleration', '9'],
    ['Powertrain Speed Interval', '11'],
    ['Powertrain Top Speed', '333'],
  ])
    await change(field(k), v)
  await click(button('Save powertrain'))
  expect(field<HTMLSelectElement>('Powertrain').selectedOptions[0].textContent).toBe('Jet (custom, 40 DP)')
  expect(pageText()).toMatch(/Top speed\d*333|Top speed3\d\d/)
  await click(button('Save'))
  expect(read(store.rows.get('d1')!.xml).design!).toMatchObject({ customPowertrain: { name: 'Jet', dp: 40, accel: 9, interval: 11, topSpeed: 333 } })
  expect(read(store.rows.get('d1')!.xml).design!.powertrain).toBeUndefined()
  await click(button('Edit custom powertrain'))
  expect(field<HTMLInputElement>('Powertrain Top Speed').value).toBe('333')
  await click(button('Cancel'))
  await click(button('Remove custom powertrain'))
  expect(field<HTMLSelectElement>('Powertrain').value).toBe('')
})

test('a design started from a known vehicle shows its chassis and its powertrain part by the chassis (removed too)', async () => {
  const d0 = blankSr6('priority', 'd1', '2026-10-16T00:00:00.000Z')
  d0.design = { kind: 'vehicle', base: 'zz.grizzly', options: [], mods: [] }
  const store = fakeStore('sr6/designs', { d1: sr6ToXml(d0) })
  stubFetch([store.route])
  await mount(asPlayer(createElement(Sr6DesignEditor, { c, data, cr, id: 'd1' })))
  expect(pageText()).toMatch(/Chassis: Truck/)
  // its own powertrain (Roller Powertrain → the Roller row) preselected
  expect(field<HTMLSelectElement>('Powertrain').value).toBe('zz.roller')
  expect(pageText()).toMatch(/Handling4\/3.*Acceleration7Speed interval20Top speed90/)
  // a swap: the factory part comes off, speeds scale by Floater over Roller, its -2 handling, its 12 DP
  await change(field<HTMLSelectElement>('Powertrain'), 'zz.floater')
  expect(pageText()).toMatch(/Roller Powertrain \(synthesized\) · powertrain 4 \(removed\)/)
  expect(pageText()).toMatch(/Handling2\/1.*Acceleration7Speed interval45Top speed43/)
  expect(pageText()).toMatch(/Powertrain swapped: Roller → Floater\./)
  await click(button('Save'))
  const saved = read(store.rows.get('d1')!.xml)
  expect(saved.design).toMatchObject({ powertrain: 'zz.floater', removedParts: ['pp'] })
  const line = boughtDesign(saved, data, cr)
  expect(line.snapshot!.parts.map(p => p.attrs.ref ?? p.attrs.name)).toEqual(['zz.powertrain-floater'])
  // restoring the factory part undoes the swap
  await click(button('Restore factory part Roller Powertrain'))
  expect(field<HTMLSelectElement>('Powertrain').value).toBe('zz.roller')
  expect(pageText()).toMatch(/Top speed90/)
  // a custom powertrain swaps in the same way
  await change(field<HTMLSelectElement>('Powertrain'), '__custom')
  for (const [k, v] of [
    ['Powertrain name', 'Jet'],
    ['Powertrain DP', '40'],
    ['Powertrain Acceleration', '30'],
    ['Powertrain Speed Interval', '40'],
    ['Powertrain Top Speed', '500'],
  ])
    await change(field(k), v)
  await click(button('Save powertrain'))
  expect(pageText()).toMatch(/Acceleration14Speed interval40Top speed180/)
  expect(pageText()).toMatch(/Roller Powertrain \(synthesized\) · powertrain 4 \(removed\)/)
})

test('an option the catalog lists one entry per level is one line with a level stepper, and its levels change the stats', async () => {
  const lc = fixtureCatalog(undefined, [
    { file: 'custom/sr6/imported/zz/vehicledesign.xml', xml: DESIGN_PARTS.replace('max="4"><name>Improved Body', 'max="4" maxLevel="4"><name>Improved Body') },
    { file: 'custom/sr6/imported/zz/gear.xml', xml: DESIGN_GEAR },
  ])
  const store = fakeStore('sr6/designs', { d1: sr6ToXml(redZip()) })
  stubFetch([store.route])
  await mount(asPlayer(createElement(Sr6DesignEditor, { c: lc, data: sr6Data(lc), cr, id: 'd1' })))
  expect(() => field('Improved Body 2')).toThrow() // (no checkbox per level)
  expect(pageText()).toMatch(/Body9Armor/) // (Red Zip: Improved Body −1)
  await click(button('Raise Improved Body level'))
  await click(button('Raise Improved Body level'))
  expect(pageText()).toMatch(/Body11Armor/)
})

test('Improved Handling: once taken, on-road and off-road or one of them (3 DP a level), saved on its option (owner Q2)', async () => {
  const store = fakeStore('sr6/designs', { d1: sr6ToXml(redZip()) })
  stubFetch([store.route])
  await mount(asPlayer(createElement(Sr6DesignEditor, { c, data, cr, id: 'd1' })))
  const which = /^Improved Handling: on-road, off-road or both/
  expect(() => field(which)).toThrow()
  await click(button('Raise Improved Handling level'))
  expect(pageText()).toMatch(/Handling2Seats/) // the vehicle stat cell (Handling then Seats)
  await change(field<HTMLSelectElement>(which), 'off')
  expect(pageText()).toMatch(/Handling3\/2Seats/)
  expect(pageText()).toMatch(/Design Points 56 ·/) // (Red Zip's 53 + 3; both would be + 5)
  await change(field<HTMLSelectElement>(which), '')
  expect(pageText()).toMatch(/Handling2Seats/)
  await change(field<HTMLSelectElement>(which), 'on')
  await click(button('Save'))
  expect(read(store.rows.get('d1')!.xml).design!.options.at(-1)).toEqual({ id: 'zz.improved-handling', level: 1, road: 'on' })
})

test('the list: a GM’s new design is approved; Copy and Delete (to the design trash)', async () => {
  const store = fakeStore('sr6/designs', { d1: sr6ToXml(redZip()) })
  const calls = stubFetch([[/\/api\/sr6\/designs\/trash/, () => ({ user: 'gm', name: 'GM', items: [] })], store.route])
  await mount(createElement(Sr6Designs, { c, data, cr }))
  expect(pageText()).toMatch(/Red Zip\s*Vehicle · Zip Frame · 53 Design Points · 57,000¥/)
  await click(button('Copy Red Zip'))
  const copy = [...store.rows.values()].map(r => read(r.xml)).find(ch => ch.id !== 'd1')!
  expect(copy.identity.streetName).toBe('Red Zip (copy)')
  expect(copy.design!.approved).toBe(true) // (copied by a GM)
  await click(button('New design'))
  await change(field('Name'), 'Gnat Mk II')
  await change(field<HTMLSelectElement>('A vehicle or a drone'), 'drone')
  await click(button('Create design'))
  const made = [...store.rows.values()].map(r => read(r.xml)).find(ch => ch.identity.streetName === 'Gnat Mk II')!
  expect(made.design).toEqual({ kind: 'drone', options: [], mods: [], approved: true })
  expect(location.hash).toBe(`#/sr6/designs/${made.id}`)
  await click(button('Delete Red Zip'))
  await click(button('Delete design'))
  expect(calls.some(x => x.init?.method === 'DELETE' && /\/api\/sr6\/designs\/d1$/.test(x.url))).toBe(true)
  expect(store.rows.has('d1')).toBe(false)
})

test('import: a player’s import is never approved (a copy of a GM’s needs approval again), its id kept or a new one; a runner or junk file says why', async () => {
  const store = fakeStore('sr6/designs', { d1: sr6ToXml(redZip()) })
  stubFetch([[/\/api\/sr6\/designs\/trash/, () => ({ user: 'pat', name: 'Pat', items: [] })], store.route])
  await mount(asPlayer(createElement(Sr6Designs, { c, data, cr })))
  const gms = redZip()
  gms.design!.approved = true
  const runner = blankSr6('karma', 'r9', '2026-10-16T00:00:00.000Z')
  runner.identity.streetName = 'Not A Design'
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!
  const file = (xml: string, name: string) => new File([xml], name, { type: 'application/xml' })
  Object.defineProperty(input, 'files', {
    value: [file(sr6ToXml(gms), 'zip.xml'), file(sr6ToXml(runner), 'runner.xml'), file('junk', 'junk.xml')],
    configurable: true,
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await settle(10)
  expect(pageText()).toMatch(/Imported Red Zip\./)
  expect(pageText()).toMatch(/runner\.xml: This is a runner or NPC, not a vehicle or drone design\./)
  expect(pageText()).toMatch(/junk\.xml: /)
  const mine = [...store.rows.values()].map(r => read(r.xml))
  expect(mine).toHaveLength(2)
  const copy = mine.find(ch => ch.id !== 'd1')! // (d1 taken: a new id)
  expect(copy.design!.approved).toBeUndefined()
})

test('a runner buys a player’s design on Vehicles: its line and built-in mod; Review warns it needs GM approval (a player can’t approve it)', async () => {
  const ch = blankSr6('karma', 'r1', '2026-10-16T00:00:00.000Z')
  ch.build.metatype = GLIM
  const runners = fakeStore('sr6/characters', { r1: sr6ToXml(ch) }),
    designs = fakeStore('sr6/designs', { d1: sr6ToXml(redZip()) })
  stubFetch([runners.route, designs.route])
  const view = (tab: string) => asPlayer(createElement(Sr6EditorView, { c, data, cr, id: 'r1', tab }))
  const m = await mount(view('vehicles'))
  expect(field<HTMLSelectElement>('Your designs').selectedOptions[0].textContent).toBe('Red Zip · 57,000¥')
  await click(button('Buy design'))
  const main = () => pageText(document.querySelector('main')!)
  expect(main()).toMatch(/Red Zip\s*Custom design\s*DC p\.150/)
  expect(main()).toMatch(/Built in \(already paid for\):Glitter Paint ×/)
  await click(button('Save'))
  const line = read(runners.rows.get('r1')!.xml).build.purchases[0]
  expect(line).toMatchObject({ kind: 'vehicles', id: 'design.d1', design: 'd1', name: 'Red Zip' })
  expect(line.snapshot!.attrs).toMatchObject({ cost: '57000', avail: '6(L)', topSpeed: '270', dp: '53' })
  await m.rerender(view('review'))
  const warn = [...document.querySelectorAll('.viol')].find(v => /Custom design: needs GM approval \(Red Zip\)\./.test(v.textContent ?? ''))!
  expect(warn.querySelector('.sev.warn')).not.toBeNull()
  expect(warn.querySelector('a')?.getAttribute('href')).toBe('#/sr6/c/r1/vehicles')
  expect(warn.querySelector<HTMLInputElement>('input[type=checkbox]')?.disabled).toBe(true) // a player sees it, read only
})

test('a GM approves the bought design on Review; one bought from a GM’s (approved) design has nothing to approve', async () => {
  const ch = blankSr6('karma', 'r2', '2026-10-16T00:00:00.000Z')
  ch.build.metatype = GLIM
  ch.build.purchases = [boughtDesign(redZip(), data, cr, 'v1')]
  const runners = fakeStore('sr6/characters', { r2: sr6ToXml(ch) })
  stubFetch([runners.route])
  await mount(createElement(Sr6EditorView, { c, data, cr, id: 'r2', tab: 'review' }))
  const warn = () => [...document.querySelectorAll('.viol')].find(v => /Custom design: needs GM approval/.test(v.textContent ?? ''))!
  await change(field('GM note (optional)', warn()), 'Built in the campaign’s garage')
  await click(field('Approved by GM', warn()))
  expect(warn().querySelector('.sev.ok')?.textContent).toBe('Approved')
  await click(button('Save'))
  expect(read(runners.rows.get('r2')!.xml).overrides).toEqual([{ code: 'vehicle.design', path: 'vehicles.v1', note: 'Built in the campaign’s garage' }])
  const gm = redZip()
  gm.design!.approved = true
  expect(boughtDesign(gm, data, cr).snapshot!.attrs.approved).toBe('true')
})

test('Create a mod… adds a named custom mod with its own price and slots', async () => {
  const blank = blankSr6('priority', 'd1', '2026-10-16T00:00:00.000Z')
  blank.design = { kind: 'vehicle', options: [], mods: [] }
  stubFetch([fakeStore('sr6/designs', { d1: sr6ToXml(blank) }).route])
  await mount(asPlayer(createElement(Sr6DesignEditor, { c, data, cr, id: 'd1' })))
  await click(button('Create a mod…'))
  await change(field('Mod name'), 'Home Brew')
  await change(field('Mod price ¥'), '1500')
  await change(field('Mod slots'), '2')
  await click(button('Save mod'))
  expect(pageText()).toMatch(/Home Brew · 2 slots, 4 DP · 1,500¥/)
})
