// @vitest-environment node
// server.mjs's two caches: the runner index (per folder) and served files' gzip. A deleted or changed file's entry goes,
// and each stays under its cap (lru).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { lru } from '../../server/server.mjs'
import { createServer } from './_signin'

type Lru = { get: (k: string) => unknown; set: (k: string, v: unknown) => unknown; delete: (k: string) => void; size: number; total: number }
const dir = mkdtempSync(join(tmpdir(), 'ca2-caches-'))
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number }; caches: { indexed: Lru; zipped: Lru } }
beforeAll(
  () =>
    new Promise<void>(ok => {
      mkdirSync(join(dir, 'custom'), { recursive: true })
      srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom') })
      srv.listen(0, () => {
        base = `http://127.0.0.1:${srv.address().port}`
        ok()
      })
    }),
)
afterAll(() => srv.close())

test('lru: the least recently used go first past the cap, counted by size; one bigger than the cap goes at once', () => {
  const c: Lru = lru(10, (v: string) => v.length)
  c.set('a', 'xxxx')
  c.set('b', 'xxxx')
  c.get('a') // now b is the oldest
  c.set('c', 'xxxx')
  expect([c.get('a'), c.get('b'), c.get('c'), c.total]).toEqual(['xxxx', undefined, 'xxxx', 8])
  c.set('a', 'x') // replaced: counted once
  expect(c.total).toBe(5)
  c.set('big', 'x'.repeat(11))
  expect([c.get('big'), c.size, c.total]).toEqual([undefined, 0, 0])
  c.set('d', 'xx')
  c.delete('d')
  expect([c.size, c.total]).toEqual([0, 0])
})

const xml = (id: string, street: string) =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="${id}" streetName="${street}" metatype="ork" level="runner" updatedAt="2026-09-27"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>`
const cached = () => [...((srv.caches.indexed.get(join(dir, 'chars', 'admin')) as Map<string, unknown>) ?? new Map()).keys()].sort()

test('the runner index drops a deleted runner, and a folder left empty', async () => {
  for (const [id, street] of [
    ['r1', 'One'],
    ['r2', 'Two'],
  ])
    expect((await fetch(`${base}/api/characters/${id}`, { method: 'PUT', body: xml(id, street) })).status).toBe(201)
  expect((await fetch(`${base}/api/characters`)).status).toBe(200)
  expect(cached()).toEqual(['One.xml', 'Two.xml'])
  expect((await fetch(`${base}/api/characters/r2`, { method: 'DELETE' })).status).toBe(204)
  await fetch(`${base}/api/characters`)
  expect(cached()).toEqual(['One.xml'])
  expect((await fetch(`${base}/api/characters/r1`, { method: 'DELETE' })).status).toBe(204)
  await fetch(`${base}/api/characters`)
  expect(srv.caches.indexed.get(join(dir, 'chars', 'admin'))).toBeUndefined()
})

test('a served file’s gzip goes when the file changes or is gone', async () => {
  const file = join(dir, 'custom', 'big.xml')
  const big = (s: string) => `<x>${s.repeat(2000)}</x>`
  writeFileSync(file, big('a'))
  const first = await fetch(`${base}/custom/big.xml`)
  expect([first.status, first.headers.get('content-encoding'), await first.text()]).toEqual([200, 'gzip', big('a')])
  expect(srv.caches.zipped.size).toBe(1)
  writeFileSync(file, big('bb')) // changed: asked for plain, the old gzip still goes
  const plain = await fetch(`${base}/custom/big.xml`, { headers: { 'Accept-Encoding': 'identity' } })
  expect([plain.headers.get('content-encoding'), await plain.text()]).toEqual([null, big('bb')])
  expect(srv.caches.zipped.get(file)).toBeUndefined()
  expect(await (await fetch(`${base}/custom/big.xml`)).text()).toBe(big('bb'))
  expect(srv.caches.zipped.size).toBe(1)
  rmSync(file)
  expect((await fetch(`${base}/custom/big.xml`)).status).toBe(404)
  expect(srv.caches.zipped.size).toBe(0)
})
