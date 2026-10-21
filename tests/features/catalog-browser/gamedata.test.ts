// Game data's one layout for both games (src/features/catalog-browser/GameData.tsx): the kinds with their counts, the categories, the book as
// a filter, the sources and the Foundry export folded, the export's link in row 1's right-hand group (only when the page
// gives an export), Problems with a Line column only when a game reports lines; the kind it opens on (the last looked at,
// per game, else the game's main kind). Made-up rows.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { GameDataPage, KIND_KEY } from '../../../src/features/catalog-browser/GameData'
import { startKind, type BrowseKind } from '../../../src/features/catalog-browser/CatalogBrowser'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  location.hash = ''
  localStorage.clear()
  vi.restoreAllMocks()
})

const KINDS: BrowseKind[] = [
  {
    id: 'gear',
    label: 'Gear',
    rows: [
      { key: 'a', name: 'Zap Gloves', source: 'NB', page: 1, group: 'tools' },
      { key: 'b', name: 'Glow Stick', source: 'OB', page: 2, group: 'lights' },
    ],
  },
  { id: 'spells', label: 'Spells', rows: [] },
]
function mount(game: 'ca2' | 'sr6', more: Record<string, unknown> = {}) {
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  act(() =>
    root!.render(
      createElement(GameDataPage, {
        game,
        kinds: KINDS,
        books: [
          { id: 'NB', name: 'New Book' },
          { id: 'OB', name: 'Old Book' },
        ],
        sourcesIntro: null,
        sources: [{ id: 'NB', name: 'New Book', publisher: 'Pub', status: 'Canon', entries: 1, texts: 'none' }],
        errors: [],
        docs: 'docs',
        ...more,
      }),
    ),
  )
  return el
}
const q = (el: Element, s: string) => [...el.querySelectorAll<HTMLElement>(s)]

test('the kinds down the left with counts, the categories across the top, the book a filter, one table', () => {
  for (const game of ['ca2', 'sr6'] as const) {
    const el = mount(game)
    expect(q(el, '[aria-label="Kind"] button').map(b => b.textContent)).toEqual(['Gear 2', 'Spells 0'])
    expect(q(el, '[aria-label="Category"] button').map(b => b.textContent)).toEqual(['All 2', 'Lights 1', 'Tools 1'])
    expect(q(el, 'select[aria-label="Book"] option').map(o => o.textContent)).toEqual(['All books', 'New Book', 'Old Book'])
    expect(q(el, 'table.browse tbody tr')).toHaveLength(2)
    expect(el.querySelector('table.browse')!.classList.contains('sr6-browse')).toBe(game === 'sr6')
    act(() => root!.unmount())
    root = null
  }
})

test('the sources are folded, with the number of books; no export: no fold and no button', () => {
  const el = mount('ca2')
  const fold = q(el, 'details.fold')
  expect(fold).toHaveLength(1)
  expect((fold[0] as HTMLDetailsElement).open).toBe(false)
  expect(fold[0].querySelector('summary')!.textContent).toBe('Sources 1 book')
  expect(el.querySelector('details#foundry-export')).toBeNull()
  expect(q(el, 'a.btn').map(a => a.textContent)).not.toContain('Export to Foundry VTT')
})

test('an export: its link sits in row 1’s right-hand group of the header (the game’s own page) and its button at the top; both open the folded export', () => {
  for (const [game, href] of [
    ['ca2', '#/data/foundry'],
    ['sr6', '#/sr6/data/foundry'],
  ] as const) {
    location.hash = game === 'sr6' ? '#/sr6/data' : '#/data'
    const el = mount(game, { foundry: createElement('section', { 'aria-label': 'Export book data for Foundry' }, 'the panel') })
    const link = el.querySelector<HTMLAnchorElement>('.menubar .tools a[aria-label="Export book data for Foundry"]')!
    expect(link.getAttribute('href')).toBe(href)
    const fold = el.querySelector<HTMLDetailsElement>('details#foundry-export')!
    expect(fold.open).toBe(false)
    Element.prototype.scrollIntoView ??= () => {}
    act(() => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    expect(fold.open).toBe(true)
    fold.open = false
    const button = [...el.querySelectorAll<HTMLAnchorElement>('a.btn')].find(a => a.textContent === 'Export to Foundry VTT')!
    expect(button.getAttribute('href')).toBe(href)
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    expect(fold.open).toBe(true)
    act(() => root!.unmount())
    root = null
  }
})

test('a page opened at …/data/foundry opens the export', () => {
  location.hash = '#/sr6/data/foundry'
  Element.prototype.scrollIntoView ??= () => {}
  const el = mount('sr6', { foundry: 'the panel' })
  expect(el.querySelector<HTMLDetailsElement>('details#foundry-export')!.open).toBe(true)
})

test('Problems: the Line column only when a game reports lines', () => {
  let el = mount('sr6', { errors: [{ file: 'a.xml', message: 'bad' }] })
  expect(q(el, 'table th').map(t => t.textContent)).toContain('Problem')
  expect(q(el, 'table th').map(t => t.textContent)).not.toContain('Line')
  act(() => root!.unmount())
  root = null
  el = mount('ca2', { errors: [{ file: 'a.xml', line: 3, message: 'bad' }] })
  expect(q(el, 'table th').map(t => t.textContent)).toContain('Line')
})

const GAME: BrowseKind[] = [
  { id: 'priorities', label: 'Priorities', rows: [{ key: 'p', name: 'Priority A', source: 'NB', page: 1 }] },
  { id: 'qualities', label: 'Qualities', rows: [{ key: 'q', name: 'Lucky Streak', source: 'NB', page: 2 }] },
  { id: 'amps', label: 'Amps', rows: [{ key: 'a', name: 'Keen Eye', source: 'NB', page: 3 }] },
  { id: 'gear', label: 'Gear', rows: [] },
]
const pressed = (el: Element) => el.querySelector('[aria-label="Kind"] button[aria-pressed="true"]')?.textContent

test('the kind it opens on: the one last looked at, else the main one, else the first with entries', () => {
  expect(startKind(GAME, 'qualities', 'k')).toBe('qualities')
  localStorage.setItem('k', 'gear')
  expect(startKind(GAME, 'qualities', 'k')).toBe('gear')
  localStorage.setItem('k', 'gone') // a kind no longer there
  expect(startKind(GAME, 'qualities', 'k')).toBe('qualities')
  expect(startKind(GAME, 'nope')).toBe('priorities')
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  expect(startKind(GAME, 'amps', 'k')).toBe('amps')
})

test('Game data opens on the game’s main kind (Anarchy Amps, SR6 Qualities) and remembers the last kind, per game', () => {
  let el = mount('sr6', { kinds: GAME })
  expect(pressed(el)).toBe('Qualities 1')
  act(() =>
    q(el, '[aria-label="Kind"] button')
      .find(b => b.textContent === 'Priorities 1')!
      .click(),
  )
  expect(localStorage.getItem(`${KIND_KEY}.sr6`)).toBe('priorities')
  act(() => root!.unmount())
  root = null
  el = mount('ca2', { kinds: GAME })
  expect(pressed(el)).toBe('Amps 1') // the other game's choice isn't this one's
  act(() => root!.unmount())
  root = null
  el = mount('sr6', { kinds: GAME })
  expect(pressed(el)).toBe('Priorities 1')
})

test('storage that throws: it still opens on the main kind and a pick still works', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  const el = mount('ca2', { kinds: GAME })
  expect(pressed(el)).toBe('Amps 1')
  act(() =>
    q(el, '[aria-label="Kind"] button')
      .find(b => b.textContent === 'Qualities 1')!
      .click(),
  )
  expect(pressed(el)).toBe('Qualities 1')
})
