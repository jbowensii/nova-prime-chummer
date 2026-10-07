// @vitest-environment node
// Books → Re-import all (POST /api/books/reimport-all, /api/sr6/books/reimport-all) with the stub worker: every book
// folder with its PDF is queued as a single re-import would be, a folder holding only original.pdf and its upload record
// imports from scratch, and a book read by AI, one without its PDF and a busy one are left out, saying why. Made-up files.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServer } from './_signin'

vi.setConfig({ testTimeout: 30000 })
const dir = mkdtempSync(join(tmpdir(), 'ca2-reimport-all-'))
const custom = join(dir, 'custom'), library = join(dir, 'library')
let base = '', srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

const PDF = Buffer.concat([Buffer.from('%PDF-1.4 made up\n'), Buffer.alloc(256)])
/** a book folder as an upload leaves it: original.pdf and upload.xml, nothing imported yet (`more`: other files) */
function folder(lib: string, id: string, { pdf = true, more = {} as Record<string, string> } = {}) {
  mkdirSync(join(lib, id), { recursive: true })
  if (pdf) writeFileSync(join(lib, id, 'original.pdf'), PDF)
  writeFileSync(join(lib, id, 'upload.xml'), `<upload file="${id}.pdf" size="273" sha256="00" uploaded="2026-10-06T00:00:00Z"/>\n`)
  for (const [f, xml] of Object.entries(more)) writeFileSync(join(lib, id, f), xml)
}

beforeAll(() => new Promise<void>(ok => {
  folder(library, 'a1-only-pdf')
  folder(library, 'a2-read-by-ai', { more: { 'import.xml': '<import recipe="ai" source="MADE" file="a2.pdf" sha256="00"><files/><report/></import>' } })
  folder(library, 'a3-no-pdf', { pdf: false, more: { 'status.xml': '<status state="removed" updated="2026-10-06T00:00:00Z"></status>' } })
  folder(join(library, 'sr6'), 's1-only-pdf')
  srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: custom, libraryDir: library,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  srv.listen(0, () => { base = `http://127.0.0.1:${srv.address().port}`; ok() })
}))
afterAll(() => srv.close())

type Book = { id: string; state: string; source?: string; busy: boolean }
const list = async (api: string): Promise<Book[]> => (await fetch(`${base}/api/${api}`)).json()
async function done(api: string, id: string) {
  await vi.waitFor(async () => expect((await list(api)).find(b => b.id === id)).toMatchObject({ state: 'done', busy: false }), { timeout: 20000, interval: 50 })
  return (await list(api)).find(b => b.id === id)!
}

test('Anarchy: a folder with only its PDF imports from scratch; one read by AI and one without its PDF are left out', async () => {
  const r = await fetch(`${base}/api/books/reimport-all`, { method: 'POST' })
  expect(r.status).toBe(202)
  expect(await r.json()).toEqual({ queued: ['a1-only-pdf'], skipped: [{ id: 'a2-read-by-ai', why: 'read by AI' }, { id: 'a3-no-pdf', why: 'no PDF' }] })
  expect((await done('books', 'a1-only-pdf')).source).toBe('STUB')
})

test('a busy book is left out of a second Re-import all', async () => {
  const [first, second] = await Promise.all([fetch(`${base}/api/books/reimport-all`, { method: 'POST' }), fetch(`${base}/api/books/reimport-all`, { method: 'POST' })])
  const bodies = [await first.json(), await second.json()] as { queued: string[]; skipped: { id: string; why: string }[] }[]
  expect(bodies.map(b => b.queued.length).sort()).toEqual([0, 1])
  expect(bodies.find(b => !b.queued.length)!.skipped).toContainEqual({ id: 'a1-only-pdf', why: 'busy' })
  await done('books', 'a1-only-pdf')
})

test('Shadowrun 6: its own books only, the same way', async () => {
  const r = await fetch(`${base}/api/sr6/books/reimport-all`, { method: 'POST' })
  expect(await r.json()).toEqual({ queued: ['s1-only-pdf'], skipped: [] })
  expect((await done('sr6/books', 's1-only-pdf')).source).toBe('CRB')
  expect((await fetch(`${base}/api/books/reimport-all`, { method: 'PUT' })).status).toBe(405)
  expect(await (await fetch(`${base}/api/books/reimport-all`)).json()).toEqual({ queued: [], skipped: [] }) // nothing running
})
