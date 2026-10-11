// Table setup's creation rules form (src/sr6/ui/Creation.tsx) with nested optional rules: a child row sits under its
// parent, greyed and disabled with "needs …" while the parent is off; of two rules that can't be on together, the second
// is disabled and says why. Made-up fixture.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import { CreationForm } from '../../src/sr6/ui/Creation'
import { fixtureCatalog, made } from '../sr6/fixture'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })

function mount() {
  const { cr } = made({ rules: { expandedContacts: false, contactKarma: 2, levelPrime: false, levelSwcStreet: false } })
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  act(() => root!.render(createElement(CreationForm, { c: fixtureCatalog(), cr: { rules: cr, errors: [] }, onSave: async () => {} })))
  const control = (label: RegExp) => [...el.querySelectorAll<HTMLSelectElement | HTMLInputElement>('select, input')].find(x => label.test(x.getAttribute('aria-label') ?? ''))!
  const row = (label: RegExp) => control(label).closest('tr')!
  const pick = (label: RegExp, value: string) => act(() => {
    const s = control(label) as HTMLSelectElement
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(s, value)
    s.dispatchEvent(new Event('change', { bubbles: true }))
  })
  return { el, control, row, pick }
}

test('a nested rule sits under its parent, disabled with what it needs while the parent is off', () => {
  const { control, row, pick } = mount()
  const child = /^Expanded contacts: karma per contact point/
  expect(row(child).className).toMatch(/nested/)
  expect(row(child).className).toMatch(/blocked/)
  expect(row(child).textContent).toMatch(/needs Expanded contacts: karma buys/)
  expect(control(child).disabled).toBe(true)
  expect(control(child).value).toBe('2')  // its stored value kept
  expect(row(child).previousElementSibling?.textContent).toMatch(/^Expanded contacts: karma buys/)
  pick(/^Expanded contacts: karma buys/, 'true')
  expect(control(child).disabled).toBe(false)
  expect(row(child).className).not.toMatch(/blocked/)
})

test('of two rules that can’t be on together, the second is disabled and says why', () => {
  const { control, row, pick } = mount()
  expect(control(/^Street-level \(Sixth World Companion\)/).disabled).toBe(false)
  pick(/^Prime runner/, 'true')
  expect(control(/^Street-level \(Sixth World Companion\)/).disabled).toBe(true)
  expect(row(/^Street-level \(Sixth World Companion\)/).textContent).toMatch(/can’t be on with Prime runner: twice the customization karma, which is on/)
  expect(control(/^Prime runner/).disabled).toBe(false)
})

test('every row has hover text: what it does, and its book and page, house rule or option (owner, 2026-10-11)', () => {
  const { el, row } = mount()
  const rows = [...el.querySelectorAll('tbody tr')]
  expect(rows.length).toBeGreaterThan(100)
  expect(rows.filter(r => !/\((.*p\.|house rule|option).*\)\.$/.test(r.querySelector('td')?.getAttribute('title') ?? '')).map(r => r.textContent)).toEqual([])
  expect(row(/^Exotic Weapons: the first specialization/).querySelector('td')!.title).toBe('On: the first Exotic Weapons specialization costs no skill points or Karma (house rule).')
  expect(row(/^Highest Magic or Resonance$/).querySelector('td')!.title).toMatch(/\(CRB Hong Kong p\. 65\)\.$/)
})

test('a toggle with the GM’s values nested under it: the values wait for it (data structure caps, carry-over, Karma build)', () => {
  const { control, pick } = mount()
  for (const [parent, child] of [[/^Caps on a technomancer’s data structures/, /^Data structure caps: most/], [/^Own carry-over limits: the Karma/, /^Own carry-over limits: most Karma/],
    [/^Karma build: a creation method/, /^Starting karma \(karma build\)/]] as const) {
    pick(parent, 'false')
    expect(control(child).disabled).toBe(true)
    pick(parent, 'true')
    expect(control(child).disabled).toBe(false)
  }
})
