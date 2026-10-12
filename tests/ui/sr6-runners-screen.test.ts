// SR6's Your runners (src/sr6/ui/Runners.tsx) over a stand-in server store: a new runner by creation method, search and
// sort, the problem count on each, examples from the imported samples list, import, export, a campaign, delete, and the
// legacy-account banner. Made-up runners and fixture data.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { expect, test, vi } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import { Sr6Runners } from '../../src/sr6/ui/Runners'
import { fixtureCatalog, made } from '../sr6/fixture'
import { button, change, click, fakeStore, field, mount, pageText, settle, stubFetch } from './dom'

const c = fixtureCatalog()
const { data, cr } = made()
const runner = (id: string, streetName: string, updatedAt = '2026-09-01T00:00:00.000Z') => {
  const ch = blankSr6('priority', id, updatedAt)
  ch.identity.streetName = streetName
  return ch
}
const names = () => [...document.querySelectorAll('.dossier .title')].map(a => a.textContent)
const page = () => createElement(Sr6Runners, { c, data, cr })
const camp = { id: 'k1', name: 'Made-up Run', note: '', archived: false, created: '', you: 'gm', gms: [], members: [], runners: [] }

function server(files: Sr6Character[] = [], extra: Parameters<typeof stubFetch>[0] = []) {
  const store = fakeStore('sr6/characters', Object.fromEntries(files.map(ch => [ch.id, sr6ToXml(ch)])))
  const calls = stubFetch([
    ...extra,
    store.route,
    [/\/api\/sr6\/trash/, () => ({ user: 'me', name: 'Me', items: [] })],
    [/\/api\/sr6\/campaigns\/k1\/runners/, () => ({})],
    [/\/api\/sr6\/campaigns$/, () => [camp]],
  ])
  return { store, calls }
}
const stored = (store: ReturnType<typeof fakeStore>) =>
  [...store.rows.values()].map(r => {
    const x = xmlToSr6(r.xml)
    if (!x.ok) throw new Error(x.reason)
    return x.character
  })

test('New runner: a street name and a method the settings allow; it opens on Concept', async () => {
  const { store } = server()
  await mount(page())
  expect(pageText()).toMatch(/No runners yet|Start a new one/)
  await click(button('New runner'))
  await change(field('Street name'), 'Made-up Spark')
  await click(button('Create runner'))
  const [ch] = stored(store)
  expect(ch.identity.streetName).toBe('Made-up Spark')
  expect(location.hash).toBe(`#/sr6/c/${ch.id}/concept`)
})

test('the list: sort, search, a blank runner’s summary, export, campaign and delete', async () => {
  const made: Blob[] = []
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => (made.push(b), 'blob:made-up'), revokeObjectURL: () => {} }))
  const { store, calls } = server([runner('r1', 'Made-up Ace', '2026-01-01T00:00:00.000Z'), runner('r2', 'Made-up Zed', '2026-09-01T00:00:00.000Z')])
  await mount(page())
  expect(names()).toEqual(['Made-up Ace', 'Made-up Zed'])
  const sort = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'recent'))!
  await change(sort, 'recent')
  expect(names()).toEqual(['Made-up Zed', 'Made-up Ace'])
  await change(field('Search runners'), 'zed')
  expect(names()).toEqual(['Made-up Zed'])
  await change(field('Search runners'), '')
  expect(document.querySelector('.dossier .meta')?.textContent).toMatch(/^No metatype yet, Priority/)

  await click(button('Export Made-up Ace'))
  expect(made.length).toBe(1)
  expect(stored(store).find(ch => ch.id === 'r1')?.lastExportedAt).toBeTruthy()

  await click(button('Add to campaign…', document.querySelector('.dossier')!))
  await click(button('Add to campaign'))
  expect(calls.some(x => x.init?.method === 'POST' && /campaigns\/k1\/runners/.test(x.url))).toBe(true)

  await click(button('Delete Made-up Zed'))
  await click(button(/^Delete/, document.querySelector('dialog[open]')!))
  expect(stored(store).map(ch => ch.id)).toEqual(['r1'])
})

test('Load example characters copies each imported sample once; import adds a file and refuses an Anarchy one', async () => {
  const sample = readFileSync('tests/fixtures/sr6/sample-glow-runner.xml', 'utf8')
  const { store } = server(
    [],
    [
      [/samples\.xml$/, () => '<samples><sample href="crb/glow.xml" name="Made-up Glow" source="CRB"/></samples>'],
      [/imported\/crb\/glow\.xml$/, () => sample],
    ],
  )
  await mount(page())
  await click(button('Load example characters'))
  await settle(5)
  expect(pageText()).toMatch(/Added 1 example character\./)
  expect(stored(store)[0].sampleKey).toBe('CRB|glow')
  await click(button('Load example characters'))
  await settle(5)
  expect(pageText()).toMatch(/already in your runners/)

  const input = document.querySelector<HTMLInputElement>('input[type=file]')!
  const mine = new File([sr6ToXml(runner('imp', 'Made-up Import'))], 'imp.xml')
  const anarchy = new File(['<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" id="a"/>'], 'anarchy.xml')
  Object.defineProperty(input, 'files', { value: [mine, anarchy], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await settle(10)
  expect(pageText()).toMatch(/Imported Made-up Import\./)
  expect(pageText()).toMatch(/anarchy\.xml: This is a Shadowrun Anarchy runner/)
})

test('a server whose sr6 account is in the way shows the legacy banner and blocks New runner', async () => {
  stubFetch([[/\/api\/sr6\/characters$/, () => new Response('{}', { status: 409 })]])
  await mount(page())
  expect(pageText()).toMatch(/An account called sr6 is in the way/)
  expect(button('New runner').disabled).toBe(true)
})
