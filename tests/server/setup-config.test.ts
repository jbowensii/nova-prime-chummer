// @vitest-environment node
// The Setup screen's API: Config/options.json read and write, admin gating, validation at the trust boundary, the codeless
// first-admin flow of the desktop app, and the backups/systems lists.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createServer, rawFetch, signIn } from './_signin'

const dir = mkdtempSync(join(tmpdir(), 'setup-cfg-'))
const opts = join(dir, 'Config', 'options.json')
let base = '',
  srv: any // eslint-disable-line @typescript-eslint/no-explicit-any
beforeAll(
  () =>
    new Promise<void>(ok => {
      mkdirSync(join(dir, 'Backups'), { recursive: true })
      writeFileSync(join(dir, 'Backups', '20260101T000000_000000Z.zip'), 'zip')
      writeFileSync(join(dir, 'Backups', 'download-abc'), 'temp, not a safety backup')
      mkdirSync(join(dir, 'Data', 'systems', 'sr6'), { recursive: true })
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
const put = (body: unknown) => fetch(`${base}/api/setup-config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
type S = { key: string; value: unknown; source: string; later: boolean }

test('GET shows each setting with its value and source, plus systems and safety backups', async () => {
  const v = await (await fetch(`${base}/api/setup-config`)).json()
  const s = (k: string): S => v.settings.find((x: S) => x.key === k)
  expect(s('updateChannel')).toMatchObject({ value: 'stable', source: 'default' })
  expect(s('upnp')).toMatchObject({ later: true })
  expect(s('language').later).toBe(true)
  expect(s('updateChannel').later).toBe(false)
  expect(v.systems.map((x: { id: string; status: string }) => [x.id, x.status])).toEqual([
    ['anarchy2', 'not created yet'],
    ['sr6', 'installed'],
  ])
  expect(v.backups.map((b: { name: string }) => b.name)).toEqual(['20260101T000000_000000Z.zip'])
})

test('PUT writes Config/options.json, null turns off, reset returns to the default', async () => {
  expect((await put({ set: { language: 'de', routePrefix: null, proxyPort: 8443, telemetry: true } })).status).toBe(200)
  expect(JSON.parse(readFileSync(opts, 'utf8'))).toEqual({ language: 'de', routePrefix: null, proxyPort: 8443, telemetry: true })
  const v = await (await fetch(`${base}/api/setup-config`)).json()
  expect(v.settings.find((x: S) => x.key === 'language')).toMatchObject({ value: 'de', source: 'file' })
  expect(v.settings.find((x: S) => x.key === 'routePrefix')).toMatchObject({ value: null, source: 'file' })
  await put({ reset: ['language'] })
  expect(JSON.parse(readFileSync(opts, 'utf8'))).not.toHaveProperty('language')
})

test('PUT refuses unknown keys, wrong types and a prefix that climbs; nothing is written', async () => {
  const before = readFileSync(opts, 'utf8')
  for (const body of [
    { set: { port: 1 } },
    { set: { '../x': 1 } },
    { set: { constructor: 1 } },
    { set: { upnp: 'yes' } },
    { set: { proxyPort: 70000 } },
    { set: { updateChannel: 'nightly' } },
    { set: { routePrefix: '/../etc' } },
    { set: { hostname: 'a\nb' } },
    { reset: ['nope'] },
    { set: [] },
  ])
    expect((await put(body)).status, JSON.stringify(body)).toBe(400)
  expect(readFileSync(opts, 'utf8')).toBe(before)
  expect(existsSync(join(dir, 'options.json'))).toBe(false) // only ever Config/
})

test('a broken options.json is not overwritten', async () => {
  const good = readFileSync(opts, 'utf8')
  writeFileSync(opts, '{ hand edit')
  expect((await put({ set: { language: 'fr' } })).status).toBe(409)
  expect(readFileSync(opts, 'utf8')).toBe('{ hand edit')
  writeFileSync(opts, good)
})

test('admin only: no session is refused, and so is a player', async () => {
  expect((await rawFetch(`${base}/api/setup-config`)).status).toBe(401)
  const made = await fetch(`${base}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'pl', name: 'Pl', role: 'player', method: 'password', password: 'a-long-player-password' }),
  })
  expect(made.status).toBe(201)
  const cookie = await signIn(base, { username: 'pl', password: 'a-long-player-password' })
  const h = { Cookie: cookie!, Origin: base, 'Content-Type': 'application/json' }
  expect((await rawFetch(`${base}/api/setup-config`, { headers: h })).status).toBe(403)
  expect((await rawFetch(`${base}/api/setup-config`, { method: 'PUT', headers: h, body: '{"set":{"language":"fr"}}' })).status).toBe(403)
})

test('openSetup (desktop): no code is needed for the first admin, and /api/auth/me says so', async () => {
  const d2 = mkdtempSync(join(tmpdir(), 'setup-open-'))
  // server.mjs directly: the helper seeds an admin, a first run has none
  const s3 = (await import('../../server/server.mjs')).createServer({ staticDir: 'public', dataPath: d2, openSetup: true, python: 'python' })
  await new Promise<void>(ok => s3.listen(0, ok))
  const b = `http://127.0.0.1:${s3.address().port}`
  try {
    const me = await (await rawFetch(`${b}/api/auth/me`)).json()
    expect(me).toMatchObject({ setup: true, codeless: true })
    const r = await rawFetch(`${b}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: b },
      body: JSON.stringify({ name: 'Me', username: 'owner', password: 'a-long-owner-password' }),
    })
    expect(r.status).toBe(201)
    expect((await (await rawFetch(`${b}/api/auth/me`, { headers: { Cookie: r.headers.get('set-cookie')!.split(';')[0] } })).json()).user.username).toBe('owner')
  } finally {
    s3.stopJobs()
    s3.close()
    rmSync(d2, { recursive: true, force: true })
  }
})
