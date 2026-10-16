// Owner requests of 2026-10-16 in the SR6 editor, on the made-up fixture: an owned item's licences, each one of a SIN's
// (managed on Contacts, read on Gear, warned on Review, bought on the Ledger once finalized). Made-up
// runner, items and prices.
import { act, createElement } from 'react'
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

const twoSins = (ch: Sr6Character) => {
  ch.build.sins = [
    { uid: 's1', name: 'Pat Roe', kind: 'fake', rating: 3, licences: [] },
    { uid: 's2', name: 'Pat Doe', kind: 'real', licences: [] },
  ]
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', qty: 1, accessories: [] }]
  return ch
}

test('Gear: an item printing a licence fee only reads its licences (assigned on Contacts); on none, one warning', async () => {
  const ch = twoSins(runner())
  await open(ch, 'gear', feeCatalog())
  expect(pageText()).toMatch(/licence fee 500¥/)
  expect(document.querySelectorAll('[aria-label^="Needs a licence (fee 500¥) on each SIN"]')).toHaveLength(1)
  expect(pageText()).toMatch(/Licence needed — assign it on Contacts/)
  expect(document.querySelector('input[type="checkbox"][aria-label*="licen"]')).toBeNull() // (no SIN boxes here any more)
})

test('Gear: an item licensed on a SIN lists it, with no warning', async () => {
  const ch = twoSins(runner())
  ch.build.sins[0].licences = [{ name: 'Tangle Rope 1', rating: 3, item: 'g1' }]
  await open(ch, 'gear', feeCatalog())
  expect(pageText()).toMatch(/licence fee 500¥ · licensed on: Pat Roe/)
  expect(document.querySelector('[aria-label^="Needs a licence"]')).toBeNull()
  expect(pageText()).not.toMatch(/Licence needed/)
})

test('Contacts: each SIN licenses an owned item, named after its licence type and rated as the SIN (no rating box); renamable; re-priced with the SIN; removable', async () => {
  const saved = await open(twoSins(runner()), 'contacts', feeCatalog())
  expect(document.querySelector('[aria-label="SIN 1 licence rating"]')).toBeNull()
  await change(field('License an item on SIN 1'), 'g1')
  expect(field('SIN 1 licence 1 name').value).toBe('Licence (tools)')
  expect(pageText()).toMatch(/ 3 \(Tangle Rope 1\)/)
  expect(pageText()).toMatch(/Tangle Rope 1 \(fee 500¥\)/) // (SIN 2, real: offered at its fee)
  await change(field('License an item on SIN 2'), 'g1')
  expect(field('SIN 2 licence 1 name').value).toBe('Licence (tools)')
  expect(document.querySelector('[aria-label="License an item on SIN 1"]')).toBeNull() // (licensed there: none left to offer)
  // a typed fake licence, rated as the SIN too
  await change(field('SIN 1 new licence'), 'Zap License')
  await click(button('Add licence to SIN 1'))
  // renamed
  const name = field('SIN 1 licence 1 name')
  await change(name, 'Rope permit')
  await act(async () => name.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
  expect((await saved()).build.sins.map(s => s.licences)).toEqual([
    [
      { name: 'Rope permit', rating: 3, item: 'g1' },
      { name: 'Zap License', rating: 3 },
    ],
    [{ name: 'Licence (tools)', rating: 1, item: 'g1' }],
  ])
  // the SIN's rating lowered: its licences follow
  await click(button('Lower SIN 1 rating'))
  expect((await saved()).build.sins[0].licences.map(l => l.rating)).toEqual([2, 2])
  await click(button('Remove licence Rope permit'))
  await click(button('Remove licence Zap License'))
  await click(button('Remove licence Licence (tools)'))
  expect((await saved()).build.sins.map(s => s.licences)).toEqual([[], []])
})

test('Review: an owned item needing a licence with none on any SIN is one warning line', async () => {
  const ch = twoSins(runner())
  ch.build.purchases.push({ uid: 'g2', kind: 'gear', id: 'crb.tangle-rope.1', rating: 2, qty: 1, accessories: [] })
  await open(ch, 'review', feeCatalog())
  expect(
    pageText().match(/Needs a licence on a SIN \(none yet; or carried unlicensed, settle it with your GM\): Tangle Rope 1, Tangle Rope 1\./g),
  ).toHaveLength(1)
})

test('Review: no licence warning once each such item is licensed on a SIN', async () => {
  const ch = twoSins(runner())
  ch.build.purchases.push({ uid: 'g2', kind: 'gear', id: 'crb.tangle-rope.1', rating: 2, qty: 1, accessories: [] })
  ch.build.sins[1].licences = [{ name: 'Tangle Rope 1', rating: 1, item: 'g1' }]
  ch.build.sins[0].licences = [{ name: 'Tangle Rope 1', rating: 3, item: 'g2' }]
  await open(ch, 'review', feeCatalog())
  expect(pageText()).not.toMatch(/Needs a licence on a SIN/)
})

test('Ledger: after finalising, a licence on another SIN is a spend: a real SIN’s at its fee, a fake SIN’s by its rating (no rating box)', async () => {
  const ch = twoSins(runner())
  ch.build.purchases.push({ uid: 'g2', kind: 'gear', id: 'crb.tangle-rope.1', rating: 2, qty: 1, accessories: [] })
  ch.build.sins[0].licences = [{ name: 'Tangle Rope 1', rating: 3, item: 'g1' }]
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00.000Z', final: { karma: 0, nuyen: 1400 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00.000Z', type: 'finalize', karma: 0, nuyen: 1400 }]
  const saved = await open(ch, 'ledger', feeCatalog())
  await change(field('What'), 'licensed')
  await change(field('Licensed item'), 'g1')
  await change(field('Licensed on'), 's2')
  expect(pageText()).toMatch(/Licence: Tangle Rope 1 on Pat Doe/)
  await click(button('Record'))
  await click(button('Record it'))
  expect((await saved()).ledger.at(-1)).toMatchObject({ type: 'advance', advance: { op: 'licensed', target: 'g1', sin: 's2' }, nuyen: 500 })
  await change(field('What'), 'licensed')
  await change(field('Licensed item'), 'g2')
  await change(field('Licensed on'), 's1')
  expect(document.querySelector('[aria-label="Licence rating"]')).toBeNull()
  expect(pageText()).toMatch(/Licence: Tangle Rope 1 on Pat Roe \(fake licence, rating 3\)/)
  await click(button('Record'))
  await click(button('Record it'))
  const after = await saved()
  expect(after.ledger.at(-1)).toMatchObject({ advance: { op: 'licensed', target: 'g2', sin: 's1', name: 'Licence (tools)' }, nuyen: 900 })
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
  'the %s sheet shows the Infected gains, a licence per SIN, Burning 4, a melee weapon’s +1 damage, the Awakened override, Stolen Gear’s bounty, a vehicle’s mods and mounted weapon',
  async style => {
    saveSettings({ ...loadSettings(), print: style })
    const gainer =
      '<quality id="crb.zap-gainer" source="CRB" page="71" kind="positive" karma="20" class="INFECTED"><name>Zap Gainer</name>' +
      '<infected strain="II" base="Glimmerkin" freePhysical="2" freeMental="2" essence="5" magic="1" magicLoss="1" magicMax="5+initiate-grade"/>' +
      '<power name="Glimmer (Bright)"/><power name="Knack" rating="2"/><weakness name="Trouble Dice (Noon, Mild)"/><text/></quality>'
    const zapStick =
      '<weapon id="crb.zap-stick" source="CRB" page="250" category="clubs" dv="3S" ar="6/—/—/—/—" avail="2" cost="100"><name>Zap Stick</name><text/></weapon>'
    const c = fixtureCatalog((f, x) =>
      f.endsWith('crb/qualities.xml')
        ? x.replace('</sr6:data>', `${gainer}\n</sr6:data>`)
        : f.endsWith('crb/weapons.xml')
          ? x
              .replace('<name>Fizz Rifle 70</name>', '<name>Fizz Rifle 70</name><status name="Burning" level="4"/>')
              .replace('</sr6:data>', `${zapStick}\n</sr6:data>`)
          : f.endsWith('crb/gear.xml')
            ? x
                .replace('category="tools" rating="1–4" capacity="—" avail="1"', 'category="tools" rating="1–4" capacity="—" avail="2, 500¥"')
                .replace(
                  '</sr6:data>',
                  '<gear id="crb.zap-mount" source="CRB" page="295" category="Vehicle modification" class="MOD_HARD/MOD_MOUNT" avail="4(I)" cost="2000"><name>Zap Weapon Mount</name><text/></gear></sr6:data>',
                )
            : f.endsWith('crb/vehicles.xml')
              ? x.replace('<name>Putt-Putt</name>', '<name>Putt-Putt</name><builtin name="Zap horn"/>')
              : x,
    )
    const cr = stolenCr()
    cr.set('infectedAllowed', { key: 'infectedAllowed', value: true })
    // (high Strength's bonus damage on a melee weapon: the option on, its first step at Strength 1, so +1)
    cr.set('highStrengthDamage', { key: 'highStrengthDamage', value: true })
    cr.set('strengthDamageStep1', { key: 'strengthDamageStep1', value: 1 })
    const ch = stolenRunner(false)
    ch.build.qualities.push({ uid: 'q0', id: 'crb.zap-gainer', level: 1 })
    ch.build.awakened = false
    // (an older rating than its SIN's: read at the SIN's)
    ch.build.sins = [{ uid: 's1', name: 'Pat Roe', kind: 'fake', rating: 3, licences: [{ name: 'Licence (tools)', rating: 2, item: 'g1' }] }]
    ch.build.purchases = [
      { uid: 'w1', kind: 'weapons', id: 'crb.fizz-rifle-70', qty: 1, accessories: [] },
      { uid: 'w2', kind: 'weapons', id: 'crb.zap-stick', qty: 1, accessories: [] },
      { uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', qty: 1, accessories: [] },
      { uid: 'a1', kind: 'armor', id: 'crb.padded-vest', qty: 1, worn: true, accessories: [] },
      {
        uid: 'v1',
        kind: 'vehicles',
        id: 'crb.putt-putt',
        qty: 1,
        accessories: [
          { uid: 'm1', kind: 'gear', id: 'crb.zap-mount', qty: 1, diy: true, accessories: [] },
          { uid: 'w3', kind: 'weapons', id: 'crb.zap-gun', qty: 1, mount: 'm1', accessories: [] },
        ],
      },
    ]
    await open(ch, 'print', c, cr)
    expect(document.querySelector(style === 'plain' ? '.sr6-sheet' : `.sr6-${style}`)).not.toBeNull() // (that style, not another)
    const t = pageText()
    expect(t).toMatch(/Powers: Glimmer \(Bright\), Knack 2/)
    expect(t).toMatch(/Weaknesses: Trouble Dice \(Noon, Mild\)/)
    expect(t).toMatch(/Pat Roe[^]*Licence \(tools\) 3 \(Tangle Rope 1\)/)
    expect(t).toMatch(/Burning 4/)
    expect(t).toMatch(/3S \(\+1\)/)
    expect(t).not.toMatch(/5P \(\+/) // (a ranged weapon takes no Strength bonus)
    expect(t).toMatch(/no, overridden \(derived: yes, Infected: Zap Gainer\)/)
    expect(t).toMatch(/Bounty: 3 of 3 karma turned into nuyen not bought off/)
    expect(t).toMatch(/Social/)
    expect(t).toMatch(/–1/) // (the vest's printed Social Rating)
    expect(t).toMatch(/Putt-Putt[^]*Mods: Zap Weapon Mount \(do it yourself\)/)
    expect(t).toMatch(/Weapons: Zap Gun \(in Zap Weapon Mount\)/)
    expect(t).toMatch(/Built in: Zap horn/)
  },
)
