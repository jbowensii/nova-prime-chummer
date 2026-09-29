// @vitest-environment node
// Campaigns (server/campaigns.mjs): who may do what, who sees which runners, one campaign per runner, saves keep it and
// copies drop it, account renames and deletes, campaigns.xml schema-valid and never served.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { validateXML } from 'xmllint-wasm'
// @ts-expect-error plain JS module
import { createServer, restoredCopy } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'

vi.setConfig({ testTimeout: 30000 })
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', ed: 'ed-password-12', pat: 'pat-password-1', kim: 'kim-password-1' }
type Who = keyof typeof PW
const dir = mkdtempSync(join(tmpdir(), 'ca2-campaigns-')), chars = join(dir, 'chars'), custom = join(dir, 'custom')
const jar = {} as Record<Who, string>
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

beforeAll(async () => {
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' }, { username: 'ed', password: PW.ed, role: 'editor' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }, { username: 'kim', password: PW.kim, role: 'player' }]))
  srv = createServer({ staticDir: 'public', charDir: chars, customDir: custom, libraryDir: join(dir, 'library') })
  await new Promise<void>(ok => srv.listen(0, ok))
  base = `http://127.0.0.1:${srv.address().port}`
  for (const who of Object.keys(PW) as Who[]) {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ username: who, password: PW[who] }),
      headers: { 'Content-Type': 'application/json', Origin: base } })
    jar[who] = r.headers.getSetCookie().find(c => /session=/.test(c))!.split(';')[0]
  }
})
afterAll(() => srv.close())

const call = (who: Who, method: string, path: string, body?: unknown) => fetch(`${base}${path}`, { method,
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  headers: { Origin: base, Cookie: jar[who], ...(body !== undefined && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}) } })
const runner = (id: string, street: string, extra = '') =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="${id}" streetName="${street}" metatype="ork" level="runner" package="runner-face"${extra} updatedAt="2026-09-29"><build/></ca2:character>`
const sheets = async (who: Who) => (await (await call(who, 'GET', '/api/characters')).json()).map((c: { owner: string; xml: string }) =>
  `${c.owner}/${c.xml.match(/ id="([^"]+)"/)![1]}`).sort()
const file = (user: string, name: string) => readFileSync(join(chars, user, name), 'utf8')
let c1 = '', c2 = ''

test('the admin and editors make campaigns (the maker is its GM); players can’t', async () => {
  expect((await call('pat', 'POST', '/api/campaigns', { name: 'Nope' })).status).toBe(403)
  expect((await call('eve', 'POST', '/api/campaigns', { name: '' })).status).toBe(400)
  const r = await call('eve', 'POST', '/api/campaigns', { name: 'Seattle <Nights> & Days', note: 'Session 0 on Friday' })
  expect(r.status).toBe(201)
  const c = await r.json()
  expect(c).toMatchObject({ name: 'Seattle <Nights> & Days', note: 'Session 0 on Friday', archived: false, you: 'gm',
    gms: [{ username: 'eve', name: 'Eve Editor' }], members: [], runners: [] })
  c1 = c.id
  c2 = (await (await call('ed', 'POST', '/api/campaigns', { name: 'Ed’s table' })).json()).id
  for (const who of ['pat', 'kim'] as const) expect(await (await call(who, 'GET', '/api/campaigns')).json()).toEqual([])
  expect((await (await call('ada', 'GET', '/api/campaigns')).json()).map((x: { you: string }) => x.you)).toEqual(['admin', 'admin'])
  expect((await call('ed', 'GET', `/api/campaigns/${c1}`)).status).toBe(404) // not theirs
})

test('members and co-GMs: the GM picks players; only the admin adds co-GMs, and only admins or editors', async () => {
  expect((await call('eve', 'POST', `/api/campaigns/${c1}/members`, { user: 'nobody' })).status).toBe(404)
  for (const user of ['pat', 'kim']) expect((await call('eve', 'POST', `/api/campaigns/${c1}/members`, { user })).status).toBe(200)
  expect((await call('ed', 'POST', `/api/campaigns/${c2}/members`, { user: 'pat' })).status).toBe(200)
  expect((await call('pat', 'POST', `/api/campaigns/${c1}/members`, { user: 'pat' })).status).toBe(403) // a member isn't a GM
  expect((await call('pat', 'PUT', `/api/campaigns/${c1}`, { name: 'Mine' })).status).toBe(403)
  expect((await call('eve', 'POST', `/api/campaigns/${c1}/gms`, { user: 'ed' })).status).toBe(403)
  expect((await call('ada', 'POST', `/api/campaigns/${c1}/gms`, { user: 'kim' })).status).toBe(400)
  expect((await call('ada', 'POST', `/api/campaigns/${c1}/gms`, { user: 'ed' })).status).toBe(200)
  expect((await call('ed', 'DELETE', `/api/campaigns/${c1}/gms/ed`)).status).toBe(200) // a GM steps down
  expect((await call('eve', 'DELETE', `/api/campaigns/${c1}/gms/eve`)).status).toBe(409) // the last GM stays
  expect((await call('eve', 'PUT', `/api/campaigns/${c1}`, { name: 'Seattle Nights', archived: 'yes' })).status).toBe(400)
  expect(await (await call('eve', 'PUT', `/api/campaigns/${c1}`, { name: 'Seattle Nights' })).json()).toMatchObject({ name: 'Seattle Nights' })
  const xml = readFileSync(join(custom, 'campaigns.xml'), 'utf8')
  const v = await validateXML({ xml: { fileName: 'campaigns.xml', contents: xml },
    schema: { fileName: 'campaigns.xsd', contents: readFileSync('public/data/schema/campaigns.xsd', 'utf8') } })
  expect(v.errors).toEqual([])
  expect((await call('pat', 'GET', '/custom/campaigns.xml')).status).toBe(404)
  expect((await call('pat', 'GET', '/custom/./campaigns.xml')).status).toBe(404)
})

test('a player puts their own runner in one campaign; its GM reads the sheet, members see the roster only', async () => {
  expect((await call('pat', 'PUT', '/api/characters/p1', runner('p1', 'Ratchet &amp; Co'))).status).toBe(201)
  expect((await call('pat', 'PUT', '/api/characters/p2', runner('p2', 'Spare'))).status).toBe(201)
  expect((await call('kim', 'PUT', '/api/characters/k1', runner('k1', 'Kestrel'))).status).toBe(201)
  expect((await call('ada', 'PUT', '/api/characters/a1', runner('a1', 'Boss'))).status).toBe(201)
  expect(await sheets('eve')).toEqual([]) // an editor no longer sees everyone's runners
  expect((await call('kim', 'POST', `/api/campaigns/${c1}/runners`, { id: 'p1' })).status).toBe(404) // not kim's
  expect((await call('kim', 'POST', `/api/campaigns/${c2}/runners`, { id: 'k1' })).status).toBe(404) // not kim's campaign
  expect((await call('pat', 'POST', `/api/campaigns/${c1}/runners`, { id: 'p1' })).status).toBe(200)
  expect((await call('kim', 'POST', `/api/campaigns/${c1}/runners`, { id: 'k1' })).status).toBe(200)
  expect(file('pat', 'Ratchet-amp-Co.xml')).toContain(`campaign="${c1}"`)
  expect(file('pat', 'Ratchet-amp-Co.xml')).toContain('rev="1"') // not a new revision: an open editor still saves
  const other = await call('pat', 'POST', `/api/campaigns/${c2}/runners`, { id: 'p1' })
  expect(other.status).toBe(409)
  expect((await other.json()).error).toContain('Seattle Nights')
  expect(await sheets('eve')).toEqual(['kim/k1', 'pat/p1'])
  expect(await sheets('ed')).toEqual([])
  expect(await sheets('pat')).toEqual(['pat/p1', 'pat/p2'])
  expect((await sheets('ada')).length).toBe(4)
  const roster = await (await call('kim', 'GET', `/api/campaigns/${c1}`)).json()
  expect(roster.you).toBe('member')
  expect(roster.runners).toEqual([
    { id: 'p1', owner: 'pat', ownerName: 'Pat Player', streetName: 'Ratchet & Co', level: 'runner', package: 'runner-face' },
    { id: 'k1', owner: 'kim', ownerName: 'kim', streetName: 'Kestrel', level: 'runner', package: 'runner-face' }])
  expect((await (await call('eve', 'GET', `/api/campaigns/${c1}`)).json()).runners[0]).toMatchObject({ file: 'Ratchet-amp-Co.xml' })
  // a GM reads, never writes, a player's runner
  expect((await call('eve', 'PUT', '/api/characters/p1?force=1', runner('p1', 'Hijacked'))).status).toBe(403)
})

test('saves keep the stored campaign; a new runner or a copy gets none', async () => {
  expect((await call('pat', 'PUT', '/api/characters/p1', runner('p1', 'Ratchet'))).status).toBe(409) // no If-Match: stale
  expect((await call('pat', 'PUT', '/api/characters/p1?force=1', runner('p1', 'Ratchet', ' campaign="ffffffffffff"'))).status).toBe(200)
  expect(file('pat', 'Ratchet-amp-Co.xml')).toContain(`campaign="${c1}"`)
  expect(file('pat', 'Ratchet-amp-Co.xml')).not.toContain('ffffffffffff')
  expect((await call('pat', 'PUT', '/api/characters/p3', runner('p3', 'Copy', ` campaign="${c1}"`))).status).toBe(201)
  expect(file('pat', 'Copy.xml')).not.toContain('campaign=')
  expect(restoredCopy(runner('p1', 'X', ` campaign="${c1}"`), 'new-id')).not.toContain('campaign=')
})

test('leaving: the owner or a GM takes a runner out; a removed member’s runners leave; a campaign is deleted only empty', async () => {
  expect((await call('kim', 'DELETE', `/api/campaigns/${c1}/runners/p1`)).status).toBe(403)
  expect((await call('eve', 'DELETE', `/api/campaigns/${c1}`)).status).toBe(409)
  expect((await call('eve', 'DELETE', `/api/campaigns/${c1}/runners/p1`)).status).toBe(200)
  expect(file('pat', 'Ratchet-amp-Co.xml')).not.toContain('campaign=')
  expect((await call('eve', 'DELETE', `/api/campaigns/${c1}/members/kim`)).status).toBe(200)
  expect(file('kim', 'Kestrel.xml')).not.toContain('campaign=')
  expect(await sheets('eve')).toEqual([])
  expect((await call('kim', 'GET', `/api/campaigns/${c1}`)).status).toBe(404)
  expect((await call('pat', 'POST', `/api/campaigns/${c2}/runners`, { id: 'p1' })).status).toBe(200) // free again
  expect((await call('pat', 'DELETE', `/api/campaigns/${c2}/runners/p1`)).status).toBe(200)
  expect((await call('eve', 'DELETE', `/api/campaigns/${c1}`)).status).toBe(204)
  expect((await call('eve', 'GET', `/api/campaigns/${c1}`)).status).toBe(404)
})

test('renaming an account renames it in campaigns; deleting one drops it, and a campaign left without a GM gets the admin', async () => {
  const users: { id: string; username: string }[] = await (await call('ada', 'GET', '/api/users')).json()
  const id = (n: string) => users.find(u => u.username === n)!.id
  expect((await call('ed', 'POST', `/api/campaigns/${c2}/members`, { user: 'kim' })).status).toBe(200)
  expect((await call('ada', 'PUT', `/api/users/${id('kim')}`, { username: 'kira' })).status).toBe(200)
  expect((await call('ada', 'DELETE', `/api/users/${id('ed')}`)).status).toBe(204)
  const c = await (await call('ada', 'GET', `/api/campaigns/${c2}`)).json()
  expect(c.gms.map((u: { username: string }) => u.username)).toEqual(['ada'])
  expect(c.members.map((u: { username: string }) => u.username)).toEqual(['pat', 'kira'])
})
