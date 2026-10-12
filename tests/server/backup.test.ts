// @vitest-environment node
// Backup and restore API with the stub worker (tests/fixtures/stub-worker.mjs); backup-python.test.ts runs the real importer.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServer } from './_signin'

vi.setConfig({ testTimeout: 30000 })

const dir = mkdtempSync(join(tmpdir(), 'ca2-backup-'))
const chars = join(dir, 'chars'),
  library = join(dir, 'library'),
  backups = join(library, '.backups')
const mine = join(chars, 'admin') // the signed-in admin's runners
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
let base = ''
let srv: { close: () => void; stopJobs: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
beforeAll(
  () =>
    new Promise<void>(ok => {
      mkdirSync(join(dir, 'custom', 'edits'), { recursive: true })
      writeFileSync(join(dir, 'custom', 'edits', 'edits.xml'), '<edits/>')
      srv = createServer({
        staticDir: 'public',
        charDir: chars,
        customDir: join(dir, 'custom'),
        libraryDir: library,
        python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
      })
      srv.listen(0, () => {
        base = `http://127.0.0.1:${srv.address().port}`
        ok()
      })
    }),
)
afterAll(() => srv.close())

const runner = (street: string) =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="r1" streetName="${street}" metatype="ork" level="runner" updatedAt="2026-09-27"><build/></ca2:character>`
const putRunner = (street: string) => fetch(`${base}/api/characters/r1?force=1`, { method: 'PUT', body: runner(street) })
const temps = () => (existsSync(backups) ? readdirSync(backups).filter(f => /^(download|upload)-/.test(f)) : [])
const make = (q = '', at = base, signal?: AbortSignal) => fetch(`${at}/api/backup${q}`, { method: 'POST', signal })
/** Both steps: make the zip, then fetch it by its token. */
const download = async (q = '', at = base) => {
  const { token } = await (await make(q, at)).json()
  const r = await fetch(`${at}/api/backup/${token}`)
  return { r, token, bytes: Buffer.from(await r.arrayBuffer()) }
}
const preview = (body: Buffer | string) => fetch(`${base}/api/restore?preview=1`, { method: 'POST', body, headers: { 'Content-Type': 'application/zip' } })
const apply = (token: string) => fetch(`${base}/api/restore/${token}`, { method: 'POST' })
const setKey = (value: string) => fetch(`${base}/api/ai-keys`, { method: 'PUT', body: `<keys><key provider="openai">${value}</key></keys>` })

test('a backup is made, then downloads once as a dated zip; its folder is gone afterwards', async () => {
  await putRunner('Before')
  const { r, token, bytes } = await download()
  expect(token).toMatch(/^[0-9a-f]{32}$/)
  expect(r.status).toBe(200)
  expect(r.headers.get('content-type')).toBe('application/zip')
  expect(r.headers.get('content-disposition')).toBe(`attachment; filename="nova-prime-chummer-backup-${new Date().toISOString().slice(0, 10)}.zip"`)
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04')
  expect(bytes.toString()).toContain(`"app":"${version}"`) // --version from package.json (the image: /app/VERSION)
  await vi.waitFor(() => expect(temps()).toEqual([]))
  expect((await fetch(`${base}/api/backup/${token}`)).status).toBe(404) // single use
  expect((await fetch(`${base}/api/backup/nonsense`)).status).toBe(404)
  expect((await fetch(`${base}/api/backup`)).status).toBe(405) // the old one-step download is gone
})

test('API keys are in a backup only when asked for', async () => {
  expect((await setKey('sk-test-KEEPOUT1234')).status).toBe(204)
  const plain = (await download()).bytes.toString()
  expect(plain).toContain('"keys":false')
  expect(plain).not.toContain('ai-keys.xml')
  expect((await download('?keys=1')).bytes.toString()).toContain('library/.config/ai-keys.xml')
})

test('a client that leaves mid-download or while the zip is made leaves no temp file', async () => {
  const { token } = await (await make()).json()
  const ac = new AbortController()
  const r = await fetch(`${base}/api/backup/${token}`, { signal: ac.signal })
  ac.abort()
  expect(r.status).toBe(200)
  await vi.waitFor(() => expect(temps()).toEqual([]))
  const early = new AbortController()
  const aborted = make('', base, early.signal).catch(e => e.name)
  await vi.waitFor(() => expect(temps()).toHaveLength(1)) // the zip's folder, the stub's partial .tmp in it
  early.abort()
  expect(await aborted).toBe('AbortError')
  await vi.waitFor(() => expect(temps()).toEqual([]))
  expect((await download()).r.status).toBe(200) // and the next backup isn't blocked
})

test('one backup at a time, and no restore while one is made', async () => {
  const { token } = await (await preview((await download()).bytes)).json()
  const first = download()
  await vi.waitFor(() => expect(temps().filter(f => f.startsWith('download-'))).toHaveLength(1))
  const second = await make()
  expect([second.status, await second.json()]).toEqual([409, { error: 'a backup is already being made; wait for it to finish' }])
  const refused = await apply(token)
  expect([refused.status, (await refused.json()).error]).toEqual([409, 'a backup is being made; try again when it’s done'])
  expect((await first).r.status).toBe(200)
  expect((await apply(token)).status).toBe(200)
})

test('a restore is refused while an import is queued or running', async () => {
  const { token } = await (await preview((await download()).bytes)).json()
  expect((await fetch(`${base}/api/books`, { method: 'POST', body: '%PDF-1.7 slow', headers: { 'Content-Type': 'application/pdf' } })).status).toBe(202)
  const r = await apply(token)
  expect([r.status, (await r.json()).error]).toEqual([409, 'a book is being imported or read by AI; try again when it’s done'])
  await vi.waitFor(async () => expect((await (await fetch(`${base}/api/books`)).json()).some((b: { busy: boolean }) => b.busy)).toBe(false), { timeout: 5000 })
  expect((await apply(token)).status).toBe(200)
})

test('a preview refuses files that aren’t backups', async () => {
  const notZip = await preview('%PDF-1.7 hello')
  expect([notZip.status, await notZip.json()]).toEqual([415, { error: 'this file isn’t a backup (not a zip file)' }])
  const badZip = await preview('PK\x03\x04 not really')
  expect([badZip.status, await badZip.json()]).toEqual([400, { error: 'this isn’t a readable zip file (stub)' }])
  const big = await fetch(`${base}/api/restore?preview=1`, { method: 'POST', body: 'x', headers: { 'Content-Length': String(21 * 1024 ** 3) } }).catch(
    () => null,
  )
  if (big) expect(big.status).toBe(413) // some fetch versions refuse to send a wrong length at all
  expect(temps()).toEqual([])
})

test('backup → change → preview → restore brings the runner back; the token is single use', async () => {
  await putRunner('Before')
  const { bytes } = await download()
  await putRunner('After')
  const p = await preview(bytes)
  expect(p.status).toBe(200)
  const { token, manifest } = await p.json()
  expect(token).toMatch(/^[0-9a-f]{32}$/)
  expect(manifest).toMatchObject({ app: version, keys: false, folders: { characters: { files: 1 }, custom: { files: 1 } } })
  expect(temps()).toHaveLength(1) // the upload waits for its token
  const r = await apply(token)
  expect([r.status, await r.json()]).toEqual([200, { ok: true }])
  expect(
    readdirSync(mine)
      .map(f => readFileSync(join(mine, f), 'utf8'))
      .join(),
  ).toContain('streetName="Before"')
  expect(readFileSync(join(library, '.config', 'ai-keys.xml'), 'utf8')).toContain('KEEPOUT') // a backup without keys keeps the server's
  expect(readdirSync(backups).some(f => /^\d{14}_\d{6}Z\.zip$/.test(f))).toBe(true) // the safety backup
  expect(temps()).toEqual([])
  expect((await apply(token)).status).toBe(404)
  expect((await apply('nonsense')).status).toBe(404)
})

test('a restore is refused while a write runs, and nothing writes while a restore runs', async () => {
  const { token } = await (await preview((await download()).bytes)).json()
  const writing = setKey('sk-test-SLOW12345') // the stub's set-key takes 300 ms
  await new Promise(r => setTimeout(r, 100))
  const refused = await apply(token)
  expect(refused.status).toBe(409)
  expect((await refused.json()).error).toBe('a save or an upload is running; try again when it’s done')
  await writing
  const restoring = apply(token) // the refusal didn't use up the token; the stub's apply takes 400 ms
  await new Promise(r => setTimeout(r, 150))
  for (const r of [
    await putRunner('During'),
    await setKey('sk-test-DURING1234'),
    await make(),
    await fetch(`${base}/api/books`, { method: 'POST', body: '%PDF-1.7', headers: { 'Content-Type': 'application/pdf' } }),
    await fetch(`${base}/api/edits/items/x`, { method: 'PUT', body: '<edit/>' }),
    await fetch(`${base}/api/review/abc-1`, { method: 'PUT', body: '<review/>' }),
    await fetch(`${base}/api/characters/r1`, { method: 'DELETE' }),
    await fetch(`${base}/api/trash`, { method: 'DELETE' }),
    await fetch(`${base}/api/trash/r1.xml`, { method: 'DELETE' }),
    await fetch(`${base}/api/trash/r1.xml/restore`, { method: 'POST' }),
  ])
    expect(r.status).toBe(409)
  expect((await restoring).status).toBe(200)
  expect(
    readdirSync(mine)
      .map(f => readFileSync(join(mine, f), 'utf8'))
      .join(),
  ).not.toContain('During')
})

test('a new preview or backup replaces the pending one; stopping the server deletes them', async () => {
  const { bytes } = await download()
  const first = (await (await preview(bytes)).json()).token
  const second = (await (await preview(bytes)).json()).token
  const old = (await (await make()).json()).token
  const made = (await (await make()).json()).token
  expect(temps()).toHaveLength(2) // one upload, one made backup
  expect((await apply(first)).status).toBe(404)
  expect((await fetch(`${base}/api/backup/${old}`)).status).toBe(404)
  srv.stopJobs()
  expect(temps()).toEqual([])
  expect((await apply(second)).status).toBe(404)
  expect((await fetch(`${base}/api/backup/${made}`)).status).toBe(404)
})

test('an unused preview or backup expires and its file is deleted', async () => {
  const short = createServer({
    staticDir: 'public',
    charDir: chars,
    customDir: join(dir, 'custom'),
    libraryDir: library,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
    restoreTtl: 1000,
    downloadTtl: 1000,
  })
  await new Promise<void>(ok => short.listen(0, ok))
  const at = `http://127.0.0.1:${short.address().port}`
  try {
    const { bytes } = await download('', at)
    const { token } = await (await fetch(`${at}/api/restore?preview=1`, { method: 'POST', body: bytes })).json()
    const made = (await (await make('', at)).json()).token
    expect(temps().length).toBeGreaterThan(0)
    await vi.waitFor(() => expect(temps()).toEqual([]), { timeout: 4000 })
    expect((await fetch(`${at}/api/restore/${token}`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${at}/api/backup/${made}`)).status).toBe(404)
  } finally {
    short.close()
  }
})

test('start-up removes temp files a stop left (library/.backups, restore swap folders), and keeps safety backups', () => {
  const lib = join(dir, 'lib-sweep'),
    bk = join(lib, '.backups')
  mkdirSync(join(bk, 'download-abc123'), { recursive: true })
  for (const f of ['upload-abc123.zip', '.backup.x1y2.tmp', 'download-abc123/backup.zip', '20260928T000000_000000Z.zip', 'mine.zip'])
    writeFileSync(join(bk, f), 'x')
  const ch = join(dir, 'chars-sweep'),
    cu = join(dir, 'custom-sweep') // and a killed restore's swap folders
  for (const d of [join(ch, '.restore-old-a1'), join(cu, '.restore-new-b2'), join(lib, '.restore-old-c3'), join(ch, 'keep')]) {
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'x.xml'), 'x')
  }
  createServer({ staticDir: 'public', charDir: ch, customDir: cu, libraryDir: lib, python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  expect(readdirSync(bk).sort()).toEqual(['20260928T000000_000000Z.zip', 'mine.zip'])
  expect([readdirSync(ch), readdirSync(cu), readdirSync(lib).sort()]).toEqual([['keep'], [], ['.backups', '.config']]) // .config: the test admin
})
