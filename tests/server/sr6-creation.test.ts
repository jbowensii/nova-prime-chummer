// @vitest-environment node
// The SR6 creation rules route (server/books.mjs in the SR6 area: GET/PUT /api/sr6/creation): the admin writes the server's
// default, custom/sr6/creation.xml (creation.xsd), anyone signed in reads it at /custom/sr6/creation.xml; never in Anarchy's
// area. A campaign's own settings (server/campaigns.mjs, PUT /api/sr6/campaigns/:id { creation }): its GMs and the admin
// write them, its players read them, nobody else sees them, and they never touch the default or another campaign.
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
const PW: Record<string, string> = { eve: 'eve-password-1', pat: 'pat-password-1', gus: 'gus-password-1', nia: 'nia-password-1' }
const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-creation-'))
const custom = join(dir, 'custom'), library = join(dir, 'library')
let base = '', srv: Srv
const cookies: Record<string, string> = {}
beforeAll(async () => {
  mkdirSync(join(library, '.config'), { recursive: true })
  writeFileSync(join(library, '.config', 'users.xml'), await usersFile([ADMIN, { username: 'eve', role: 'editor', password: PW.eve, name: 'Eve' },
    { username: 'pat', role: 'player', password: PW.pat, name: 'Pat' }, { username: 'gus', role: 'editor', password: PW.gus, name: 'Gus' },
    { username: 'nia', role: 'player', password: PW.nia, name: 'Nia' }]))
  srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: custom, libraryDir: library })
  await new Promise<void>(ok => srv.listen(0, ok))
  base = `http://127.0.0.1:${srv.address().port}`
  for (const who of Object.keys(PW)) {
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

test('the admin saves the server’s settings: 204, served at /custom/sr6/creation.xml, valid against creation.xsd, read back as JSON', async () => {
  expect((await put('admin', SETTINGS)).status).toBe(204)
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

test('editors and players can’t save the server’s settings', async () => {
  expect((await put('pat', SETTINGS)).status).toBe(403)
  expect((await put('eve', SETTINGS)).status).toBe(403)
})

test('a bad key, a duplicate, an empty or 201-character value, a bad source or a page of 0 is refused with 400', async () => {
  const bad = [
    [{ key: 'bad key', value: '1' }], [{ key: 'x'.repeat(81), value: '1' }],
    [{ key: 'skillCap', value: '1' }, { key: 'skillCap', value: '2' }],
    [{ key: 'skillCap', value: '' }], [{ key: 'skillCap', value: 'x'.repeat(201) }],
    [{ key: 'skillCap', value: '5', source: 'crb' }], [{ key: 'skillCap', value: '5', page: 0 }], [{ key: 'skillCap', value: '5', page: 1.5 }],
  ]
  for (const s of bad) {
    const r = await put('admin', s)
    expect(r.status, JSON.stringify(s)).toBe(400)
    expect((await r.json()).error).toBeTruthy()
  }
  expect((await put('admin', [{ key: 'skillCap', value: 'x'.repeat(200) }])).status).toBe(204)
  expect((await put('admin', Array.from({ length: 501 }, (_, i) => ({ key: `k${i}`, value: '1' })))).status).toBe(400)
  expect((await as('admin', '/api/sr6/creation', { method: 'PUT', body: 'x', headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
})

test('Anarchy has no creation rules: /api/creation is 404 and nothing lands in custom/', async () => {
  expect((await put('admin', SETTINGS, '/api/creation')).status).toBe(404)
  expect((await as('admin', '/api/creation')).status).toBe(404)
  expect(existsSync(join(custom, 'creation.xml'))).toBe(false)
  expect((await as('admin', '/custom/creation.xml')).status).toBe(404)
  expect(existsSync(join(custom, 'sr6', 'creation.xml'))).toBe(true)
})

// a campaign's own settings
const json = (who: string, method: string, path: string, body?: unknown) => as(who, path, { method,
  ...body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } })
const campaign = async (who: string, name: string, game = 'sr6/') => (await (await json(who, 'POST', `/api/${game}campaigns`, { name })).json()).id as string
const OWN = [{ key: 'startingKarma', value: '55', source: 'HOUSE', page: 3 }, { key: 'skillCap', value: '4' }]

test('a campaign uses the server’s settings until its GM sets its own; players read them, nobody else sees them', async () => {
  expect((await put('admin', SETTINGS)).status).toBe(204)
  const id = await campaign('eve', 'Made-up Table'), other = await campaign('gus', 'Other Table')
  expect((await json('eve', 'POST', `/api/sr6/campaigns/${id}/members`, { user: 'pat' })).status).toBe(200)
  expect((await (await json('eve', 'GET', `/api/sr6/campaigns/${id}`)).json()).creation).toBeNull()
  // its GM sets its own
  const r = await json('eve', 'PUT', `/api/sr6/campaigns/${id}`, { creation: OWN })
  expect(r.status).toBe(200)
  expect((await r.json()).creation).toEqual(OWN)
  // its player reads them, read only
  expect((await (await json('pat', 'GET', `/api/sr6/campaigns/${id}`)).json()).creation).toEqual(OWN)
  expect((await (await json('pat', 'GET', '/api/sr6/campaigns')).json())[0].creation).toEqual(OWN)
  expect((await json('pat', 'PUT', `/api/sr6/campaigns/${id}`, { creation: [] })).status).toBe(403)
  // another editor (not its GM) and a player not in it: no access at all
  expect((await json('gus', 'PUT', `/api/sr6/campaigns/${id}`, { creation: [] })).status).toBe(404)
  expect((await json('nia', 'GET', `/api/sr6/campaigns/${id}`)).status).toBe(404)
  expect((await json('nia', 'PUT', `/api/sr6/campaigns/${id}`, { creation: [] })).status).toBe(404)
  // isolation: the server's default and the other campaign are untouched
  expect(await (await as('pat', '/api/sr6/creation')).json()).toHaveLength(SETTINGS.length)
  expect(readFileSync(join(custom, 'sr6', 'creation.xml'), 'utf8')).not.toContain('55')
  expect((await (await json('gus', 'GET', `/api/sr6/campaigns/${other}`)).json()).creation).toBeNull()
  // the admin may change them too; the same checks as the server's
  expect((await (await json('admin', 'PUT', `/api/sr6/campaigns/${id}`, { creation: OWN.slice(0, 1) })).json()).creation).toEqual(OWN.slice(0, 1))
  for (const bad of [[{ key: 'bad key', value: '1' }], [{ key: 'skillCap', value: '' }], [{ key: 'skillCap', value: '5', source: 'crb' }], 'x'])
    expect((await json('eve', 'PUT', `/api/sr6/campaigns/${id}`, { creation: bad })).status, JSON.stringify(bad)).toBe(400)
  expect((await (await json('eve', 'GET', `/api/sr6/campaigns/${id}`)).json()).creation).toEqual(OWN.slice(0, 1))
  // a full form's worth (500 settings, well over the usual JSON cap) fits
  const many = Array.from({ length: 500 }, (_, i) => ({ key: `made.up.setting.${i}`, value: String(i), source: 'HOUSE', page: i + 1 }))
  expect((await json('eve', 'PUT', `/api/sr6/campaigns/${id}`, { creation: many })).status).toBe(200)
  // an empty list is its own (nothing set); campaigns.xml stays valid
  expect((await (await json('eve', 'PUT', `/api/sr6/campaigns/${id}`, { creation: [] })).json()).creation).toEqual([])
  expect((await json('eve', 'PUT', `/api/sr6/campaigns/${id}`, { creation: OWN })).status).toBe(200)
  const xml = readFileSync(join(custom, 'sr6', 'campaigns.xml'), 'utf8')
  expect(xml).toContain('<setting key="startingKarma" value="55" source="HOUSE" page="3"/>')
  const xsd = readFileSync('public/data/schema/campaigns.xsd', 'utf8')
  expect((await validateXML({ xml: { fileName: 'campaigns.xml', contents: xml }, schema: { fileName: 'campaigns.xsd', contents: xsd } })).errors).toEqual([])
  // a rename keeps them; back to the server's
  expect((await (await json('eve', 'PUT', `/api/sr6/campaigns/${id}`, { name: 'Renamed Table' })).json()).creation).toEqual(OWN)
  expect((await (await json('eve', 'PUT', `/api/sr6/campaigns/${id}`, { creation: null })).json()).creation).toBeNull()
  expect(readFileSync(join(custom, 'sr6', 'campaigns.xml'), 'utf8')).not.toContain('<creation')
})

test('a campaign’s GM locks creation settings for its runners: kept with who locked each, players read them, nobody else changes them', async () => {
  const id = await campaign('eve', 'Locked Table')
  expect((await json('eve', 'POST', `/api/sr6/campaigns/${id}/members`, { user: 'pat' })).status).toBe(200)
  expect((await (await json('eve', 'GET', `/api/sr6/campaigns/${id}`)).json()).locks).toEqual([])
  const r = await (await json('eve', 'PUT', `/api/sr6/campaigns/${id}`, { locks: ['startingKarma', 'contactKarma'] })).json()
  expect(r.locks).toEqual([{ key: 'startingKarma', by: 'eve', byName: 'Eve' }, { key: 'contactKarma', by: 'eve', byName: 'Eve' }])
  // the admin adds one: the ones there keep who locked them
  const r2 = await (await json('admin', 'PUT', `/api/sr6/campaigns/${id}`, { locks: ['startingKarma', 'maxKarmaLeft'] })).json()
  expect(r2.locks.map((l: { key: string; by: string }) => [l.key, l.by])).toEqual([['startingKarma', 'eve'], ['maxKarmaLeft', 'admin']])
  expect((await (await json('pat', 'GET', `/api/sr6/campaigns/${id}`)).json()).locks).toHaveLength(2)
  expect((await json('pat', 'PUT', `/api/sr6/campaigns/${id}`, { locks: [] })).status).toBe(403)
  for (const bad of ['startingKarma', [3], ['bad key']]) expect((await json('eve', 'PUT', `/api/sr6/campaigns/${id}`, { locks: bad })).status, JSON.stringify(bad)).toBe(400)
  const xml = readFileSync(join(custom, 'sr6', 'campaigns.xml'), 'utf8')
  expect(xml).toContain('<lock key="maxKarmaLeft" by="admin"/>')
  const xsd = readFileSync('public/data/schema/campaigns.xsd', 'utf8')
  expect((await validateXML({ xml: { fileName: 'campaigns.xml', contents: xml }, schema: { fileName: 'campaigns.xsd', contents: xsd } })).errors).toEqual([])
  expect((await (await json('eve', 'PUT', `/api/sr6/campaigns/${id}`, { locks: [] })).json()).locks).toEqual([])
})

test('Anarchy campaigns have no creation settings', async () => {
  const id = await campaign('eve', 'Anarchy Table', '')
  const r = await json('eve', 'PUT', `/api/campaigns/${id}`, { creation: OWN })
  expect(r.status).toBe(200)
  expect(await r.json()).not.toHaveProperty('creation')
  expect(readFileSync(join(custom, 'campaigns.xml'), 'utf8')).not.toContain('<creation')
})
