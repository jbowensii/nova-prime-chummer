// The Critters tab (owner 2026-10-16, BUILDER Q9-Q10: its own tab): buy a critter, pick its pet class, train it, tame
// it (and untame it), its companion qualities with the purchase and by the bond, critterware or gear from the
// critter-only catalog, Undo; its powers at 0 Karma; Review's warning links here; after finalising, a critter bought and
// a quality bonded on the Ledger. Made-up runner, critters, prices and qualities on the made-up fixture.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { currentBuild } from '../../src/sr6/engine/career'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6Data } from '../../src/sr6/engine/data'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import { Sr6EditorView } from '../../src/sr6/ui/EditorView'
import { fixtureCatalog, fixtureCreation, GLIM } from '../sr6/fixture'
import { button, change, click, fakeStore, field, mount, option, pageText, stubFetch } from './dom'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const row = (id: string, name: string, cat: string, avail: string, cost: string) =>
  `<gear id="zz.${id}" ${at} category="${cat}" class="CRITTERWARE/PURCHASE" avail="${avail}" cost="${cost}"><name>${name}</name><text/></gear>`
const GEAR = `<sr6:data ${NS} kind="gear" version="1">
  ${row('pet-mundane', 'Pet (Mundane)', 'Critter purchase', '--', 'Body x 70 nuyen')}
  ${row('pet-exotic', 'Pet (Exotic)', 'Critter purchase', '3', 'Body x 200 nuyen')}
  ${row('pet-wild', 'Pet (Wild)', 'Critter purchase', '3(L)', 'Body x 200 nuyen')}
  ${row('negative-quality', 'Negative Quality', 'Critter purchase option', '-1 per negative quality', '-10% nuyen cost per net Karma bonus')}
  ${row('positive-quality', 'Positive Quality', 'Critter purchase option', '+1 per positive quality', '+300 nuyen per net Karma cost')}
  ${row('trained-command', 'Trained: Command', 'Critter purchase option', '+2', '+400 nuyen')}
  ${row('trained-special-training', 'Trained: Special Training', 'Critter purchase option', '+1', '+600 nuyen')}
  <gear id="zz.fuzz-harness" ${at} category="Critter gear" class="CRITTERWARE/GEAR" avail="2" cost="Critter's Body x 30¥"><name>Fuzz Harness</name><text/></gear>
</sr6:data>`
const q = (id: string, name: string, kind: string, karma: number) =>
  `<quality id="zz.${id}" ${at} kind="${kind}" karma="${karma}" class="CRITTERWARE/QUALITY"><name>${name}</name><text/></quality>`
const QUALITIES = `<sr6:data ${NS} kind="qualities" version="1">
  ${q('snuggly', 'Snuggly', 'positive', 2)}
  ${q('keen', 'Keen', 'positive', 3)}
  ${q('wild-soul', 'Wild Soul', 'positive', 1)}
  ${q('high-maintenance', 'High Maintenance', 'negative', 1)}
  ${q('grumpy', 'Grumpy', 'negative', 4)}
</sr6:data>`
const catalog = () =>
  fixtureCatalog(undefined, [
    { file: 'custom/sr6/imported/zz/gear.xml', xml: GEAR },
    { file: 'custom/sr6/imported/zz/qualities.xml', xml: QUALITIES },
  ])

async function open(ch: Sr6Character, tab: string) {
  const c = catalog()
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
  const ch = blankSr6('karma', 'made-up-c', '2026-10-16T00:00:00.000Z')
  ch.build.metatype = GLIM
  return ch
}
const main = () => pageText(document.querySelector('main')!) // (the budgets beside it list every line)

test('Critters: buy one, pick its class, train and tame it, its qualities and critter gear; powers at 0 Karma; Undo', async () => {
  const saved = await open(runner(), 'critters')
  await click(button('Add a critter…'))
  await click(option('Fuzzbeast'))
  expect(main()).toMatch(/Powers \(innate, 0 Karma\): Glimmer, Thick Fur/)
  expect(main()).toMatch(/Pet \(Mundane\) Body x 70 nuyen: 280¥/)
  await change(field('Fuzzbeast class'), 'exotic')
  await click(button('Raise Fuzzbeast commands'))
  await click(button('Raise Fuzzbeast commands'))
  await click(button('Raise Fuzzbeast commands')) // (Logic 1: past its 2, a warning, never refused)
  expect(main()).toMatch(/Pet \(Exotic\) Body x 200 nuyen: 800¥ · 3 commands: \+1,200¥, Availability \+6/)
  expect(main()).toMatch(/of 2 \(Logic × 2\)/)
  let after = await saved()
  expect(after.build.purchases[0]).toMatchObject({ kind: 'critters', id: 'crb.fuzzbeast', pet: 'exotic', commands: 3 })
  // a quality specified with the purchase, from the critter-only catalog, and taken off again
  await click(button('Add a quality with the purchase to Fuzzbeast'))
  await click(option('Snuggly'))
  expect(main()).toMatch(/qualities: 1 positive, 0 negative \(Availability \+1\); net 2 Karma cost: \+600¥/)
  await click(button('Remove Snuggly from Fuzzbeast'))
  // tamed: no price; Wild Soul and High Maintenance come, and go again
  await change(field('Fuzzbeast tamed'), true)
  expect(main()).toMatch(/tamed from the wild: no price/)
  expect(main()).toMatch(/Wild Soul\s*from taming/)
  expect(main()).toMatch(/High Maintenance\s*from taming/)
  await change(field('Fuzzbeast tamed'), false)
  expect(main()).not.toMatch(/Wild Soul\s*from taming/)
  // critter gear from the critter-only catalog, priced at its Body (4)
  await click(button('Add an accessory to Fuzzbeast'))
  await click(option('Fuzz Harness'))
  after = await saved()
  expect(after.build.purchases[0].accessories.map(a => a.id)).toEqual(['zz.fuzz-harness'])
  expect(after.build.purchases[0].critterQualities).toBeUndefined()
  // undone: the harness goes
  await click(button('Undo'))
  expect((await saved()).build.purchases[0].accessories).toEqual([])
  expect(document.querySelector('[aria-label="Critter Fuzzbeast"]')).not.toBeNull()
})

test('Review: a critter past its limits is a warning (not an error) linking to Critters', async () => {
  const ch = runner()
  ch.build.purchases = [{ uid: 'c1', kind: 'critters', id: 'crb.fuzzbeast', qty: 1, accessories: [], commands: 3 }]
  await open(ch, 'review')
  const link = [...document.querySelectorAll('a')].find(a => /Fuzzbeast: 3 commands; it can learn 2/.test(a.textContent ?? ''))
  expect(link?.getAttribute('href')).toBe('#/sr6/c/made-up-c/critters')
  expect(link?.closest('.viol')?.querySelector('.sev.warn')).not.toBeNull()
})

test('Critters: a quality bought by the bond costs the runner Karma at creation', async () => {
  const ch = runner()
  ch.build.purchases = [{ uid: 'c1', kind: 'critters', id: 'crb.fuzzbeast', qty: 1, accessories: [] }]
  const saved = await open(ch, 'critters')
  await click(button('Add a quality by the bond (your Karma) to Fuzzbeast'))
  await click(option('Keen'))
  expect(main()).toMatch(/the bond: 3 Karma/)
  expect(pageText()).toMatch(/Critter qualities bought by the bond/)
  expect((await saved()).build.purchases[0].critterQualities).toEqual([{ uid: expect.any(String), id: 'zz.keen', level: 1, name: 'Keen', how: 'bonded' }])
})

test('Ledger: after finalising, a critter is bought at its class and training, and a quality bonded with a negative', async () => {
  const ch = runner()
  ch.build.purchases = [{ uid: 'c1', kind: 'critters', id: 'crb.fuzzbeast', qty: 1, accessories: [] }]
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00.000Z', final: { karma: 30, nuyen: 5000 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00.000Z', type: 'finalize', karma: 30, nuyen: 5000 }]
  const saved = await open(ch, 'ledger')
  await change(field('What'), 'critter')
  await click(button('Pick from the catalog…'))
  await click(option('Rustmole'))
  await change(field('Critter class'), 'wild')
  await change(field('Special training'), '1')
  expect(pageText()).toMatch(/Rustmole · 1,200¥/) // (Body 3 × 200 + 600)
  await click(button('Record'))
  await click(button('Record it'))
  expect((await saved()).ledger.at(-1)).toMatchObject({
    advance: { op: 'purchase', line: { kind: 'critters', id: 'crb.rustmole', pet: 'wild', training: 1 } },
    nuyen: 1200,
  })
  await change(field('What'), 'bond')
  await change(field('Bonded critter'), 'c1')
  await change(field('Bonded quality'), 'zz.keen')
  await change(field('Negative taken with it'), 'zz.high-maintenance')
  // (3 − 1, × the career quality factor)
  expect(pageText()).toMatch(/Critter bond: Keen with High Maintenance on Fuzzbeast · 6 karma/)
  await click(button('Record'))
  await click(button('Record it'))
  expect((await saved()).ledger.at(-1)).toMatchObject({ advance: { op: 'bond', target: 'c1', line: { id: 'zz.keen', how: 'bonded' } }, karma: 6 })
  // the runner as it stands has it, bonded
  expect(currentBuild(await saved()).purchases[0].critterQualities?.map(y => [y.id, y.how])).toEqual([
    ['zz.keen', 'bonded'],
    ['zz.high-maintenance', 'bonded'],
  ])
})

test('Critters after finalising: read only, pointing at the Ledger', async () => {
  const ch = runner()
  ch.build.purchases = [
    { uid: 'c1', kind: 'critters', id: 'crb.fuzzbeast', qty: 1, accessories: [], critterQualities: [{ uid: 'k', id: 'zz.keen', level: 1, how: 'bonded' }] },
  ]
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00.000Z', final: { karma: 0, nuyen: 0 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00.000Z', type: 'finalize', karma: 0, nuyen: 0 }]
  await open(ch, 'critters')
  expect(main()).toMatch(/Keen\s*bonded: your Karma/)
  expect(main()).toMatch(/After finalising: buy a critter, fit critterware or gear, or bond a quality on the Ledger/)
  expect(field<HTMLInputElement>('Fuzzbeast tamed').closest('fieldset')?.disabled).toBe(true)
})
