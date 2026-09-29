// @vitest-environment node
// Ask the rules (GET/POST /api/ask, the dailyQuestions limit) with the stub worker; importer/tests/test_ask.py tests the real
// retrieval and provider call.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
import { ADMIN, createServer, rawFetch, signIn } from './_signin'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'
// @ts-expect-error plain JS module
import { limitReached } from '../../server/books.mjs'

vi.setConfig({ testTimeout: 30000 })
const dir = mkdtempSync(join(tmpdir(), 'ca2-ask-')), lib = join(dir, 'library')
const PLAYER = { username: 'pia', password: 'player-password-1', role: 'player', dailyQuestions: 2 }
const EDITOR = { username: 'eddie', password: 'editor-password-1', role: 'editor' }
const PAT = { username: 'pat', password: 'player-password-2', role: 'player' }
type Srv = { close: () => void; stopJobs: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
const servers: Srv[] = []
function start(): Promise<string> {
  return new Promise(ok => {
    const s: Srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom'), libraryDir: lib,
      python: [process.execPath, 'tests/fixtures/stub-worker.mjs'], askTimeout: 2000 })
    servers.push(s)
    s.listen(0, () => ok(`http://127.0.0.1:${s.address().port}`))
  })
}
let base = ''
const cookies: Record<string, string> = {}
beforeAll(async () => {
  mkdirSync(join(lib, '.config'), { recursive: true })
  writeFileSync(join(lib, '.config', 'users.xml'), await usersFile([ADMIN, PLAYER, EDITOR, PAT]))
  base = await start()
  for (const u of [ADMIN, PLAYER, EDITOR, PAT]) cookies[u.username] = (await signIn(base, u))!
})
afterAll(() => { for (const s of servers) { s.stopJobs(); s.close() } })
afterEach(() => { vi.useRealTimers() })

const as = (who: string, path: string, init: RequestInit = {}) => rawFetch(`${base}${path}`, { ...init,
  headers: { Origin: base, Cookie: cookies[who], 'Content-Type': 'application/json', ...init.headers as Record<string, string> } })
const ask = (who: string, question: string) => as(who, '/api/ask', { method: 'POST', body: JSON.stringify({ question }) })

test('ask is off until a provider is chosen, enabled and has its key', async () => {
  expect(await (await as('pia', '/api/ask')).json()).toEqual({ available: false, limit: 2, used: 0 })
  const r = await ask('pia', 'How far can I jump?')
  expect([r.status, (await r.json()).error]).toEqual([409, 'Ask the rules isn’t set up: the admin chooses an AI provider and its key in AI settings'])
  const settings = (enabled: string) => as('admin', '/api/ai-settings', { method: 'PUT', headers: { 'Content-Type': 'application/xml' },
    body: `<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" use="anthropic"><provider id="anthropic" enabled="${enabled}"/></ca2:aiproviders>` })
  expect((await settings('false')).status).toBe(200)
  expect((await as('admin', '/api/ai-keys', { method: 'PUT', body: '<key provider="anthropic">sk-ant-SECRETASK1234</key>' })).status).toBe(204)
  expect((await (await as('eddie', '/api/ask')).json()).available).toBe(false) // disabled
  expect((await settings('true')).status).toBe(200)
  expect(await (await as('eddie', '/api/ask')).json()).toEqual({ available: true, limit: null, used: 0 })
})

test('every signed-in role may ask; nobody else, and not from another page', async () => {
  for (const who of ['admin', 'eddie']) {
    const r = await ask(who, 'What happens when I jump a puddle?')
    expect(await r.json(), who).toEqual({ answer: 'Invented answer [ZZ p.61].', sources: [{ source: 'ZZ', page: '61', title: 'Puddle jumping' }],
      covered: true, used: 1, limit: null })
  }
  expect((await rawFetch(`${base}/api/ask`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{"question":"x"}' })).status).toBe(401)
  expect((await rawFetch(`${base}/api/ask`)).status).toBe(401)
  expect((await as('pia', '/api/ask', { method: 'POST', body: '{"question":"x"}', headers: { Origin: 'https://evil.example' } })).status).toBe(403)
  expect((await as('pia', '/api/ask', { method: 'DELETE' })).status).toBe(405)
})

test('the question is checked: text, 500 characters at most, JSON', async () => {
  expect((await ask('eddie', 'p'.repeat(500))).status).toBe(200)
  for (const q of ['p'.repeat(501), '   ', 42]) expect((await ask('eddie', q as string)).status, String(q)).toBe(400)
  expect((await as('eddie', '/api/ask', { method: 'POST', body: 'question', headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
  expect((await as('eddie', '/api/ask', { method: 'POST', body: JSON.stringify({ question: 'x'.repeat(9000) }) })).status).toBe(413)
})

test('the limit message: none, one, or all N', () => {
  expect([0, 1, 5].map(limitReached)).toEqual(['You have no questions today.', 'You’ve used today’s question. Ask again tomorrow.',
    'You’ve used all 5 of today’s questions. Ask again tomorrow.'])
})

test('a daily limit counts every question the provider got, answers 429 with Retry-After, and resets at UTC midnight', async () => {
  const laser = await (await ask('pia', 'orbital laser?')).json()
  expect(laser).toMatchObject({ covered: false, used: 0, limit: 2, sources: [] }) // retrieval found nothing: no call, not counted
  // the model saying it isn't covered was a call: counted
  expect(await (await ask('pia', 'refuse puddles')).json()).toMatchObject({ covered: false, used: 1 })
  expect((await ask('pia', 'fail puddles')).status).toBe(502) // a provider error after the call: counted
  expect(await (await as('pia', '/api/ask')).json()).toMatchObject({ used: 2 })
  const r = await ask('pia', 'puddles three')
  expect([r.status, (await r.json()).error]).toEqual([429, 'You’ve used all 2 of today’s questions. Ask again tomorrow.'])
  const wait = Number(r.headers.get('Retry-After'))
  expect(wait).toBeGreaterThan(0)
  expect(wait).toBeLessThanOrEqual(86400)
  expect(await (await as('pia', '/api/ask')).json()).toEqual({ available: true, limit: 2, used: 2 })
  // the counts are in library/.config/ask-counts.xml, by user id, never with the question
  const counts = readFileSync(join(lib, '.config', 'ask-counts.xml'), 'utf8')
  expect(counts).toMatch(/<ca2:askcounts [^>]*date="\d{4}-\d\d-\d\d"/)
  expect(counts).not.toContain('puddle')
  // a restart keeps them
  const again = await start(), prev = base
  base = again
  cookies.pia = (await signIn(again, PLAYER))!
  expect(await (await as('pia', '/api/ask')).json()).toEqual({ available: true, limit: 2, used: 2 })
  base = prev
  cookies.pia = (await signIn(prev, PLAYER))!
  // the next UTC day starts afresh
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + wait * 1000 + 1000)
  expect(await (await ask('pia', 'puddles tomorrow')).json()).toMatchObject({ covered: true, used: 1 })
})

test('a question the server had to stop counts too', async () => {
  const before = (await (await as('pat', '/api/ask')).json()).used
  const r = await ask('pat', 'hang puddles')
  expect([r.status, (await r.json()).error]).toEqual([502, 'no answer within 2 seconds; try again'])
  expect((await (await as('pat', '/api/ask')).json()).used).toBe(before + 1)
})

test('a count at UTC midnight lands in the new day', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const midnight = Date.parse(`${new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10)}T00:00:00Z`)
  vi.setSystemTime(midnight - 500)
  expect((await (await as('pat', '/api/ask')).json()).used).toBe(0) // a new day for pat
  const slow = ask('pat', 'slow puddles')
  await new Promise(r => setTimeout(r, 300))
  vi.setSystemTime(midnight + 5000) // answered after midnight
  expect(await (await slow).json()).toMatchObject({ used: 1 })
  expect((await (await as('pat', '/api/ask')).json()).used).toBe(1)
})

test('at most 3 questions are answered at once on the server', async () => {
  const slow = ['admin', 'eddie', 'pat'].map(u => ask(u, 'slow puddles'))
  await new Promise(r => setTimeout(r, 300))
  const busy = await ask('pia', 'puddles')
  expect([busy.status, (await busy.json()).error, busy.headers.get('Retry-After')]).toEqual([429, 'Ask the rules is busy; try again in a moment', '5'])
  expect((await Promise.all(slow)).map(r => r.status)).toEqual([200, 200, 200])
})

test('one question at a time per account', async () => {
  const slow = ask('eddie', 'slow puddles')
  await new Promise(r => setTimeout(r, 300))
  const busy = await ask('eddie', 'puddles')
  expect([busy.status, (await busy.json()).error]).toEqual([429, 'your last question is still being answered; wait for it'])
  expect(busy.headers.get('Retry-After')).toBe('5')
  expect((await ask('admin', 'puddles')).status).toBe(200) // someone else meanwhile
  expect((await slow).status).toBe(200)
  expect((await ask('eddie', 'puddles')).status).toBe(200)
})

test('the key never comes back, in an answer or an error', async () => {
  const r = await ask('eddie', 'leak puddles')
  const text = await r.text()
  expect(r.status).toBe(200)
  expect(text).toContain('[key]')
  expect(text).not.toContain('SECRETASK')
  const f = await ask('eddie', 'fail puddles')
  const ft = await f.text()
  expect(f.status).toBe(502)
  expect(ft).toContain('the provider didn’t accept the API key [key]')
  expect(ft).not.toContain('SECRETASK')
})

test('the admin sets dailyQuestions on the users update route; nobody else can', async () => {
  const users: { id: string; username: string; dailyQuestions: number | null }[] = await (await as('admin', '/api/users')).json()
  const eddie = users.find(u => u.username === 'eddie')!
  expect(users.find(u => u.username === 'pia')!.dailyQuestions).toBe(2)
  expect(eddie.dailyQuestions).toBeNull()
  const put = (who: string, b: unknown) => as(who, `/api/users/${eddie.id}`, { method: 'PUT', body: JSON.stringify(b) })
  expect((await (await put('admin', { dailyQuestions: 5 })).json()).user.dailyQuestions).toBe(5)
  expect(readFileSync(join(lib, '.config', 'users.xml'), 'utf8')).toMatch(/username="eddie"[^>]*dailyQuestions="5"/)
  expect((await (await as('eddie', '/api/ask')).json()).limit).toBe(5)
  for (const v of [-1, 1.5, '3', 10001]) expect((await put('admin', { dailyQuestions: v })).status, String(v)).toBe(400)
  expect((await put('eddie', { dailyQuestions: null })).status).toBe(403)
  expect((await (await put('admin', { dailyQuestions: null })).json()).user.dailyQuestions).toBeNull()
  expect(readFileSync(join(lib, '.config', 'users.xml'), 'utf8')).not.toMatch(/username="eddie"[^>]*dailyQuestions/)
  expect(existsSync(join(lib, '.config', 'ask-counts.xml'))).toBe(true)
})
