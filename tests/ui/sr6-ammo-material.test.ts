// The Gear tab's material picker on an ammunition line (purchases.ts materialOf): chosen, priced, taken
// off again, kept in the saved file. Invented material and factor on the made-up fixture.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6Data } from '../../src/sr6/engine/data'
import { blankSr6 } from '../../src/sr6/model/character'
import { Sr6EditorView } from '../../src/sr6/ui/EditorView'
import { fixtureCatalog, fixtureCreation, GLIM } from '../sr6/fixture'
import { button, change, click, fakeStore, field, mount, option, pageText, stubFetch } from './dom'

const MATERIALS = {
  file: 'custom/sr6/imported/zz/ammotypes.xml',
  xml:
    '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="ammotypes" version="1">' +
    '<ammotype id="zz.glow-slugs-moonstone" source="ZZ" page="3" category="Ammunition accessory" cost="x7"><name>Glow Slugs (moonstone)</name><formula field="cost">H*7</formula></ammotype>' +
    '</sr6:data>',
}

test('ammo-material: the picker on an ammunition line prices it and is saved; None takes it off', async () => {
  const c = fixtureCatalog(undefined, [MATERIALS]),
    ch = blankSr6('karma', 'made-up-am', '2026-10-20T00:00:00.000Z')
  ch.build.metatype = GLIM
  ch.build.purchases = [{ uid: 'p1', kind: 'gear', id: 'crb.zap-pellets', qty: 1, accessories: [] }]
  const store = fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  await mount(createElement(Sr6EditorView, { c, data: sr6Data(c), cr: fixtureCreation(), id: ch.id, tab: 'gear' }))
  expect(pageText()).toContain('21¥')
  await change(field('Zap Pellets: material'), 'zz.glow-slugs-moonstone')
  expect(pageText()).toContain('147¥')
  await click(button('Save'))
  const saved = xmlToSr6(store.rows.get(ch.id)!.xml)
  expect(saved.ok && saved.character.build.purchases[0].material).toBe('zz.glow-slugs-moonstone')
  await change(field('Zap Pellets: material'), '')
  expect(pageText()).toContain('21¥')
  expect(pageText()).not.toContain('147¥')
})

test('ammo-material: an ammunition line takes an ammunition type on the Gear tab, priced with it and removable; combined with a material the book’s rule shows', async () => {
  const c = fixtureCatalog(undefined, [MATERIALS]),
    ch = blankSr6('karma', 'made-up-at', '2026-10-20T00:00:00.000Z')
  ch.build.metatype = GLIM
  ch.build.purchases = [{ uid: 'p1', kind: 'gear', id: 'crb.zap-pellets', qty: 1, accessories: [] }]
  const store = fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  await mount(createElement(Sr6EditorView, { c, data: sr6Data(c), cr: fixtureCreation(), id: ch.id, tab: 'gear' }))
  await click(button('Add an accessory to Zap Pellets'))
  expect(document.querySelector('dialog[open]')?.textContent).not.toContain('Glow Slugs') // (a material is the picker's, not a type)
  await click(option('Fizz Rounds'))
  expect(pageText()).toContain('42¥') // (21 × Fizz Rounds' x2)
  expect(pageText()).not.toContain('may not be combined')
  await change(field('Zap Pellets: material'), 'zz.glow-slugs-moonstone')
  expect(pageText()).toContain('294¥')
  expect(pageText()).toContain('Bestial Nature p. 36: silver bullets “may not be combined with other types of ammunition”')
  await click(button('Save'))
  const saved = xmlToSr6(store.rows.get(ch.id)!.xml)
  expect(saved.ok && saved.character.build.purchases[0].accessories.map(a => a.id)).toEqual(['crb.fizz-rounds'])
  await click(button(/^Remove Fizz Rounds from Zap Pellets/))
  expect(pageText()).toContain('147¥')
  expect(pageText()).not.toContain('may not be combined')
})
