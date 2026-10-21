// Anarchy's NPCs & Critters (src/ui/Npcs.tsx): a new NPC or critter in its section, the imported books' NPCs loaded
// once, import (a runner file is refused), search, delete; on the server, sharing with a campaign the GM runs.
// Made-up NPCs and the made-up fixture's book NPC.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { characterToXml } from '../../src/engine/charxml'
import { blankCharacter } from '../../src/engine/file'
import { blankNpc } from '../../src/engine/npc'
import type { User } from '../../src/core/ui-kit/auth'
import { Me } from '../../src/core/ui-kit/auth'
import { NpcsScreen } from '../../src/ui/Npcs'
import { ca2Codec } from '../../src/engine/charxml'
import { serverRepo } from '../../src/features/runner-store/repo'
import { RepoContext } from '../../src/core/ui-kit/repoContext'
import { listCharacters, NPC_KEY, saveCharacter } from '../../src/core/ui-kit/storage'
import { cat } from '../helpers'
import { button, change, click, fakeStore, field, mount, pageText, settle, stubFetch } from './dom'

const GOON = readFileSync('tests/fixtures/mini/custom/imported/testc/npcs/testc.npc-made-up-goon.xml', 'utf8')
const names = () => [...document.querySelectorAll('.dossier .title')].map(a => a.textContent)
const npc = (name: string, kind: 'npc' | 'critter' = 'npc') => {
  const ch = blankNpc(kind, 'regular', kind === 'npc' ? 'human' : '')
  ch.identity.streetName = name
  return ch
}

test('a new NPC is saved in this browser’s NPC store and opens in the editor; a critter goes to its own section', async () => {
  stubFetch()
  await mount(createElement(NpcsScreen, { c: cat }))
  await click(button('New NPC'))
  await change(field('Tier'), 'prime')
  await click(button('Create NPC'))
  const [ch] = listCharacters(NPC_KEY)
  expect(ch.npc).toMatchObject({ kind: 'npc', tier: 'prime' })
  expect(location.hash).toBe(`#/n/${ch.id}/concept`)
  expect(listCharacters()).toHaveLength(0) // never on the runner list

  saveCharacter(npc('Made-up Hound', 'critter'), NPC_KEY)
  await mount(createElement(NpcsScreen, { c: cat, section: 'critters' }))
  expect(names()).toEqual(['Made-up Hound'])
})

test('Load book NPCs copies each once; import refuses a runner; search and delete', async () => {
  stubFetch([
    [/custom\/imported\/npcs\.xml$/, () => readFileSync('tests/fixtures/mini/custom/imported/npcs.xml', 'utf8')],
    [/testc\.npc-made-up-goon\.xml$/, () => GOON],
  ])
  saveCharacter(npc('Made-up Fixer'), NPC_KEY)
  await mount(createElement(NpcsScreen, { c: cat }))
  await click(button('Load book NPCs'))
  await settle(10)
  expect(pageText()).toMatch(/Loaded 1 · already there 0 · failed 0\./)
  expect(names()).toEqual(['Made-up Fixer', 'Made-Up Goon'])
  await click(button('Load book NPCs'))
  await settle(10)
  expect(pageText()).toMatch(/Loaded 0 · already there 1/)

  const input = document.querySelector<HTMLInputElement>('input[type=file]')!
  const runner = blankCharacter()
  runner.identity.streetName = 'Made-up Runner'
  Object.defineProperty(input, 'files', {
    value: [new File([characterToXml(runner)], 'runner.xml'), new File([characterToXml(npc('Made-up Thug'))], 'thug.xml')],
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await settle(10)
  expect(pageText()).toMatch(/Imported Made-up Thug\./)
  expect(pageText()).toMatch(/runner\.xml: this is a runner, not an NPC/)

  await change(field('Search npcs'), 'thug')
  expect(names()).toEqual(['Made-up Thug'])
  await click(button('Delete Made-up Thug'))
  await click(button(/^Delete/, document.querySelector('dialog[open]')!))
  await change(field('Search npcs'), '')
  expect(names()).not.toContain('Made-up Thug')
})

const gm: User = { id: 'u', username: 'gm', name: 'Made-up GM', email: null, role: 'editor', method: 'password', enabled: true, created: '', lastLogin: null }

test('on the server a GM shares an NPC with a campaign they run', async () => {
  const fixer = npc('Made-up Fixer')
  const store = fakeStore('npcs', { [fixer.id]: characterToXml(fixer) })
  const camp = { id: 'k1', name: 'Made-up Run', note: '', archived: false, created: '', you: 'gm', gms: [], members: [], runners: [] }
  const calls = stubFetch([
    [/\/api\/campaigns\/k1\/npcs/, () => ({})],
    [/\/api\/campaigns$/, () => [camp]],
    [/\/api\/npcs\/trash/, () => ({ user: 'gm', name: 'Made-up GM', items: [] })],
    [/\/api\/compendiums/, () => []],
    store.route,
  ])
  await mount(
    createElement(Me.Provider, { value: gm }, createElement(RepoContext.Provider, { value: serverRepo(ca2Codec) }, createElement(NpcsScreen, { c: cat }))),
  )
  expect(names()).toEqual(['Made-up Fixer'])
  await click(button('Share Made-up Fixer…'))
  await click(button(/^Share/, document.querySelector('dialog[open]')!))
  expect(calls.some(x => x.init?.method === 'POST' && /campaigns\/k1\/npcs/.test(x.url))).toBe(true)
  expect(pageText()).toMatch(/Made-up Fixer is shared with Made-up Run\./)
})
