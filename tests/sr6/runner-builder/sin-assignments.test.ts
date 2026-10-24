import { createElement } from 'react'
import { expect, test } from 'vitest'
import { blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { Sr6EditorView } from '../../../src/sr6/shell/ui/EditorView'
import { fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'
import { button, change, click, fakeStore, field, mount, stubFetch } from '../../ui/dom'

function runner() {
  const ch = blankSr6('karma', 'sin-assignments', '2026-10-24T00:00:00.000Z')
  ch.build.metatype = GLIM
  ch.build.sins = [
    { uid: 's1', name: 'First identity', kind: 'real', licences: [] },
    { uid: 's2', name: 'Second identity', kind: 'real', licences: [] },
  ]
  ch.build.purchases = [
    { uid: 'g1', kind: 'gear', name: 'Commlink A', qty: 1, accessories: [
      { uid: 'a1', kind: 'gear', name: 'Accessory', qty: 1, accessories: [
        { uid: 'a2', kind: 'gear', name: 'Nested accessory', qty: 1, accessories: [] },
      ] },
    ] },
    { uid: 'g2', kind: 'gear', name: 'Commlink B', qty: 1, accessories: [] },
  ]
  return ch
}

function read(xml: string): Sr6Character {
  const r = xmlToSr6(xml)
  if (!r.ok) throw new Error(r.reason)
  return r.character
}

async function open(ch: Sr6Character) {
  const c = fixtureCatalog()
  const store = fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  await mount(createElement(Sr6EditorView, { c, data: sr6Data(c), cr: fixtureCreation(), id: ch.id, tab: 'contacts' }))
  return async () => {
    await click(button('Save'))
    return read(store.rows.get(ch.id)!.xml)
  }
}

const assign = (sin: number, uid: string) => change(field(`Assign owned gear to SIN ${sin}`), uid)

test('XML preserves SIN assignments on multiple purchases and nested accessories', () => {
  const ch = runner()
  const p = ch.build.purchases
  p[0].sin = p[1].sin = p[0].accessories[0].accessories[0].sin = 's1'
  const back = read(sr6ToXml(ch)).build.purchases
  expect(back).toEqual(p)
  expect(back.map(x => x.sin)).toEqual(['s1', 's1'])
})

test('legacy XML without purchase sin attributes loads without adding assignments', () => {
  const xml = sr6ToXml(runner())
  expect(xml).not.toContain(' sin=')
  const p = read(xml).build.purchases
  expect(p[0]).not.toHaveProperty('sin')
  expect(p[1]).not.toHaveProperty('sin')
  expect(p[0].accessories[0]).not.toHaveProperty('sin')
})

test('Contacts assigns many purchases, moves an assignment, and unassigns without changing licences or prices', async () => {
  const ch = runner()
  ch.build.sins[0].licences = [{ name: 'Existing permit', rating: 1, item: 'g1' }]
  ch.build.purchases[0].cost = 123
  const save = await open(ch)
  await assign(1, 'g1')
  await assign(1, 'g2')
  await assign(1, 'a2')
  let back = await save()
  expect(back.build.purchases.map(x => x.sin)).toEqual(['s1', 's1'])
  expect(back.build.purchases[0].accessories[0].accessories[0].sin).toBe('s1')
  await assign(2, 'g1')
  back = await save()
  expect(back.build.purchases.map(x => x.sin)).toEqual(['s2', 's1'])
  await click(button('Unassign Commlink A from SIN 2'))
  back = await save()
  expect(back.build.purchases[0]).not.toHaveProperty('sin')
  expect(back.build.purchases[0].cost).toBe(123)
  expect(back.build.sins.map(s => s.licences)).toEqual(ch.build.sins.map(s => s.licences))
})

test('removing a SIN clears its purchase and nested accessory links but preserves other assignments', async () => {
  const ch = runner()
  ch.build.purchases[0].sin = 's1'
  ch.build.purchases[0].accessories[0].sin = 's1'
  ch.build.purchases[0].accessories[0].accessories[0].sin = 's1'
  ch.build.purchases[1].sin = 's2'
  const save = await open(ch)
  await click(button('Remove First identity'))
  const back = await save()
  expect(back.build.sins.map(s => s.uid)).toEqual(['s2'])
  expect(back.build.purchases[0]).not.toHaveProperty('sin')
  expect(back.build.purchases[0].accessories[0]).not.toHaveProperty('sin')
  expect(back.build.purchases[0].accessories[0].accessories[0]).not.toHaveProperty('sin')
  expect(back.build.purchases[1].sin).toBe('s2')
})
