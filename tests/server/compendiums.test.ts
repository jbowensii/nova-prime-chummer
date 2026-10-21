// @vitest-environment node
// Compendiums (server/compendiums.mjs, /api/compendiums*): a GM-only store in characters/.compendiums/<owner>/; players
// get 403 on every route; only the owner writes; private / campaign / table sharing; a source id never clashes with a
// book's or another compendium's; rev/If-Match like NPCs; account renames and deletes move the folder; backups include it.
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
import { compendiumXml } from '../../src/ca2/formats/domain/compendium'
import type { Compendium } from '../../src/ca2/formats/domain/types'

vi.setConfig({ testTimeout: 30000 })
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', ed: 'ed-password-12', gil: 'gil-password-1', pat: 'pat-password-1' }
type Who = keyof typeof PW
const python: string[] | null = findPython()
const dir = mkdtempSync(join(tmpdir(), 'ca2-comps-')),
  chars = join(dir, 'chars'),
  comps = join(chars, '.compendiums'),
  custom = join(dir, 'custom')
const jar = {} as Record<Who, string>
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

beforeAll(async () => {
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  mkdirSync(join(custom, 'edits'), { recursive: true })
  writeFileSync(join(custom, 'edits', 'sources.xml'), '<sources><source id="HOUSE" publisher="Me" canon="false"><name>House</name></source></sources>')
  writeFileSync(
    join(dir, 'library', '.config', 'users.xml'),
    await usersFile([
      { username: 'ada', password: PW.ada, name: 'Ada Admin' },
      { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' },
      { username: 'ed', password: PW.ed, role: 'editor', name: 'Ed' },
      { username: 'gil', password: PW.gil, role: 'editor', name: 'Gil' },
      { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' },
    ]),
  )
  srv = createServer({ staticDir: 'public', charDir: chars, customDir: custom, libraryDir: join(dir, 'library'), python: python ?? 'python3' })
  await new Promise<void>(ok => srv.listen(0, ok))
  base = `http://127.0.0.1:${srv.address().port}`
  for (const who of Object.keys(PW) as Who[]) {
    const r = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: who, password: PW[who] }),
      headers: { 'Content-Type': 'application/json', Origin: base },
    })
    jar[who] = r.headers
      .getSetCookie()
      .find(c => /session=/.test(c))!
      .split(';')[0]
  }
})
afterAll(() => srv.close())

const call = (who: Who, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    headers: { Origin: base, Cookie: jar[who], ...(body !== undefined && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}), ...headers },
  })
const comp = (id: string, source: string, extra: Partial<Compendium> = {}) =>
  compendiumXml({
    id,
    name: `Book ${id}`,
    source,
    sharing: 'private',
    updatedAt: '2026-10-02T00:00:00.000Z',
    amps: [],
    items: [],
    vehicles: [],
    npcs: [],
    ...extra,
  })
const put = (who: Who, id: string, xml: string, rev?: number) => call(who, 'PUT', `/api/compendiums/${id}`, xml, rev == null ? {} : { 'If-Match': String(rev) })
const list = async (who: Who) =>
  ((await (await call(who, 'GET', '/api/compendiums')).json()) as { owner: string; id: string }[]).map(c => `${c.owner}/${c.id}`).sort()
const userId = async (n: string) =>
  ((await (await call('ada', 'GET', '/api/users')).json()) as { id: string; username: string }[]).find(u => u.username === n)!.id
const E1 = 'e1e1e1e1e1e1',
  E2 = 'e2e2e2e2e2e2',
  D1 = 'd1d1d1d1d1d1'
let cid = ''

test('a player gets 403 on every /api/compendiums route', async () => {
  for (const [m, p] of [
    ['GET', '/api/compendiums'],
    ['PUT', `/api/compendiums/${E1}`],
    ['DELETE', `/api/compendiums/${E1}`],
    ['GET', '/api/compendiums/x'],
  ])
    expect([m, p, (await call('pat', m, p, m === 'PUT' ? comp(E1, 'PAT') : undefined)).status]).toEqual([m, p, 403])
  expect(existsSync(comps)).toBe(false)
})

test('an editor creates and updates their own with rev and If-Match; the server sets rev and updatedAt', async () => {
  const made = await put('eve', E1, comp(E1, 'EVE', { rev: 41, updatedAt: '1999-01-01' }))
  expect(made.status).toBe(201)
  const body = await made.json()
  expect(body).toMatchObject({ rev: 1, file: `${E1}.xml` })
  const stored = readFileSync(join(comps, 'eve', `${E1}.xml`), 'utf8')
  expect(stored).toContain('rev="1"')
  expect(stored).not.toContain('1999-01-01')
  expect(stored).toContain(`updatedAt="${body.updatedAt}"`)
  expect(stored.match(/<ca2:data [^>]*>/)![0]).toMatch(/ id="e1e1e1e1e1e1" .* source="EVE" /)
  expect((await put('eve', E1, comp(E1, 'EVE'))).status).toBe(409) // no If-Match
  const stale = await put('eve', E1, comp(E1, 'EVE'), 0)
  expect([stale.status, (await stale.json()).rev]).toEqual([409, 1])
  expect((await (await put('eve', E1, comp(E1, 'EVE', { name: 'Renamed' }), 1)).json()).rev).toBe(2)
  expect((await call('eve', 'PUT', `/api/compendiums/${E1}?force=1`, comp(E1, 'EVE'))).status).toBe(200)
  const [only] = await (await call('eve', 'GET', '/api/compendiums')).json()
  expect(only).toMatchObject({ id: E1, file: `${E1}.xml`, rev: 3, owner: 'eve', ownerName: 'Eve Editor' })
  // a body bigger than the usual 5 MB cap is fine (embedded portraits)
  const big = comp(E1, 'EVE').replace('</ca2:data>', `<!-- ${'x'.repeat(6 * 1024 * 1024)} --></ca2:data>`)
  expect((await put('eve', E1, big, 3)).status).toBe(200)
})

test('bad bodies and ids are refused', async () => {
  const bad = async (id: string, xml: string) => (await put('eve', id, xml)).status
  expect(await bad(E2, comp(E1, 'EVE2'))).toBe(400) // id mismatch
  expect(await bad('../x', comp('../x', 'EVE2'))).toBe(404)
  expect(await bad('..%2Fxyzxyzxyzxy', comp(E2, 'EVE2'))).toBe(400)
  expect(await bad('E2E2E2E2E2E2', comp('E2E2E2E2E2E2', 'EVE2'))).toBe(400) // 12 lower-case hex only
  expect(await bad(E2, comp(E2, 'eve2'))).toBe(400) // source pattern
  expect(await bad(E2, comp(E2, 'EVE2').replace('kind="compendium"', 'kind="books"'))).toBe(400)
  expect(await bad(E2, comp(E2, 'EVE2').replace('sharing="private"', 'sharing="world"'))).toBe(400)
  expect(await bad(E2, comp(E2, 'EVE2').replace('sharing="private"', 'sharing="private" campaign="abcdefabcdef"'))).toBe(400)
  expect(await bad(E2, comp(E2, 'EVE2').replace('sharing="private"', `sharing="private" x='y'`))).toBe(400) // not as the app writes it
  expect(await bad(E2, `<!-- ${comp(E1, 'EVE')} -->${comp(E2, 'EVE2')}`)).toBe(400) // the root comes first
  expect(await bad(E2, comp(E2, 'EVE2', { sharing: 'campaign', campaign: 'abcdefabcdef' }))).toBe(400) // a campaign she doesn't GM
  expect(existsSync(join(comps, 'eve', `${E2}.xml`))).toBe(false)
})

test('a source id that clashes with a book or another compendium: 409; changing a source: 400; a 20 MB+ body: 413', async () => {
  for (const s of ['CRB', 'HOUSE', 'EVE']) expect([s, (await put('ed', D1, comp(D1, s))).status]).toEqual([s, 409])
  expect((await put('eve', E2, comp(E2, 'EVE'))).status).toBe(409) // her own other one too
  expect((await put('eve', E1, comp(E1, 'OTHER'), 4)).status).toBe(400)
  expect((await put('ed', D1, comp(D1, 'ED'))).status).toBe(201)
  // and the other way: a new house source can't take a compendium's id
  expect((await call('ed', 'POST', '/api/edits/sources', { id: 'EVE', name: 'Clash' })).status).toBe(409)
  const huge = comp(D1, 'ED').replace('</ca2:data>', `<!-- ${'x'.repeat(21 * 1024 * 1024)} --></ca2:data>`)
  const r = await put('ed', D1, huge, 1).catch(() => null)
  if (r) expect(r.status).toBe(413) // the server may close the connection before fetch reads the answer
  expect(readFileSync(join(comps, 'ed', `${D1}.xml`), 'utf8')).toContain('rev="1"')
})

test('another editor and the admin can’t write it; private ones are the owner’s and the admin’s', async () => {
  expect((await put('ed', E1, comp(E1, 'EVE'), 4)).status).toBe(403)
  expect((await call('ed', 'DELETE', `/api/compendiums/${E1}`)).status).toBe(403)
  expect((await put('ada', E1, comp(E1, 'EVE'), 4)).status).toBe(403)
  expect((await call('ada', 'DELETE', `/api/compendiums/${E1}`)).status).toBe(403)
  expect(await list('ed')).toEqual(['ed/' + D1])
  expect(await list('ada')).toEqual(['ed/' + D1, 'eve/' + E1])
})

test('table sharing: every editor and the admin list it, read only', async () => {
  expect((await put('eve', E1, comp(E1, 'EVE', { sharing: 'table' }), 4)).status).toBe(200)
  for (const who of ['ed', 'gil', 'ada'] as Who[]) expect(await list(who)).toContain('eve/' + E1)
  expect((await put('gil', E1, comp(E1, 'EVE', { sharing: 'table' }), 5)).status).toBe(403)
})

test('campaign sharing: that campaign’s other GMs, not another campaign’s; gone when the owner stops GMing it', async () => {
  cid = (await (await call('eve', 'POST', '/api/campaigns', { name: 'Seattle' })).json()).id
  expect((await call('ada', 'POST', `/api/campaigns/${cid}/gms`, { user: 'ed' })).status).toBe(200)
  expect((await call('eve', 'POST', `/api/campaigns/${cid}/members`, { user: 'pat' })).status).toBe(200)
  expect((await call('gil', 'POST', '/api/campaigns', { name: 'Gil’s table' })).status).toBe(201)
  expect((await put('eve', E1, comp(E1, 'EVE', { sharing: 'campaign', campaign: cid }), 5)).status).toBe(200)
  expect(await list('ed')).toEqual(['ed/' + D1, 'eve/' + E1])
  expect(await list('gil')).toEqual([])
  expect(await list('ada')).toEqual(['ed/' + D1, 'eve/' + E1])
  // the player: 403 here, and their runners and campaign view are unchanged
  expect((await call('pat', 'GET', '/api/compendiums')).status).toBe(403)
  expect(await (await call('pat', 'GET', '/api/characters')).json()).toEqual([])
  const view = await (await call('pat', 'GET', `/api/campaigns/${cid}`)).json()
  expect(JSON.stringify(view)).not.toMatch(/compendi|EVE|Book /)
  // eve steps down as GM: ed no longer reads it
  expect((await call('eve', 'DELETE', `/api/campaigns/${cid}/gms/eve`)).status).toBe(200)
  expect(await list('ed')).toEqual(['ed/' + D1])
  expect(await list('eve')).toEqual(['eve/' + E1])
})

test('never served under /custom/', async () => {
  expect((await call('eve', 'GET', `/custom/../chars/.compendiums/eve/${E1}.xml`)).status).toBe(404)
  expect((await call('eve', 'GET', `/custom/%2e%2e/chars/.compendiums/eve/${E1}.xml`)).status).not.toBe(200)
})

test('delete moves it to the owner’s .trash', async () => {
  expect((await call('eve', 'DELETE', `/api/compendiums/${E2}`)).status).toBe(404)
  expect((await call('eve', 'DELETE', `/api/compendiums/${E1}`)).status).toBe(204)
  expect(await list('eve')).toEqual([])
  expect(readdirSync(join(comps, 'eve', '.trash'))).toEqual([expect.stringMatching(new RegExp(`^${E1}-\\d+\\.xml$`))])
  expect((await put('eve', E1, comp(E1, 'EVE'))).status).toBe(201) // its source is free again
})

test('backups include the compendium store', async () => {
  if (!python) return // the backup is `python -m importer`
  const { token } = await (await call('ada', 'POST', '/api/backup')).json()
  const zip = Buffer.from(await (await call('ada', 'GET', `/api/backup/${token}`)).arrayBuffer()).toString('latin1')
  expect(zip).toContain(`characters/.compendiums/eve/${E1}.xml`)
  expect(zip).toContain(`characters/.compendiums/ed/${D1}.xml`)
}, 120000)

test('an account rename moves its folder; a delete retires it to .compendiums/.trash; a leftover folder blocks the name', async () => {
  expect((await call('ada', 'PUT', `/api/users/${await userId('ed')}`, { username: 'edd' })).status).toBe(200)
  expect(existsSync(join(comps, 'ed'))).toBe(false)
  expect(readdirSync(join(comps, 'edd'))).toEqual([`${D1}.xml`])
  expect(await list('ada')).toEqual(['edd/' + D1, 'eve/' + E1])
  mkdirSync(join(comps, 'zed'), { recursive: true })
  expect((await call('ada', 'POST', '/api/users', { username: 'zed', name: 'Zed', role: 'editor', password: 'zed-password-1' })).status).toBe(409)
  expect((await call('ada', 'DELETE', `/api/users/${await userId('edd')}`)).status).toBe(204)
  expect(existsSync(join(comps, 'edd'))).toBe(false)
  expect(readdirSync(join(comps, '.trash'))).toEqual([`edd-${D1}.xml`])
  expect(await list('ada')).toEqual(['eve/' + E1])
})
