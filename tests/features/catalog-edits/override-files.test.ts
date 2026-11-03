// Override files: an edits file is built from the edits layer (all of it, or one book's, with each description), read back
// into a preview (new, changed, conflicting, same, left out), and only the chosen entries are saved. Made-up game.
import { createElement } from 'react'
import { expect, test, vi } from 'vitest'

const saved = vi.hoisted(() => ({ files: [] as { name: string; text: string }[] }))
vi.mock('../../../src/core/ui-kit/download', () => ({ downloadFile: (name: string, text: string) => void saved.files.push({ name, text }) }))

import { buildExport, OverrideFiles, readImport, type OverrideGame } from '../../../src/features/catalog-edits/OverrideFiles'
import { button, change, click, field, mount, pageText, settle, stubFetch } from '../../ui/dom'

const NS = 'urn:toy:data:1'
const EDITS = `<toy:data xmlns:toy="${NS}" kind="edits" version="1">
  <gadget id="a.one" source="AAA" cost="5"><name>One</name><text/></gadget>
  <gadget id="b.two" source="BBB" cost="7"><name>Two</name></gadget>
</toy:data>`
const TEXTS = `<texts><t of="gadget" id="a.one">Its own words.</t></texts>`
const current = new Map([
  ['gadget a.one', { xml: '<gadget id="a.one" cost="5"><name>One</name></gadget>', edited: true, text: 'Its own words.' }],
  ['gadget b.two', { xml: '<gadget id="b.two" cost="6"><name>Two</name></gadget>', edited: false, text: '' }],
  ['gadget c.three', { xml: '<gadget id="c.three" cost="1"><name>Three</name></gadget>', edited: true, text: 'old' }],
])
const g: OverrideGame = {
  dir: 'custom/edits/',
  api: 'edits',
  ns: NS,
  prefix: 'toy',
  tags: { gadget: 'gadget' },
  descTag: () => 'text',
  strip: ['formula'],
  current: (k, id) => current.get(`${k} ${id}`),
  books: [
    { id: 'AAA', name: 'Book A' },
    { id: 'BBB', name: 'Book B' },
  ],
  file: 'toy-edits',
}
const files = () => [[/edits\.xml$/, () => EDITS] as const, [/texts\.xml$/, () => TEXTS] as const].map(([re, f]) => [re, f] as [RegExp, () => string])

test('the export holds every edit with its own description, or only one book’s', async () => {
  stubFetch(files())
  const all = await buildExport(g, '')
  expect(all.count).toBe(2)
  expect(all.xml).toContain('Its own words.')
  const a = await buildExport(g, 'AAA')
  expect(a.count).toBe(1)
  expect(a.xml).toContain('a.one')
  expect(a.xml).not.toContain('b.two')
  expect((await buildExport(g, 'ZZZ')).count).toBe(0)
})

test('with no edits on the server the export is an empty edits file; an unreadable one is refused', async () => {
  stubFetch([[/edits\.xml$/, () => new Response('', { status: 404 })]])
  expect((await buildExport(g, '')).count).toBe(0)
  stubFetch([[/edits\.xml$/, () => '<toy:data']])
  await expect(buildExport(g, '')).rejects.toThrow('can’t be read')
})

test('an imported file is read into what saving each entry would do', () => {
  const xml = `<toy:data xmlns:toy="${NS}" kind="edits" version="1">
    <gadget id="a.one" cost="5" by="me"><name>One</name><text>Its own words.</text></gadget>
    <gadget id="b.two" cost="9"><name>Two</name><formula field="x">1</formula></gadget>
    <gadget id="c.three" cost="1"><name>Three</name><text>new words</text></gadget>
    <gadget id="n.ew" cost="1"><name>Newbie</name></gadget>
    <widget id="w.1"><name>Odd</name></widget>
    <gadget><name>No id</name></gadget>
  </toy:data>`
  const r = readImport(g, xml)
  if (!('rows' in r)) throw new Error(r.error)
  expect(r.rows.map(x => [x.id, x.status])).toEqual([
    ['a.one', 'same'],
    ['b.two', 'changed'],
    ['c.three', 'conflict'],
    ['n.ew', 'added'],
    ['w.1', 'skip'],
    ['', 'skip'],
  ])
  expect(r.rows[1].fields).toEqual(['cost'])
  expect(r.rows[2].fields).toEqual(['description'])
  expect(r.rows[3].body).toContain('<edit>')
})

test('a file that is not this game’s edits file is refused with a reason', () => {
  for (const bad of ['<toy:data', `<toy:data xmlns:toy="urn:other" kind="edits"/>`, `<toy:data xmlns:toy="${NS}" kind="books"/>`])
    expect(readImport(g, bad)).toHaveProperty('error', expect.stringContaining('isn’t an edits file of this game'))
})

test('the Export dialog downloads a file named for the book, and says when there is nothing to export', async () => {
  stubFetch(files())
  await mount(createElement(OverrideFiles, { g, reload: async () => {} }))
  await click(button('Export my edits…'))
  await change(document.querySelector('select')!, 'AAA')
  await click(button('Export'))
  expect(saved.files.at(-1)!.name).toBe('toy-edits-aaa.xml')
  expect(pageText()).toContain('Exported 1 edit.')
  await click(button('Export my edits…'))
  await change(document.querySelector('select')!, '')
  await click(button('Export'))
  expect(pageText()).toContain('Exported 2 edits.')
  stubFetch([[/edits\.xml$/, () => new Response('', { status: 404 })]])
  await click(button('Export my edits…'))
  await click(button('Export'))
  expect(pageText()).toContain('No edits to export yet.')
})

const IMPORT = `<toy:data xmlns:toy="${NS}" kind="edits" version="1">
  <gadget id="b.two" cost="9"><name>Two</name></gadget>
  <gadget id="c.three" cost="2"><name>Three</name></gadget>
  <gadget id="n.ew" cost="1"><name>Newbie</name></gadget>
  <gadget id="a.one" cost="5"><name>One</name><text>Its own words.</text></gadget>
</toy:data>`
const pick = async (name: string, text: string, size?: number) => {
  const input = field('Import edits')
  const f = new File([text], name, { type: 'application/xml' })
  if (size) Object.defineProperty(f, 'size', { value: size })
  Object.defineProperty(input, 'files', { value: [f], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await settle(6)
}

test('an import previews every entry, saves new and changed ones plus the conflicts taken, and lists what the server refused', async () => {
  const calls = stubFetch([
    [/\/api\/edits\/gadget\/n\.ew$/, () => new Response('{"error":"bad cost"}', { status: 400 })],
    [/\/api\/edits\//, () => ({})],
  ])
  const reload = vi.fn(async () => {})
  await mount(createElement(OverrideFiles, { g, reload }))
  await pick('mine.xml', IMPORT)
  expect(pageText()).toContain('1 new, 1 changing the book, 1 conflicting with your edits, 1 the same as yours')
  expect(pageText()).toContain('Conflicts with your edit: cost')
  expect(pageText()).toContain('Save 2 edits')
  await change(field('Three: keep'), 'theirs')
  expect(pageText()).toContain('Save 3 edits')
  await change(field('Three: keep'), 'mine')
  await change(field('Three: keep'), 'theirs')
  await click(button('Save 3 edits'))
  expect(calls.filter(c => c.init?.method === 'PUT').map(c => c.url)).toEqual([
    './api/edits/gadget/b.two',
    './api/edits/gadget/c.three',
    './api/edits/gadget/n.ew',
  ])
  expect(reload).toHaveBeenCalled()
  expect(pageText()).toContain('Saved 2 edits from mine.xml.')
  expect(pageText()).toContain('Newbie: bad cost')
})

test('an import that is too big, not an edits file, or has nothing to save says so', async () => {
  stubFetch()
  await mount(createElement(OverrideFiles, { g, reload: async () => {} }))
  await pick('huge.xml', '<x/>', 5 * 1024 * 1024)
  expect(pageText()).toContain('huge.xml is larger than 4 MB')
  await pick('junk.xml', 'not xml')
  expect(pageText()).toContain('Can’t import junk.xml')
  await pick(
    'same.xml',
    `<toy:data xmlns:toy="${NS}" kind="edits" version="1"><gadget id="a.one" cost="5"><name>One</name><text>Its own words.</text></gadget></toy:data>`,
  )
  expect(pageText()).toContain('1 the same as yours')
  expect(button('Nothing to save').disabled).toBe(true)
  await click(button('Cancel'))
})
