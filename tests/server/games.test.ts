// @vitest-environment node
// The two games' stores (server.mjs gameStore, server/games.mjs): Anarchy at the unprefixed /api routes and today's folders,
// Shadowrun 6 at /api/sr6/* in characters/sr6/ and custom/sr6/. Nothing of one game is listed, saved, restored or shared in
// the other; accounts span both; an account called sr6 from before blocks the SR6 area until it is renamed. Made-up files.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'
// @ts-expect-error plain JS module
import { findPython } from '../../tools/python.mjs'

vi.setConfig({ testTimeout: 30000 })
const PW: Record<string, string> = { ada: 'ada-password-1', eve: 'eve-password-1', pat: 'pat-password-1', sid: 'sid-password-1', sr6: 'old-password-1' }
const python: string[] | null = findPython()
type Srv = { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
const servers: Srv[] = []
afterAll(() => { for (const s of servers) s.close() })

async function start(dir: string, users: { username: string; role?: string }[] | null) {
  if (users) {
    mkdirSync(join(dir, 'library', '.config'), { recursive: true })
    writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile(users.map(u => ({ ...u, password: PW[u.username], name: u.username }))))
  }
  const srv: Srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'),
    python: python ?? 'python3' })
  servers.push(srv)
  await new Promise<void>(ok => srv.listen(0, ok))
  return { base: `http://127.0.0.1:${srv.address().port}`, chars: join(dir, 'chars'), custom: join(dir, 'custom'), lib: join(dir, 'library') }
}
const jar = new Map<string, string>()
async function signIn(base: string, who: string) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ username: who, password: PW[who] }),
    headers: { 'Content-Type': 'application/json', Origin: base } })
  expect(r.status, `${who} signs in`).toBe(200)
  jar.set(`${base} ${who}`, r.headers.getSetCookie().find(c => /session=/.test(c))!.split(';')[0])
}
const at = (base: string) => (who: string, method: string, path: string, body?: unknown) => fetch(`${base}${path}`, { method,
  body: body === undefined || typeof body === 'string' || body instanceof Uint8Array ? body as BodyInit : JSON.stringify(body),
  headers: { Origin: base, Cookie: jar.get(`${base} ${who}`) ?? '',
    ...(body !== undefined && typeof body !== 'string' && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}) } })

const ca2 = (id: string, street: string, inner = '<build/>') =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="${id}" streetName="${street}" updatedAt="2026-10-02">${inner}</ca2:character>`
const sr6 = (id: string, street: string, inner = '<build/>') =>
  `<?xml version="1.0"?><sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="${id}" streetName="${street}" updatedAt="2026-10-02">${inner}</sr6:character>`
const NPC = '\n  <npc kind="grunt"/><build/>'
/** "owner/id/game" for each entry of a character or NPC list. */
const listed = async (r: Response) => ((await r.json()) as { owner: string; xml: string }[])
  .map(c => `${c.owner}/${c.xml.match(/ id="([^"]+)"/)![1]}/${/<sr6:character\b/.test(c.xml) ? 'sr6' : 'ca2'}`).sort()

let s: Awaited<ReturnType<typeof start>>, call: ReturnType<typeof at>
let s6c = '', ca2c = ''
beforeAll(async () => {
  s = await start(mkdtempSync(join(tmpdir(), 'ca2-games-')), [{ username: 'ada' }, { username: 'eve', role: 'editor' }, { username: 'pat', role: 'player' }])
  call = at(s.base)
  for (const who of ['ada', 'eve', 'pat']) await signIn(s.base, who)
})

test('isolation both ways: each game lists, deletes and restores only its own runners, at its own folders', async () => {
  for (const [who, id] of [['pat', 'r1'], ['eve', 'e1']]) {
    expect((await call(who, 'PUT', `/api/characters/${id}`, ca2(id, `Anarchy ${who}`))).status).toBe(201)
    expect((await call(who, 'PUT', `/api/sr6/characters/${id}`, sr6(id, `Sixth ${who}`))).status).toBe(201) // the same id: separate stores
  }
  expect(readdirSync(join(s.chars, 'pat'))).toEqual(['Anarchy-pat.xml'])
  expect(readdirSync(join(s.chars, 'sr6', 'pat'))).toEqual(['Sixth-pat.xml'])
  expect(await listed(await call('pat', 'GET', '/api/characters'))).toEqual(['pat/r1/ca2'])
  expect(await listed(await call('pat', 'GET', '/api/sr6/characters'))).toEqual(['pat/r1/sr6'])
  expect(await listed(await call('eve', 'GET', '/api/characters'))).toEqual(['eve/e1/ca2'])
  expect(await listed(await call('eve', 'GET', '/api/sr6/characters'))).toEqual(['eve/e1/sr6'])
  expect(await listed(await call('ada', 'GET', '/api/characters'))).toEqual(['eve/e1/ca2', 'pat/r1/ca2'])
  expect(await listed(await call('ada', 'GET', '/api/sr6/characters'))).toEqual(['eve/e1/sr6', 'pat/r1/sr6'])
  // a save of the other game's copy goes by its own rev
  expect((await call('pat', 'PUT', '/api/sr6/characters/r1', sr6('r1', 'Sixth pat'))).status).toBe(409)

  for (const [game, other] of [['/api/sr6', '/api'], ['/api', '/api/sr6']]) {
    expect((await call('pat', 'DELETE', `${game}/characters/r1`)).status).toBe(204)
    expect(await listed(await call('pat', 'GET', `${other}/characters`))).toEqual([`pat/r1/${other === '/api' ? 'ca2' : 'sr6'}`])
    const t = await (await call('pat', 'GET', `${game}/trash`)).json()
    expect(t.items.map((i: { id: string }) => i.id)).toEqual(['r1'])
    expect((await (await call('pat', 'GET', `${other}/trash`)).json()).items).toEqual([])
    expect((await call('pat', 'POST', `${game}/trash/${t.items[0].file}/restore`)).status).toBe(200)
    expect(await listed(await call('pat', 'GET', `${game}/characters`))).toEqual([`pat/r1/${game === '/api' ? 'ca2' : 'sr6'}`])
  }
  expect(readdirSync(join(s.chars, 'pat'))).toContain('Anarchy-pat.xml')
  expect(readdirSync(join(s.chars, 'sr6', 'pat'))).toContain('Sixth-pat.xml')
})

test('refusals: the other game’s body, a runner in the NPC store, the other game’s file in a trash, a player on SR6 NPCs', async () => {
  const bad = [['/api/sr6/characters/x', ca2('x', 'X')], ['/api/characters/x', sr6('x', 'X')],
    // the right prefix, the wrong namespace
    ['/api/sr6/characters/x', sr6('x', 'X').replace('urn:chummer-sr6:character:1', 'urn:chummer-anarchy2:character:1')],
    ['/api/characters/x', ca2('x', 'X').replace('urn:chummer-anarchy2:character:1', 'urn:chummer-sr6:character:1')],
    ['/api/sr6/npcs/x', sr6('x', 'X')], ['/api/sr6/npcs/x', ca2('x', 'X', NPC)], ['/api/npcs/x', sr6('x', 'X', NPC)],
    ['/api/sr6/characters/x', sr6('x', 'X', NPC)],
    // the game's root inside the other game's file: the first element counts
    ['/api/sr6/characters/x', ca2('x', 'X', sr6('x', 'X').replace('<?xml version="1.0"?>', ''))],
    ['/api/characters/x', sr6('x', 'X', ca2('x', 'X').replace('<?xml version="1.0"?>', ''))]]
  for (const [i, [path, body]] of bad.entries()) expect([i, path, (await call('eve', 'PUT', path, body)).status]).toEqual([i, path, 400])
  expect(existsSync(join(s.chars, 'eve', 'X.xml')) || existsSync(join(s.chars, 'sr6', 'eve', 'X.xml'))).toBe(false)

  mkdirSync(join(s.chars, 'sr6', 'pat', '.trash'), { recursive: true })
  writeFileSync(join(s.chars, 'sr6', 'pat', '.trash', 'planted-1700000000000.xml'), ca2('p1', 'Planted'))
  mkdirSync(join(s.chars, 'pat', '.trash'), { recursive: true })
  writeFileSync(join(s.chars, 'pat', '.trash', 'planted-1700000000000.xml'), sr6('p1', 'Planted'))
  expect((await call('pat', 'POST', '/api/sr6/trash/planted-1700000000000.xml/restore')).status).toBe(400)
  expect((await call('pat', 'POST', '/api/trash/planted-1700000000000.xml/restore')).status).toBe(400)

  for (const [m, p] of [['GET', '/api/sr6/npcs'], ['PUT', '/api/sr6/npcs/n1'], ['DELETE', '/api/sr6/npcs/n1'], ['GET', '/api/sr6/npcs/trash'],
    ['DELETE', '/api/sr6/npcs/trash'], ['POST', '/api/sr6/npcs/trash/a-1700000000000.xml/restore'], ['DELETE', '/api/sr6/npcs/trash/a-1700000000000.xml']])
    expect([m, p, (await call('pat', m, p, m === 'PUT' ? sr6('n1', 'Nope', NPC) : undefined)).status]).toEqual([m, p, 403])
  expect(existsSync(join(s.chars, 'sr6', '.npcs'))).toBe(false)
})

test('campaigns: each game its own campaigns.xml; only its own runners and NPCs join', async () => {
  const made = await call('eve', 'POST', '/api/sr6/campaigns', { name: 'Seattle sixth' })
  expect(made.status).toBe(201)
  s6c = (await made.json()).id
  ca2c = (await (await call('eve', 'POST', '/api/campaigns', { name: 'Anarchy table' })).json()).id
  expect((await (await call('eve', 'GET', '/api/campaigns')).json()).map((c: { id: string }) => c.id)).toEqual([ca2c])
  expect((await (await call('eve', 'GET', '/api/sr6/campaigns')).json()).map((c: { id: string }) => c.id)).toEqual([s6c])
  expect(readFileSync(join(s.custom, 'sr6', 'campaigns.xml'), 'utf8')).toContain(s6c)
  expect(readFileSync(join(s.custom, 'campaigns.xml'), 'utf8')).not.toContain(s6c)
  expect(readFileSync(join(s.custom, 'sr6', 'campaigns.xml'), 'utf8')).not.toContain(ca2c)

  expect((await call('eve', 'POST', `/api/sr6/campaigns/${s6c}/members`, { user: 'pat' })).status).toBe(200)
  expect((await call('pat', 'PUT', '/api/characters/a-only', ca2('a-only', 'Anarchy only'))).status).toBe(201)
  expect((await call('pat', 'POST', `/api/sr6/campaigns/${s6c}/runners`, { id: 'a-only' })).status).toBe(404)
  expect((await call('pat', 'POST', `/api/sr6/campaigns/${s6c}/runners`, { id: 'r1' })).status).toBe(200)
  expect(readFileSync(join(s.chars, 'sr6', 'pat', 'Sixth-pat.xml'), 'utf8')).toContain(`campaign="${s6c}"`)
  expect(readFileSync(join(s.chars, 'pat', 'Anarchy-pat.xml'), 'utf8')).not.toContain('campaign=')
  // the GM reads it in that game only
  expect(await listed(await call('eve', 'GET', '/api/sr6/characters'))).toEqual(['eve/e1/sr6', 'pat/r1/sr6'])
  expect(await listed(await call('eve', 'GET', '/api/characters'))).toEqual(['eve/e1/ca2'])
  // the other game's campaign id: no such campaign here
  for (const [m, p, b] of [['GET', `/api/sr6/campaigns/${ca2c}`], ['POST', `/api/sr6/campaigns/${ca2c}/runners`, { id: 'r1' }],
    ['GET', `/api/campaigns/${s6c}`], ['POST', `/api/campaigns/${s6c}/runners`, { id: 'r1' }]] as [string, string, unknown?][])
    expect([m, p, (await call(m === 'GET' ? 'eve' : 'pat', m, p, b)).status]).toEqual([m, p, 404])

  expect((await call('eve', 'PUT', '/api/sr6/npcs/n6', sr6('n6', 'Sixth goon', NPC))).status).toBe(201)
  expect(readdirSync(join(s.chars, 'sr6', '.npcs', 'eve'))).toEqual(['Sixth-goon.xml'])
  expect((await call('eve', 'POST', `/api/campaigns/${ca2c}/npcs`, { id: 'n6' })).status).toBe(404)
  expect((await call('eve', 'POST', `/api/sr6/campaigns/${s6c}/npcs`, { id: 'n6' })).status).toBe(200)
  expect(await listed(await call('eve', 'GET', '/api/npcs'))).toEqual([])
  expect(await listed(await call('eve', 'GET', '/api/sr6/npcs'))).toEqual(['eve/n6/sr6'])
})

test('scope: only the game stores answer under /api/sr6/', async () => {
  for (const p of ['/api/sr6/compendiums', '/api/sr6/books', '/api/sr6/edits', '/api/sr6/auth/me', '/api/sr6/users', '/api/sr6/health', '/api/sr6',
    '/api/sr6/', '/api/sr6/table-rules', '/api/sr6/samples', '/api/sr6/backgrounds'])
    expect([p, (await call('ada', 'GET', p)).status]).toEqual([p, 404])
  expect((await call('ada', 'GET', '/api/auth/me')).status).toBe(200)
  expect((await call('ada', 'GET', '/api/sr6x/characters')).status).toBe(404)
})

test('accounts: a rename moves both games’ folders and memberships; runners of either game block a delete; retire uses each game’s trash', async () => {
  const id = async (n: string) => ((await (await call('ada', 'GET', '/api/users')).json()) as { id: string; username: string; runners: number }[]).find(u => u.username === n)!
  expect((await id('pat')).runners).toBe(3) // two Anarchy, one SR6
  expect((await call('ada', 'PUT', `/api/users/${(await id('pat')).id}`, { username: 'pam' })).status).toBe(200)
  expect(existsSync(join(s.chars, 'pat')) || existsSync(join(s.chars, 'sr6', 'pat'))).toBe(false)
  expect(readdirSync(join(s.chars, 'pam')).filter(f => f.endsWith('.xml')).sort()).toEqual(['Anarchy-only.xml', 'Anarchy-pat.xml'])
  expect(readdirSync(join(s.chars, 'sr6', 'pam')).filter(f => f.endsWith('.xml'))).toEqual(['Sixth-pat.xml'])
  const c = await (await call('eve', 'GET', `/api/sr6/campaigns/${s6c}`)).json()
  expect(c.members.map((m: { username: string }) => m.username)).toEqual(['pam'])
  expect(c.runners.map((r: { owner: string }) => r.owner)).toEqual(['pam'])
  PW.pam = PW.pat

  expect((await call('ada', 'POST', '/api/users', { username: 'sid', name: 'Sid', role: 'player', password: PW.sid })).status).toBe(201)
  await signIn(s.base, 'sid')
  expect((await call('sid', 'PUT', '/api/sr6/characters/s1', sr6('s1', 'Sid six'))).status).toBe(201)
  const sid = (await id('sid')).id
  const del = await call('ada', 'DELETE', `/api/users/${sid}`)
  expect([del.status, (await del.json()).error]).toEqual([409, 'this account still has runners: move them to another account first'])
  expect((await call('sid', 'DELETE', '/api/sr6/characters/s1')).status).toBe(204)
  expect((await call('ada', 'DELETE', `/api/users/${sid}`)).status).toBe(204)
  expect(existsSync(join(s.chars, 'sr6', 'sid'))).toBe(false)
  expect(readdirSync(join(s.chars, 'sr6', '.trash'))).toEqual([expect.stringMatching(/^sid-Sid-six-\d{13}\.xml$/)])
  expect(existsSync(join(s.chars, '.trash'))).toBe(false)
  // a new account can't take a name whose SR6 folder is left over
  mkdirSync(join(s.chars, 'sr6', 'zed'), { recursive: true })
  expect((await call('ada', 'POST', '/api/users', { username: 'zed', name: 'Zed', role: 'player', password: 'zed-password-1' })).status).toBe(409)
})

describe.skipIf(!python)('backup', () => {
  test('one zip holds both games; a restore into a fresh server brings both back', async () => {
    const { token } = await (await call('ada', 'POST', '/api/backup')).json()
    const zip = Buffer.from(await (await call('ada', 'GET', `/api/backup/${token}`)).arrayBuffer())
    const names = zip.toString('latin1')
    for (const n of ['characters/pam/Anarchy-pat.xml', 'characters/sr6/pam/Sixth-pat.xml', 'custom/sr6/campaigns.xml', 'characters/sr6/.npcs/eve/Sixth-goon.xml'])
      expect(names).toContain(n)
    const dir = mkdtempSync(join(tmpdir(), 'ca2-games-restore-'))
    mkdirSync(join(dir, 'library', '.config'), { recursive: true })
    copyFileSync(join(s.lib, '.config', 'users.xml'), join(dir, 'library', '.config', 'users.xml'))
    const t = await start(dir, null), go = at(t.base)
    await signIn(t.base, 'ada')
    const p = await go('ada', 'POST', '/api/restore?preview=1', zip)
    expect(p.status).toBe(200)
    expect((await go('ada', 'POST', `/api/restore/${(await p.json()).token}`)).status).toBe(200)
    await signIn(t.base, 'pam') // a restore ends every session
    expect(await listed(await go('pam', 'GET', '/api/characters'))).toEqual(['pam/a-only/ca2', 'pam/r1/ca2'])
    expect(await listed(await go('pam', 'GET', '/api/sr6/characters'))).toEqual(['pam/r1/sr6'])
  }, 120000)
})

test('an account called sr6 from before: it keeps its runners and signs in; the SR6 area answers 409 until it is renamed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-games-legacy-'))
  mkdirSync(join(dir, 'chars', 'sr6'), { recursive: true })
  writeFileSync(join(dir, 'chars', 'sr6', 'old.xml'), ca2('old', 'Old runner'))
  const t = await start(dir, [{ username: 'ada' }, { username: 'sr6', role: 'player' }]), go = at(t.base)
  for (const who of ['ada', 'sr6']) await signIn(t.base, who)
  expect(await listed(await go('sr6', 'GET', '/api/characters'))).toEqual(['sr6/old/ca2'])
  for (const [m, p, b] of [['GET', '/api/sr6/characters'], ['PUT', '/api/sr6/characters/n1', sr6('n1', 'New')], ['GET', '/api/sr6/npcs'],
    ['PUT', '/api/sr6/npcs/n2', sr6('n2', 'Goon', NPC)], ['GET', '/api/sr6/trash'], ['DELETE', '/api/sr6/trash'], ['GET', '/api/sr6/campaigns'],
    ['POST', '/api/sr6/campaigns', { name: 'Nope' }], ['GET', '/api/sr6/compendiums'], ['GET', '/api/sr6/auth/me']] as [string, string, unknown?][]) {
    const r = await go('ada', m, p, b)
    expect([m, p, r.status, (await r.json()).error]).toEqual([m, p, 409, 'rename the account sr6 first'])
  }
  expect(readdirSync(join(t.chars, 'sr6'))).toEqual(['old.xml'])
  expect(existsSync(join(t.custom, 'sr6'))).toBe(false)

  const legacy = ((await (await go('ada', 'GET', '/api/users')).json()) as { id: string; username: string }[]).find(u => u.username === 'sr6')!
  expect((await go('ada', 'PUT', `/api/users/${legacy.id}`, { username: 'sr6', name: 'Renamed' })).status).toBe(200) // its other fields still change
  expect((await go('ada', 'PUT', `/api/users/${legacy.id}`, { username: 'legacy' })).status).toBe(200)
  const r = await go('ada', 'GET', '/api/sr6/characters')
  expect([r.status, await r.json()]).toEqual([200, []])
  expect(readdirSync(join(t.chars, 'legacy'))).toEqual(['old.xml'])
  expect(existsSync(join(t.chars, 'sr6'))).toBe(false)
})
