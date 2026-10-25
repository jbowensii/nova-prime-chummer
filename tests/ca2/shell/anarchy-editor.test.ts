// The Anarchy runner editor (src/ca2/shell/ui/EditorView.tsx) on the made-up catalog, saved in this browser (jsdom's localStorage):
// the tabs a player works through, the receipt's balance, autosave, undo, GM approval, Finalize and the ledger. Made-up runner.
import { createElement } from 'react'
import { expect, test, vi } from 'vitest'
import { blankCharacter } from '../../../src/ca2/formats/domain/file'
import { EditorView } from '../../../src/ca2/shell/ui/EditorView'
import { getCharacter, saveCharacter } from '../../../src/core/ui-kit/storage'
import type { Character } from '../../../src/ca2/formats/domain/types'
import { cat } from '../../helpers'
import { button, change, click, field, mount, option, pageText, stubFetch } from '../../ui/dom'

function runner(fn: (ch: Character) => void = () => {}) {
  const ch = blankCharacter()
  ch.identity.streetName = 'Made-up Sprocket'
  fn(ch)
  saveCharacter(ch)
  return ch
}
async function open(ch: Character, tab: string) {
  stubFetch()
  location.hash = `#/c/${ch.id}/${tab}`
  const m = await mount(createElement(EditorView, { c: cat, id: ch.id, tab }))
  return { ...m, tab: (t: string) => m.rerender(createElement(EditorView, { c: cat, id: ch.id, tab: t })) }
}
const left = () => document.querySelector('.receipt .left')?.textContent
const dialog = () => document.querySelector('dialog[open]')!
const section = (title: RegExp) => [...document.querySelectorAll('section')].find(s => title.test(s.querySelector('h3')?.textContent ?? ''))!

test('a missing runner says so', async () => {
  stubFetch()
  await mount(createElement(EditorView, { c: cat, id: 'nope', tab: 'concept' }))
  expect(pageText()).toMatch(/Runner not found/)
})

test('Concept: the street name heads the editor and is saved', async () => {
  const ch = runner()
  await open(ch, 'concept')
  expect(document.querySelector('.who .name')?.textContent).toBe('Made-up Sprocket')
  await change(field('Street name'), 'Made-up Cog')
  expect(document.querySelector('.who .name')?.textContent).toBe('Made-up Cog')
  await change(field('keywords 1'), 'Gearhead')
  await change(field('Background'), 'Grew up in a made-up garage.')
  await click(button('Save'))
  expect(getCharacter(ch.id)?.identity.streetName).toBe('Made-up Cog')
  expect(getCharacter(ch.id)?.narrative.keywords[0]).toBe('Gearhead')
})

test('Attributes: a raise is priced on the receipt, and Undo takes it back', async () => {
  const ch = runner()
  await open(ch, 'attributes')
  const before = left()
  expect(button('Lower Brawn').disabled).toBe(true) // at the metatype's minimum
  await click(button('Raise Brawn'))
  expect((document.querySelector('input[aria-label^="Brawn"]') as HTMLInputElement).value).toBe('2')
  expect(left()).not.toBe(before)
  await click(button('Undo'))
  expect((document.querySelector('input[aria-label^="Brawn"]') as HTMLInputElement).value).toBe('1')
  expect(left()).toBe(before)
  await click(button('Redo'))
  expect((document.querySelector('input[aria-label^="Brawn"]') as HTMLInputElement).value).toBe('2')
})

test('Skills: a rating, a specialization and a knowledge skill', async () => {
  const ch = runner()
  await open(ch, 'skills')
  await click(button('Raise Athletics'))
  expect((document.querySelector('input[aria-label="Athletics"]') as HTMLInputElement).value).toBe('1')
  const spec = field<HTMLSelectElement>('Add a Athletics specialization')
  const first = [...spec.options].find(o => o.value && o.value !== 'custom')!.value
  await change(spec, first)
  await change(field('New knowledge skill'), 'Made-up gang lore')
  await click(button(/^Add knowledge skill/))
  await click(button('Save'))
  const saved = getCharacter(ch.id)!.build
  expect(saved.skills.find(s => s.id === 'athletics')).toMatchObject({ rating: 1, specs: [first] })
  expect(saved.knowledge.map(k => k.name)).toContain('Made-up gang lore')
})

test('Shadow Amps: one from the book through the Amp Builder, one built from a type, then removed', async () => {
  const ch = runner()
  await open(ch, 'amps')
  expect(pageText()).toMatch(/No amps yet/)
  await click(button('Add an amp'))
  await change(field('Search the book’s amps'), 'Keen')
  await click(option('Keen Eye'))
  expect(field('Name', dialog()).value).toBe('Keen Eye')
  await click(button('Add amp'))
  expect(pageText()).toMatch(/Keen Eye/)

  await click(button('Add an amp'))
  await click(button('Trait'))
  await change(field('Name', dialog()), 'Made-up Luck')
  const fx = field<HTMLSelectElement>('Add an effect')
  await change(fx, [...fx.options].find(o => o.value && !o.disabled)!.value)
  await click(button('Add amp'))
  expect(pageText()).toMatch(/Made-up Luck/)
  await click(button('Remove Made-up Luck'))
  expect(pageText()).not.toMatch(/Made-up Luck/)
  await click(button('Save'))
  expect(getCharacter(ch.id)!.build.amps.map(a => a.name)).toEqual(['Keen Eye'])
})

test('Gear: a weapon from the book and a custom one, then one removed', async () => {
  const ch = runner()
  await open(ch, 'gear')
  await click(button('Add from the book', section(/^Weapons/)))
  await click(option('Shiv'))
  expect(pageText(section(/^Weapons/))).toMatch(/Shiv/)
  await click(button('Custom', section(/^Weapons/)))
  await change(field('Name', dialog()), 'Made-up slingshot')
  await click(button(/^Add/, dialog()))
  expect(pageText(section(/^Weapons/))).toMatch(/Made-up slingshot/)
  await click(button('Remove Shiv'))
  expect(pageText(section(/^Weapons/))).not.toMatch(/Shiv/)
  await click(button('Save'))
  expect(getCharacter(ch.id)!.build.items.map(i => i.name)).toContain('Made-up slingshot')
})

test('Review lists the problems; a GM approves them, Finalize opens the ledger, which records earnings, notes and voids', async () => {
  const ch = runner(c => {
    c.build.attributes = { str: 9, agi: 1, wil: 1, log: 1, cha: 1 } // past the metatype's maximum: a problem
  })
  const m = await open(ch, 'review')
  expect(pageText()).toMatch(/Problem/)
  expect(document.querySelector('nav.tabs a[aria-label^="Review,"]')).not.toBeNull()
  expect(button('Finalize runner').disabled).toBe(true)
  for (let b; (b = [...document.querySelectorAll('button')].find(x => x.textContent === 'GM approve'));) {
    await click(b)
    await change(field('Why the GM allows it'), 'Made-up session zero')
    await click(button('Approve'))
  }
  expect(pageText()).toMatch(/GM: Made-up session zero/)
  await click(button('Finalize runner'))
  await click(button('Finalize'))
  expect(location.hash).toBe(`#/c/${ch.id}/ledger`)
  await m.tab('ledger')
  await change(field('Nuyen earned'), '5000')
  await change(field('Run'), 'Made-up milk run')
  await click(button('Record earnings'))
  await click(button('Record it'))
  expect(pageText()).toMatch(/Made-up milk run/)
  await change(field('Note'), 'Met a made-up fixer')
  await click(button('Add note'))
  expect(pageText()).toMatch(/Met a made-up fixer/)
  vi.spyOn(window, 'prompt').mockReturnValue('typo')
  await click(button('Void'))
  expect(pageText()).toMatch(/Voided: typo/)
})
