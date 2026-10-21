// Table setup's creation rules form (src/sr6/table-setup/ui/Creation.tsx): nine foldable sections, a real switch for every on/off rule,
// nested optional rules with a child row under its parent, greyed and disabled with "needs …" while the parent is off; of two
// rules that can't be on together, the second is disabled and says why. The standard values in grey, a changed one marked, Reset
// section, the search box. Made-up fixture.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import { CreationForm } from '../../../src/sr6/table-setup/ui/Creation'
import { SECTIONS } from '../../../src/sr6/table-setup/ui/creationLayout'
import { rulesFrom } from '../../../src/sr6/table-setup/domain/creation'
import { fixtureCatalog, made } from '../catalog/fixture'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

type Opts = { std?: boolean; open?: boolean; rules?: Record<string, number | boolean | string>; onSave?: boolean }
function mount(o: Opts = {}) {
  const { cr } = made({ rules: { expandedContacts: false, contactKarma: 2, levelPrime: false, levelSwcStreet: false, ...o.rules } })
  const std = o.std ? made().cr : undefined
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  let saved: { key: string; value: string }[] | null = null
  act(() =>
    root!.render(
      createElement(CreationForm, {
        c: fixtureCatalog(),
        cr: { rules: cr, errors: [] },
        std,
        onSave:
          o.onSave === false
            ? undefined
            : async s => {
                saved = s
              },
      }),
    ),
  )
  const button = (name: RegExp | string) =>
    [...el.querySelectorAll('button')].find(b =>
      typeof name === 'string'
        ? b.textContent === name || b.getAttribute('aria-label') === name
        : name.test(b.textContent ?? '') || name.test(b.getAttribute('aria-label') ?? ''),
    )!
  const click = (b: Element) => act(() => (b as HTMLElement).click())
  const openAll = () => click(button('Open all sections'))
  if (o.open !== false) openAll()
  const control = (label: RegExp) =>
    [...el.querySelectorAll<HTMLSelectElement | HTMLInputElement>('select, input')].find(x => label.test(x.getAttribute('aria-label') ?? ''))!
  const row = (label: RegExp) => control(label).closest('.cr-row')!
  const toggle = (label: RegExp, on: boolean) => {
    const c = control(label) as HTMLInputElement
    if (c.checked !== on) click(c)
  }
  const type = (label: RegExp, value: string) =>
    act(() => {
      const i = control(label) as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, value)
      i.dispatchEvent(new Event('input', { bubbles: true }))
    })
  const search = (text: string) => type(/^Search the settings$/, text)
  return { el, control, row, toggle, type, click, button, openAll, search, saved: () => saved }
}

test('a nested rule sits under its parent, disabled with what it needs while the parent is off', () => {
  const { control, row, toggle } = mount()
  const child = /^Expanded contacts: karma per contact point/
  expect(row(child).className).toMatch(/nested/)
  expect(row(child).className).toMatch(/blocked/)
  expect(row(child).textContent).toMatch(/needs Expanded contacts: karma buys/)
  expect(control(child).disabled).toBe(true)
  expect(control(child).value).toBe('2') // its stored value kept
  expect(row(child).previousElementSibling?.textContent).toMatch(/^Expanded contacts: karma buys/)
  toggle(/^Expanded contacts: karma buys/, true)
  expect(control(child).disabled).toBe(false)
  expect(row(child).className).not.toMatch(/blocked/)
})

test('of two rules that can’t be on together, the second is disabled and says why', () => {
  const { control, row, toggle } = mount()
  expect(control(/^Street-level \(Sixth World Companion\)/).disabled).toBe(false)
  toggle(/^Prime runner/, true)
  expect(control(/^Street-level \(Sixth World Companion\)/).disabled).toBe(true)
  expect(row(/^Street-level \(Sixth World Companion\)/).textContent).toMatch(/can’t be on with Prime runner: twice the customization karma, which is on/)
  expect(control(/^Prime runner/).disabled).toBe(false)
})

test('every row has hover text: what it does, and its book and page, house rule or option (owner, 2026-10-11)', () => {
  const { el, row } = mount()
  const rows = [...el.querySelectorAll('.cr-row')]
  expect(rows.length).toBeGreaterThan(100)
  expect(
    rows.filter(r => !/\((.*p\.|house rule|option).*\)\.$/.test(r.querySelector('.cr-name')?.getAttribute('title') ?? '')).map(r => r.textContent),
  ).toEqual([])
  expect(
    row(/^Exotic Weapons: the first specialization/)
      .querySelector('.cr-name')!
      .getAttribute('title'),
  ).toBe('On: the first Exotic Weapons specialization costs no skill points or Karma (house rule).')
  expect(
    row(/^Highest Magic or Resonance$/)
      .querySelector('.cr-name')!
      .getAttribute('title'),
  ).toMatch(/\(CRB Hong Kong p\. 65\)\.$/)
})

test('a toggle with the GM’s values nested under it: the values wait for it (data structure caps, carry-over, Karma build)', () => {
  const { control, toggle } = mount()
  for (const [parent, child] of [
    [/^Caps on a technomancer’s data structures/, /^Data structure caps: most/],
    [/^Own carry-over limits: the Karma/, /^Own carry-over limits: most Karma/],
    [/^Karma build: a creation method/, /^Starting karma \(karma build\)/],
  ] as const) {
    toggle(parent, false)
    expect(control(child).disabled).toBe(true)
    toggle(parent, true)
    expect(control(child).disabled).toBe(false)
  }
})

test('an on/off rule is a switch with its label, not a Not set / Yes / No list', () => {
  const { el, control } = mount()
  const sw = control(/^Stacking Advantage/) as HTMLInputElement
  expect(sw.type).toBe('checkbox')
  expect(sw.getAttribute('role')).toBe('switch')
  expect(sw.checked).toBe(false)
  // no setting of the form is a yes/no/not-set list any more; the only lists are qualities
  const lists = [...el.querySelectorAll('select')].filter(s => [...s.options].some(o => o.textContent === 'Yes' || o.textContent === 'No'))
  expect(lists).toEqual([])
  expect(el.querySelectorAll('input[role=switch]').length).toBeGreaterThan(40)
})

test('nine foldable sections; a folded section draws no rows until it is opened (the fast part)', () => {
  const { el, openAll, click, button } = mount({ open: false })
  const heads = () => [...el.querySelectorAll('details.fold.sub > summary h3')].map(h => h.textContent)
  expect(heads()).toEqual([...SECTIONS])
  expect(el.querySelectorAll('.cr-row').length).toBe(0)
  expect(el.querySelectorAll('input[type=number]').length).toBe(0)
  const first = el.querySelector('details.fold.sub') as HTMLDetailsElement
  act(() => {
    first.open = true
    first.dispatchEvent(new Event('toggle'))
  })
  expect(el.querySelectorAll('.cr-row').length).toBeGreaterThan(5)
  openAll()
  const all = el.querySelectorAll('.cr-row').length
  expect(all).toBeGreaterThan(150)
  click(button('Close all sections'))
  expect(el.querySelectorAll('.cr-row').length).toBe(0)
})

test('the standard value is grey; a changed one stands out, shows the standard and resets; Reset section does a whole section', () => {
  const { el, control, row, type, click, button } = mount({ std: true })
  const cap = /^Highest skill rank$/
  expect(row(cap).className).toMatch(/at-std/)
  expect(row(cap).className).not.toMatch(/changed/)
  expect(row(cap).querySelector('.cr-std')).toBeNull()
  type(cap, '4')
  expect(row(cap).className).toMatch(/changed/)
  expect(row(cap).querySelector('.cr-std')!.textContent).toMatch(/^Standard: 5 \(CRB p\. 61\)/)
  const badge = (section: string) =>
    [...el.querySelectorAll<HTMLElement>('details.fold.sub')].find(d => d.dataset.section === section)!.querySelector('.cr-changed')
  expect(badge('Attributes & skills')!.textContent).toBe('1 changed')
  expect(badge('Budgets & priorities')).toBeNull()
  type(/^Highest skill rank with the aptitude quality$/, '9')
  type(/^Most paid qualities$/, '9')
  click(button('Reset section Attributes & skills'))
  expect((control(cap) as HTMLInputElement).value).toBe('5')
  expect((control(/^Highest skill rank with the aptitude quality$/) as HTMLInputElement).value).toBe('6')
  expect((control(/^Most paid qualities$/) as HTMLInputElement).value).toBe('9') // another section: untouched
  expect(button('Reset section Attributes & skills').disabled).toBe(true)
  click(button('Reset Most paid qualities to standard'))
  expect((control(/^Most paid qualities$/) as HTMLInputElement).value).toBe('5')
})

test('the search box filters rows by name and opens the sections that have a match', () => {
  const { el, search } = mount({ open: false })
  search('skill rank')
  const names = [...el.querySelectorAll('.cr-row')].map(r => r.querySelector('.cr-name')!.textContent!)
  expect(names.length).toBeGreaterThan(1)
  expect(names.every(n => /skill rank/i.test(n))).toBe(true)
  expect(el.querySelectorAll('details.fold.sub').length).toBeLessThan(SECTIONS.length)
  search('zzz no such setting')
  expect(el.querySelectorAll('.cr-row').length).toBe(0)
  expect(el.textContent).toMatch(/No setting’s name contains “zzz no such setting”/)
  search('')
  expect(el.querySelectorAll('details.fold.sub').length).toBe(SECTIONS.length)
})

test('a switch stores the same values the Not set / Yes / No list did: true, false, or nothing where the standard has none', async () => {
  const { toggle, click, button, saved } = mount({ std: true })
  toggle(/^Working for the Man/, false) // the standard has it: stored false
  toggle(/^Close Combat rolls STR/, true)
  toggle(/^Karma build: a creation method/, true)
  toggle(/^Karma build: a creation method/, false) // no standard row: nothing stored again
  await act(async () => {
    click(button('Save creation rules'))
  })
  const rows = Object.fromEntries(saved()!.map(s => [s.key, s.value]))
  expect(rulesFrom(saved()!).errors).toEqual([])
  expect(rows.strengthInCloseCombat).toBe('true')
  expect(rows.workingForTheMan).toBe('false')
  expect(rows.karmaBuildMethod ?? 'false').not.toBe('true')
})

test('read only: the sections and the switches show, nothing can be changed', () => {
  const { el } = mount({ onSave: false })
  expect([...el.querySelectorAll<HTMLInputElement>('input, select')].filter(i => !i.disabled && i.type !== 'search')).toEqual([])
  expect(el.querySelectorAll('.cr-row').length).toBeGreaterThan(150)
})
