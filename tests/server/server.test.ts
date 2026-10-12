// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createServer } from './_signin'

const dir = mkdtempSync(join(tmpdir(), 'ca2-'))
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
beforeAll(
  () =>
    new Promise<void>(ok => {
      srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom') })
      srv.listen(0, () => {
        base = `http://127.0.0.1:${srv.address().port}`
        ok()
      })
    }),
)
afterAll(() => srv.close())

const xml = (id: string, street = 'Street Sam', rev?: number) =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="${id}"${rev != null ? ` rev="${rev}"` : ''} streetName="${street}" metatype="ork" level="runner" updatedAt="2026-09-27"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>`
const put = (id: string, body: string, headers: Record<string, string> = {}, q = '') =>
  fetch(`${base}/api/characters/${id}${q}`, { method: 'PUT', body, headers })

test('health', async () => {
  expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true, storage: 'server' })
})

test('create names the file after the street name and starts at rev 1', async () => {
  const r = await put('a1', xml('a1', 'Test Runner'))
  expect(r.status).toBe(201)
  expect(await r.json()).toEqual({ rev: 1, file: 'Test-Runner.xml' })
  expect(readFileSync(join(dir, 'chars', 'admin', 'Test-Runner.xml'), 'utf8')).toContain('rev="1"')
})

test('a save based on an old revision is refused; force or the right rev succeeds', async () => {
  expect((await put('a1', xml('a1', 'Test Runner'), { 'If-Match': '1' })).status).toBe(200) // now rev 2
  const stale = await put('a1', xml('a1', 'Test Runner'), { 'If-Match': '1' })
  expect(stale.status).toBe(409)
  expect(await stale.json()).toMatchObject({ error: 'conflict', rev: 2, file: 'Test-Runner.xml' })
  expect(await (await put('a1', xml('a1', 'Test Runner'), { 'If-Match': '1' }, '?force=1')).json()).toEqual({ rev: 3, file: 'Test-Runner.xml' })
})

test('save as a new file name; same street name gets a unique file', async () => {
  expect(await (await put('a2', xml('a2', 'Test Runner'), {}, '?filename=Test Runner copy')).json()).toEqual({ rev: 1, file: 'Test-Runner-copy.xml' })
  expect(await (await put('a3', xml('a3', 'Test Runner'))).json()).toEqual({ rev: 1, file: 'Test-Runner-2.xml' })
})

test('list returns every runner with its XML', async () => {
  const list = await (await fetch(`${base}/api/characters`)).json()
  expect(list.map((c: { file: string }) => c.file).sort()).toEqual(['Test-Runner-2.xml', 'Test-Runner-copy.xml', 'Test-Runner.xml'])
  expect(list.find((c: { file: string }) => c.file === 'Test-Runner.xml').rev).toBe(3)
})

test('delete moves the file to .trash', async () => {
  expect((await fetch(`${base}/api/characters/a3`, { method: 'DELETE' })).status).toBe(204)
  expect(readdirSync(join(dir, 'chars', 'admin'))).not.toContain('Test-Runner-2.xml')
  expect(readdirSync(join(dir, 'chars', 'admin', '.trash'))[0]).toMatch(/^Test-Runner-2-\d+\.xml$/)
})

test('trust boundary: bad ids, mismatched bodies and path traversal are refused', async () => {
  expect((await put('..%2Fetc', xml('x'))).status).toBe(400)
  expect((await put('%E0%A4%A', xml('x'))).status).toBe(400) // a malformed escape: a bad id, not a 500
  expect((await put('a9', xml('other'))).status).toBe(400)
  expect((await put('a9', '<html/>')).status).toBe(400)
  expect((await fetch(`${base}/custom/..%2F..%2Fpackage.json`)).status).not.toBe(200)
})

test('serves the app and data files', async () => {
  const r = await fetch(`${base}/data/sources.xml`)
  expect(r.status).toBe(200)
  expect(await r.text()).toContain('kind="sources"')
})

test('/custom/sr6/ has its own route (never campaigns.xml); other spellings of it 404; the rest of /custom/ is served', async () => {
  const custom = join(dir, 'custom')
  mkdirSync(join(custom, 'sr6'), { recursive: true })
  writeFileSync(join(custom, 'index.xml'), '<overlays/>')
  writeFileSync(join(custom, 'sr6', 'campaigns.xml'), '<campaigns/>')
  writeFileSync(join(custom, 'sr6', 'x.xml'), '<x/>')
  for (const p of ['/custom/sr6/campaigns.xml', '/custom/sr6', '/custom/sr6/', '/custom/SR6/x.xml', '/custom/sr6./x.xml', '/custom//sr6/x.xml'])
    expect((await fetch(`${base}${p}`)).status, p).toBe(404)
  for (const p of ['/custom/sr6/x.xml', '/custom/a/../sr6/x.xml']) expect((await fetch(`${base}${p}`)).status, p).toBe(200)
  const ok = await fetch(`${base}/custom/index.xml`)
  expect([ok.status, await ok.text()]).toEqual([200, '<overlays/>'])
})

test('a static file has a validator: unchanged it is a 304; text goes gzipped to a browser that takes it', async () => {
  const r = await fetch(`${base}/data/sr6/sources.xml`)
  const etag = r.headers.get('etag')!
  expect(etag).toMatch(/^W\/"/)
  expect(r.headers.get('content-encoding')).toBe('gzip')
  expect(await r.text()).toContain('<sr6:data')
  expect((await fetch(`${base}/data/sr6/sources.xml`, { headers: { 'If-None-Match': etag } })).status).toBe(304)
  const plain = await fetch(`${base}/data/sr6/sources.xml`, { headers: { 'Accept-Encoding': 'identity' } })
  expect(plain.headers.get('content-encoding')).toBeNull()
})

test('the runner list reads a file changed on disk again (its index is kept per file while unchanged)', async () => {
  const file = join(dir, 'chars', 'admin', 'Test-Runner.xml')
  writeFileSync(file, readFileSync(file, 'utf8').replace('streetName="Test Runner"', 'streetName="Changed On Disk"'))
  const list = await (await fetch(`${base}/api/characters`)).json()
  expect(list.find((c: { file: string }) => c.file === 'Test-Runner.xml').xml).toContain('Changed On Disk')
})
