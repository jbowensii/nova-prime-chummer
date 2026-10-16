// Owner requests of 2026-10-16 in the SR6 editor, on the made-up fixture: an owned item's licence toggle (Gear). Made-up
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

test('Gear: an item printing a licence fee gets a licence choice; bought puts the fee on its cost, unlicensed warns', async () => {
  const c = fixtureCatalog((f, x) =>
    f.endsWith('crb/gear.xml')
      ? x.replace('category="tools" rating="1–4" capacity="—" avail="1"', 'category="tools" rating="1–4" capacity="—" avail="2, 500¥"')
      : x,
  )
  const ch = runner()
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', qty: 1, accessories: [] }]
  const saved = await open(ch, 'gear', c)
  expect(pageText()).toMatch(/licence fee 500¥/)
  expect(document.querySelector('[aria-label^="Needs a licence (fee 500¥)"]')).not.toBeNull()
  await change(field('Tangle Rope 1 licence'), 'bought')
  expect(pageText()).toMatch(/licence fee 500¥ · licensed/)
  expect(pageText()).toMatch(/incl\. licence 500¥/)
  expect((await saved()).build.purchases[0].licence).toBe('bought')
  await change(field('Tangle Rope 1 licence'), 'unlicensed')
  expect(document.querySelector('[aria-label^="Carried without a licence (fee 500¥ not paid)"]')).not.toBeNull()
  await change(field('Tangle Rope 1 licence'), '')
  expect((await saved()).build.purchases[0].licence).toBeUndefined()
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
