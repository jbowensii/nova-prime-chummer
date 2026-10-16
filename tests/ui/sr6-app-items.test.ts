// Owner requests of 2026-10-16 in the SR6 editor, on the made-up fixture: an owned item's licences, one per SIN (Gear, Ledger). Made-up
// runner, items and prices.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6Data } from '../../src/sr6/engine/data'
import type { CreationRules } from '../../src/sr6/engine/creation'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import type { Sr6Catalog } from '../../src/sr6/model/types'
import { Sr6EditorView } from '../../src/sr6/ui/EditorView'
import { fixtureCatalog, fixtureCreation, GLIM } from '../sr6/fixture'
import { button, change, click, fakeStore, field, mount, pageText, stubFetch } from './dom'
import { loadSettings, saveSettings } from '../../src/ui/settings'

async function open(ch: Sr6Character, tab: string, c: Sr6Catalog = fixtureCatalog(), cr: CreationRules = fixtureCreation()) {
  const store = fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  await mount(createElement(Sr6EditorView, { c, data: sr6Data(c), cr, id: ch.id, tab }))
  return async () => {
    await click(button('Save'))
    const r = xmlToSr6(store.rows.get(ch.id)!.xml)
    if (!r.ok) throw new Error(r.reason)
    return r.character
  }
}
const runner = () => {
  const ch = blankSr6('karma', 'made-up-a', '2026-10-16T00:00:00.000Z')
  ch.build.metatype = GLIM
  return ch
}

const feeCatalog = () =>
  fixtureCatalog((f, x) =>
    f.endsWith('crb/gear.xml')
      ? x.replace('category="tools" rating="1–4" capacity="—" avail="1"', 'category="tools" rating="1–4" capacity="—" avail="2, 500¥"')
      : x,
  )

test('Gear: an item printing a licence fee is licensed per SIN, its fee once a SIN; on none, one warning', async () => {
  const ch = runner()
  ch.build.sins = [
    { uid: 's1', name: 'Pat Roe', kind: 'fake', rating: 3, licences: [] },
    { uid: 's2', name: 'Pat Doe', kind: 'real', licences: [] },
  ]
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', qty: 1, accessories: [] }]
  const saved = await open(ch, 'gear', feeCatalog())
  expect(pageText()).toMatch(/licence fee 500¥/)
  expect(document.querySelectorAll('[aria-label^="Needs a licence (fee 500¥) on each SIN"]')).toHaveLength(1)
  await change(field('Tangle Rope 1 licensed on Pat Roe'), true)
  await change(field('Tangle Rope 1 licensed on Pat Doe'), true)
  expect(pageText()).toMatch(/licence fee 500¥ · licensed on: Pat Roe, Pat Doe/)
  expect(pageText()).toMatch(/incl\. licence 1,000¥/)
  expect(document.querySelector('[aria-label^="Needs a licence"]')).toBeNull()
  expect((await saved()).build.purchases[0].licensedOn).toEqual(['s1', 's2'])
  await change(field('Tangle Rope 1 licensed on Pat Roe'), false)
  await change(field('Tangle Rope 1 licensed on Pat Doe'), false)
  expect((await saved()).build.purchases[0].licensedOn).toBeUndefined()
})

test('Gear: with no SIN the licence choice is there, disabled, saying why', async () => {
  const ch = runner()
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', qty: 1, accessories: [] }]
  await open(ch, 'gear', feeCatalog())
  expect(field('Tangle Rope 1 licence').disabled).toBe(true)
  expect(pageText()).toMatch(/No SIN to license it on \(add one on Contacts\)/)
})

test('Ledger: after finalising, a licence on another SIN is a purchase at its fee', async () => {
  const ch = runner()
  ch.build.sins = [
    { uid: 's1', name: 'Pat Roe', kind: 'fake', rating: 3, licences: [] },
    { uid: 's2', name: 'Pat Doe', kind: 'real', licences: [] },
  ]
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', qty: 1, licensedOn: ['s1'], accessories: [] }]
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00.000Z', final: { karma: 0, nuyen: 900 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00.000Z', type: 'finalize', karma: 0, nuyen: 900 }]
  const saved = await open(ch, 'ledger', feeCatalog())
  await change(field('What'), 'licensed')
  await change(field('Licensed item'), 'g1')
  await change(field('Licensed on'), 's2')
  expect(pageText()).toMatch(/Licence: Tangle Rope 1 on Pat Doe/)
  await click(button('Record'))
  await click(button('Record it'))
  expect((await saved()).ledger.at(-1)).toMatchObject({ type: 'advance', advance: { op: 'licensed', target: 'g1', sin: 's2' }, nuyen: 500 })
})

test('Ledger: the Awakened override after finalising is a free spend; Method says where it went', async () => {
  const ch = runner()
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00.000Z', final: { karma: 10, nuyen: 0 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00.000Z', type: 'finalize', karma: 10, nuyen: 0 }]
  const saved = await open(ch, 'ledger')
  await change(field('What'), 'awakened')
  await change(field('Awakened override'), 'yes')
  expect(pageText()).toMatch(/Awakened override: Awakened \(derived: not Awakened\)/)
  await click(button('Record'))
  await click(button('Record it'))
  const after = await saved()
  expect(after.ledger.at(-1)).toMatchObject({ type: 'advance', advance: { op: 'awakened', value: true }, karma: 0 })
  expect(pageText()).toMatch(/Karma 10/)
})

const stolenCr = () => {
  const cr = fixtureCreation()
  cr.set('stolenGearQuality', { key: 'stolenGearQuality', value: 'crb.butterfingers' }) // (a made-up stand-in)
  return cr
}
/** A runner with Stolen Gear and 3 karma turned into nuyen; career: finalized with 10 karma. */
const stolenRunner = (career: boolean) => {
  const ch = runner()
  ch.build.karmaToNuyen = 3
  ch.build.qualities = [{ uid: 'sg', id: 'crb.butterfingers', level: 1 }]
  if (career) {
    Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00.000Z', final: { karma: 10, nuyen: 0 } })
    ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00.000Z', type: 'finalize', karma: 10, nuyen: 0 }]
  }
  return ch
}

test('Stolen Gear: its rate and limit on Contacts', async () => {
  await open(stolenRunner(false), 'contacts', undefined, stolenCr())
  expect(pageText()).toMatch(/9,000¥ a karma, at most 4 \(Stolen Gear, No Future errata: its own rate and limit\)/)
})

test('Stolen Gear: its bounty on Qualities', async () => {
  await open(stolenRunner(true), 'qualities', undefined, stolenCr())
  expect(pageText()).toMatch(/Bounty: 3 of 3 karma turned into nuyen not bought off/)
})

test('Stolen Gear: a part of it bought off on the Ledger', async () => {
  const saved = await open(stolenRunner(true), 'ledger', undefined, stolenCr())
  await change(field('What'), 'buyoff')
  await change(field('Quality'), 'sg')
  await change(field('Converted karma to buy off'), '2')
  expect(pageText()).toMatch(/Buy off: Butterfingers, 2 of 3 converted karma · 6 karma/)
  await click(button('Record'))
  await click(button('Record it'))
  expect((await saved()).ledger.at(-1)).toMatchObject({ advance: { op: 'buyoff', target: 'sg', part: 2 }, karma: 6 })
})

test('a weapon that applies a status (the No Future errata’s Molotov: Burning 4) shows it on its Gear line', async () => {
  const c = fixtureCatalog((f, x) =>
    f.endsWith('crb/weapons.xml') ? x.replace('<name>Fizz Rifle 70</name>', '<name>Fizz Rifle 70</name><status name="Burning" level="4"/>') : x,
  )
  const ch = runner()
  ch.build.purchases = [{ uid: 'w1', kind: 'weapons', id: 'crb.fizz-rifle-70', qty: 1, accessories: [] }]
  await open(ch, 'gear', c)
  expect(pageText()).toMatch(/AR 4\/10\/8\/—\/—.* · applies Burning 4/)
})

test('Creation method: the Infected type’s gained powers (free) and weaknesses, each with its card or marked when the catalog lacks it', async () => {
  const gainer =
    '<quality id="crb.zap-gainer" source="CRB" page="71" kind="positive" karma="20" class="INFECTED"><name>Zap Gainer</name>' +
    '<infected strain="II" base="Glimmerkin" freePhysical="2" freeMental="2" essence="5" magic="1" magicLoss="1" magicMax="5+initiate-grade"/>' +
    '<power name="Glimmer (Bright)"/><power name="Ghost Step"/><power name="Knack" rating="2"/><weakness name="Trouble Dice (Noon, Mild)"/><text/></quality>'
  const c = fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml') ? x.replace('</sr6:data>', `${gainer}\n</sr6:data>`) : x))
  const cr = fixtureCreation()
  cr.set('infectedAllowed', { key: 'infectedAllowed', value: true })
  const ch = runner()
  ch.build.qualities = [{ uid: 'q0', id: 'crb.zap-gainer', level: 1 }]
  await open(ch, 'print', c, cr)
  expect(pageText()).toMatch(/Zap Gainer\s*Powers: Glimmer \(Bright\), Ghost Step, Knack 2\s*Weaknesses: Trouble Dice \(Noon, Mild\)/) // (the printed sheet)
  await open(ch, 'method', c, cr)
  expect(pageText()).toMatch(/Gained powers \(free\): Glimmer \(Bright\), Ghost Step \(as printed; not in the catalog\), Knack 2Gained weaknesses/)
  expect(pageText()).toMatch(/Gained weaknesses: Trouble Dice \(Noon, Mild\)/)
  // (one the catalog lacks, Goblin's Dietary Restriction kept as printed: no error to the player, Review notes it once)
  expect([...document.querySelectorAll('.err')].some(x => /catalog/.test(x.textContent ?? ''))).toBe(false)
  await open(ch, 'review', c, cr)
  expect(pageText().match(/gained power “Ghost Step” isn’t a critter power/g)).toHaveLength(1)
})

// every printed sheet style shows the same data (owner 2026-10-16): only the look differs
test.each(['plain', 'book', 'neon', 'hex', 'dossier'] as const)(
  'the %s sheet shows the Infected gains, a licence per SIN, Burning 4, the Awakened override, Stolen Gear’s bounty',
  async style => {
    saveSettings({ ...loadSettings(), print: style })
    const gainer =
      '<quality id="crb.zap-gainer" source="CRB" page="71" kind="positive" karma="20" class="INFECTED"><name>Zap Gainer</name>' +
      '<infected strain="II" base="Glimmerkin" freePhysical="2" freeMental="2" essence="5" magic="1" magicLoss="1" magicMax="5+initiate-grade"/>' +
      '<power name="Glimmer (Bright)"/><power name="Knack" rating="2"/><weakness name="Trouble Dice (Noon, Mild)"/><text/></quality>'
    const c = fixtureCatalog((f, x) =>
      f.endsWith('crb/qualities.xml')
        ? x.replace('</sr6:data>', `${gainer}\n</sr6:data>`)
        : f.endsWith('crb/weapons.xml')
          ? x.replace('<name>Fizz Rifle 70</name>', '<name>Fizz Rifle 70</name><status name="Burning" level="4"/>')
          : f.endsWith('crb/gear.xml')
            ? x.replace('category="tools" rating="1–4" capacity="—" avail="1"', 'category="tools" rating="1–4" capacity="—" avail="2, 500¥"')
            : x,
    )
    const cr = stolenCr()
    cr.set('infectedAllowed', { key: 'infectedAllowed', value: true })
    const ch = stolenRunner(false)
    ch.build.qualities.push({ uid: 'q0', id: 'crb.zap-gainer', level: 1 })
    ch.build.awakened = false
    ch.build.sins = [{ uid: 's1', name: 'Pat Roe', kind: 'fake', rating: 3, licences: [] }]
    ch.build.purchases = [
      { uid: 'w1', kind: 'weapons', id: 'crb.fizz-rifle-70', qty: 1, accessories: [] },
      { uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', qty: 1, licensedOn: ['s1'], accessories: [] },
      { uid: 'a1', kind: 'armor', id: 'crb.padded-vest', qty: 1, worn: true, accessories: [] },
    ]
    await open(ch, 'print', c, cr)
    expect(document.querySelector(style === 'plain' ? '.sr6-sheet' : `.sr6-${style}`)).not.toBeNull() // (that style, not another)
    const t = pageText()
    expect(t).toMatch(/Powers: Glimmer \(Bright\), Knack 2/)
    expect(t).toMatch(/Weaknesses: Trouble Dice \(Noon, Mild\)/)
    expect(t).toMatch(/Pat Roe[^]*Tangle Rope 1 \(licence\)/)
    expect(t).toMatch(/Burning 4/)
    expect(t).toMatch(/no, overridden \(derived: yes, Infected: Zap Gainer\)/)
    expect(t).toMatch(/Bounty: 3 of 3 karma turned into nuyen not bought off/)
    expect(t).toMatch(/Social/)
    expect(t).toMatch(/–1/) // (the vest's printed Social Rating)
  },
)
