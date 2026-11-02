// The starter-pack picker lives on the Gear tab only (owner 2026-11-02), its options grouped by the book's section.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6ToXml } from '../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { blankSr6 } from '../../src/sr6/formats/domain/character'
import { Sr6EditorView } from '../../src/sr6/shell/ui/EditorView'
import { fixtureCatalog, fixtureCreation, GLIM } from '../sr6/catalog/fixture'
import { fakeStore, mount, stubFetch } from './dom'

async function open(tab: 'gear' | 'skills') {
  const c = fixtureCatalog(),
    ch = blankSr6('karma', 'made-up-sp', '2026-11-02T00:00:00.000Z')
  ch.build.metatype = GLIM
  stubFetch([fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) }).route])
  await mount(createElement(Sr6EditorView, { c, data: sr6Data(c), cr: fixtureCreation(), id: ch.id, tab }))
  return document.querySelector('select[aria-label="Starter pack"]')
}

test('starter pack picker: on Gear, options in an optgroup per book section', async () => {
  expect((await open('gear'))?.querySelector('optgroup[label="augmentation-packs"]')).not.toBeNull()
})

test('starter pack picker: absent on other tabs', async () => {
  expect(await open('skills')).toBeNull()
})
