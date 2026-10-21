// Your runners (src/ca2/runner-library/ui/Library.tsx) on the made-up catalog: in this browser, a new runner, search and sort, duplicate,
// export, import and delete; on the server, a file that can't be read (repair), another account's runners, campaigns
// and the trash count. Made-up runners throughout.
import { createElement } from 'react'
import { expect, test, vi } from 'vitest'
import { characterToXml } from '../../../src/ca2/formats/domain/charxml'
import { blankCharacter } from '../../../src/ca2/formats/domain/file'
import type { Character } from '../../../src/ca2/formats/domain/types'
import { Me, type User } from '../../../src/core/ui-kit/auth'
import { Library } from '../../../src/ca2/runner-library/ui/Library'
import { ca2Codec } from '../../../src/ca2/formats/domain/charxml'
import { serverRepo } from '../../../src/features/runner-store/repo'
import { RepoContext } from '../../../src/core/ui-kit/repoContext'
import { listCharacters, saveCharacter } from '../../../src/core/ui-kit/storage'
import { cat } from '../../helpers'
import { button, change, click, fakeStore, field, mount, pageText, settle, stubFetch } from '../../ui/dom'

const runner = (streetName: string, fn: (ch: Character) => void = () => {}) => {
  const ch = blankCharacter()
  ch.identity.streetName = streetName
  fn(ch)
  return ch
}
const names = () => [...document.querySelectorAll('.dossier .title')].map(a => a.textContent)
const blobs = () => {
  const made: Blob[] = []
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => (made.push(b), 'blob:made-up'), revokeObjectURL: () => {} }))
  return made
}

test('an empty browser library says how to start; New runner saves one and opens it', async () => {
  stubFetch()
  await mount(createElement(Library, { c: cat }))
  expect(pageText()).toMatch(/No runners yet/)
  await click(button('New runner'))
  await change(field('Metatype'), 'elf')
  await click(button('Create runner'))
  const [ch] = listCharacters()
  expect(ch.identity.metatype).toBe('elf')
  expect(location.hash).toBe(`#/c/${ch.id}/concept`)
})

test('search, sort, duplicate, export and delete in this browser', async () => {
  stubFetch()
  const made = blobs()
  saveCharacter(runner('Made-up Zed', ch => (ch.updatedAt = '2026-01-01T00:00:00Z')))
  saveCharacter(runner('Made-up Ace', ch => (ch.updatedAt = '2026-09-01T00:00:00Z')))
  await mount(createElement(Library, { c: cat }))
  expect(names()).toEqual(['Made-up Ace', 'Made-up Zed'])
  const sort = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'za'))!
  await change(sort, 'za')
  expect(names()).toEqual(['Made-up Zed', 'Made-up Ace'])
  expect(localStorage.getItem('ca2.library.sort')).toBe('za') // remembered
  await change(field('Search runners'), 'ace')
  expect(names()).toEqual(['Made-up Ace'])
  await change(field('Search runners'), '')

  await click(button('Duplicate', document.querySelectorAll('.dossier')[1]))
  expect(names()).toContain('Made-up Ace (copy)')
  await click(button('Export Made-up Ace'))
  expect(made).toHaveLength(1)
  expect(await made[0].text()).toMatch(/streetName="Made-up Ace"/)
  expect(listCharacters().find(c => c.identity.streetName === 'Made-up Ace')?.lastExportedAt).toBeTruthy()

  await click(button('Delete Made-up Zed'))
  await click(button('Delete runner'))
  expect(names()).not.toContain('Made-up Zed')
  expect(listCharacters()).toHaveLength(2)
})

test('import: a runner file is added, an unreadable one says why', async () => {
  stubFetch()
  await mount(createElement(Library, { c: cat }))
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!
  const good = new File([characterToXml(runner('Made-up Import'))], 'import.ca2.xml', { type: 'application/xml' })
  const bad = new File(['not a runner'], 'junk.xml', { type: 'application/xml' })
  Object.defineProperty(input, 'files', { value: [good, bad], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await settle(10)
  expect(pageText()).toMatch(/Imported Made-up Import\./)
  expect(pageText()).toMatch(/junk\.xml: /)
  expect(names()).toEqual(['Made-up Import'])
})

const admin: User = {
  id: 'u1',
  username: 'gm',
  name: 'Made-up GM',
  email: null,
  role: 'admin',
  method: 'password',
  enabled: true,
  created: '2026-01-01',
  lastLogin: null,
}

test('on the server: an unreadable file is listed and repaired, another account’s runner is grouped, campaigns and trash are offered', async () => {
  const mine = runner('Made-up Mine')
  const theirs = runner('Made-up Theirs')
  const broken = characterToXml(runner('Made-up Broken', ch => (ch.identity.background = 'Made-up past'))).replace('Made-up past', 'Made-up & past')
  const store = fakeStore('characters', { [mine.id]: characterToXml(mine), bad: broken })
  const camp = {
    id: 'k1',
    name: 'Made-up Campaign',
    note: '',
    archived: false,
    created: '',
    you: 'gm',
    gms: [{ username: 'gm', name: 'Made-up GM' }],
    members: [],
    runners: [],
  }
  const posted: string[] = []
  stubFetch([
    [
      /\/api\/characters$/,
      () => [
        ...[...store.rows.values()].map(r => ({ ...r, owner: 'gm', ownerName: 'Made-up GM' })),
        { file: 'theirs.xml', rev: 1, xml: characterToXml(theirs), owner: 'pat', ownerName: 'Made-up Pat' },
      ],
    ],
    store.route,
    [/\/api\/trash/, () => ({ user: 'gm', name: 'Made-up GM', items: [{ id: 'x' }] })],
    [/\/api\/campaigns\/k1\/runners/, (url, init) => (posted.push(`${init?.method} ${url}`), {})],
    [/\/api\/campaigns$/, () => [camp]],
    [/\/api\/books$/, () => [{ id: 'B' }]],
  ])
  await mount(
    createElement(Me.Provider, { value: admin }, createElement(RepoContext.Provider, { value: serverRepo(ca2Codec) }, createElement(Library, { c: cat }))),
  )
  expect(pageText()).toMatch(/Couldn’t open Made-up Broken/)
  expect(document.querySelector('section[aria-label="Made-up Pat’s runners"]')?.textContent).toMatch(/Made-up Theirs/)
  expect(pageText()).toMatch(/My runners/)

  await click(button('Try to repair'))
  expect(pageText()).toMatch(/It reads with these changes/)
  await click(button('Save repaired runner'))
  expect(pageText()).toMatch(/Repaired Made-up Broken\./)
  expect([...store.rows.values()].some(r => r.xml.includes('Made-up &amp; past'))).toBe(true)

  await click(button('Add to campaign…', document.querySelector('.dossier:not(.unreadable)')!))
  await click(button('Add to campaign'))
  expect(posted.some(p => p.startsWith('POST'))).toBe(true)
})
