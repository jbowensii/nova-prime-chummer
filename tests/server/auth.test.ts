// @vitest-environment node
// Accounts (server/auth.mjs): roles on every route, sign-in and lockout, sessions, setup and recovery codes, the Origin
// check, the trusted proxy, runner folders. Plain fetch here: every request says who it is.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { validateXML } from 'xmllint-wasm'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { issueReset, usersFile } from '../../server/auth.mjs'

vi.setConfig({ testTimeout: 30000 })
const PW = { admin: 'admin-password-1', editor: 'editor-password-1', player: 'player-password-1' }
type Role = keyof typeof PW
type Srv = { close: () => void; stopJobs: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

// every log line of every server in this file: checked for secrets at the end
const logged: string[] = []
for (const m of ['log', 'error', 'warn'] as const)
  vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(' ')) })
const secrets = new Set<string>(Object.values(PW))

async function start(dir: string, users?: Partial<Record<Role, string>> | null, extra: Record<string, unknown> = {}) {
  const lib = join(dir, 'library')
  if (users) {
    mkdirSync(join(lib, '.config'), { recursive: true })
    writeFileSync(join(lib, '.config', 'users.xml'), await usersFile(Object.entries(users).map(([role, password]) => ({ username: role, role, password }))))
  }
  const srv: Srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom'), libraryDir: lib,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'], ...extra })
  await new Promise<void>(ok => srv.listen(0, ok))
  const base = `http://127.0.0.1:${srv.address().port}`
  return { srv, base, lib, chars: join(dir, 'chars') }
}
const json = (b: unknown) => ({ body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' } })
/** A request from the app's own page (Origin), with `cookie`. */
function call(base: string, method: string, path: string, { cookie = '', body, headers = {} }: { cookie?: string; body?: BodyInit; headers?: Record<string, string> } = {}) {
  return fetch(`${base}${path}`, { method, body, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...headers } })
}
async function login(base: string, username: string, password: string, headers: Record<string, string> = {}) {
  const r = await call(base, 'POST', '/api/auth/login', { ...json({ username, password }), headers: { 'Content-Type': 'application/json', ...headers } })
  const set = r.headers.get('set-cookie') ?? ''
  if (set) secrets.add(set.split(';')[0].split('=')[1])
  return { r, set, cookie: set.split(';')[0] }
}
const runner = (id: string, street: string) =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="${id}" streetName="${street}" metatype="ork" level="runner" updatedAt="2026-09-27"><build/></ca2:character>`
async function valid(file: string) {
  const r = await validateXML({ xml: { fileName: file, contents: readFileSync(file, 'utf8') },
    schema: { fileName: 'users.xsd', contents: readFileSync('public/data/schema/users.xsd', 'utf8') } })
  expect(r.errors, file).toEqual([])
}

describe('with an admin, an editor and a player', () => {
  let s: Awaited<ReturnType<typeof start>>
  const jar = {} as Record<Role, string>
  beforeAll(async () => {
    s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), PW)
    for (const role of Object.keys(PW) as Role[]) jar[role] = (await login(s.base, role, PW[role])).cookie
  })
  afterAll(() => s.srv.close())

  // [method, path, who may, body?]: every route of server.mjs and books.mjs
  const ROUTES: [string, string, 'public' | 'user' | 'editor' | 'admin', BodyInit?][] = [
    ['GET', '/api/health', 'public'], ['GET', '/api/auth/me', 'public'],
    ['GET', '/api/characters', 'user'], ['PUT', '/api/characters/zz', 'user', '<nope/>'], ['DELETE', '/api/characters/zz', 'user'],
    ['POST', '/api/auth/password', 'user', '{}'], ['GET', '/custom/index.xml', 'user'], ['GET', '/api/edits', 'user'], ['GET', '/api/nothing', 'user'],
    ['PUT', '/api/edits/items/x', 'editor', '<edit/>'], ['DELETE', '/api/edits/items/x', 'editor'], ['POST', '/api/edits/sources', 'editor', '{}'],
    ['GET', '/api/books', 'admin'], ['POST', '/api/books', 'admin', 'not a pdf'], ['GET', '/api/books/nope/report', 'admin'],
    ['POST', '/api/books/nope/reimport', 'admin'], ['POST', '/api/books/nope/ai', 'admin'], ['DELETE', '/api/books/nope', 'admin'],
    ['GET', '/api/review/nope', 'admin'], ['PUT', '/api/review/nope', 'admin', '<review/>'],
    ['GET', '/api/ai-settings', 'admin'], ['PUT', '/api/ai-settings', 'admin', '<nope/>'], ['PUT', '/api/ai-keys', 'admin', '<nope/>'],
    ['GET', '/api/ai-models?provider=nope', 'admin'],
    ['GET', '/api/backup/nope', 'admin'], ['POST', '/api/restore?preview=1', 'admin', 'not a zip'], ['POST', '/api/restore/nope', 'admin'],
    ['POST', '/api/datapack', 'admin'], ['GET', '/api/datapack/nope', 'admin'], ['POST', '/api/datapack/import', 'admin', 'not a zip'],
    ['GET', '/api/users', 'admin'], ['POST', '/api/users', 'admin', '{}'], ['PUT', '/api/users/000000000000', 'admin', '{}'],
    ['DELETE', '/api/users/000000000000', 'admin'], ['POST', '/api/users/000000000000/reset-password', 'admin', '{}'],
    ['POST', '/api/users/000000000000/move-runner', 'admin', '{}'],
  ]
  const may = { public: ['admin', 'editor', 'player', ''], user: ['admin', 'editor', 'player'], editor: ['admin', 'editor'], admin: ['admin'] }
  test.each(ROUTES)('%s %s: %s', async (method, path, level, body) => {
    for (const who of ['admin', 'editor', 'player', ''] as const) {
      const r = await call(s.base, method, path, { cookie: who ? jar[who] : '', body,
        headers: typeof body === 'string' && body.startsWith('{') ? { 'Content-Type': 'application/json' } : {} })
      const want = may[level].includes(who) ? 'allowed' : who ? 403 : 401
      if (want === 'allowed') expect([401, 403], `${who} ${r.status}`).not.toContain(r.status)
      else expect(r.status, who || 'nobody').toBe(want)
    }
  })

  test('me says who is signed in, and never a hash', async () => {
    const me = await (await call(s.base, 'GET', '/api/auth/me', { cookie: jar.editor })).json()
    expect(me).toMatchObject({ setup: false, user: { username: 'editor', role: 'editor', method: 'password', enabled: true } })
    expect(await (await call(s.base, 'GET', '/api/auth/me')).json()).toEqual({ user: null, setup: false })
    const list = await (await call(s.base, 'GET', '/api/users', { cookie: jar.admin })).text()
    expect(list).not.toMatch(/hash|salt|scrypt|"password":/)
    expect(JSON.parse(list).map((u: { username: string }) => u.username).sort()).toEqual(['admin', 'editor', 'player'])
  })

  test('runners: each account its own folder; admin and editors read everyone’s with the owner, write only their own', async () => {
    expect((await call(s.base, 'PUT', '/api/characters/p1', { cookie: jar.player, body: runner('p1', 'Kim') })).status).toBe(201)
    expect((await call(s.base, 'PUT', '/api/characters/a1', { cookie: jar.admin, body: runner('a1', 'Boss') })).status).toBe(201)
    expect(readdirSync(join(s.chars, 'player'))).toEqual(['Kim.xml'])
    const list = async (who: Role) => (await (await call(s.base, 'GET', '/api/characters', { cookie: jar[who] })).json())
      .map((c: { file: string; owner: string }) => `${c.owner}/${c.file}`).sort()
    expect(await list('player')).toEqual(['player/Kim.xml'])
    expect(await list('editor')).toEqual(['admin/Boss.xml', 'player/Kim.xml'])
    for (const who of ['admin', 'editor'] as const) {
      expect((await call(s.base, 'PUT', '/api/characters/p1?force=1', { cookie: jar[who], body: runner('p1', 'Hijacked') })).status).toBe(403)
      expect((await call(s.base, 'DELETE', '/api/characters/p1', { cookie: jar[who] })).status).toBe(403)
    }
    expect((await call(s.base, 'PUT', '/api/characters/a1?force=1', { cookie: jar.player, body: runner('a1', 'Mine now') })).status).toBe(403)
    expect(readFileSync(join(s.chars, 'player', 'Kim.xml'), 'utf8')).toContain('streetName="Kim"')
  })

  test('catalog edits record who saved them', async () => {
    const body = '<edit><item id="short-weapon" kind="gear" source="CRB" page="1"><name>Shiv</name><text></text></item></edit>'
    expect((await call(s.base, 'PUT', '/api/edits/items/short-weapon', { cookie: jar.editor, body })).status).toBe(204)
    expect(readFileSync(join(s.lib, '..', 'custom', 'edits', 'edits.xml'), 'utf8')).toContain('<item id="short-weapon" kind="gear" source="CRB" page="1" by="editor">')
  })

  test('the Origin check: every non-GET needs the app’s own origin (or Referer)', async () => {
    const post = (headers: Record<string, string>) => fetch(`${s.base}/api/characters/o1?force=1`, { method: 'PUT', body: runner('o1', 'O'), headers: { Cookie: jar.admin, ...headers } })
    expect((await post({})).status).toBe(403)
    expect((await post({ Origin: 'https://evil.example' })).status).toBe(403)
    expect((await post({ Origin: 'null' })).status).toBe(403)
    expect((await post({ Referer: 'https://evil.example/page' })).status).toBe(403)
    expect((await post({ Referer: `${s.base}/#/runner` })).status).toBe(201)
    expect((await post({ Origin: s.base, 'X-Forwarded-Host': 'evil.example' })).status).toBe(200) // an untrusted peer's header is ignored
    expect((await fetch(`${s.base}/api/auth/login`, { method: 'POST', ...json({ username: 'admin', password: PW.admin }) })).status).toBe(403)
  })

  test('the last enabled admin can’t be demoted, disabled or deleted', async () => {
    const users = await (await call(s.base, 'GET', '/api/users', { cookie: jar.admin })).json()
    const id = (n: string) => users.find((u: { username: string }) => u.username === n).id
    const put = (who: string, b: unknown, as: Role = 'admin') => call(s.base, 'PUT', `/api/users/${id(who)}`, { cookie: jar[as], ...json(b) })
    for (const b of [{ role: 'editor' }, { enabled: false }]) expect((await put('admin', b)).status).toBe(409)
    expect((await call(s.base, 'DELETE', `/api/users/${id('admin')}`, { cookie: jar.admin })).status).toBe(409)
    expect((await put('editor', { role: 'admin' })).status).toBe(200)
    expect((await put('admin', { role: 'editor' })).status).toBe(200) // another admin exists now; the role counts at once
    expect((await call(s.base, 'GET', '/api/users', { cookie: jar.admin })).status).toBe(403)
    expect((await put('editor', { enabled: false }, 'editor')).status).toBe(409)
    expect((await put('admin', { role: 'admin' }, 'editor')).status).toBe(200)
    expect((await put('editor', { role: 'editor' })).status).toBe(200)
  })

  test('accounts: add, rename (the runner folder moves), move a runner, disable ends the sessions, delete', async () => {
    const add = await call(s.base, 'POST', '/api/users', { cookie: jar.admin, ...json({ username: 'Kim', name: 'Kim', role: 'player', password: 'kim-password-1', email: 'kim@example.com' }) })
    expect(add.status).toBe(201)
    const kim = (await add.json()).user
    expect(kim).toMatchObject({ username: 'kim', email: 'kim@example.com', role: 'player', enabled: true })
    for (const b of [{ username: 'kim', name: 'x', role: 'player', password: 'kim-password-1' }, { username: 'x2', name: 'x', role: 'player', password: 'kim-password-1', email: 'KIM@example.com' }])
      expect((await call(s.base, 'POST', '/api/users', { cookie: jar.admin, ...json(b) })).status).toBe(409)
    for (const b of [{ username: '.trash', name: 'x', role: 'player', password: 'long-enough-1' }, { username: 'ok', name: 'x', role: 'player', password: 'short' },
      { username: 'ok', name: 'x', role: 'god', password: 'long-enough-1' }, { username: 'ok', name: '', role: 'player', password: 'long-enough-1' }])
      expect((await call(s.base, 'POST', '/api/users', { cookie: jar.admin, ...json(b) })).status, JSON.stringify(b)).toBe(400)
    const k = (await login(s.base, 'kim', 'kim-password-1')).cookie
    expect((await call(s.base, 'PUT', '/api/characters/k1', { cookie: k, body: runner('k1', 'Kims Runner') })).status).toBe(201)
    expect((await call(s.base, 'DELETE', `/api/users/${kim.id}`, { cookie: jar.admin })).status).toBe(409) // has a runner

    expect((await call(s.base, 'PUT', `/api/users/${kim.id}`, { cookie: jar.admin, ...json({ username: 'kimberly' }) })).status).toBe(200)
    expect(existsSync(join(s.chars, 'kim'))).toBe(false)
    expect(readdirSync(join(s.chars, 'kimberly'))).toEqual(['Kims-Runner.xml'])
    expect((await (await call(s.base, 'GET', '/api/characters', { cookie: k })).json()).map((c: { owner: string }) => c.owner)).toEqual(['kimberly'])

    const player = (await (await call(s.base, 'GET', '/api/auth/me', { cookie: jar.player })).json()).user.id
    const mv = await call(s.base, 'POST', `/api/users/${kim.id}/move-runner`, { cookie: jar.admin, ...json({ file: 'Kims-Runner.xml', to: player }) })
    expect([mv.status, await mv.json()]).toEqual([200, { file: 'Kims-Runner.xml' }])
    expect(readdirSync(join(s.chars, 'player')).sort()).toEqual(['Kim.xml', 'Kims-Runner.xml'])

    expect((await call(s.base, 'PUT', `/api/users/${kim.id}`, { cookie: jar.admin, ...json({ enabled: false }) })).status).toBe(200)
    expect((await call(s.base, 'GET', '/api/characters', { cookie: k })).status).toBe(401)
    expect((await login(s.base, 'kimberly', 'kim-password-1')).r.status).toBe(401)
    expect((await call(s.base, 'DELETE', `/api/users/${kim.id}`, { cookie: jar.admin })).status).toBe(204)
    expect(existsSync(join(s.chars, 'kimberly'))).toBe(false)
  })
})

test('sign-in: wrong passwords, lockout after 5 per username and address, sessions that survive a restart and end on reset', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-auth-'))
  let s = await start(dir, { admin: PW.admin, player: PW.player })
  expect((await login(s.base, 'admin', 'wrong-password')).r.status).toBe(401)
  expect(await (await login(s.base, 'nobody', 'wrong-password')).r.json()).toEqual({ error: 'wrong username or password' })
  const a = await login(s.base, 'ADMIN', PW.admin) // usernames are case-insensitive
  expect(a.r.status).toBe(200)
  expect(a.set).toMatch(/^ca2_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/) // no Secure over http
  const p1 = (await login(s.base, 'player', PW.player)).cookie, p2 = (await login(s.base, 'player', PW.player)).cookie
  for (let i = 0; i < 5; i++) expect((await login(s.base, 'player', 'wrong-password')).r.status).toBe(401)
  const paused = await login(s.base, 'player', PW.player)
  expect([paused.r.status, await paused.r.json()]).toEqual([429, { error: 'too many tries: paused for 15 minutes' }])
  expect((await login(s.base, 'admin', PW.admin)).r.status).toBe(200) // another username isn't paused

  // sessions.xml holds hashes, never tokens; a restart keeps everyone signed in
  s.srv.stopJobs(); s.srv.close()
  const saved = readFileSync(join(s.lib, '.config', 'sessions.xml'), 'utf8')
  expect(saved).toMatch(/<session hash="[0-9a-f]{64}"/)
  for (const c of [a.cookie, p1, p2]) expect(saved).not.toContain(c.split('=')[1])
  await valid(join(s.lib, '.config', 'sessions.xml'))
  await valid(join(s.lib, '.config', 'users.xml'))
  expect(readFileSync(join(s.lib, '.config', 'users.xml'), 'utf8')).not.toContain(PW.admin)
  s = await start(dir)
  expect((await call(s.base, 'GET', '/api/characters', { cookie: p1 })).status).toBe(200)
  expect((await call(s.base, 'GET', '/api/characters', { cookie: 'ca2_session=' + 'x'.repeat(43) })).status).toBe(401)

  // changing your password ends your other sessions; an admin's reset ends them all (and a restart doesn't bring them back)
  expect((await call(s.base, 'POST', '/api/auth/password', { cookie: p1, ...json({ current: 'wrong-password', password: 'player-password-2' }) })).status).toBe(400)
  expect((await call(s.base, 'POST', '/api/auth/password', { cookie: p1, ...json({ current: PW.player, password: 'short' }) })).status).toBe(400)
  expect((await call(s.base, 'POST', '/api/auth/password', { cookie: p1, ...json({ current: PW.player, password: 'player-password-2' }) })).status).toBe(204)
  expect((await call(s.base, 'GET', '/api/characters', { cookie: p1 })).status).toBe(200)
  expect((await call(s.base, 'GET', '/api/characters', { cookie: p2 })).status).toBe(401)
  const id = (await (await call(s.base, 'GET', '/api/auth/me', { cookie: p1 })).json()).user.id
  expect((await call(s.base, 'POST', `/api/users/${id}/reset-password`, { cookie: a.cookie, ...json({ password: 'player-password-3' }) })).status).toBe(204)
  expect((await call(s.base, 'GET', '/api/characters', { cookie: p1 })).status).toBe(401)
  s.srv.stopJobs(); s.srv.close()
  s = await start(dir)
  expect((await call(s.base, 'GET', '/api/characters', { cookie: p1 })).status).toBe(401)
  expect((await login(s.base, 'player', 'player-password-3')).r.status).toBe(200)

  // sign out
  const out = await call(s.base, 'POST', '/api/auth/logout', { cookie: a.cookie })
  expect(out.status).toBe(204)
  expect(out.headers.get('set-cookie')).toMatch(/^ca2_session=; .*Max-Age=0/)
  expect((await call(s.base, 'GET', '/api/users', { cookie: a.cookie })).status).toBe(401)
  s.srv.close()
})

test('setup: a code logged once per start, single use; the first admin gets the runners from before accounts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-auth-'))
  mkdirSync(join(dir, 'chars', '.trash'), { recursive: true })
  writeFileSync(join(dir, 'chars', 'Old-Timer.xml'), runner('o1', 'Old Timer'))
  writeFileSync(join(dir, 'chars', '.trash', 'Gone-1.xml'), runner('o2', 'Gone'))
  const codes = () => logged.map(l => l.match(/Setup code for the first admin: ([A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4})/)?.[1]).filter(Boolean)
  const before = codes().length
  let s = await start(dir, null)
  s.srv.close()
  s = await start(dir, null) // a restart: a new code
  expect(codes().length).toBe(before + 2)
  const [old, code] = codes().slice(-2) as string[]
  expect(old).not.toBe(code)
  secrets.add(code)
  expect(await (await call(s.base, 'GET', '/api/auth/me')).json()).toEqual({ user: null, setup: true })
  expect((await call(s.base, 'GET', '/api/characters')).status).toBe(401)
  expect((await call(s.base, 'GET', '/custom/index.xml')).status).toBe(401)
  const setup = (b: Record<string, string>) => call(s.base, 'POST', '/api/setup', json({ username: 'boss', name: 'The Boss', password: PW.admin, ...b }))
  expect((await setup({ code: old })).status).toBe(403)
  expect((await setup({ code, password: 'short' })).status).toBe(400)
  const r = await setup({ code: code.toLowerCase() })
  expect(r.status).toBe(201)
  expect(await r.json()).toMatchObject({ user: { username: 'boss', role: 'admin' } })
  const cookie = r.headers.get('set-cookie')!.split(';')[0]
  expect((await call(s.base, 'GET', '/api/characters', { cookie })).status).toBe(200)
  expect((await setup({ code })).status).toBe(404) // used up, and there is an account now
  expect(readdirSync(join(dir, 'chars')).sort()).toEqual(['boss'])
  expect(readdirSync(join(dir, 'chars', 'boss')).sort()).toEqual(['.trash', 'Old-Timer.xml'])
  expect(readdirSync(join(dir, 'chars', 'boss', '.trash'))).toEqual(['Gone-1.xml'])
  s.srv.close()
  s = await start(dir, null)
  expect(codes().length).toBe(before + 2) // accounts exist: no code
  s.srv.close()
})

test('recovery: users.mjs reset prints a one-time code (15 min) that /api/setup/reset takes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-auth-'))
  const s = await start(dir, { admin: PW.admin, player: PW.player })
  const old = (await login(s.base, 'player', PW.player)).cookie
  const cli = spawnSync(process.execPath, ['server/users.mjs', 'reset', 'Player'], { env: { ...process.env, LIBRARY_DIR: s.lib }, encoding: 'utf8' })
  expect(cli.status, cli.stderr).toBe(0)
  const code = cli.stdout.match(/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/)![0]
  secrets.add(code)
  const file = readFileSync(join(s.lib, '.config', 'reset.xml'), 'utf8')
  expect(file).not.toContain(code)
  await valid(join(s.lib, '.config', 'reset.xml'))
  expect(spawnSync(process.execPath, ['server/users.mjs', 'reset', 'nobody'], { env: { ...process.env, LIBRARY_DIR: s.lib }, encoding: 'utf8' }).status).toBe(1)
  const reset = (b: Record<string, string>) => call(s.base, 'POST', '/api/setup/reset', json({ username: 'player', code, password: 'player-password-9', ...b }))
  expect((await reset({ code: 'AAAA-BBBB-CCCC' })).status).toBe(403)
  expect((await reset({ username: 'admin' })).status).toBe(403)
  expect((await reset({})).status).toBe(204)
  expect(existsSync(join(s.lib, '.config', 'reset.xml'))).toBe(false)
  expect((await reset({})).status).toBe(403) // once
  expect((await call(s.base, 'GET', '/api/characters', { cookie: old })).status).toBe(401)
  expect((await login(s.base, 'player', 'player-password-9')).r.status).toBe(200)
  // an expired code
  const late = await issueReset(s.lib, 'player')
  secrets.add(late)
  writeFileSync(join(s.lib, '.config', 'reset.xml'), readFileSync(join(s.lib, '.config', 'reset.xml'), 'utf8').replace(/expires="[^"]+"/, 'expires="2020-01-01T00:00:00Z"'))
  expect((await reset({ code: late })).status).toBe(403)
  s.srv.close()
})

test('trusted proxy: forwarded headers count only from TRUST_PROXY peers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-auth-'))
  const t = await start(dir, { admin: PW.admin }, { trustProxy: '10.0.0.0/8, 127.0.0.1' })
  const fwd = (ip: string) => ({ 'X-Forwarded-For': `${ip}, 10.1.2.3`, 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'app.example', Origin: 'https://app.example' })
  const ok = await login(t.base, 'admin', PW.admin, fwd('203.0.113.5'))
  expect(ok.r.status).toBe(200)
  expect(ok.set).toMatch(/; Secure$/)
  expect((await login(t.base, 'admin', PW.admin, { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'app.example' })).r.status).toBe(403) // Origin: the bare address
  for (let i = 0; i < 5; i++) await login(t.base, 'admin', 'wrong-password', fwd('203.0.113.5'))
  expect((await login(t.base, 'admin', PW.admin, fwd('203.0.113.5'))).r.status).toBe(429)
  expect((await login(t.base, 'admin', PW.admin, fwd('203.0.113.6'))).r.status).toBe(200) // the client's own address is paused
  t.srv.close()

  const u = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin }) // no TRUST_PROXY
  expect((await login(u.base, 'admin', PW.admin, fwd('203.0.113.5'))).r.status).toBe(403) // Host decides the origin, not X-Forwarded-Host
  const plain = await login(u.base, 'admin', PW.admin, { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.9' })
  expect(plain.set).not.toMatch(/Secure/)
  for (let i = 0; i < 5; i++) await login(u.base, 'admin', 'wrong-password', { 'X-Forwarded-For': `198.51.100.${i}` })
  expect((await login(u.base, 'admin', PW.admin, { 'X-Forwarded-For': '198.51.100.77' })).r.status).toBe(429) // it's all 127.0.0.1
  u.srv.close()
  expect(() => createServer({ staticDir: 'public', charDir: join(dir, 'c2'), customDir: join(dir, 'u2'), trustProxy: 'proxy.lan' })).toThrow(/TRUST_PROXY/)
})

test('a restore ends every session and brings back the backup’s accounts; one without accounts means setup again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-auth-'))
  const s = await start(dir, { admin: PW.admin })
  let cookie = (await login(s.base, 'admin', PW.admin)).cookie
  const zip = async () => {
    const { token } = await (await call(s.base, 'POST', '/api/backup', { cookie })).json()
    return Buffer.from(await (await call(s.base, 'GET', `/api/backup/${token}`, { cookie })).arrayBuffer())
  }
  const restore = async (bytes: Buffer) => {
    const { token } = await (await call(s.base, 'POST', '/api/restore?preview=1', { cookie, body: bytes })).json()
    return call(s.base, 'POST', `/api/restore/${token}`, { cookie })
  }
  expect((await restore(await zip())).status).toBe(200)
  expect((await call(s.base, 'GET', '/api/characters', { cookie })).status).toBe(401)
  cookie = (await login(s.base, 'admin', PW.admin)).cookie
  expect(cookie).toBeTruthy()
  // a backup from before accounts: the stub's zip is JSON behind a zip header
  const before = await zip(), z = JSON.parse(before.subarray(5).toString())
  delete z.files['library/.config/users.xml']
  expect((await restore(Buffer.concat([before.subarray(0, 5), Buffer.from(JSON.stringify(z))]))).status).toBe(200)
  expect(await (await call(s.base, 'GET', '/api/auth/me', { cookie })).json()).toEqual({ user: null, setup: true })
  s.srv.close()
})

test('no password, code or session token ever reaches the log', () => {
  expect(logged.some(l => l.startsWith('signed in: admin from 127.0.0.1'))).toBe(true)
  expect(logged.some(l => l.startsWith('sign-in failed: "admin" from 203.0.113.5'))).toBe(true)
  for (const secret of secrets) for (const l of logged) if (!/Setup code for the first admin/.test(l)) expect(l).not.toContain(secret)
})
