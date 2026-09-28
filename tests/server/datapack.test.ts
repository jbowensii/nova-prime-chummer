// @vitest-environment node
// Data pack API with the stub worker (tests/fixtures/stub-worker.mjs); datapack-python.test.ts runs the real importer.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServer } from './_signin'

vi.setConfig({ testTimeout: 30000 })

const dir = mkdtempSync(join(tmpdir(), 'ca2-pack-'))
const custom = join(dir, 'custom'), core = join(custom, 'imported', 'core'), library = join(dir, 'library'), backups = join(library, '.backups')
let base = ''
let srv: { close: () => void; stopJobs: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
beforeAll(() => new Promise<void>(ok => {
  cpSync('tests/fixtures/mini/custom/imported/core', core, { recursive: true })
  srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: custom, libraryDir: library,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  srv.listen(0, () => { base = `http://127.0.0.1:${srv.address().port}`; ok() })
}))
afterAll(() => { srv.stopJobs(); srv.close() })

const temps = () => existsSync(backups) ? readdirSync(backups).filter(f => /^pack-/.test(f)) : []
const download = async () => {
  const r0 = await fetch(`${base}/api/datapack`, { method: 'POST' })
  const { token } = await r0.json()
  const r = await fetch(`${base}/api/datapack/${token}`)
  return { r, token, bytes: Buffer.from(await r.arrayBuffer()) }
}
const upload = (body: Buffer | string, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/datapack/import`, { method: 'POST', body, headers: { 'Content-Type': 'application/zip', ...headers } })
const MAGIC = 'PK\x03\x04\n'

test('a pack is made, then downloads once as a dated zip; its folder is gone afterwards', async () => {
  const { r, token, bytes } = await download()
  expect(token).toMatch(/^[0-9a-f]{32}$/)
  expect(r.status).toBe(200)
  expect(r.headers.get('content-disposition')).toBe(`attachment; filename="chummer-anarchy2-datapack-${new Date().toISOString().slice(0, 10)}.zip"`)
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04')
  expect(Object.keys(JSON.parse(bytes.toString().slice(MAGIC.length)).files)).toHaveLength(12)
  await vi.waitFor(() => expect(temps()).toEqual([]))
  expect((await fetch(`${base}/api/datapack/${token}`)).status).toBe(404) // single use
  expect((await fetch(`${base}/api/datapack/nonsense`)).status).toBe(404)
  expect((await fetch(`${base}/api/datapack`)).status).toBe(405)
  expect((await fetch(`${base}/api/datapack/import`)).status).toBe(405)
})

test('upload: the pack’s files replace the core files; the start-up re-import won’t overwrite them', async () => {
  const { bytes } = await download()
  mkdirSync(join(library, 'crb-1'), { recursive: true })
  writeFileSync(join(library, 'crb-1', 'import.xml'), '<import recipe="crb" source="CRB" file="crb.pdf" sha256="abc"><files/><report/></import>\n')
  const pack = JSON.parse(bytes.toString().slice(MAGIC.length))
  pack.files = { 'skills.xml': pack.files['skills.xml'].replace('</ca2:data>', '<!-- from the pack --></ca2:data>') } // a partial pack
  rmSync(join(core, 'lifestyles.xml'))
  const r = await upload(MAGIC + JSON.stringify(pack))
  expect([r.status, await r.json()]).toEqual([200, { files: ['skills.xml'] }])
  expect(readFileSync(join(core, 'skills.xml'), 'utf8')).toContain('from the pack')
  expect(existsSync(join(core, 'lifestyles.xml'))).toBe(false) // a partial pack: the core is still missing a table ...
  expect(readFileSync(join(library, 'crb-1', 'core-rebuild.xml'), 'utf8')).toMatch(/<rebuild sha256="abc" pack="[^"]+" files="skills.xml"\/>/) // no version: the book itself wasn't tried
  // ... and a restart doesn't re-import the core rulebook over the pack
  const restart = async () => {
    const log = join(dir, 'calls.log')
    writeFileSync(log, '')
    vi.stubEnv('STUB_LOG', log)
    const again = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: custom, libraryDir: library,
      python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
    await again.started
    await new Promise(r => setTimeout(r, 300))
    again.stopJobs()
    vi.unstubAllEnvs()
    return readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => l.split(' ').slice(0, 2).join(' '))
  }
  expect(await restart()).toEqual([])
  // once the pack's files are gone, the mark no longer holds: the core rulebook is re-imported
  const saved = readFileSync(join(core, 'skills.xml'))
  rmSync(join(core, 'skills.xml'))
  expect(await restart()).toContain('remove crb-1')
  writeFileSync(join(core, 'skills.xml'), saved)
  // the admin's Re-import of the core rulebook drops its pack mark: the book was chosen over the pack
  const mark = join(library, 'crb-1', 'core-rebuild.xml')
  writeFileSync(mark, '<rebuild sha256="abc" pack="2026-09-28T00:00:00Z" files="skills.xml"/>\n')
  expect((await fetch(`${base}/api/books/crb-1/reimport`, { method: 'POST' })).status).toBe(202)
  expect(existsSync(mark)).toBe(false)
  await vi.waitFor(async () => expect((await (await fetch(`${base}/api/books`)).json()).every((b: { busy: boolean }) => !b.busy)).toBe(true), { timeout: 10000 })
  cpSync('tests/fixtures/mini/custom/imported/core/lifestyles.xml', join(core, 'lifestyles.xml'))
  rmSync(join(library, 'crb-1'), { recursive: true })
})

test('refused uploads say why and change nothing', async () => {
  const before = readFileSync(join(core, 'skills.xml'), 'utf8')
  let r = await upload('not a zip')
  expect([r.status, await r.json()]).toEqual([415, { error: 'this file isn’t a data pack (not a zip file)' }])
  r = await upload(MAGIC + JSON.stringify({ files: { 'notes.xml': '<x/>' } }))
  expect(r.status).toBe(400)
  expect((await r.json()).error).toMatch(/a file a data pack can’t hold: notes\.xml/)
  r = await upload('PK\x03\x04', { 'Content-Length': String(51 * 1024 * 1024) }).catch(() => null) as Response | null
  if (r) expect(r.status).toBe(413) // the server may close the connection before fetch reads the answer
  const big = Buffer.alloc(51 * 1024 * 1024, 'a')
  big.write('PK\x03\x04', 'latin1')
  r = await upload(big).catch(() => null) as Response | null
  if (r) expect([r.status, (await r.json()).error]).toEqual([413, 'the file is larger than 50 MB'])
  expect(readFileSync(join(core, 'skills.xml'), 'utf8')).toBe(before)
  await vi.waitFor(() => expect(temps()).toEqual([]))
})

test('one pack at a time; not while a book imports; a job waits for the pack; not during a restore', async () => {
  const { bytes } = await download()
  const first = upload(bytes)
  await vi.waitFor(() => expect(temps()).toHaveLength(1))
  expect((await upload(bytes)).status).toBe(409)
  expect((await fetch(`${base}/api/datapack`, { method: 'POST' })).status).toBe(409)
  // a book uploaded meanwhile is queued, and starts after the pack
  const book = await fetch(`${base}/api/books`, { method: 'POST', body: '%PDF-1.4 slow', headers: { 'Content-Type': 'application/pdf', 'X-Filename': 'b.pdf' } })
  expect(book.status).toBe(202)
  const { id } = await book.json()
  expect((await (await fetch(`${base}/api/books`)).json()).find((b: { id: string }) => b.id === id).state).toBe('queued')
  expect((await first).status).toBe(200)
  await vi.waitFor(async () => expect((await (await fetch(`${base}/api/books`)).json()).find((b: { id: string }) => b.id === id).state).toBe('done'), { timeout: 10000 })
  // while a job runs, a pack is refused
  const slow = await fetch(`${base}/api/books`, { method: 'POST', body: '%PDF-1.4 slow', headers: { 'Content-Type': 'application/pdf', 'X-Filename': 'c.pdf' } })
  expect(slow.status).toBe(202)
  const busy = await upload(bytes)
  expect([busy.status, (await busy.json()).error]).toEqual([409, 'a book is being imported or read by AI; try again when it’s done'])
  const made = await fetch(`${base}/api/datapack`, { method: 'POST' }) // nor made: it could mix old and new tables
  expect([made.status, (await made.json()).error]).toEqual([409, 'a book is being imported or read by AI; try again when it’s done'])
  await vi.waitFor(async () => expect((await (await fetch(`${base}/api/books`)).json()).every((b: { busy: boolean }) => !b.busy)).toBe(true), { timeout: 10000 })
  // a pack import is a counted write: a restore can't start under it
  const pending = upload(bytes)
  await vi.waitFor(() => expect(temps()).toHaveLength(1))
  const backup = await fetch(`${base}/api/backup`, { method: 'POST' }) // nor a backup: it would copy the swap's folders
  expect([backup.status, (await backup.json()).error]).toEqual([409, 'a data pack is being made or loaded; try again when it’s done'])
  const restore = await fetch(`${base}/api/restore/${'0'.repeat(32)}`, { method: 'POST' })
  expect(restore.status).toBe(409)
  expect((await pending).status).toBe(200)
  // nor while a backup is being made (the stub's takes 300 ms)
  const zipping = fetch(`${base}/api/backup`, { method: 'POST' })
  await vi.waitFor(() => expect(readdirSync(backups).some(f => f.startsWith('download-'))).toBe(true))
  const during = await upload(bytes)
  expect([during.status, (await during.json()).error]).toEqual([409, 'a backup is being made; try again when it’s done'])
  await zipping
})

test('no core data: the pack is refused with the reason', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'ca2-pack-empty-'))
  const s = createServer({ staticDir: 'public', charDir: join(empty, 'chars'), customDir: join(empty, 'custom'), libraryDir: join(empty, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  await new Promise<void>(ok => s.listen(0, ok))
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/datapack`, { method: 'POST' })
    expect([r.status, (await r.json()).error]).toEqual([409, 'there is no core data to put in a pack. Import the core rulebook first'])
  } finally { s.stopJobs(); s.close() }
})
