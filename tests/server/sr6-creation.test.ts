// @vitest-environment node
// The SR6 creation rules route (server/books.mjs in the SR6 area: GET/PUT /api/sr6/creation): admin and editors write
// custom/sr6/creation.xml (creation.xsd), anyone signed in reads it at /custom/sr6/creation.xml; never in Anarchy's area.
// Made-up settings.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { validateXML } from 'xmllint-wasm'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'
import { ADMIN, createServer, rawFetch } from './_signin'

vi.setConfig({ testTimeout: 30000 })
type Srv = { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
const PW: Record<string, string> = { eve: 'eve-password-1', pat: 'pat-password-1' }
const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-creation-'))
const custom = join(dir, 'custom'), library = join(dir, 'library')
let base = '', srv: Srv
const cookies: Record<string, string> = {}
beforeAll(async () => {
  mkdirSync(join(library, '.config'), { recursive: true })
  writeFileSync(join(library, '.config', 'users.xml'), await usersFile([ADMIN, { username: 'eve', role: 'editor', password: PW.eve, name: 'Eve' },
    { username: 'pat', role: 'player', password: PW.pat, name: 'Pat' }]))
  srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: custom, libraryDir: library })
  await new Promise<void>(ok => srv.listen(0, ok))
  base = `http://127.0.0.1:${srv.address().port}`
  for (const who of ['eve', 'pat']) {
    const r = await rawFetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ username: who, password: PW[who] }),
      headers: { 'Content-Type': 'application/json', Origin: base } })
    cookies[who] = r.headers.getSetCookie().find(c => /session=/.test(c))!.split(';')[0]
  }
})
afterAll(() => srv.close())

/** fetch as admin (the default, through _signin's fetch), eve (editor) or pat (player). */
const as = (who: string, path: string, init: RequestInit = {}) => who === 'admin' ? fetch(`${base}${path}`, init)
  : rawFetch(`${base}${path}`, { ...init, headers: { ...init.headers as Record<string, string>, Origin: base, Cookie: cookies[who] } })
const put = (who: string, settings: unknown[], path = '/api/sr6/creation') =>
  as(who, path, { method: 'PUT', body: JSON.stringify({ settings }), headers: { 'Content-Type': 'application/json' } })
const SETTINGS = [{ key: 'startingKarma', value: '40', source: 'CRB', page: 61 }, { key: 'aptitudeQuality', value: 'crb.knack' },
  { key: 'grade:alpha:essence', value: '0.7', source: 'CRB', page: '283' }, { key: 'metatypeKarma:crb.stonefolk', value: '11' }]

test('nothing saved yet: GET gives [] and the file isn’t there', async () => {
  const r = await as('pat', '/api/sr6/creation')
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual([])
  expect((await as('pat', '/custom/sr6/creation.xml')).status).toBe(404)
})

test('an editor saves the settings: 204, served at /custom/sr6/creation.xml, valid against creation.xsd, read back as JSON', async () => {
  expect((await put('eve', SETTINGS)).status).toBe(204)
  const r = await as('pat', '/custom/sr6/creation.xml')
  expect(r.status).toBe(200)
  const xml = await r.text()
  expect(xml).toContain('<sr6:creation xmlns:sr6="urn:chummer-sr6:config:1" version="1">')
  expect(xml).toContain('<setting key="startingKarma" value="40" source="CRB" page="61"/>')
  const xsd = readFileSync('public/data/sr6/schema/creation.xsd', 'utf8')
  expect((await validateXML({ xml: { fileName: 'creation.xml', contents: xml }, schema: { fileName: 'creation.xsd', contents: xsd } })).errors).toEqual([])
  expect(await (await as('pat', '/api/sr6/creation')).json()).toEqual([
    { key: 'startingKarma', value: '40', source: 'CRB', page: 61 }, { key: 'aptitudeQuality', value: 'crb.knack' },
    { key: 'grade:alpha:essence', value: '0.7', source: 'CRB', page: 283 }, { key: 'metatypeKarma:crb.stonefolk', value: '11' }])
  expect((await put('admin', SETTINGS.slice(0, 1))).status).toBe(204)
  expect(await (await as('pat', '/api/sr6/creation')).json()).toHaveLength(1)
})

test('a player can’t save', async () => {
  expect((await put('pat', SETTINGS)).status).toBe(403)
})

test('a bad key, a duplicate, an empty or 201-character value, a bad source or a page of 0 is refused with 400', async () => {
  const bad = [
    [{ key: 'bad key', value: '1' }], [{ key: 'x'.repeat(81), value: '1' }],
    [{ key: 'skillCap', value: '1' }, { key: 'skillCap', value: '2' }],
    [{ key: 'skillCap', value: '' }], [{ key: 'skillCap', value: 'x'.repeat(201) }],
    [{ key: 'skillCap', value: '5', source: 'crb' }], [{ key: 'skillCap', value: '5', page: 0 }], [{ key: 'skillCap', value: '5', page: 1.5 }],
  ]
  for (const s of bad) {
    const r = await put('eve', s)
    expect(r.status, JSON.stringify(s)).toBe(400)
    expect((await r.json()).error).toBeTruthy()
  }
  expect((await put('eve', [{ key: 'skillCap', value: 'x'.repeat(200) }])).status).toBe(204)
  expect((await put('eve', Array.from({ length: 501 }, (_, i) => ({ key: `k${i}`, value: '1' })))).status).toBe(400)
  expect((await as('eve', '/api/sr6/creation', { method: 'PUT', body: 'x', headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
})

test('Anarchy has no creation rules: /api/creation is 404 and nothing lands in custom/', async () => {
  expect((await put('admin', SETTINGS, '/api/creation')).status).toBe(404)
  expect((await as('admin', '/api/creation')).status).toBe(404)
  expect(existsSync(join(custom, 'creation.xml'))).toBe(false)
  expect((await as('admin', '/custom/creation.xml')).status).toBe(404)
  expect(existsSync(join(custom, 'sr6', 'creation.xml'))).toBe(true)
})
