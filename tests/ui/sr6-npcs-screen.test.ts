// SR6's NPCs & Critters (src/sr6/ui/Npcs.tsx) over a stand-in server store, and an NPC's editor (Stat block tab):
// a new grunt from the catalog at a Professional Rating, the book NPCs loaded once, search, sharing
// with a campaign and delete. Made-up fixture NPCs.
import { act, createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { npcFromEntry } from '../../src/sr6/engine/npc'
import { Sr6EditorView } from '../../src/sr6/ui/EditorView'
import { Sr6Npcs } from '../../src/sr6/ui/Npcs'
import { fixtureCatalog, made } from '../sr6/fixture'
import { button, change, click, fakeStore, field, mount, pageText, settle, stubFetch } from './dom'

const c = fixtureCatalog()
const { data, cr } = made()
const names = () => [...document.querySelectorAll('.dossier .title')].map(a => a.textContent)
const camp = { id: 'k1', name: 'Made-up Run', note: '', archived: false, created: '', you: 'gm', gms: [], members: [], runners: [] }
function server(files: Record<string, string> = {}) {
  const store = fakeStore('sr6/npcs', files)
  const calls = stubFetch([
    [/\/api\/sr6\/campaigns\/k1\/npcs/, () => ({})],
    [/\/api\/sr6\/campaigns$/, () => [camp]],
    [/\/api\/sr6\/npcs\/trash/, () => ({ user: 'gm', name: 'GM', items: [] })],
    [/\/api\/sr6\/compendiums/, () => []],
    store.route,
  ])
  return { store, calls }
}
const stored = (store: ReturnType<typeof fakeStore>) =>
  [...store.rows.values()].map(r => {
    const x = xmlToSr6(r.xml)
    if (!x.ok) throw new Error(x.reason)
    return x.character
  })

test('New NPC: a catalog grunt at a Professional Rating, saved and opened', async () => {
  const { store } = server()
  await mount(createElement(Sr6Npcs, { c, data, cr }))
  await click(button('New NPC'))
  const from = field<HTMLSelectElement>('From the catalog')
  expect(from.options.length).toBeGreaterThan(1)
  await click(button(/^Create/, document.querySelector('dialog[open]')!))
  const [ch] = stored(store)
  expect(ch.npc?.kind).toBe('grunt')
  expect(location.hash).toMatch(new RegExp(`^#/sr6/n/${ch.id}`))
})

test('Load book NPCs copies the catalog’s NPCs once; search, share and delete', async () => {
  const { store, calls } = server()
  await mount(createElement(Sr6Npcs, { c, data, cr }))
  await click(button('Load book NPCs'))
  await settle(10)
  expect(pageText()).toMatch(/Loaded \d+/)
  const loaded = stored(store).length
  expect(loaded).toBeGreaterThan(0)
  await click(button('Load book NPCs'))
  await settle(10)
  expect(stored(store)).toHaveLength(loaded) // none twice

  const first = names()[0]!
  await change(field('Search npcs'), first.slice(0, 5))
  expect(names()[0]).toBe(first)
  await click(button(`Share ${first}…`))
  await click(button(/^Share/, document.querySelector('dialog[open]')!))
  expect(calls.some(x => x.init?.method === 'POST' && /campaigns\/k1\/npcs/.test(x.url))).toBe(true)
  await click(button(`Delete ${first}`))
  await click(button(/^Delete/, document.querySelector('dialog[open]')!))
  expect(stored(store)).toHaveLength(loaded - 1)
})

test('an NPC’s editor: Concept and Stat block tabs; the rating, a printed stat, a new stat and its group are saved', async () => {
  const e = [...c.entries.npcs.values()][0]
  const ch = npcFromEntry(e)
  const { store } = server({ [ch.id]: sr6ToXml(ch) })
  await mount(createElement(Sr6EditorView, { c, data, cr, id: ch.id, tab: 'stats', npc: true }))
  expect([...document.querySelectorAll('nav.tabs a')].map(a => a.textContent)).toEqual(['Concept', 'Stat block', 'Print'])
  expect(pageText()).toMatch(new RegExp(`Made from ${e.name}`))
  await click(button(/^Raise /))
  await change(field('Group'), 'Made-up crew')
  const printed = document.querySelector<HTMLInputElement>('input[aria-label$=" as printed"]')!
  await change(printed, '7')
  await act(async () => printed.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
  const add = field<HTMLSelectElement>('Add stat')
  const key = [...add.options].find(o => o.value)!.value
  await change(add, key)
  await click(button('Save'))
  const r = xmlToSr6(store.rows.get(ch.id)!.xml)
  if (!r.ok) throw new Error(r.reason)
  expect(r.character.npc?.group).toBe('Made-up crew')
  expect(r.character.npc?.rating).toBe((ch.npc?.rating ?? 0) + 1)
  expect(r.character.npc?.stats[key]).toBe('0')
  expect(Object.values(r.character.npc!.stats)).toContain('7')
})
