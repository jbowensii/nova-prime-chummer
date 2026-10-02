// @vitest-environment node
// NPCs (server.mjs /api/npcs*, campaigns.mjs …/npcs): a GM-only store in characters/.npcs/<owner>/; players get 403 on
// every route and never see a shared NPC; rev/If-Match like runners; the NPC trash; account renames and deletes move the
// folder; backups include it.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'
// @ts-expect-error plain JS module
import { findPython } from '../../tools/python.mjs'

vi.setConfig({ testTimeout: 30000 })
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', ed: 'ed-password-12', pat: 'pat-password-1' }
type Who = keyof typeof PW
const python: string[] | null = findPython()
const dir = mkdtempSync(join(tmpdir(), 'ca2-npcs-')), chars = join(dir, 'chars'), npcs = join(chars, '.npcs')
const jar = {} as Record<Who, string>
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

beforeAll(async () => {
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' }, { username: 'ed', password: PW.ed, role: 'editor', name: 'Ed' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
  srv = createServer({ staticDir: 'public', charDir: chars, customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'), python: python ?? 'python3' })
  await new Promise<void>(ok => srv.listen(0, ok))
  base = `http://127.0.0.1:${srv.address().port}`
  for (const who of Object.keys(PW) as Who[]) {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ username: who, password: PW[who] }),
      headers: { 'Content-Type': 'application/json', Origin: base } })
    jar[who] = r.headers.getSetCookie().find(c => /session=/.test(c))!.split(';')[0]
  }
})
afterAll(() => srv.close())

const call = (who: Who, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { method,
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  headers: { Origin: base, Cookie: jar[who], ...(body !== undefined && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}), ...headers } })
const npc = (id: string, name: string, extra = '') =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="${id}" streetName="${name}" metatype="ork" level="runner"${extra} updatedAt="2026-10-02">\n  <npc kind="npc" tier="regular"/><build/></ca2:character>`
const ids = async (who: Who, path = '/api/npcs') => (await (await call(who, 'GET', path)).json()).map((c: { owner: string; xml: string }) =>
  `${c.owner}/${c.xml.match(/ id="([^"]+)"/)![1]}`).sort()
const userId = async (n: string) => ((await (await call('ada', 'GET', '/api/users')).json()) as { id: string; username: string }[]).find(u => u.username === n)!.id
let cid = ''

test('a player gets 403 on every /api/npcs route', async () => {
  for (const [m, p] of [['GET', '/api/npcs'], ['PUT', '/api/npcs/n1'], ['DELETE', '/api/npcs/n1'], ['GET', '/api/npcs/trash'],
    ['DELETE', '/api/npcs/trash'], ['POST', '/api/npcs/trash/a-1700000000000.xml/restore'], ['DELETE', '/api/npcs/trash/a-1700000000000.xml']])
    expect([m, p, (await call('pat', m, p, m === 'PUT' ? npc('n1', 'Nope') : undefined)).status]).toEqual([m, p, 403])
  expect(existsSync(npcs)).toBe(false)
})

test('an editor creates and saves their own NPCs with rev and If-Match; a body without an npc block is refused', async () => {
  expect((await call('eve', 'PUT', '/api/npcs/n1', npc('n1', 'Ganger').replace(/<npc[^>]*\/>/, ''))).status).toBe(400)
  const made = await call('eve', 'PUT', '/api/npcs/n1', npc('n1', 'Ganger &amp; Co'))
  expect([made.status, await made.json()]).toEqual([201, { rev: 1, file: 'Ganger-amp-Co.xml' }])
  expect(readFileSync(join(npcs, 'eve', 'Ganger-amp-Co.xml'), 'utf8')).toContain('rev="1"')
  expect((await call('eve', 'PUT', '/api/npcs/n1', npc('n1', 'Ganger'))).status).toBe(409) // no If-Match
  expect((await call('eve', 'PUT', '/api/npcs/n1', npc('n1', 'Ganger'), { 'If-Match': '0' })).status).toBe(409)
  const saved = await call('eve', 'PUT', '/api/npcs/n1', npc('n1', 'Ganger'), { 'If-Match': '1' })
  expect([saved.status, await saved.json()]).toEqual([200, { rev: 2, file: 'Ganger-amp-Co.xml' }])
  const [only] = await (await call('eve', 'GET', '/api/npcs')).json()
  expect(only).toMatchObject({ file: 'Ganger-amp-Co.xml', rev: 2, owner: 'eve', ownerName: 'Eve Editor' })
  // never a runner: not in /api/characters, not in the runner folder
  expect(await ids('eve', '/api/characters')).toEqual([])
  expect(existsSync(join(chars, 'eve'))).toBe(false)
})

test('another editor can’t overwrite or delete it and doesn’t list it; the admin lists everyone’s', async () => {
  expect((await call('ed', 'PUT', '/api/npcs/n1', npc('n1', 'Mine now'), { 'If-Match': '2' })).status).toBe(403)
  expect((await call('ed', 'DELETE', '/api/npcs/n1')).status).toBe(403)
  expect((await call('ed', 'PUT', '/api/npcs/e1', npc('e1', 'Ed’s goon'))).status).toBe(201)
  expect(await ids('ed')).toEqual(['ed/e1'])
  expect(await ids('ada')).toEqual(['ed/e1', 'eve/n1'])
  expect((await (await call('ada', 'GET', '/api/npcs')).json()).find((c: { owner: string }) => c.owner === 'eve').ownerName).toBe('Eve Editor')
  expect(await ids('ada', '/api/characters')).toEqual([])
  expect(readFileSync(join(npcs, 'eve', 'Ganger-amp-Co.xml'), 'utf8')).toContain('streetName="Ganger"')
})

test('an NPC shared with a campaign: its GMs see it (read only for others), its members never do', async () => {
  cid = (await (await call('eve', 'POST', '/api/campaigns', { name: 'Seattle' })).json()).id
  expect((await call('eve', 'POST', `/api/campaigns/${cid}/members`, { user: 'pat' })).status).toBe(200)
  expect((await call('ada', 'POST', `/api/campaigns/${cid}/gms`, { user: 'ed' })).status).toBe(200)
  expect((await call('pat', 'PUT', '/api/characters/p1', npc('p1', 'Pat’s runner').replace(/<npc[^>]*\/>/, ''))).status).toBe(201)
  expect((await call('pat', 'POST', `/api/campaigns/${cid}/runners`, { id: 'p1' })).status).toBe(200)
  expect((await call('pat', 'POST', `/api/campaigns/${cid}/npcs`, { id: 'n1' })).status).toBe(404) // a member learns nothing
  expect((await call('eve', 'POST', `/api/campaigns/${cid}/npcs`, { id: 'nope' })).status).toBe(404)
  const shared = await call('eve', 'POST', `/api/campaigns/${cid}/npcs`, { id: 'n1' })
  expect(shared.status).toBe(200)
  expect((await shared.json()).npcs).toEqual([{ id: 'n1', name: 'Ganger', owner: 'eve', ownerName: 'Eve Editor' }])
  expect(readFileSync(join(npcs, 'eve', 'Ganger-amp-Co.xml'), 'utf8')).toContain(`campaign="${cid}"`)
  // a member gets the same 404 to unshare whether or not the NPC is shared; so does an editor outside a campaign
  for (const npcId of ['n1', 'zz']) {
    const r = await call('pat', 'DELETE', `/api/campaigns/${cid}/npcs/${npcId}`)
    expect([r.status, await r.json()]).toEqual([404, { error: 'no such campaign' }])
  }
  const c2 = (await (await call('ed', 'POST', '/api/campaigns', { name: 'Ed’s table' })).json()).id
  expect((await call('eve', 'POST', `/api/campaigns/${c2}/npcs`, { id: 'n1' })).status).toBe(404)
  // one campaign per NPC: unshare it there first
  expect((await call('ed', 'POST', `/api/campaigns/${c2}/npcs`, { id: 'e1' })).status).toBe(200)
  const twice = await call('ed', 'POST', `/api/campaigns/${cid}/npcs`, { id: 'e1' })
  expect([twice.status, await twice.json()]).toEqual([409, { error: 'That NPC is shared with Ed’s table; unshare it there first.' }])
  expect((await call('ed', 'DELETE', `/api/campaigns/${c2}/npcs/e1`)).status).toBe(200)
  // the co-GM reads it, can't change it; the admin sees it in the campaign too
  expect(await ids('ed')).toEqual(['ed/e1', 'eve/n1'])
  expect((await call('ed', 'PUT', '/api/npcs/n1', npc('n1', 'Mine'), { 'If-Match': '2' })).status).toBe(403)
  expect((await (await call('ed', 'GET', `/api/campaigns/${cid}`)).json()).npcs).toEqual([{ id: 'n1', name: 'Ganger', owner: 'eve', ownerName: 'Eve Editor' }])
  expect((await (await call('ada', 'GET', `/api/campaigns/${cid}`)).json()).npcs).toHaveLength(1)
  // the member: no npcs in the view, the roster unchanged, /api/characters only their own
  const view = await (await call('pat', 'GET', `/api/campaigns/${cid}`)).json()
  expect(view).not.toHaveProperty('npcs')
  expect(view.runners.map((r: { streetName: string }) => r.streetName)).toEqual(['Pat’s runner'])
  expect(JSON.stringify(view)).not.toContain('Ganger')
  expect(await ids('pat', '/api/characters')).toEqual(['pat/p1'])
  expect(JSON.stringify(await (await call('pat', 'GET', '/api/campaigns')).json())).not.toContain('Ganger')
  // a save keeps the campaign (never the body's); the body can't put it in another
  expect((await call('eve', 'PUT', '/api/npcs/n1', npc('n1', 'Ganger', ' campaign="000000000000"'), { 'If-Match': '2' })).status).toBe(200)
  expect(readFileSync(join(npcs, 'eve', 'Ganger-amp-Co.xml'), 'utf8')).toContain(`campaign="${cid}"`)
  // the co-GM takes it out; the owner shares it again
  expect((await (await call('ed', 'DELETE', `/api/campaigns/${cid}/npcs/n1`)).json()).npcs).toEqual([])
  expect(await ids('ed')).toEqual(['ed/e1'])
  expect((await call('eve', 'POST', `/api/campaigns/${cid}/npcs`, { id: 'n1' })).status).toBe(200)
})

test('delete → NPC trash → restore; a deleted NPC leaves its campaign', async () => {
  expect((await call('eve', 'DELETE', '/api/npcs/n1')).status).toBe(204)
  expect(await ids('eve')).toEqual([])
  expect((await (await call('eve', 'GET', `/api/campaigns/${cid}`)).json()).npcs).toEqual([])
  const t = await (await call('eve', 'GET', '/api/npcs/trash')).json()
  expect(t).toMatchObject({ user: 'eve', name: 'Eve Editor', items: [{ id: 'n1', name: 'Ganger' }] })
  expect(readdirSync(join(npcs, 'eve', '.trash'))).toEqual([t.items[0].file])
  expect((await (await call('eve', 'GET', '/api/trash')).json()).items).toEqual([]) // not the runner trash
  expect((await call('ed', 'GET', '/api/npcs/trash?user=eve')).status).toBe(403)
  expect((await (await call('ada', 'GET', '/api/npcs/trash?user=eve')).json()).items).toHaveLength(1)
  const r = await call('eve', 'POST', `/api/npcs/trash/${t.items[0].file}/restore`)
  expect(await r.json()).toEqual({ file: 'Ganger-amp-Co.xml', id: 'n1', name: 'Ganger', copy: false })
  expect(await ids('eve')).toEqual(['eve/n1'])
  expect(readFileSync(join(npcs, 'eve', 'Ganger-amp-Co.xml'), 'utf8')).not.toContain('campaign=')
  // delete for good
  expect((await call('eve', 'DELETE', '/api/npcs/n1')).status).toBe(204)
  const [item] = (await (await call('eve', 'GET', '/api/npcs/trash')).json()).items
  expect((await call('eve', 'DELETE', `/api/npcs/trash/${item.file}`)).status).toBe(204)
  expect(readdirSync(join(npcs, 'eve', '.trash'))).toEqual([])
  expect((await call('eve', 'PUT', '/api/npcs/n1', npc('n1', 'Ganger'))).status).toBe(201)
})

test('backups include the NPC store', async () => {
  if (!python) return // the backup is `python -m importer`
  const { token } = await (await call('ada', 'POST', '/api/backup')).json()
  const zip = Buffer.from(await (await call('ada', 'GET', `/api/backup/${token}`)).arrayBuffer()).toString('latin1')
  expect(zip).toContain('characters/.npcs/eve/Ganger.xml')
  expect(zip).toContain('characters/.npcs/ed/')
}, 120000)

test('an account rename moves its NPC folder; a delete retires it to .npcs/.trash; .npcs is never an account', async () => {
  expect((await call('ada', 'PUT', `/api/users/${await userId('ed')}`, { username: 'edd' })).status).toBe(200)
  expect(existsSync(join(npcs, 'ed'))).toBe(false)
  expect(readdirSync(join(npcs, 'edd'))).toEqual(['Eds-goon.xml'])
  expect(await ids('ada')).toEqual(['edd/e1', 'eve/n1'])
  // a leftover NPC folder blocks taking that name
  mkdirSync(join(npcs, 'zed'), { recursive: true })
  expect((await call('ada', 'POST', '/api/users', { username: 'zed', name: 'Zed', role: 'editor', password: 'zed-password-1' })).status).toBe(409)
  expect((await call('ada', 'PUT', `/api/users/${await userId('edd')}`, { username: 'zed' })).status).toBe(409)
  expect(existsSync(join(npcs, 'edd', 'Eds-goon.xml'))).toBe(true)
  const users = (await (await call('ada', 'GET', '/api/users')).json()).map((u: { username: string }) => u.username)
  expect(users.some((u: string) => u.startsWith('.'))).toBe(false)
  expect((await call('ada', 'DELETE', `/api/users/${await userId('edd')}`)).status).toBe(204)
  expect(existsSync(join(npcs, 'edd'))).toBe(false)
  expect(readdirSync(join(npcs, '.trash'))).toEqual(['edd-Eds-goon.xml'])
  expect(await ids('ada')).toEqual(['eve/n1'])
})


test('PUT /api/characters refuses an NPC file: an NPC never lands in a runner folder players can list', async () => {
  for (const who of ['eve', 'pat'] as Who[]) {
    const r = await call(who, 'PUT', '/api/characters/sneaky-1', npc('sneaky-1', 'Sneaky'))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/NPC/)
  }
  expect(existsSync(join(chars, 'eve', 'Sneaky.xml'))).toBe(false)
  expect(existsSync(join(chars, 'pat', 'Sneaky.xml'))).toBe(false)
})
