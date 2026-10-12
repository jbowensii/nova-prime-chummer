// @vitest-environment node
// Data pack API with the stub worker (tests/fixtures/stub-worker.mjs); datapack-python.test.ts runs the real importer.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServer } from './_signin'

vi.setConfig({ testTimeout: 30000 })

const dir = mkdtempSync(join(tmpdir(), 'ca2-pack-'))
const custom = join(dir, 'custom'),
  core = join(custom, 'imported', 'core'),
  library = join(dir, 'library'),
  backups = join(library, '.backups')
let base = ''
let srv: { close: () => void; stopJobs: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
beforeAll(
  () =>
    new Promise<void>(ok => {
      cpSync('tests/fixtures/mini/custom/imported/core', core, { recursive: true })
      srv = createServer({
        staticDir: 'public',
        charDir: join(dir, 'chars'),
        customDir: custom,
        libraryDir: library,
        python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
      })
      srv.listen(0, () => {
        base = `http://127.0.0.1:${srv.address().port}`
        ok()
      })
    }),
)
afterAll(() => {
  srv.stopJobs()
  srv.close()
})

const temps = () => (existsSync(backups) ? readdirSync(backups).filter(f => /^pack-/.test(f)) : [])
const download = async () => {
  const r0 = await fetch(`${base}/api/datapack`, { method: 'POST' })
  const { token } = await r0.json()
  const r = await fetch(`${base}/api/datapack/${token}`)
  return { r, token, bytes: Buffer.from(await r.arrayBuffer()) }
}
/** Step 1: the upload, checked; nothing changes yet. -> { token, pack } */
const upload = (body: Buffer | string, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/datapack/import`, { method: 'POST', body, headers: { 'Content-Type': 'application/zip', ...headers } })
/** Step 2: load the checked pack. */
const load = (token: string) => fetch(`${base}/api/datapack/import/${token}`, { method: 'POST' })
const uploadAndLoad = async (body: Buffer | string) => {
  const r = await upload(body)
  if (!r.ok) return r
  return load((await r.json()).token)
}
const MAGIC = 'PK\x03\x04\n'
/** A server start on this data: the importer calls its start-up re-import queued ("remove crb-1", …). `want`: the call to
 *  wait for (the stub worker's start alone can take over a second on a busy machine: a fixed 300 ms wait was this suite's
 *  flake); without it, none may come within 500 ms. */
let restarts = 0
const restart = async (want?: string) => {
  // a log of its own: a worker of the last restart that was still starting when it was stopped can write after it
  const log = join(dir, `calls-${++restarts}.log`)
  writeFileSync(log, '')
  vi.stubEnv('STUB_LOG', log)
  const again = createServer({
    staticDir: 'public',
    charDir: join(dir, 'chars'),
    customDir: custom,
    libraryDir: library,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
  })
  await again.started
  const calls = () =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => l.split(' ').slice(0, 2).join(' '))
  try {
    if (want) await vi.waitFor(() => expect(calls()).toContain(want), { timeout: 20000, interval: 50 })
    else await new Promise(r => setTimeout(r, 500))
    // its jobs run to the end (library/.config/jobs.json gone): a job a stop cuts off would run again at the next start
    await vi.waitFor(() => expect(existsSync(join(library, '.config', 'jobs.json'))).toBe(false), { timeout: 20000, interval: 50 })
  } finally {
    again.stopJobs()
    vi.unstubAllEnvs()
  }
  return calls()
}
const idle = () =>
  vi.waitFor(async () => expect((await (await fetch(`${base}/api/books`)).json()).every((b: { busy: boolean }) => !b.busy)).toBe(true), { timeout: 10000 })

test('a pack is made, then downloads once as a dated zip; its folder is gone afterwards', async () => {
  const { r, token, bytes } = await download()
  expect(token).toMatch(/^[0-9a-f]{32}$/)
  expect(r.status).toBe(200)
  expect(r.headers.get('content-disposition')).toBe(`attachment; filename="nova-prime-chummer-datapack-${new Date().toISOString().slice(0, 10)}.zip"`)
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
  const p = await upload(MAGIC + JSON.stringify(pack))
  const { token, pack: summary } = await p.json()
  expect([p.status, summary]).toEqual([
    200,
    { app: JSON.parse(readFileSync('package.json', 'utf8')).version, created: '2026-09-28T12:00:00+00:00', files: ['skills.xml'], replaces: ['skills.xml'] },
  ])
  expect(readFileSync(join(core, 'skills.xml'), 'utf8')).not.toContain('from the pack') // the preview changes nothing
  expect(temps()).toHaveLength(1) // the checked zip waits for its token
  const r = await load(token)
  expect([r.status, await r.json()]).toEqual([200, { files: ['skills.xml'] }])
  await vi.waitFor(() => expect(temps()).toEqual([])) // the zip goes once loaded
  const again = await load(token) // single use
  expect([again.status, (await again.json()).error]).toEqual([404, 'this data pack upload has expired; choose the file again'])
  expect(readFileSync(join(core, 'skills.xml'), 'utf8')).toContain('from the pack')
  expect(existsSync(join(core, 'lifestyles.xml'))).toBe(false) // a partial pack: the core is still missing a table ...
  expect(readFileSync(join(library, 'crb-1', 'core-rebuild.xml'), 'utf8')).toMatch(/<rebuild sha256="abc" pack="[^"]+" files="skills.xml"\/>/) // no version: the book itself wasn't tried
  // ... and a restart doesn't re-import the core rulebook over the pack
  expect(await restart()).toEqual([])
  // once the pack's files are gone, the mark no longer holds: the core rulebook is re-imported
  const saved = readFileSync(join(core, 'skills.xml'))
  rmSync(join(core, 'skills.xml'))
  expect(await restart('remove crb-1')).toContain('remove crb-1')
  writeFileSync(join(core, 'skills.xml'), saved)
  // the admin's Re-import of the core rulebook drops its pack mark: the book was chosen over the pack
  const mark = join(library, 'crb-1', 'core-rebuild.xml')
  writeFileSync(mark, '<rebuild sha256="abc" pack="2026-09-28T00:00:00Z" files="skills.xml"/>\n')
  expect((await fetch(`${base}/api/books/crb-1/reimport`, { method: 'POST' })).status).toBe(202)
  expect(existsSync(mark)).toBe(false)
  await vi.waitFor(async () => expect((await (await fetch(`${base}/api/books`)).json()).every((b: { busy: boolean }) => !b.busy)).toBe(true), {
    timeout: 10000,
  })
  cpSync('tests/fixtures/mini/custom/imported/core/lifestyles.xml', join(core, 'lifestyles.xml'))
  rmSync(join(library, 'crb-1'), { recursive: true })
})

test('the same core rulebook uploaded again: imported again into its entry, its pack marks dropped (the marks follow the file’s sha256)', async () => {
  const pdf = '%PDF-1.4 the same core rulebook',
    sha = createHash('sha256').update(pdf).digest('hex')
  const old = join(library, 'crb-old'),
    mark = join(old, 'core-rebuild.xml'),
    other = join(library, 'other-crb', 'core-rebuild.xml')
  mkdirSync(old, { recursive: true })
  mkdirSync(join(library, 'other-crb'), { recursive: true })
  const isCrb = () => writeFileSync(join(old, 'import.xml'), `<import recipe="crb" source="CRB" file="crb.pdf" sha256="${sha}"><files/><report/></import>\n`)
  isCrb() // the stub's remove and run, which a start-up re-import or an upload queue, rewrite the record
  writeFileSync(mark, `<rebuild sha256="${sha}" pack="2026-09-28T00:00:00Z" files="skills.xml"/>\n`)
  writeFileSync(other, '<rebuild sha256="another-file" pack="2026-09-28T00:00:00Z" files="skills.xml"/>\n')
  rmSync(join(core, 'lifestyles.xml'))
  expect(await restart()).toEqual([]) // the pack's mark holds
  // the admin uploads the same PDF again: chosen over the pack, so every pack mark for that file goes (another file's stays)
  const up = await fetch(`${base}/api/books`, { method: 'POST', body: pdf, headers: { 'Content-Type': 'application/pdf', 'X-Filename': 'crb.pdf' } })
  expect([up.status, (await up.json()).id]).toEqual([202, 'crb-old']) // its entry, not a new one
  expect(existsSync(mark)).toBe(false)
  expect(existsSync(other)).toBe(true)
  await idle()
  isCrb()
  expect(await restart('remove crb-old')).toContain('remove crb-old') // the core is partial and this file wasn't tried with this version
  // tried once per file and version
  const tried = readFileSync(mark, 'utf8')
  expect(tried).toMatch(new RegExp(`<rebuild sha256="${sha}" version="[^"]+" tried=`))
  isCrb()
  expect(await restart()).toEqual([])
  // a mark for another file doesn't count
  writeFileSync(mark, tried.replace(sha, 'another-file'))
  isCrb()
  expect(await restart('remove crb-old')).toContain('remove crb-old')
  await idle()
  for (const d of [old, join(library, 'other-crb')]) rmSync(d, { recursive: true, force: true })
  cpSync('tests/fixtures/mini/custom/imported/core/lifestyles.xml', join(core, 'lifestyles.xml'))
})

test('a pack that replaces a table read by AI: the books stop saying so for that table, not for the others', async () => {
  const ai = join(library, 'crb-ai'),
    otherBook = join(library, 'other-ai')
  for (const [d, rows] of [
    [
      ai,
      '    <row kind="core-ai" file="skills.xml" entries="2" problem="read by AI: check it against the book"/>\n' +
        '    <row kind="core-ai" file="weapons.xml" entries="1" problem="read by AI: check it against the book"/>\n    <row kind="core-unread" file="levels.xml"/>\n',
    ],
    [otherBook, '    <row kind="core-ai" file="skills.xml" entries="1" problem="read by AI: check it against the book"/>\n'],
  ]) {
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'import.xml'), `<import recipe="crb" source="CRB" file="crb.pdf" sha256="ai"><files/><report>\n${rows}  </report></import>\n`)
    writeFileSync(join(d, 'status.xml'), '<status state="done" updated="2026-09-28T00:00:00Z"></status>\n')
  }
  const listed = async () =>
    Object.fromEntries(
      ((await (await fetch(`${base}/api/books`)).json()) as { id: string; coreAi: string[]; coreUnread: string[] }[])
        .filter(b => ['crb-ai', 'other-ai'].includes(b.id))
        .map(b => [b.id, [b.coreAi, b.coreUnread]]),
    )
  expect(await listed()).toEqual({ 'crb-ai': [['skills.xml', 'weapons.xml'], ['levels.xml']], 'other-ai': [['skills.xml'], []] })
  const { bytes } = await download()
  const pack = JSON.parse(bytes.toString().slice(MAGIC.length))
  pack.files = { 'skills.xml': pack.files['skills.xml'] }
  const r = await uploadAndLoad(MAGIC + JSON.stringify(pack))
  expect(r.status).toBe(200)
  expect(await listed()).toEqual({ 'crb-ai': [['weapons.xml'], ['levels.xml']], 'other-ai': [[], []] })
  for (const d of [ai, otherBook]) rmSync(d, { recursive: true, force: true })
})

test('refused uploads say why and change nothing', async () => {
  const before = readFileSync(join(core, 'skills.xml'), 'utf8')
  let r = await upload('not a zip')
  expect([r.status, await r.json()]).toEqual([415, { error: 'this file isn’t a data pack (not a zip file)' }])
  r = await upload(MAGIC + JSON.stringify({ files: { 'notes.xml': '<x/>' } }))
  expect(r.status).toBe(400)
  expect((await r.json()).error).toMatch(/a file a data pack can’t hold: notes\.xml/)
  r = (await upload('PK\x03\x04', { 'Content-Length': String(51 * 1024 * 1024) }).catch(() => null)) as Response | null
  if (r) expect(r.status).toBe(413) // the server may close the connection before fetch reads the answer
  const big = Buffer.alloc(51 * 1024 * 1024, 'a')
  big.write('PK\x03\x04', 'latin1')
  r = (await upload(big).catch(() => null)) as Response | null
  if (r) expect([r.status, (await r.json()).error]).toEqual([413, 'the file is larger than 50 MB'])
  expect(readFileSync(join(core, 'skills.xml'), 'utf8')).toBe(before)
  await vi.waitFor(() => expect(temps()).toEqual([]))
})

test('one pack loads at a time; not while a book imports; a job waits for the pack; not during a restore', async () => {
  const { bytes } = await download()
  /** A pack's load under way (the stub's takes 400 ms). */
  const loading = async () => {
    const { token } = await (await upload(bytes)).json()
    const done = load(token)
    await new Promise(r => setTimeout(r, 100))
    return { done }
  }
  let { done } = await loading()
  expect((await fetch(`${base}/api/datapack`, { method: 'POST' })).status).toBe(409)
  // a book uploaded meanwhile is queued, and starts after the pack
  const book = await fetch(`${base}/api/books`, {
    method: 'POST',
    body: '%PDF-1.4 slow',
    headers: { 'Content-Type': 'application/pdf', 'X-Filename': 'b.pdf' },
  })
  expect(book.status).toBe(202)
  const { id } = await book.json()
  expect((await (await fetch(`${base}/api/books`)).json()).find((b: { id: string }) => b.id === id).state).toBe('queued')
  expect((await done).status).toBe(200)
  await vi.waitFor(async () => expect((await (await fetch(`${base}/api/books`)).json()).find((b: { id: string }) => b.id === id).state).toBe('done'), {
    timeout: 10000,
  })
  // while a job runs, a pack can be checked but not loaded; the refused load keeps its token
  const slow = await fetch(`${base}/api/books`, {
    method: 'POST',
    body: '%PDF-1.4 slow',
    headers: { 'Content-Type': 'application/pdf', 'X-Filename': 'c.pdf' },
  })
  expect(slow.status).toBe(202)
  const { token } = await (await upload(bytes)).json()
  const busy = await load(token)
  expect([busy.status, (await busy.json()).error]).toEqual([409, 'a book is being imported or read by AI; try again when it’s done'])
  const made = await fetch(`${base}/api/datapack`, { method: 'POST' }) // nor made: it could mix old and new tables
  expect([made.status, (await made.json()).error]).toEqual([409, 'a book is being imported or read by AI; try again when it’s done'])
  await vi.waitFor(async () => expect((await (await fetch(`${base}/api/books`)).json()).every((b: { busy: boolean }) => !b.busy)).toBe(true), {
    timeout: 10000,
  })
  expect((await load(token)).status).toBe(200)
  // a pack load is a counted write: a restore can't start under it
  ;({ done } = await loading())
  const backup = await fetch(`${base}/api/backup`, { method: 'POST' }) // nor a backup: it would copy the swap's folders
  expect([backup.status, (await backup.json()).error]).toEqual([409, 'a data pack is being made or loaded; try again when it’s done'])
  const restore = await fetch(`${base}/api/restore/${'0'.repeat(32)}`, { method: 'POST' })
  expect(restore.status).toBe(409)
  expect((await done).status).toBe(200)
  // nor while a backup is being made (the stub's takes 300 ms)
  const { token: t2 } = await (await upload(bytes)).json()
  const zipping = fetch(`${base}/api/backup`, { method: 'POST' })
  await vi.waitFor(() => expect(readdirSync(backups).some(f => f.startsWith('download-'))).toBe(true))
  const during = await load(t2)
  expect([during.status, (await during.json()).error]).toEqual([409, 'a backup is being made; try again when it’s done'])
  await zipping
  expect((await load(t2)).status).toBe(200)
})

test('pending uploads: one at a time, and each expires with its zip', async () => {
  const d = mkdtempSync(join(tmpdir(), 'ca2-pack-ttl-')),
    bk = join(d, 'library', '.backups')
  cpSync('tests/fixtures/mini/custom/imported/core', join(d, 'custom', 'imported', 'core'), { recursive: true })
  const s = createServer({
    staticDir: 'public',
    charDir: join(d, 'chars'),
    customDir: join(d, 'custom'),
    libraryDir: join(d, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
    restoreTtl: 1500,
  })
  await new Promise<void>(ok => s.listen(0, ok))
  const url = `http://127.0.0.1:${s.address().port}/api/datapack/import`
  const zips = () => readdirSync(bk).filter(f => /^pack-.*\.zip$/.test(f))
  try {
    const pack = MAGIC + JSON.stringify({ files: { 'skills.xml': readFileSync(join(core, 'skills.xml'), 'utf8') } })
    const a = (await (await fetch(url, { method: 'POST', body: pack })).json()).token
    const b = (await (await fetch(url, { method: 'POST', body: pack })).json()).token
    expect(zips()).toHaveLength(1) // the newer upload replaced the older
    expect((await fetch(`${url}/${a}`, { method: 'POST' })).status).toBe(404)
    await vi.waitFor(() => expect(zips()).toEqual([]), { timeout: 5000 })
    expect((await fetch(`${url}/${b}`, { method: 'POST' })).status).toBe(404) // expired
    expect((await fetch(`${url}/${b}`)).status).toBe(405)
  } finally {
    s.stopJobs()
    s.close()
  }
})

test('no core data: the pack is refused with the reason', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'ca2-pack-empty-'))
  const s = createServer({
    staticDir: 'public',
    charDir: join(empty, 'chars'),
    customDir: join(empty, 'custom'),
    libraryDir: join(empty, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
  })
  await new Promise<void>(ok => s.listen(0, ok))
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/datapack`, { method: 'POST' })
    expect([r.status, (await r.json()).error]).toEqual([409, 'there is no core data to put in a pack. Import the core rulebook first'])
  } finally {
    s.stopJobs()
    s.close()
  }
})
