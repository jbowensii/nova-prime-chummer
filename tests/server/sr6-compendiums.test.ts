// @vitest-environment node
// SR6 compendiums (server/compendiums.mjs, a second instance at /api/sr6/compendiums*): the same store as Anarchy's one level
// down, in characters/sr6/.compendiums/<owner>/, with SR6's campaigns and SR6's book sources. Neither game's store takes,
// lists or shares the other's files. Made-up sources and entries.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'
// @ts-expect-error plain JS module
import { findPython } from '../../tools/python.mjs'
import { compendiumXml } from '../../src/ca2/formats/domain/compendium'

vi.setConfig({ testTimeout: 30000 })
const PW: Record<string, string> = {
  ada: 'ada-password-1',
  eve: 'eve-password-1',
  gil: 'gil-password-1',
  ed: 'ed-password-12',
  pat: 'pat-password-1',
  sr6: 'old-password-1',
}
const python: string[] | null = findPython()
type Srv = { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
const servers: Srv[] = []
afterAll(() => {
  for (const s of servers) s.close()
})

async function start(dir: string, users: { username: string; role?: string }[]) {
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile(users.map(u => ({ ...u, password: PW[u.username], name: `${u.username} name` }))))
  mkdirSync(join(dir, 'custom', 'sr6', 'imported'), { recursive: true })
  copyFileSync('tests/fixtures/sr6/custom/imported/sources.xml', join(dir, 'custom', 'sr6', 'imported', 'sources.xml'))
  const srv: Srv = createServer({
    staticDir: 'public',
    charDir: join(dir, 'chars'),
    customDir: join(dir, 'custom'),
    libraryDir: join(dir, 'library'),
    python: python ?? 'python3',
  })
  servers.push(srv)
  await new Promise<void>(ok => srv.listen(0, ok))
  const base = `http://127.0.0.1:${srv.address().port}`,
    jar: Record<string, string> = {}
  for (const u of users) {
    const r = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: u.username, password: PW[u.username] }),
      headers: { 'Content-Type': 'application/json', Origin: base },
    })
    jar[u.username] = r.headers
      .getSetCookie()
      .find(c => /session=/.test(c))!
      .split(';')[0]
  }
  const call = (who: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      headers: {
        Origin: base,
        Cookie: jar[who] ?? '',
        ...(body !== undefined && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    })
  return { base, call, chars: join(dir, 'chars') }
}

/** An SR6 compendium file as the app writes its root (Task 2 writes the children). */
const sr6c = (id: string, source: string, sharing = 'sharing="private"', inner = '') =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="compendium" version="1" id="${id}" name="Kit ${id}" source="${source}" ${sharing} updatedAt="2026-10-02T00:00:00.000Z">${inner}\n</sr6:data>\n`
const ca2c = (id: string, source: string) =>
  compendiumXml({ id, name: `Book ${id}`, source, sharing: 'private', updatedAt: '2026-10-02T00:00:00.000Z', amps: [], items: [], vehicles: [], npcs: [] })
const SR6_NPC =
  '<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="npc-1" streetName="Corner Goon" updatedAt="2026-10-02"><npc kind="grunt"/><build/></sr6:character>'
const CA2_NPC =
  '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="npc-2" streetName="Corner Goon" updatedAt="2026-10-02"><npc kind="grunt"/><build/></ca2:character>'
const E1 = 'e1e1e1e1e1e1',
  E2 = 'e2e2e2e2e2e2',
  G1 = 'a1a1a1a1a1a1',
  D1 = 'd1d1d1d1d1d1',
  S1 = '5e5e5e5e5e5e'

let s: Awaited<ReturnType<typeof start>>,
  call: Awaited<ReturnType<typeof start>>['call'],
  comps = ''
const put = (who: string, id: string, xml: string, rev?: number, game = '/api/sr6') =>
  call(who, 'PUT', `${game}/compendiums/${id}`, xml, rev == null ? {} : { 'If-Match': String(rev) })
const list = async (who: string, game = '/api/sr6') =>
  ((await (await call(who, 'GET', `${game}/compendiums`)).json()) as { owner: string; id: string }[]).map(c => `${c.owner}/${c.id}`).sort()
const userId = async (n: string) =>
  ((await (await call('ada', 'GET', '/api/users')).json()) as { id: string; username: string }[]).find(u => u.username === n)!.id

beforeAll(async () => {
  s = await start(mkdtempSync(join(tmpdir(), 'ca2-sr6comps-')), [
    { username: 'ada' },
    { username: 'eve', role: 'editor' },
    { username: 'gil', role: 'editor' },
    { username: 'ed', role: 'editor' },
    { username: 'pat', role: 'player' },
  ])
  call = s.call
  comps = join(s.chars, 'sr6', '.compendiums')
})

test('a player gets 403 on every /api/sr6/compendiums route', async () => {
  for (const [m, p] of [
    ['GET', '/api/sr6/compendiums'],
    ['PUT', `/api/sr6/compendiums/${E1}`],
    ['DELETE', `/api/sr6/compendiums/${E1}`],
  ])
    expect([m, p, (await call('pat', m, p, m === 'PUT' ? sr6c(E1, 'PAT') : undefined)).status]).toEqual([m, p, 403])
  expect(existsSync(comps)).toBe(false)
})

test('an editor creates, updates and deletes her own; rev, If-Match, force; the server sets rev and updatedAt', async () => {
  const made = await put('eve', E1, sr6c(E1, 'STREET').replace('updatedAt="2026-10-02T00:00:00.000Z"', 'rev="41" updatedAt="1999-01-01"'))
  expect(made.status).toBe(201)
  const body = await made.json()
  expect(body).toMatchObject({ rev: 1, file: `${E1}.xml` })
  const stored = readFileSync(join(comps, 'eve', `${E1}.xml`), 'utf8')
  expect(stored).toContain('rev="1"')
  expect(stored).not.toContain('1999-01-01')
  expect(stored).toContain(`updatedAt="${body.updatedAt}"`)
  expect(existsSync(join(s.chars, '.compendiums'))).toBe(false) // never Anarchy's folder
  expect((await put('eve', E1, sr6c(E1, 'STREET'))).status).toBe(409) // no If-Match
  const stale = await put('eve', E1, sr6c(E1, 'STREET'), 0)
  expect([stale.status, (await stale.json()).rev]).toEqual([409, 1])
  expect((await (await put('eve', E1, sr6c(E1, 'STREET'), 1)).json()).rev).toBe(2)
  expect((await call('eve', 'PUT', `/api/sr6/compendiums/${E1}?force=1`, sr6c(E1, 'STREET'))).status).toBe(200)
  const [only] = await (await call('eve', 'GET', '/api/sr6/compendiums')).json()
  expect(only).toMatchObject({ id: E1, file: `${E1}.xml`, rev: 3, owner: 'eve', ownerName: 'eve name' })

  expect((await put('eve', E2, sr6c(E2, 'TOSS'))).status).toBe(201)
  expect((await call('gil', 'PUT', `/api/sr6/compendiums/${E2}`, sr6c(E2, 'TOSS'), { 'If-Match': '1' })).status).toBe(403)
  expect((await call('gil', 'DELETE', `/api/sr6/compendiums/${E2}`)).status).toBe(403)
  expect((await call('ada', 'DELETE', `/api/sr6/compendiums/${E2}`)).status).toBe(403)
  expect((await call('eve', 'DELETE', `/api/sr6/compendiums/${E2}`)).status).toBe(204)
  expect((await call('eve', 'DELETE', `/api/sr6/compendiums/${E2}`)).status).toBe(404)
  expect(readdirSync(join(comps, 'eve', '.trash'))).toEqual([expect.stringMatching(new RegExp(`^${E2}-\\d+\\.xml$`))])
  expect(await list('eve')).toEqual(['eve/' + E1])
})

test('bad ids and bodies; a 20 MB+ body: 413', async () => {
  expect((await put('eve', '../x', sr6c('../x', 'X'))).status).toBe(404)
  expect((await put('eve', '..%2Fxyzxyzxyzxy', sr6c(E2, 'X'))).status).toBe(400)
  expect((await put('eve', E2, sr6c(E1, 'X'))).status).toBe(400) // id mismatch
  expect((await put('eve', E2, sr6c(E2, 'X').replace('kind="compendium"', 'kind="weapons"'))).status).toBe(400)
  expect((await put('eve', E2, sr6c(E2, 'X').replace('urn:chummer-sr6:data:1', 'urn:chummer-sr6:character:1'))).status).toBe(400)
  // long runs that would make a backtracking root or namespace check crawl: refused at once
  for (const body of [`<sr6:data${' '.repeat(4e6)}x`, `<sr6:data a="1"${' a="1"'.repeat(5e5)} b`, ` xmlns:a="${'x'.repeat(4e6)}`, ' xmlns="'.repeat(5e5)]) {
    const t = Date.now()
    expect((await put('eve', E2, body)).status).toBe(400)
    expect(Date.now() - t).toBeLessThan(3000)
  }
  const huge = sr6c(E1, 'STREET').replace('</sr6:data>', `<!-- ${'x'.repeat(21 * 1024 * 1024)} --></sr6:data>`)
  const r = await put('eve', E1, huge, 3).catch(() => null)
  if (r) expect(r.status).toBe(413)
  expect(readFileSync(join(comps, 'eve', `${E1}.xml`), 'utf8')).toContain('rev="3"')
})

test('source ids: the SR6 book’s and another SR6 compendium’s 409; an Anarchy compendium’s is free; a source never changes', async () => {
  expect((await put('gil', G1, sr6c(G1, 'CRB'))).status).toBe(409) // the fixture book
  expect((await put('gil', G1, sr6c(G1, 'STREET'))).status).toBe(409) // eve's
  expect((await put('gil', D1, ca2c(D1, 'ANARCH'), undefined, '/api')).status).toBe(201)
  expect((await put('gil', G1, sr6c(G1, 'ANARCH'))).status).toBe(201) // only the other game's
  expect((await put('gil', G1, sr6c(G1, 'OTHER'), 1)).status).toBe(400)
  expect((await put('gil', G1, sr6c(G1, 'ANARCH'), 1)).status).toBe(200)
})

test('sharing: private ones are the owner’s and the admin’s; table: every editor, read only; campaign: that SR6 campaign’s GMs only', async () => {
  expect(await list('gil')).toEqual(['gil/' + G1])
  expect(await list('ada')).toEqual(['eve/' + E1, 'gil/' + G1])
  expect((await put('eve', E1, sr6c(E1, 'STREET', 'sharing="table"'), 3)).status).toBe(200)
  for (const who of ['gil', 'ed', 'ada']) expect(await list(who)).toContain('eve/' + E1)
  expect((await put('gil', E1, sr6c(E1, 'STREET', 'sharing="table"'), 4)).status).toBe(403)
  expect(await list('gil', '/api')).toEqual(['gil/' + D1]) // Anarchy's list: none of SR6's

  const cid = (await (await call('eve', 'POST', '/api/sr6/campaigns', { name: 'Sixth table' })).json()).id
  const other = (await (await call('ed', 'POST', '/api/sr6/campaigns', { name: 'Ed’s table' })).json()).id
  const anarchy = (await (await call('eve', 'POST', '/api/campaigns', { name: 'Anarchy table' })).json()).id
  expect((await call('ada', 'POST', `/api/sr6/campaigns/${cid}/gms`, { user: 'gil' })).status).toBe(200)
  expect((await put('eve', E1, sr6c(E1, 'STREET', `sharing="campaign" campaign="${anarchy}"`), 4)).status).toBe(400) // Anarchy's campaign
  expect((await put('eve', E1, sr6c(E1, 'STREET', `sharing="campaign" campaign="${other}"`), 4)).status).toBe(400) // not hers
  expect((await put('eve', E1, sr6c(E1, 'STREET', `sharing="campaign" campaign="${cid}"`), 4)).status).toBe(200)
  expect(await list('gil')).toEqual(['eve/' + E1, 'gil/' + G1])
  expect(await list('ed')).toEqual([])
  expect((await call('eve', 'DELETE', `/api/sr6/campaigns/${cid}/gms/eve`)).status).toBe(200)
  expect(await list('gil')).toEqual(['gil/' + G1])
  expect(await list('eve')).toEqual(['eve/' + E1])
})

test('isolation: neither store takes the other game’s file or embedded runner; lists and ids are per game', async () => {
  const bad: [string, string, string][] = [
    ['/api/sr6', S1, ca2c(S1, 'XA')],
    ['/api', S1, sr6c(S1, 'XB')],
    ['/api/sr6', S1, sr6c(S1, 'XC', undefined, CA2_NPC)],
    ['/api', S1, ca2c(S1, 'XD').replace('</ca2:data>', `${SR6_NPC}</ca2:data>`)],
    // the other game's namespace hidden behind a character reference
    ['/api/sr6', S1, sr6c(S1, 'XE', undefined, CA2_NPC.replace('urn:chummer-anarchy2:', 'urn&#58;chummer-anarchy2:'))],
  ]
  for (const [i, [game, id, xml]] of bad.entries()) expect([i, (await put('eve', id, xml, undefined, game)).status]).toEqual([i, 400])
  const r = await put('eve', S1, ca2c(S1, 'XA'))
  expect(await r.json()).toEqual({ error: 'this is the other game’s file' })
  expect(existsSync(join(comps, 'eve', `${S1}.xml`)) || existsSync(join(s.chars, '.compendiums', 'eve', `${S1}.xml`))).toBe(false)
  // its own NPCs are fine
  expect((await put('eve', S1, sr6c(S1, 'XC', undefined, SR6_NPC))).status).toBe(201)
  // the same 12-hex id in both games, each its own
  expect((await put('eve', S1, ca2c(S1, 'XD'), undefined, '/api')).status).toBe(201)
  expect(await list('ada', '/api')).toEqual(['eve/' + S1, 'gil/' + D1])
  expect(await list('ada')).toEqual(['eve/' + S1, 'eve/' + E1, 'gil/' + G1])
  const files = (await (await call('ada', 'GET', '/api/compendiums')).json()) as { xml: string }[]
  expect(files.every(f => !f.xml.includes('urn:chummer-sr6:'))).toBe(true)
  const six = (await (await call('ada', 'GET', '/api/sr6/compendiums')).json()) as { xml: string }[]
  expect(six.every(f => f.xml.includes('<sr6:data') && !f.xml.includes('urn:chummer-anarchy2:'))).toBe(true)
})

test('never served as a static file', async () => {
  for (const p of [
    `/chars/sr6/.compendiums/eve/${E1}.xml`,
    `/custom/sr6/../../chars/sr6/.compendiums/eve/${E1}.xml`,
    `/custom/sr6/%2e%2e/%2e%2e/chars/sr6/.compendiums/eve/${E1}.xml`,
  ])
    expect([p, (await call('eve', 'GET', p)).status]).not.toEqual([p, 200])
})

test('backups include the SR6 compendium store', async () => {
  if (!python) return // the backup is `python -m importer`
  const { token } = await (await call('ada', 'POST', '/api/backup')).json()
  const zip = Buffer.from(await (await call('ada', 'GET', `/api/backup/${token}`)).arrayBuffer()).toString('latin1')
  expect(zip).toContain(`characters/sr6/.compendiums/eve/${E1}.xml`)
  expect(zip).toContain(`characters/sr6/.compendiums/gil/${G1}.xml`)
}, 120000)

test('account hooks: a rename moves the folder; a leftover folder blocks a new name; a delete retires it to its game’s .trash', async () => {
  expect((await call('ada', 'PUT', `/api/users/${await userId('gil')}`, { username: 'gill' })).status).toBe(200)
  expect(existsSync(join(comps, 'gil'))).toBe(false)
  expect(readdirSync(join(comps, 'gill'))).toEqual([`${G1}.xml`])
  expect(readdirSync(join(s.chars, '.compendiums', 'gill'))).toEqual([`${D1}.xml`]) // Anarchy's moved too
  expect(await list('ada')).toEqual(['eve/' + S1, 'eve/' + E1, 'gill/' + G1])
  mkdirSync(join(comps, 'zed'), { recursive: true })
  const r = await call('ada', 'POST', '/api/users', { username: 'zed', name: 'Zed', role: 'editor', password: 'zed-password-1' })
  expect([r.status, (await r.json()).error]).toEqual([409, 'characters/sr6/.compendiums/zed already exists; move it away first'])
  expect((await call('ada', 'DELETE', `/api/users/${await userId('gill')}`)).status).toBe(204)
  expect(existsSync(join(comps, 'gill'))).toBe(false)
  expect(readdirSync(join(comps, '.trash'))).toEqual([`gill-${G1}.xml`])
  expect(readdirSync(join(s.chars, '.compendiums', '.trash'))).toEqual([`gill-${D1}.xml`])
  expect(await list('ada')).toEqual(['eve/' + S1, 'eve/' + E1])
})

test('an account called sr6 from before: every /api/sr6/compendiums route 409s and characters/sr6/.compendiums is never touched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6comps-legacy-')),
    planted = join(dir, 'chars', 'sr6', '.compendiums', 'eve')
  mkdirSync(planted, { recursive: true })
  writeFileSync(join(planted, `${E1}.xml`), sr6c(E1, 'STREET'))
  const t = await start(dir, [{ username: 'ada' }, { username: 'sr6', role: 'player' }, { username: 'eve', role: 'editor' }])
  for (const [m, p, b] of [
    ['GET', '/api/sr6/compendiums'],
    ['PUT', `/api/sr6/compendiums/${E2}`, sr6c(E2, 'NEW')],
    ['DELETE', `/api/sr6/compendiums/${E1}`],
  ] as [string, string, string?][]) {
    const r = await t.call('eve', m, p, b)
    expect([m, p, r.status, (await r.json()).error]).toEqual([m, p, 409, 'rename the account sr6 first'])
  }
  const eve = ((await (await t.call('ada', 'GET', '/api/users')).json()) as { id: string; username: string }[]).find(u => u.username === 'eve')!.id
  expect((await t.call('ada', 'PUT', `/api/users/${eve}`, { username: 'evelyn' })).status).toBe(200)
  expect((await t.call('ada', 'DELETE', `/api/users/${eve}`)).status).toBe(204)
  expect(readdirSync(join(dir, 'chars', 'sr6', '.compendiums'))).toEqual(['eve'])
  expect(readdirSync(planted)).toEqual([`${E1}.xml`])
})
