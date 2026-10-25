import { createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { priceAt, PurchaseSection } from '../../../src/sr6/runner-builder/ui/Picker'
import { Sr6Editor, type Sr6Ctx } from '../../../src/sr6/runner-builder/ui/editor'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'
import { mount } from '../../ui/dom'

test.each([
  ['7(L), 500¥', '7(L), licence fee 500¥', '5(L), licence fee 500¥'],
  ['2(I), 15,000¥', '2(I), licence fee 15,000¥', '0(I), licence fee 15,000¥'],
  ['500¥', '0, available with licence (fee 500¥)', '0, available with licence (fee 500¥)'],
])('owned licence availability uses Event Horizon without losing licence details: %s', async (avail, before, after) => {
  const c = fixtureCatalog()
  const e = {
    id: 'test.licensed',
    kind: 'gear' as const,
    name: 'Licensed item',
    source: 'CRB',
    page: 1,
    attrs: { avail, cost: '100' },
    text: '',
    parts: [],
  }
  c.entries.gear.set(e.id, e)
  c.entries.qualities.set('test.horizon', {
    ...e,
    id: 'test.horizon',
    kind: 'qualities',
    attrs: { kind: 'positive', karma: '0' },
    parts: [{ tag: 'modifier', attrs: { kind: 'itemmod', type: 'RULE', ref: 'DECREASE_AVAILABILITY_2' }, text: '' }],
  })
  const data = sr6Data(c)
  const cr = fixtureCreation()
  const ch = blankSr6('priority', 'licensed')
  ch.build.purchases.push({ uid: 'item', kind: 'gear', id: e.id, qty: 1, accessories: [] })
  const ctx = { c, data, cr, ch, d: { hosts: [] } } as unknown as Sr6Ctx
  const view = () => createElement(Sr6Editor.Provider, { value: ctx }, createElement(PurchaseSection, { kind: 'gear', title: 'Gear', one: 'item' }))
  const { el, rerender } = await mount(view())
  const shown = () => el.querySelector('tbody tr')!.children[2].textContent!
  expect(shown()).toContain(before)
  ch.build.qualities.push({ uid: 'quality', id: 'test.horizon', level: 1 })
  await rerender(view())
  expect(shown()).toContain(after)
  expect(e.attrs.avail).toBe(avail)
  expect(priceAt(e, 1, cr, undefined, data, ch.build).avail).toContain(after.replace('available with ', ''))
  ch.build.sins.push({ uid: 'sin', kind: 'real', name: 'Runner SIN', licences: [{ name: 'Item licence', item: 'item', rating: 1 }] })
  await rerender(view())
  expect(shown()).toContain(after)
  expect(shown()).toContain('licensed on: Runner SIN')
  expect(shown()).not.toContain('Licence needed')
  ch.build.qualities = []
  await rerender(view())
  expect(shown()).toContain(before)
})
