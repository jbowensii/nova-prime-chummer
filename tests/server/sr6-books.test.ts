// @vitest-environment node
// The Shadowrun 6 area's books, jobs and edits (server/books.mjs with game 'sr6', /api/sr6/books*, /api/sr6/edits*) and
// /custom/sr6/, with the stub worker (tests/fixtures/stub-worker.mjs: `sr6 run` copies the made-up SR6 fixture). Nothing of
// one game's books or edits shows in the other's; one job queue runs both games' imports one at a time. Made-up files.
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'
import { ADMIN, cookieFor, createServer, rawFetch } from './_signin'

vi.setConfig({ testTimeout: 30000 })
type Srv = { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number }; started: Promise<void>; stopJobs: () => void }
const PW: Record<string, string> = { eve: 'eve-password-1', pat: 'pat-password-1' }
const STUB = [process.execPath, 'tests/fixtures/stub-worker.mjs']

const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-books-'))
const custom = join(dir, 'custom'), library = join(dir, 'library'), log = join(dir, 'calls.log')
let base = '', srv: Srv
const cookies: Record<string, string> = {}
beforeAll(async () => {
  mkdirSync(join(library, '.config'), { recursive: true })
  writeFileSync(join(library, '.config', 'users.xml'), await usersFile([ADMIN, { username: 'eve', role: 'editor', password: PW.eve, name: 'Eve' },
    { username: 'pat', role: 'player', password: PW.pat, name: 'Pat' }]))
  writeFileSync(log, '')
  vi.stubEnv('STUB_LOG', log)
  srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: custom, libraryDir: library, python: STUB })
  await new Promise<void>(ok => srv.listen(0, ok))
  base = `http://127.0.0.1:${srv.address().port}`
  for (const who of ['eve', 'pat']) {
    const r = await rawFetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ username: who, password: PW[who] }),
      headers: { 'Content-Type': 'application/json', Origin: base } })
    cookies[who] = r.headers.getSetCookie().find(c => /session=/.test(c))!.split(';')[0]
  }
})
afterAll(() => srv.close())

/** fetch as an account: admin (the default, through _signin's fetch), eve (editor) or pat (player). */
const as = (who: string, path: string, init: RequestInit = {}) => who === 'admin' ? fetch(`${base}${path}`, init)
  : rawFetch(`${base}${path}`, { ...init, headers: { ...init.headers as Record<string, string>, Origin: base, Cookie: cookies[who] } })
type Book = { id: string; state: string; source?: string; recipe?: string; counts: Record<string, number>; busy: boolean }
const list = async (path = '/api/sr6/books'): Promise<Book[]> => (await fetch(`${base}${path}`)).json()
async function waitFor(id: string, state: string, path = '/api/sr6/books'): Promise<Book | undefined> {
  for (let i = 0; i < 600; i++) {
    const b = (await list(path)).find(x => x.id === id)
    if (state === 'gone' ? !b : b?.state === state && !b.busy) return b
    await new Promise(r => setTimeout(r, 25))
  }
  throw new Error(`${id} never reached ${state}`)
}
const pdf = (marker = '') => Buffer.concat([Buffer.from(`%PDF-1.4 ${marker}\n`), Buffer.alloc(256)])
const upload = (path: string, marker = '') => fetch(`${base}${path}`, { method: 'POST', body: pdf(marker),
  headers: { 'Content-Type': 'application/pdf', 'X-Filename': 'made-up-sr6.pdf' } })
const GUN = '<edit><weapon id="crb.zap-gun" source="CRB" page="250" category="zappers" cost="275"><name>Zap Gun</name><text/></weapon>' +
  '<description>Mine.</description></edit>'
function raw(path: string, cookie = cookieFor(base)): Promise<number> {
  return new Promise((ok, fail) => {
    const req = request(`${base}${path}`, { headers: { Origin: base, Cookie: cookie } }, res => { res.resume(); ok(res.statusCode ?? 0) })
    req.on('error', fail)
    req.end()
  })
}

let book = ''
test('the admin uploads an SR6 book: imported into library/sr6/ and custom/sr6/, listed only under /api/sr6/books', async () => {
  const r = await upload('/api/sr6/books')
  expect(r.status).toBe(202)
  book = (await r.json()).id
  const b = await waitFor(book, 'done')
  expect(b).toMatchObject({ source: 'CRB', recipe: 'crb' })
  expect(b!.counts['weapons.xml']).toBe(2)
  expect(existsSync(join(library, 'sr6', book, 'original.pdf'))).toBe(true)
  expect(existsSync(join(library, book))).toBe(false)
  expect(readdirSync(join(custom, 'sr6', 'imported', 'crb'))).toContain('weapons.xml')
  expect(existsSync(join(custom, 'imported'))).toBe(false)
  expect((await list('/api/books')).map(x => x.id)).toEqual([])
  expect(readFileSync(log, 'utf8')).toContain(`sr6:run ${book}`)
})

test('report, reimport and delete; Anarchy’s routes don’t know the SR6 book', async () => {
  const rep = await fetch(`${base}/api/sr6/books/${book}/report`)
  expect([rep.status, await rep.text()]).toEqual([200, expect.stringContaining('kind="unpaired-row"')])
  expect((await fetch(`${base}/api/books/${book}/report`)).status).toBe(404)
  expect((await fetch(`${base}/api/sr6/books/${book}/reimport`, { method: 'POST' })).status).toBe(202)
  await waitFor(book, 'done')
  expect(readFileSync(log, 'utf8')).toMatch(new RegExp(`sr6:remove ${book}.*\\nsr6:run ${book}`))
  expect((await fetch(`${base}/api/books/${book}`, { method: 'DELETE' })).status).toBe(404)
  expect((await fetch(`${base}/api/sr6/books/${book}`, { method: 'DELETE' })).status).toBe(202)
  await waitFor(book, 'removed')
  expect(existsSync(join(custom, 'sr6', 'imported', 'crb'))).toBe(false)
  expect((await fetch(`${base}/api/sr6/books/${book}/reimport`, { method: 'POST' })).status).toBe(202) // back for the edits below
  await waitFor(book, 'done')
})

test('roles: a player gets 403 on SR6 book routes; editors edit; anyone signed in lists the edits', async () => {
  for (const [m, p] of [['GET', '/api/sr6/books'], ['POST', '/api/sr6/books'], ['GET', `/api/sr6/books/${book}/report`],
    ['POST', `/api/sr6/books/${book}/reimport`], ['DELETE', `/api/sr6/books/${book}`], ['PUT', '/api/sr6/edits/weapons/crb.zap-gun']])
    expect([m, p, (await as('pat', p, { method: m })).status]).toEqual([m, p, 403])
  expect((await as('eve', '/api/sr6/books')).status).toBe(403)
  const put = await as('eve', '/api/sr6/edits/weapons/crb.zap-gun', { method: 'PUT', body: GUN })
  expect(put.status).toBe(204)
  expect(readFileSync(join(custom, 'sr6', 'edits', 'edits.xml'), 'utf8')).toMatch(/<sr6:data[\s\S]*<weapon id="crb.zap-gun"[^>]* by="eve"/)
  expect(await (await as('pat', '/api/sr6/edits')).json()).toEqual([{ kind: 'weapons', id: 'crb.zap-gun' }])
  expect(await (await fetch(`${base}/api/edits`)).json()).toEqual([]) // Anarchy's edits never list SR6's
  expect((await as('eve', '/api/sr6/edits/amps/crb.zap-gun', { method: 'PUT', body: GUN })).status).toBe(400)
  expect((await as('eve', '/api/sr6/edits/nope/crb.zap-gun', { method: 'PUT', body: GUN })).status).toBe(400)
  expect((await as('eve', '/api/edits/weapons/crb.zap-gun', { method: 'PUT', body: GUN })).status).toBe(400) // not an Anarchy kind
  const bad = await as('eve', '/api/sr6/edits/weapons/crb.zap-gun', { method: 'PUT', body: GUN.replace('Zap Gun', '') })
  expect([bad.status, (await bad.json()).error]).toEqual([400, 'no id or name'])
  const del = await as('eve', '/api/sr6/edits/weapons/crb.zap-gun', { method: 'DELETE' })
  expect(await del.json()).toEqual({ removed: true })
})

test('the SR6 edits list names entries, not their parts that share a kind’s tag', async () => {
  const path = join(custom, 'sr6', 'edits', 'edits.xml'), before = readFileSync(path, 'utf8')
  writeFileSync(path, '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="edits" version="1">' +
    '<critter id="crb.fuzzbeast" source="CRB" page="400" by="eve"><name>Fuzzbeast</name><gear>Made-up collar</gear><text/></critter>' +
    '<priority id="crb.priority-a" source="CRB" page="40" letter="A" by="eve"><name>Priority A</name><metatype name="Elf" points="13"/><text/></priority></sr6:data>')
  try {
    expect(await (await as('pat', '/api/sr6/edits')).json()).toEqual([{ kind: 'critters', id: 'crb.fuzzbeast' }, { kind: 'priorities', id: 'crb.priority-a' }])
  } finally { writeFileSync(path, before) }
})

test('what SR6 doesn’t have answers 404: AI, review, data pack, house sources, settings', async () => {
  for (const [m, p] of [['POST', `/api/sr6/books/${book}/ai`], ['GET', '/api/sr6/review/x'], ['PUT', '/api/sr6/review/x'], ['POST', '/api/sr6/datapack'],
    ['POST', '/api/sr6/edits/sources'], ['GET', '/api/sr6/ai-settings'], ['GET', '/api/sr6/samples'], ['PUT', '/api/sr6/table-rules'],
    ['POST', '/api/sr6/backup'], ['GET', '/api/sr6/ask']])
    expect([m, p, (await fetch(`${base}${p}`, { method: m })).status]).toEqual([m, p, 404])
})

test('an Anarchy and an SR6 upload queued together run one at a time', async () => {
  writeFileSync(log, '')
  const a = (await (await upload('/api/books', 'slow')).json()).id
  const s = (await (await upload('/api/sr6/books')).json()).id
  expect((await list()).find(b => b.id === s)?.state).toBe('queued') // waits for the Anarchy job
  await waitFor(a, 'done', '/api/books')
  await waitFor(s, 'done')
  expect(readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => l.split(' ').slice(0, 2).join(' '))).toEqual([`run ${a}`, `sr6:run ${s}`])
  expect((await list('/api/books')).map(b => b.id)).toEqual([a])
  expect((await list()).map(b => b.id)).not.toContain(a)
})

test('/custom/sr6/: signed in only, never campaigns.xml in any spelling or link; Anarchy’s /custom/ unchanged', async () => {
  const sr6 = join(custom, 'sr6')
  writeFileSync(join(sr6, 'campaigns.xml'), '<campaigns secret="sr6"/>')
  writeFileSync(join(custom, 'campaigns.xml'), '<campaigns secret="ca2"/>')
  linkSync(join(sr6, 'campaigns.xml'), join(sr6, 'linked.xml'))
  linkSync(join(custom, 'campaigns.xml'), join(sr6, 'linked-ca2.xml'))
  const ok = await fetch(`${base}/custom/sr6/imported/index.xml`)
  expect([ok.status, await ok.text()]).toEqual([200, expect.stringContaining('crb/weapons.xml')])
  expect((await rawFetch(`${base}/custom/sr6/imported/index.xml`)).status).toBe(401)
  for (const p of ['/custom/sr6/campaigns.xml', '/custom/sr6/CAMPAIGNS.XML', '/custom/sr6/campaigns.xml.', '/custom/sr6/campaigns.xml%20',
    '/custom/sr6/campaigns.xml::$DATA', '/custom/sr6/CAMPAI~1.XML', '/custom/sr6/linked.xml', '/custom/sr6/linked-ca2.xml',
    '/custom/SR6/imported/index.xml', '/custom/sr6./imported/index.xml', '/custom/sr6/../campaigns.xml', '/custom/sr6/imported/../campaigns.xml',
    '/custom/sr6/..%2Fcampaigns.xml', '/custom/sr6/%2e%2e/campaigns.xml'])
    expect([p, await raw(p)]).toEqual([p, 404])
  const anarchy = await fetch(`${base}/custom/imported/index.xml`), text = await anarchy.text()
  expect([anarchy.status, text]).toEqual([200, expect.stringContaining('stub/amps.xml')])
  expect(text).not.toContain('crb/')
})

test('a restart marks an interrupted SR6 book failed', async () => {
  const d = mkdtempSync(join(tmpdir(), 'ca2-sr6-restart-'))
  mkdirSync(join(d, 'library', 'sr6', 'stale-1'), { recursive: true })
  writeFileSync(join(d, 'library', 'sr6', 'stale-1', 'status.xml'), '<status state="extracting" updated="2026-10-02T00:00:00Z"></status>')
  const s: Srv = createServer({ staticDir: 'public', charDir: join(d, 'chars'), customDir: join(d, 'custom'), libraryDir: join(d, 'library'), python: STUB })
  await s.started
  s.stopJobs()
  expect(readFileSync(join(d, 'library', 'sr6', 'stale-1', 'status.xml'), 'utf8')).toMatch(/state="failed"[^>]*>Interrupted by a restart/)
})
