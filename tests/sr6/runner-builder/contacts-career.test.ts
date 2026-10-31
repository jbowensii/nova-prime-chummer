// Career: contact raises are paid in Karma on the Ledger, so the creation "Contact points: over by N" line is not shown.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { Sr6Editor, type Sr6Ctx } from '../../../src/sr6/runner-builder/ui/editor'
import { ContactsTab } from '../../../src/sr6/runner-builder/ui/tabs/Contacts'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'
import { mount } from '../../ui/dom'

test.each([
  [false, true],
  [true, false],
])('career=%s shows the contact points line: %s', async (career, shown) => {
  const c = fixtureCatalog()
  const ch = blankSr6('priority', 'contacts')
  const budgets = { contactPoints: { max: 4, spent: 9, left: -5, ratingCap: 0, karma: 0 } }
  const ctx = { c, data: sr6Data(c), cr: fixtureCreation(), ch, budgets, career, act: () => true, d: { hosts: [] } } as unknown as Sr6Ctx
  const { el } = await mount(createElement(Sr6Editor.Provider, { value: ctx }, createElement(ContactsTab)))
  expect(el.textContent!.includes('Contact points:')).toBe(shown)
  expect(el.textContent!.includes('over by')).toBe(shown)
})
