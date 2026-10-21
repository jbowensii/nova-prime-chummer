// The Books page (src/ui/Books.tsx) over a stand-in server: each book's state and counts, the report, re-import, remove
// (with its files), Re-import all with its progress line, the AI import's confirmation (no key: where to add one) and the
// supported books list; SR6's page; and the browser-only build saying it needs the server. Made-up books.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import type { Book } from '../../src/ui/Books'
import { BooksScreen } from '../../src/ui/Books'
import { ca2Codec } from '../../src/engine/charxml'
import { serverRepo } from '../../src/ui/repo'
import { RepoContext } from '../../src/ui/repoContext'
import { cat } from '../helpers'
import { button, change, click, mount, pageText, stubFetch } from './dom'

const book = (b: Partial<Book> & { id: string; state: string }): Book => ({ message: '', counts: {}, busy: false, ...b })
const BOOKS = [
  book({ id: 'b1', name: 'Made-up Core', file: 'core.pdf', source: 'MUC', state: 'done', recipe: 'crb', counts: { 'amps.xml': 3, 'spells.xml': 1 } }),
  book({ id: 'b2', file: 'broken.pdf', state: 'failed', message: 'Made-up failure' }),
  book({ id: 'b3', file: 'mystery.pdf', state: 'needs-ai', message: 'No recipe knows this book' }),
]
const SOURCES =
  '<sources><source id="MUC" canon="true"><name>Made-up Core</name></source><source id="MUX" canon="false"><name>Made-up Extra</name></source></sources>'

function server(books: Book[] = BOOKS, provider: string | null = null) {
  return stubFetch([
    [/\/api\/books\/b1\/report$/, () => '<report><row kind="amp" name="Made-up Amp" note="no rating printed"/></report>'],
    [
      /\/api\/books\/reimport-all$/,
      (_, i) => (i?.method === 'POST' ? { queued: ['b1'], skipped: [{ id: 'b3', why: 'read by AI' }] } : { queued: [], skipped: [] }),
    ],
    [/\/api\/books\/b3\/ai\?dryRun=1$/, () => ({ parts: 4, provider })],
    [/\/api\/ai-settings$/, () => `<ai><key provider="${provider}" set="true"/></ai>`],
    [/\/api\/books\/[^/]+(\/reimport|\?files=1)?$/, () => ({})],
    [/\/api\/books$/, () => books],
    [/\/api\/sr6\/books$/, () => [book({ id: 's1', name: 'Made-up Sixth', source: 'MU6', state: 'done', counts: { 'weapons.xml': 2 } })]],
    [/\/api\/sr6\/books\/reimport-all$/, () => ({ queued: [], skipped: [] })],
    [/data\/(sr6\/)?sources\.xml$/, () => SOURCES],
  ])
}
const on = (node: ReturnType<typeof createElement>) => createElement(RepoContext.Provider, { value: serverRepo(ca2Codec) }, node)
const row = (name: RegExp) => [...document.querySelectorAll('.book')].find(b => name.test(b.textContent ?? ''))!

test('without the server the page says importing needs it', async () => {
  stubFetch()
  await mount(createElement(BooksScreen, { c: cat, reload: () => {} }))
  expect(pageText()).toMatch(/Importing books needs the app’s server/)
})

test('each book shows its state; the report, re-import and remove (with its files) go to the server', async () => {
  const calls = server()
  await mount(on(createElement(BooksScreen, { c: cat, reload: () => {} })))
  expect(row(/Made-up Core/).textContent).toMatch(/Imported.*recipe crb.*3 amps, 1 spell/)
  expect(row(/broken\.pdf/).textContent).toMatch(/Failed.*Made-up failure/)
  expect(row(/mystery\.pdf/).textContent).toMatch(/Needs AI/)
  expect([...document.querySelectorAll('.supported li')].map(l => l.textContent)).toEqual([
    expect.stringMatching(/^MUC Made-up Core.*Imported$/),
    expect.stringMatching(/^MUX Made-up Extra.*Not yet$/),
  ])

  await click(button('Report', row(/Made-up Core/)))
  expect(pageText(document.querySelector('dialog[open]')!)).toMatch(/kind amp.*name Made-up Amp.*note no rating printed/)

  await click(button('Re-import', row(/broken\.pdf/)))
  expect(calls.some(x => x.init?.method === 'POST' && x.url.endsWith('/api/books/b2/reimport'))).toBe(true)

  await click(button('Remove', row(/broken\.pdf/)))
  await change(document.querySelector<HTMLInputElement>('dialog[open] input[type=checkbox]')!, true)
  await click(button('Remove book'))
  expect(calls.some(x => x.init?.method === 'DELETE' && x.url.endsWith('/api/books/b2?files=1'))).toBe(true)
})

test('Re-import all asks first, then follows the books it queued and names the ones it left out', async () => {
  const calls = server()
  await mount(on(createElement(BooksScreen, { c: cat, reload: () => {} })))
  await click(button('Re-import all books'))
  expect(pageText(document.querySelector('dialog[open]')!)).toMatch(/Re-import all 3 books\?/)
  await click(button('Re-import all'))
  expect(calls.some(x => x.init?.method === 'POST' && x.url.endsWith('/api/books/reimport-all'))).toBe(true)
  expect(document.querySelector('progress[aria-label="Re-import all books"]')).not.toBeNull()
  expect(pageText()).toMatch(/mystery\.pdf.*read by AI/)
})

test('Extract with AI: without a key it says where to add one; with one it confirms the parts and sends', async () => {
  server(BOOKS, 'anthropic')
  await mount(on(createElement(BooksScreen, { c: cat, reload: () => {} })))
  await click(button('Extract with AI', row(/mystery\.pdf/)))
  expect(pageText(document.querySelector('dialog[open]')!)).toMatch(/It goes in 4 parts/)
  await click(button('Send to Anthropic'))

  server(BOOKS, null)
  await mount(on(createElement(BooksScreen, { c: cat, reload: () => {} })))
  await click(button('Extract with AI', [...document.querySelectorAll('.book')].filter(b => /mystery/.test(b.textContent ?? ''))[1]))
  expect(pageText(document.querySelector('dialog[open]')!)).toMatch(/No AI provider is chosen yet/)
})

test('the SR6 page lists its books by kind, with no AI', async () => {
  server()
  await mount(on(createElement(BooksScreen, { reload: () => {}, game: 'sr6' })))
  expect(row(/Made-up Sixth/).textContent).toMatch(/Imported/)
  expect(pageText()).not.toMatch(/Extract with AI/)
})
