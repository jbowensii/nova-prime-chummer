// @vitest-environment node
// Game systems as packages: manifests (seeded/synthesized), status, on/off, and install/update from a zip (validation, the old
// tree moved to _to_delete, account data kept).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createServer } from './_signin'
import { swapIn } from '../../server/systems.mjs'

/** A zip of { name: text }; the first entry is deflated, the rest stored. */
function zip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [],
    central: Buffer[] = []
  let off = 0
  Object.entries(files).forEach(([name, text], i) => {
    const raw = Buffer.from(text),
      method = i === 0 ? 8 : 0,
      data = method ? deflateRawSync(raw) : raw,
      n = Buffer.from(name)
    const h = Buffer.alloc(30)
    h.writeUInt32LE(0x04034b50, 0)
    h.writeUInt16LE(20, 4)
    h.writeUInt16LE(method, 8)
    h.writeUInt32LE(crc32(raw), 14)
    h.writeUInt32LE(data.length, 18)
    h.writeUInt32LE(raw.length, 22)
    h.writeUInt16LE(n.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(method, 10)
    c.writeUInt32LE(crc32(raw), 16)
    c.writeUInt32LE(data.length, 20)
    c.writeUInt32LE(raw.length, 24)
    c.writeUInt16LE(n.length, 28)
    c.writeUInt32LE(off, 42)
    parts.push(h, n, data)
    central.push(c, n)
    off += 30 + n.length + data.length
  })
  const cd = Buffer.concat(central),
    e = Buffer.alloc(22)
  e.writeUInt32LE(0x06054b50, 0)
  e.writeUInt16LE(central.length / 2, 8)
  e.writeUInt16LE(central.length / 2, 10)
  e.writeUInt32LE(cd.length, 12)
  e.writeUInt32LE(off, 16)
  return Buffer.concat([...parts, cd, e])
}

const dir = mkdtempSync(join(tmpdir(), 'systems-'))
const sr6 = join(dir, 'Data', 'systems', 'sr6')
let base = '',
  srv: any // eslint-disable-line @typescript-eslint/no-explicit-any
beforeAll(
  () =>
    new Promise<void>(ok => {
      mkdirSync(join(sr6, 'imported', 'core'), { recursive: true })
      mkdirSync(join(sr6, 'characters'), { recursive: true })
      writeFileSync(join(sr6, 'imported', 'core', 'a.xml'), '<a/>')
      writeFileSync(join(sr6, 'characters', 'me.xml'), '<me/>')
      mkdirSync(join(dir, 'Library', 'sr6', 'book1'), { recursive: true })
      srv = createServer({ staticDir: 'public', dataPath: dir, python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
      srv.listen(0, () => {
        base = `http://127.0.0.1:${srv.address().port}`
        ok()
      })
    }),
)
afterAll(() => {
  srv.close()
  rmSync(dir, { recursive: true, force: true })
})
const list = async () => (await (await fetch(`${base}/api/setup-config`)).json()).systems
const sys = async (id: string) => (await list()).find((s: { id: string }) => s.id === id)
const install = (id: string, body: Buffer) =>
  fetch(`${base}/api/setup-config/systems/${id}/install`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: new Uint8Array(body) })
const pkg = (extra: object = {}, files: Record<string, string> = {}) =>
  zip({ 'system.json': JSON.stringify({ id: 'sr6', title: 'SR6', version: '9.9.9', ...extra }), ...files })

test('a system with data gets a default manifest written; an empty one is synthesized, not written', async () => {
  const s = await sys('sr6')
  expect(s).toMatchObject({ id: 'sr6', enabled: true, coreImported: true, books: 1, catalog: 1 })
  expect(JSON.parse(readFileSync(join(sr6, 'system.json'), 'utf8')).id).toBe('sr6')
  const a = await sys('anarchy2')
  expect(a).toMatchObject({ id: 'anarchy2', status: 'not created yet', coreImported: false, books: 0 })
  expect(existsSync(join(dir, 'Data', 'systems', 'anarchy2'))).toBe(false)
})

test('enable/disable persists in system.json and rejects a non-boolean', async () => {
  const put = (id: string, body: unknown) =>
    fetch(`${base}/api/setup-config/systems/${id}/enabled`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  expect((await put('sr6', { enabled: false })).status).toBe(200)
  expect(JSON.parse(readFileSync(join(sr6, 'system.json'), 'utf8')).enabled).toBe(false)
  expect((await sys('sr6')).enabled).toBe(false)
  expect((await put('sr6', { enabled: 'no' })).status).toBe(400)
  expect((await put('nope', { enabled: true })).status).toBe(404)
  await put('sr6', { enabled: true })
})

test('install refuses bad packages and changes nothing', async () => {
  const before = readdirSync(sr6).sort()
  const bad: [string, Buffer, number][] = [
    ['not a zip', Buffer.from('hello'), 415],
    ['no manifest', zip({ 'a.txt': 'x' }), 400],
    ['wrong game', pkg({ id: 'anarchy2' }), 400],
    ['bad version', pkg({ version: 'x' }), 400],
    ['needs newer core', pkg({ compatibility: { minCore: '999.0.0' } }), 409],
    ['path climbs', pkg({}, { '../evil.txt': 'x' }), 400],
    ['carries account data', pkg({}, { 'characters/x.xml': 'x' }), 400],
  ]
  for (const [why, body, code] of bad) expect([why, (await install('sr6', body)).status]).toEqual([why, code])
  expect(readdirSync(sr6).sort()).toEqual(before)
})

test('install replaces the system, moves the old files to _to_delete, keeps characters', async () => {
  const r = await install('sr6', pkg({}, { 'imported/core/b.xml': '<b/>', 'imported/more.xml': '<m/>' }))
  expect(r.status).toBe(200)
  const s = (await r.json()).find((x: { id: string }) => x.id === 'sr6')
  expect(s).toMatchObject({ version: '9.9.9', catalog: 2 })
  expect(existsSync(join(sr6, 'imported', 'core', 'a.xml'))).toBe(false)
  expect(readFileSync(join(sr6, 'characters', 'me.xml'), 'utf8')).toBe('<me/>')
  const [stamp] = readdirSync(join(dir, '_to_delete'))
  expect(readFileSync(join(dir, '_to_delete', stamp, 'sr6', 'imported', 'core', 'a.xml'), 'utf8')).toBe('<a/>')
  expect(readdirSync(join(dir, 'Backups')).some(n => n.startsWith('.install-'))).toBe(false)
})

test('install from a URL: only http(s), and internal addresses are refused', async () => {
  const u = (url: string) =>
    fetch(`${base}/api/setup-config/systems/sr6/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  expect((await u('file:///etc/passwd')).status).toBe(400)
  expect((await u('nonsense')).status).toBe(400)
  for (const h of ['127.0.0.1', '[::1]', '169.254.169.254', '10.0.0.5', '172.20.1.1', '192.168.1.1', '0.0.0.0', '[fd00::1]', '[::ffff:127.0.0.1]'])
    expect([h, (await u(`http://${h}:1/p.zip`)).status]).toEqual([h, 400])
})

test('a failure mid-swap restores the old tree', async () => {
  const d = mkdtempSync(join(tmpdir(), 'swap-')),
    live = join(d, 'sys'),
    stage = join(d, 'stage'),
    aside = join(d, 'aside')
  mkdirSync(join(live, 'characters'), { recursive: true })
  mkdirSync(stage)
  writeFileSync(join(live, 'old1.txt'), '1')
  writeFileSync(join(live, 'old2.txt'), '2')
  writeFileSync(join(live, 'characters', 'me.xml'), 'me')
  writeFileSync(join(stage, 'new.txt'), 'n')
  let n = 0
  const flaky = async (a: string, b: string) => {
    if (++n === 3) throw new Error('boom') // two moves aside succeed, the first staged rename fails
    return rename(a, b)
  }
  await expect(swapIn(live, stage, aside, flaky)).rejects.toThrow('boom')
  expect(readdirSync(live).sort()).toEqual(['characters', 'old1.txt', 'old2.txt'])
  expect(readFileSync(join(live, 'characters', 'me.xml'), 'utf8')).toBe('me')
  rmSync(d, { recursive: true, force: true })
})
