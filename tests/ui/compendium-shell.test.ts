// The compendium page shell both games share (src/ui/CompendiumShell.tsx): the adapter's `taken` alone decides the inline
// "X is already a source" refusal in New compendium, and the Books list leaves out the sources compendiums cite.
// Made-up sources; no fetch.
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { DetailsDialog, shelf, type CompBase, type CompGame } from '../../src/ui/CompendiumShell'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })

const adapter = (taken: (s: string) => boolean): CompGame<CompBase> => ({
  game: 'sr6', href: '#/sr6/compendiums', intro: '', list: async () => ({ comps: [], bad: [] }), blank: m => ({ ...m, npcs: [] }),
  save: async () => ({ ok: true, rev: 1 }), remove: async () => {}, books: [], taken, loaded: () => true, count: () => 0, cite: () => null,
})

async function typeSource(taken: (s: string) => boolean, value: string) {
  // jsdom's <dialog> may lack showModal: open it by hand
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.open = true }
  const el = document.body.appendChild(document.createElement('div'))
  const root = createRoot(el)
  await act(async () => root.render(createElement(DetailsDialog<CompBase>, { g: adapter(taken), comp: null, campaigns: [], onClose: () => {}, onSaved: async () => {} })))
  const input = [...el.querySelectorAll('input')].find(i => i.placeholder === 'STREET')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const text = el.querySelector('#comp-src-err')?.textContent ?? null
  root.unmount()
  return text
}

test('New compendium: the adapter’s taken() drives the inline refusal, not any catalog', async () => {
  expect(await typeSource(s => s === 'STREET', 'street')).toBe('STREET is already a source; choose another id.')
  expect(await typeSource(() => false, 'STREET')).toBeNull()
  expect(await typeSource(() => false, '9X')).toBe('A source id starts with a letter and uses only A–Z, 0–9 and hyphens.')
})

test('Books: none a listed compendium cites, by name', () => {
  const book = (id: string, name: string) => ({ id, name, publisher: 'Made-up Press', canon: true })
  const comp = { id: '0123456789ab', name: 'Kit', source: 'STREET', sharing: 'private' as const, npcs: [] }
  expect(shelf([book('ZED', 'Zed Book'), book('STREET', 'Clash'), book('ABC', 'Alpha Book')], [comp]).map(b => b.id)).toEqual(['ABC', 'ZED'])
})
