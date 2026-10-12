// @vitest-environment node
// Accounts (server/auth.mjs): roles on every route, sign-in and lockout, sessions, setup and recovery codes, the Origin
// check, the trusted proxy, runner folders. Plain fetch here: every request says who it is.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { validateXML } from 'xmllint-wasm'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { authApi, issueReset, need, netKey, usersFile } from '../../server/auth.mjs'

vi.setConfig({ testTimeout: 30000 })
const PW = { admin: 'admin-password-1', editor: 'editor-password-1', player: 'player-password-1' }
type Role = keyof typeof PW
type Srv = { close: () => void; stopJobs: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

// every log line of every server in this file: checked for secrets at the end
const logged: string[] = []
for (const m of ['log', 'error', 'warn'] as const)
  vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
    logged.push(a.map(String).join(' '))
  })
const secrets = new Set<string>(Object.values(PW))

async function start(dir: string, users?: Partial<Record<Role, string>> | null, extra: Record<string, unknown> = {}) {
  const lib = join(dir, 'library')
  if (users) {
    mkdirSync(join(lib, '.config'), { recursive: true })
    writeFileSync(join(lib, '.config', 'users.xml'), await usersFile(Object.entries(users).map(([role, password]) => ({ username: role, role, password }))))
  }
  const srv: Srv = createServer({
    staticDir: 'public',
    charDir: join(dir, 'chars'),
    customDir: join(dir, 'custom'),
    libraryDir: lib,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
    ...extra,
  })
  await new Promise<void>(ok => srv.listen(0, ok))
  const base = `http://127.0.0.1:${srv.address().port}`
  return { srv, base, lib, chars: join(dir, 'chars'), dir }
}
const json = (b: unknown) => ({ body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' } })
/** A request from the app's own page (Origin), with `cookie`. */
function call(
  base: string,
  method: string,
  path: string,
  { cookie = '', body, headers = {} }: { cookie?: string; body?: BodyInit; headers?: Record<string, string> } = {},
) {
  return fetch(`${base}${path}`, { method, body, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...headers } })
}
async function login(base: string, username: string, password: string, headers: Record<string, string> = {}) {
  const r = await call(base, 'POST', '/api/auth/login', { ...json({ username, password }), headers: { 'Content-Type': 'application/json', ...headers } })
  const all = r.headers.getSetCookie(),
    set = all.find(c => /session=/.test(c)) ?? ''
  const device = all.find(c => /device=/.test(c))?.split(';')[0] ?? ''
  if (set) secrets.add(set.split(';')[0].split('=')[1])
  if (device) secrets.add(device.split('=')[1])
  return { r, set, cookie: set.split(';')[0], device, deviceSet: all.find(c => /device=/.test(c)) ?? '' }
}
const runner = (id: string, street: string) =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="${id}" streetName="${street}" metatype="ork" level="runner" updatedAt="2026-09-27"><build/></ca2:character>`
async function valid(file: string) {
  const r = await validateXML({
    xml: { fileName: file, contents: readFileSync(file, 'utf8') },
    schema: { fileName: 'users.xsd', contents: readFileSync('public/data/schema/users.xsd', 'utf8') },
  })
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
    ['GET', '/api/health', 'public'],
    ['GET', '/api/auth/me', 'public'],
    ['GET', '/api/characters', 'user'],
    ['PUT', '/api/characters/zz', 'user', '<nope/>'],
    ['DELETE', '/api/characters/zz', 'user'],
    ['GET', '/api/trash', 'user'],
    ['POST', '/api/trash/zz.xml/restore', 'user'],
    ['DELETE', '/api/trash/zz.xml', 'user'],
    ['DELETE', '/api/trash', 'user'],
    ['POST', '/api/auth/password', 'user', '{}'],
    ['GET', '/custom/index.xml', 'user'],
    ['GET', '/api/edits', 'user'],
    ['GET', '/api/nothing', 'user'],
    ['PUT', '/api/edits/items/x', 'editor', '<edit/>'],
    ['DELETE', '/api/edits/items/x', 'editor'],
    ['POST', '/api/edits/sources', 'editor', '{}'],
    ['PUT', '/api/table-rules', 'editor', '{}'],
    ['GET', '/api/campaigns', 'user'],
    ['POST', '/api/campaigns', 'editor', '{}'],
    ['GET', '/custom/table-rules.xml', 'user'],
    ['GET', '/api/samples', 'user'],
    ['GET', '/api/books', 'admin'],
    ['POST', '/api/books', 'admin', 'not a pdf'],
    ['GET', '/api/books/nope/report', 'admin'],
    ['POST', '/api/books/nope/reimport', 'admin'],
    ['POST', '/api/books/reimport-all', 'admin'],
    ['POST', '/api/sr6/books/reimport-all', 'admin'],
    ['POST', '/api/books/nope/ai', 'admin'],
    ['DELETE', '/api/books/nope', 'admin'],
    ['GET', '/api/review/nope', 'admin'],
    ['PUT', '/api/review/nope', 'admin', '<review/>'],
    ['GET', '/api/ai-settings', 'admin'],
    ['PUT', '/api/ai-settings', 'admin', '<nope/>'],
    ['PUT', '/api/ai-keys', 'admin', '<nope/>'],
    ['GET', '/api/ai-models?provider=nope', 'admin'],
    ['POST', '/api/ai-test?provider=nope', 'admin'],
    ['GET', '/api/backup/nope', 'admin'],
    ['POST', '/api/restore?preview=1', 'admin', 'not a zip'],
    ['POST', '/api/restore/nope', 'admin'],
    ['POST', '/api/datapack', 'admin'],
    ['GET', '/api/datapack/nope', 'admin'],
    ['POST', '/api/datapack/import', 'admin', 'not a zip'],
    ['POST', '/api/datapack/import/nope', 'admin'],
    ['GET', '/api/users', 'admin'],
    ['POST', '/api/users', 'admin', '{}'],
    ['PUT', '/api/users/000000000000', 'admin', '{}'],
    ['DELETE', '/api/users/000000000000', 'admin'],
    ['POST', '/api/users/000000000000/reset-password', 'admin', '{}'],
    ['POST', '/api/users/000000000000/move-runner', 'admin', '{}'],
    ['POST', '/api/users/000000000000/unlink', 'admin'],
    ['GET', '/api/auth/oidc/start', 'public'],
    ['GET', '/api/auth/oidc/callback?state=x&code=y', 'public'],
    ['GET', '/api/auth-settings', 'admin'],
    ['PUT', '/api/auth-settings', 'admin', '{}'],
    ['POST', '/api/auth-settings/test', 'admin', '{}'],
  ]
  const may = { public: ['admin', 'editor', 'player', ''], user: ['admin', 'editor', 'player'], editor: ['admin', 'editor'], admin: ['admin'] }
  test.each(ROUTES)('%s %s: %s', async (method, path, level, body) => {
    for (const who of ['admin', 'editor', 'player', ''] as const) {
      const r = await call(s.base, method, path, {
        cookie: who ? jar[who] : '',
        body,
        headers: typeof body === 'string' && body.startsWith('{') ? { 'Content-Type': 'application/json' } : {},
      })
      const want = may[level].includes(who) ? 'allowed' : who ? 403 : 401
      if (want === 'allowed') expect([401, 403], `${who} ${r.status}`).not.toContain(r.status)
      else expect(r.status, who || 'nobody').toBe(want)
    }
  })

  test('table rules: the GM writes them (checked, schema-valid, atomic); everyone signed in reads them', async () => {
    const put = (rules: unknown, cookie = jar.editor) => call(s.base, 'PUT', '/api/table-rules', { cookie, ...json({ rules }) })
    for (const bad of [
      null,
      [{ id: 'Bad Id', on: true }],
      [
        { id: 'a', on: true },
        { id: 'a', on: false },
      ],
      [{ id: 'a', on: 'yes' }],
      [{ id: 'a', on: true, locked: 'yes' }],
      [{ id: 'house-1', on: true, text: 'no name' }],
      [{ id: 'house-1', on: true, name: 'x'.repeat(121) }],
      Array.from({ length: 201 }, (_, i) => ({ id: `r${i}`, on: true })),
    ])
      expect((await put(bad)).status, JSON.stringify(bad).slice(0, 60)).toBe(400)
    expect((await call(s.base, 'PUT', '/api/table-rules', { cookie: jar.editor, body: '{"rules":[]}' })).status).toBe(415)
    const rules = [
      { id: 'test.optional-made-up', on: true, locked: true },
      { id: 'house-3f2a', on: false, name: 'No <b>crits</b> & such', text: 'Made up.\nTwo lines.' },
    ]
    expect((await put(rules)).status).toBe(204)
    expect((await put(rules, jar.player)).status).toBe(403)
    const file = join(s.dir, 'custom', 'table-rules.xml')
    const r = await validateXML({
      xml: { fileName: file, contents: readFileSync(file, 'utf8') },
      schema: { fileName: 'tablerules.xsd', contents: readFileSync('public/data/schema/tablerules.xsd', 'utf8') },
    })
    expect(r.errors).toEqual([])
    const read = await call(s.base, 'GET', '/custom/table-rules.xml', { cookie: jar.player })
    expect(read.status).toBe(200)
    const text = await read.text()
    expect(text).toContain('<rule id="test.optional-made-up" on="true" locked="true"></rule>')
    expect(text).toContain('<rule id="house-3f2a" on="false"><name>No &lt;b&gt;crits&lt;/b&gt; &amp; such</name><text>Made up.\nTwo lines.</text></rule>')
    expect(readdirSync(join(s.dir, 'custom')).filter(f => f.endsWith('.tmp'))).toEqual([])
  })

  test('example sets: everyone signed in reads custom/samples/<set>/; nobody writes them through the API', async () => {
    const root = join(s.dir, 'custom', 'samples')
    mkdirSync(join(root, 'builtin'), { recursive: true })
    mkdirSync(join(root, 'house'), { recursive: true })
    mkdirSync(join(root, '.hidden'), { recursive: true })
    writeFileSync(join(root, 'builtin', 'sample-dusty.xml'), runner('sample-dusty', 'Dusty Hat'))
    writeFileSync(join(root, 'builtin', 'notes.txt'), 'not a runner')
    writeFileSync(
      join(root, 'house', 'set.xml'),
      '<?xml version="1.0"?><ca2:sampleset xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" name="Made-up &amp; house set" canon="false"/>',
    )
    writeFileSync(join(root, 'house', 'mo.xml'), runner('house-mo', 'Mo Ray'))
    writeFileSync(join(root, '.hidden', 'x.xml'), runner('x', 'Hidden'))
    const r = await call(s.base, 'GET', '/api/samples', { cookie: jar.player })
    expect(await r.json()).toEqual({
      sets: [
        { id: 'builtin', name: 'Built-in samples (first release)', canon: true, samples: [{ name: 'Dusty Hat', href: 'samples/builtin/sample-dusty.xml' }] },
        { id: 'house', name: 'Made-up & house set', canon: false, samples: [{ name: 'Mo Ray', href: 'samples/house/mo.xml' }] },
      ],
    })
    expect((await call(s.base, 'GET', '/custom/samples/builtin/sample-dusty.xml', { cookie: jar.player })).status).toBe(200)
    expect((await call(s.base, 'GET', '/custom/samples/builtin/sample-dusty.xml')).status).toBe(401)
    for (const m of ['PUT', 'POST', 'DELETE'])
      expect((await call(s.base, m, '/api/samples', { cookie: jar.admin, body: m === 'DELETE' ? undefined : '{}' })).status).toBe(405)
    const set = join(root, 'house', 'set.xml')
    const v = await validateXML({
      xml: { fileName: set, contents: readFileSync(set, 'utf8') },
      schema: { fileName: 'sampleset.xsd', contents: readFileSync('public/data/schema/sampleset.xsd', 'utf8') },
    })
    expect(v.errors).toEqual([])
  })

  test('me says who is signed in, and never a hash', async () => {
    const me = await (await call(s.base, 'GET', '/api/auth/me', { cookie: jar.editor })).json()
    expect(me).toMatchObject({ setup: false, user: { username: 'editor', role: 'editor', method: 'password', enabled: true } })
    expect(await (await call(s.base, 'GET', '/api/auth/me')).json()).toEqual({ user: null, setup: false, oidc: false })
    const list = await (await call(s.base, 'GET', '/api/users', { cookie: jar.admin })).text()
    expect(list).not.toMatch(/hash|salt|scrypt|"password":/)
    expect(
      JSON.parse(list)
        .map((u: { username: string }) => u.username)
        .sort(),
    ).toEqual(['admin', 'editor', 'player'])
  })

  test('runners: each account its own folder; the admin reads everyone’s with the owner (editors: their campaigns’), writes only their own', async () => {
    expect((await call(s.base, 'PUT', '/api/characters/p1', { cookie: jar.player, body: runner('p1', 'Kim') })).status).toBe(201)
    expect((await call(s.base, 'PUT', '/api/characters/a1', { cookie: jar.admin, body: runner('a1', 'Boss') })).status).toBe(201)
    expect(readdirSync(join(s.chars, 'player'))).toEqual(['Kim.xml'])
    const list = async (who: Role) =>
      (await (await call(s.base, 'GET', '/api/characters', { cookie: jar[who] })).json())
        .map((c: { file: string; owner: string }) => `${c.owner}/${c.file}`)
        .sort()
    expect(await list('player')).toEqual(['player/Kim.xml'])
    expect(await list('editor')).toEqual([]) // campaigns.test.ts: an editor reads the runners in the campaigns they GM
    expect(await list('admin')).toEqual(['admin/Boss.xml', 'player/Kim.xml'])
    // the account's name travels with each row: the runner list groups and labels others' runners by it
    expect((await (await call(s.base, 'GET', '/api/characters', { cookie: jar.admin })).json()).map((c: { ownerName: string }) => c.ownerName).sort()).toEqual([
      'admin',
      'player',
    ])
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
    expect(readFileSync(join(s.lib, '..', 'custom', 'edits', 'edits.xml'), 'utf8')).toContain(
      '<item id="short-weapon" kind="gear" source="CRB" page="1" by="editor">',
    )
  })

  test('the Origin check: every non-GET needs the app’s own origin (or Referer)', async () => {
    const post = (headers: Record<string, string>) =>
      fetch(`${s.base}/api/characters/o1?force=1`, { method: 'PUT', body: runner('o1', 'O'), headers: { Cookie: jar.admin, ...headers } })
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

  test('sr6 is reserved for the Shadowrun 6 area: no new account or rename takes it, in any case', async () => {
    const add = (username: string) =>
      call(s.base, 'POST', '/api/users', { cookie: jar.admin, ...json({ username, name: 'x', role: 'player', password: 'long-enough-1' }) })
    for (const n of ['sr6', 'SR6']) {
      const r = await add(n)
      expect([r.status, (await r.json()).error], n).toEqual([400, 'sr6 is reserved for the Shadowrun 6 area'])
    }
    const ids: string[] = []
    for (const n of ['sr6x', 'sr-6']) {
      const r = await add(n)
      expect(r.status, n).toBe(201)
      ids.push((await r.json()).user.id)
    }
    for (const n of ['sr6', 'Sr6'])
      expect((await call(s.base, 'PUT', `/api/users/${ids[0]}`, { cookie: jar.admin, ...json({ username: n }) })).status, n).toBe(400)
    for (const id of ids) expect((await call(s.base, 'DELETE', `/api/users/${id}`, { cookie: jar.admin })).status).toBe(204)
  })

  test('accounts: add, rename (the runner folder moves), move a runner, disable ends the sessions, delete', async () => {
    const add = await call(s.base, 'POST', '/api/users', {
      cookie: jar.admin,
      ...json({ username: 'Kim', name: 'Kim', role: 'player', password: 'kim-password-1', email: 'kim@example.com' }),
    })
    expect(add.status).toBe(201)
    const kim = (await add.json()).user
    expect(kim).toMatchObject({ username: 'kim', email: 'kim@example.com', role: 'player', enabled: true })
    for (const b of [
      { username: 'kim', name: 'x', role: 'player', password: 'kim-password-1' },
      { username: 'x2', name: 'x', role: 'player', password: 'kim-password-1', email: 'KIM@example.com' },
    ])
      expect((await call(s.base, 'POST', '/api/users', { cookie: jar.admin, ...json(b) })).status).toBe(409)
    for (const b of [
      { username: '.trash', name: 'x', role: 'player', password: 'long-enough-1' },
      { username: 'ok', name: 'x', role: 'player', password: 'short' },
      { username: 'ok', name: 'x', role: 'god', password: 'long-enough-1' },
      { username: 'ok', name: '', role: 'player', password: 'long-enough-1' },
    ])
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

test('need(): an /api/sr6/ path needs what the same path without the prefix needs', () => {
  expect(need('/api/sr6/npcs', 'GET')).toBe('editor')
  expect(need('/api/sr6/books', 'POST')).toBe('admin')
  expect(need('/api/sr6/characters', 'GET')).toBe('user')
  expect(need('/api/sr6/campaigns', 'POST')).toBe('editor')
  expect(need('/api/sr6', 'GET')).toBe('user')
  expect(need('/api/sr6x/npcs', 'GET')).toBe('user') // not the prefix
})

test('sign-in: wrong passwords, lockout after 5 per username and address, sessions that survive a restart and end on reset', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-auth-'))
  let s = await start(dir, { admin: PW.admin, player: PW.player })
  expect((await login(s.base, 'admin', 'wrong-password')).r.status).toBe(401)
  expect(await (await login(s.base, 'nobody', 'wrong-password')).r.json()).toEqual({ error: 'wrong username or password' })
  const a = await login(s.base, 'ADMIN', PW.admin) // usernames are case-insensitive
  expect(a.r.status).toBe(200)
  expect(a.set).toMatch(/^ca2_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/) // no Secure over http
  const p1 = (await login(s.base, 'player', PW.player)).cookie,
    p2 = (await login(s.base, 'player', PW.player)).cookie
  for (let i = 0; i < 5; i++) expect((await login(s.base, 'player', 'wrong-password')).r.status).toBe(401)
  const paused = await login(s.base, 'player', PW.player)
  expect([paused.r.status, await paused.r.json()]).toEqual([429, { error: 'too many tries: paused for 15 minutes' }])
  expect((await login(s.base, 'admin', PW.admin)).r.status).toBe(200) // another username isn't paused

  // sessions.xml holds hashes, never tokens; a restart keeps everyone signed in
  s.srv.stopJobs()
  s.srv.close()
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
  expect((await call(s.base, 'POST', '/api/auth/password', { cookie: p1, ...json({ current: 'wrong-password', password: 'player-password-2' }) })).status).toBe(
    400,
  )
  expect((await call(s.base, 'POST', '/api/auth/password', { cookie: p1, ...json({ current: PW.player, password: 'short' }) })).status).toBe(400)
  expect((await call(s.base, 'POST', '/api/auth/password', { cookie: p1, ...json({ current: PW.player, password: 'player-password-2' }) })).status).toBe(204)
  expect((await call(s.base, 'GET', '/api/characters', { cookie: p1 })).status).toBe(200)
  expect((await call(s.base, 'GET', '/api/characters', { cookie: p2 })).status).toBe(401)
  const id = (await (await call(s.base, 'GET', '/api/auth/me', { cookie: p1 })).json()).user.id
  expect((await call(s.base, 'POST', `/api/users/${id}/reset-password`, { cookie: a.cookie, ...json({ password: 'player-password-3' }) })).status).toBe(204)
  expect((await call(s.base, 'GET', '/api/characters', { cookie: p1 })).status).toBe(401)
  s.srv.stopJobs()
  s.srv.close()
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
  expect(await (await call(s.base, 'GET', '/api/auth/me')).json()).toEqual({ user: null, setup: true, oidc: false })
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
  writeFileSync(
    join(s.lib, '.config', 'reset.xml'),
    readFileSync(join(s.lib, '.config', 'reset.xml'), 'utf8').replace(/expires="[^"]+"/, 'expires="2020-01-01T00:00:00Z"'),
  )
  expect((await reset({ code: late })).status).toBe(403)
  s.srv.close()
})

test('trusted proxy: forwarded headers count only from TRUST_PROXY peers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-auth-'))
  const t = await start(dir, { admin: PW.admin }, { trustProxy: '10.0.0.0/8, 127.0.0.1' })
  const fwd = (ip: string) => ({
    'X-Forwarded-For': `${ip}, 10.1.2.3`,
    'X-Forwarded-Proto': 'https',
    'X-Forwarded-Host': 'app.example',
    Origin: 'https://app.example',
  })
  const ok = await login(t.base, 'admin', PW.admin, fwd('203.0.113.5'))
  expect(ok.r.status).toBe(200)
  expect(ok.set).toMatch(/^__Host-ca2_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/) // no Domain
  const https = { ...fwd('203.0.113.5'), Cookie: ok.cookie }
  expect((await call(t.base, 'GET', '/api/characters', { headers: https })).status).toBe(200)
  // the plain name isn't read over https (a sibling subdomain could have set it), the __Host- one not over http
  expect((await call(t.base, 'GET', '/api/characters', { headers: { ...https, Cookie: ok.cookie.replace('__Host-', '') } })).status).toBe(401)
  expect((await call(t.base, 'GET', '/api/characters', { cookie: ok.cookie })).status).toBe(401)
  // -Proto and -Host: the value the nearest proxy appended (the last); earlier ones may be the client's
  const appended = await login(t.base, 'admin', PW.admin, {
    'X-Forwarded-For': '203.0.113.5',
    'X-Forwarded-Proto': 'https, http',
    'X-Forwarded-Host': 'evil.example, app.example',
    Origin: 'http://app.example',
  })
  expect([appended.r.status, appended.set]).toEqual([200, expect.not.stringMatching(/Secure/)])
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
  const other = (await login(s.base, 'admin', PW.admin)).cookie // a second session: it ends too
  const preview = await (await call(s.base, 'POST', '/api/restore?preview=1', { cookie, body: await zip() })).json()
  expect(preview.manifest).toMatchObject({ users: 1, authSecret: false })
  expect((await call(s.base, 'POST', `/api/restore/${preview.token}`, { cookie })).status).toBe(200)
  for (const c of [cookie, other]) expect((await call(s.base, 'GET', '/api/characters', { cookie: c })).status).toBe(401)
  const sessionsXml = join(s.lib, '.config', 'sessions.xml') // gone with the swap; written again later
  expect(existsSync(sessionsXml) ? readFileSync(sessionsXml, 'utf8') : '').not.toMatch(/<session\b/)
  cookie = (await login(s.base, 'admin', PW.admin)).cookie
  expect(cookie).toBeTruthy()

  // the stub's zip is JSON behind a zip header: edit what the backup holds
  const edited = async (edit: (files: Record<string, string>) => void) => {
    const bytes = await zip(),
      z = JSON.parse(bytes.subarray(5).toString())
    edit(z.files)
    z.folders = Object.fromEntries(['characters', 'custom', 'library'].map(f => [f, Object.keys(z.files).filter(n => n.startsWith(`${f}/`)).length]))
    return Buffer.concat([bytes.subarray(0, 5), Buffer.from(JSON.stringify(z))])
  }
  const b64 = (t: string) => Buffer.from(t).toString('base64'),
    text = (b: string) => Buffer.from(b, 'base64').toString()
  // Authelia links for an issuer other than the restored auth.xml's go (subjects belong to their issuer); its own stay
  const linked = await edited(files => {
    const users = text(files['library/.config/users.xml'])
    files['library/.config/users.xml'] = b64(
      users
        .replace(/<user\b([^>]*?)(\/?>)/, '<user$1 oidcIss="https://old.example" oidcSub="sub-1"$2')
        .replace(
          '</ca2:users>',
          '  <user id="0123456789ab" username="kim" name="Kim" role="player" method="authelia" enabled="true" created="2026-09-28T00:00:00Z" oidcIss="https://auth.example" oidcSub="sub-2"/>\n</ca2:users>',
        ),
    )
    files['library/.config/auth.xml'] = b64(
      '<?xml version="1.0" encoding="UTF-8"?>\n<ca2:auth xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">\n  <oidc enabled="false" issuer="https://auth.example" client="app" tokenAuth="client_secret_basic"/>\n</ca2:auth>\n',
    )
  })
  expect((await restore(linked)).status).toBe(200)
  const users = readFileSync(join(s.lib, '.config', 'users.xml'), 'utf8')
  expect(users).not.toContain('old.example')
  expect(users).toMatch(/username="kim"[^>]*oidcIss="https:\/\/auth.example" oidcSub="sub-2"/)
  await valid(join(s.lib, '.config', 'users.xml'))
  cookie = (await login(s.base, 'admin', PW.admin)).cookie

  // a backup from before accounts: setup again, and its top-level runners go to the new admin
  const code = () =>
    logged
      .map(l => l.match(/Setup code for the first admin: (\S+)/)?.[1])
      .filter(Boolean)
      .pop()!
  const old = await edited(files => {
    delete files['library/.config/users.xml']
    files['characters/Old-Timer.xml'] = b64(runner('r-old', 'Old Timer'))
  })
  const pre = await (await call(s.base, 'POST', '/api/restore?preview=1', { cookie, body: old })).json()
  expect(pre.manifest.users).toBe(0)
  expect((await call(s.base, 'POST', `/api/restore/${pre.token}`, { cookie })).status).toBe(200)
  expect(await (await call(s.base, 'GET', '/api/auth/me', { cookie })).json()).toEqual({ user: null, setup: true, oidc: false })
  secrets.add(code())
  const r = await call(s.base, 'POST', '/api/setup', json({ username: 'boss', name: 'The Boss', password: PW.admin, code: code() }))
  expect(r.status).toBe(201)
  expect(readdirSync(join(s.chars, 'boss'))).toContain('Old-Timer.xml')
  s.srv.close()
})

test('sign-in limits: 20 failures per network whatever the username (IPv6 by /64), and a growing wait per account', async () => {
  expect([netKey('203.0.113.5'), netKey('2001:db8:1:2::5'), netKey('2001:db8:1:2:ffff:0:0:1'), netKey('2001:DB8:1:3::1'), netKey('::1')]).toEqual([
    '203.0.113.5',
    '2001:db8:1:2::/64',
    '2001:db8:1:2::/64',
    '2001:db8:1:3::/64',
    '0:0:0:0::/64',
  ])
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin, player: PW.player }, { trustProxy: '127.0.0.1' })
  const from = (ip: string) => ({ 'X-Forwarded-For': ip })
  for (let i = 0; i < 20; i++) expect((await login(s.base, `nobody${i}`, 'wrong-password', from(`2001:db8:0:1::${i + 1}`))).r.status).toBe(401)
  const paused = await login(s.base, 'admin', PW.admin, from('2001:db8:0:1:abcd::9')) // the same /64, a right password
  expect([paused.r.status, (await paused.r.json()).error]).toEqual([429, 'too many failed tries from your network: try again later'])
  expect(Number(paused.r.headers.get('retry-after'))).toBeGreaterThan(500)
  expect((await login(s.base, 'admin', PW.admin, from('2001:db8:0:2::1'))).r.status).toBe(200) // the next /64

  // one account, from many addresses: 10 failures are free, then each doubles a wait; a success clears it
  for (let i = 0; i < 10; i++) await login(s.base, 'player', 'wrong-password', from(`198.51.100.${i}`))
  expect((await login(s.base, 'player', PW.player, from('198.51.100.200'))).r.status).toBe(200)
  for (let i = 0; i < 11; i++) await login(s.base, 'player', 'wrong-password', from(`192.0.2.${i}`))
  const slow = await login(s.base, 'player', PW.player, from('192.0.2.200'))
  expect([slow.r.status, slow.r.headers.get('retry-after')]).toEqual([429, '1'])
  expect((await login(s.base, 'admin', PW.admin, from('192.0.2.201'))).r.status).toBe(200) // other accounts aren't slowed
  await new Promise(r => setTimeout(r, 1100))
  expect((await login(s.base, 'player', PW.player, from('192.0.2.200'))).r.status).toBe(200)
  expect(logged.some(l => l === 'sign-in failed: an unknown username from 2001:db8:0:1::1')).toBe(true)
  expect(logged.some(l => l.includes('nobody'))).toBe(false) // an unknown name may be a password typed in the wrong field
  s.srv.close()
})

test('known devices: a browser that signed in skips its account’s wait until it fails itself; resets clear the wait', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin, player: PW.player }, { trustProxy: '127.0.0.1' })
  let ip = 0
  const from = (extra: Record<string, string> = {}) => ({ 'X-Forwarded-For': `198.51.100.${++ip}`, ...extra })
  // 13 failures: the wait reaches 4 s, so a slow CI box can't outlast it between steps
  const lockOut = async (name = 'player') => {
    for (let i = 0; i < 13; i++) await login(s.base, name, 'wrong-password', from())
  }
  const first = await login(s.base, 'player', PW.player, from())
  expect(first.deviceSet).toMatch(/^ca2_device=[\w-]{22}\.[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=31536000$/)
  const device = first.device,
    other = (await login(s.base, 'admin', PW.admin, from())).device
  const https = await login(s.base, 'admin', PW.admin, from({ 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'app.example', Origin: 'https://app.example' }))
  expect(https.deviceSet).toMatch(/^__Host-ca2_device=.*; Path=\/; .*; Secure$/)

  await lockOut()
  expect((await login(s.base, 'player', PW.player, from())).r.status).toBe(429)
  expect((await login(s.base, 'player', PW.player, from({ Cookie: other }))).r.status).toBe(429) // another account's device
  expect((await login(s.base, 'player', PW.player, from({ Cookie: device.replace(/.$/, c => (c === 'A' ? 'B' : 'A')) }))).r.status).toBe(429) // forged
  expect(
    (await login(s.base, 'player', PW.player, from({ Cookie: device.replace(/(\.[\w-]{10})(.)/, (_, a, c) => a + (c === 'A' ? 'B' : 'A')) }))).r.status,
  ).toBe(429) // forged MAC
  expect((await login(s.base, 'player', PW.player, from({ Cookie: device }))).r.status).toBe(200) // and that clears the wait
  expect((await login(s.base, 'player', PW.player, from())).r.status).toBe(200)

  // a device that keeps failing loses its pass for the rest of the wait
  await lockOut()
  for (let i = 0; i < 5; i++) expect((await login(s.base, 'player', 'wrong-password', from({ Cookie: device }))).r.status).toBe(401)
  expect((await login(s.base, 'player', PW.player, from({ Cookie: device }))).r.status).toBe(429)

  // an admin's reset or a recovery code clears the wait
  const adminCookie = (await login(s.base, 'admin', PW.admin, from())).cookie
  const users = await (await call(s.base, 'GET', '/api/users', { cookie: adminCookie })).json()
  const pid = users.find((u: { username: string }) => u.username === 'player').id
  expect((await call(s.base, 'POST', `/api/users/${pid}/reset-password`, { cookie: adminCookie, ...json({ password: 'player-password-5' }) })).status).toBe(204)
  expect((await login(s.base, 'player', 'player-password-5', from())).r.status).toBe(200)
  await lockOut()
  const code = await issueReset(s.lib, 'player')
  secrets.add(code)
  expect((await call(s.base, 'POST', '/api/setup/reset', json({ username: 'player', code, password: 'player-password-6' }))).status).toBe(204)
  expect((await login(s.base, 'player', 'player-password-6', from())).r.status).toBe(200)
  await valid(join(s.lib, '.config', 'device-key.xml'))
  s.srv.close()
})

test('the account wait counts any typed name: an unknown one is refused exactly like a real one', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { player: PW.player }, { trustProxy: '127.0.0.1' })
  let ip = 0
  const answers = []
  for (const name of ['player', 'zzzed']) {
    for (let i = 0; i < 11; i++) await login(s.base, name, 'wrong-password', { 'X-Forwarded-For': `203.0.113.${++ip}` })
    const r = (await login(s.base, name, 'wrong-password', { 'X-Forwarded-For': `203.0.113.${++ip}` })).r
    answers.push([r.status, await r.json(), r.headers.get('retry-after')])
  }
  expect(answers[0]).toEqual([429, { error: 'too many failed sign-ins for this account: try again in a little while' }, '1'])
  expect(answers[1]).toEqual(answers[0])
  s.srv.close()
})

test('the account-wait table only drops names whose wait is over; while all are waiting, new names aren’t counted', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin }, { trustProxy: '127.0.0.1', accountKeys: 3 })
  let ip = 0
  const fail11 = async (name: string) => {
    for (let i = 0; i < 11; i++) await login(s.base, name, 'wrong-password', { 'X-Forwarded-For': `192.0.2.${++ip % 250}` })
  }
  const next = async (name: string) => (await login(s.base, name, 'wrong-password', { 'X-Forwarded-For': `198.18.0.${++ip % 250}` })).r.status
  vi.useFakeTimers({ toFake: ['Date'] }) // time stands still: every wait stays active until it's moved on
  for (const n of ['aa', 'bb', 'cc']) await fail11(n)
  const warnings = () => logged.filter(l => l.includes('usernames are waiting out failures')).length
  const before = warnings()
  await fail11('dd') // the table is full of active waits: dd isn't counted, and nobody's wait was lifted
  expect([await next('aa'), await next('dd')]).toEqual([429, 401])
  expect(warnings()).toBe(before + 1) // logged once
  vi.setSystemTime(Date.now() + 2000) // the waits are over
  await fail11('ee') // makes room by dropping an expired name
  expect(await next('ee')).toBe(429)
  vi.useRealTimers()
  s.srv.close()
})

test('the address and network failure maps are bounded: past it the oldest entries go, even a live pause', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin }, { trustProxy: '127.0.0.1', failKeys: 4 })
  const from = (ip: string) => ({ 'X-Forwarded-For': ip })
  for (let i = 0; i < 5; i++) await login(s.base, 'xx', 'wrong-password', from('203.0.113.1'))
  expect((await login(s.base, 'xx', 'wrong-password', from('203.0.113.1'))).r.status).toBe(429) // paused 15 minutes
  // other addresses' failures fill the maps with live network windows: the oldest entry, that pause, makes room
  for (let i = 2; i < 6; i++) await login(s.base, 'yy', 'wrong-password', from(`203.0.113.${i}`))
  expect((await login(s.base, 'xx', 'wrong-password', from('203.0.113.1'))).r.status).toBe(401)
  s.srv.close()
})

test('device cookies belong to the account, not its name; changing a password honours them', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin, player: PW.player }, { trustProxy: '127.0.0.1' })
  let ip = 0
  const from = (extra: Record<string, string> = {}) => ({ 'X-Forwarded-For': `198.51.100.${++ip}`, ...extra })
  const lockOut = async (name: string) => {
    for (let i = 0; i < 11; i++) await login(s.base, name, 'wrong-password', from())
  }
  const p = await login(s.base, 'player', PW.player, from())
  await lockOut('player')
  const change = (extra: Record<string, string>) =>
    call(s.base, 'POST', '/api/auth/password', {
      ...json({ current: PW.player, password: 'player-password-4' }),
      headers: { 'Content-Type': 'application/json', ...extra },
    })
  expect((await change({ Cookie: p.cookie })).status).toBe(429)
  expect((await change({ Cookie: `${p.cookie}; ${p.device}` })).status).toBe(204)

  // the account goes; a new one with the same username doesn't take the old device
  const admin = (await login(s.base, 'admin', PW.admin, from())).cookie
  const users = await (await call(s.base, 'GET', '/api/users', { cookie: admin })).json()
  const pid = users.find((u: { username: string }) => u.username === 'player').id
  expect((await call(s.base, 'DELETE', `/api/users/${pid}`, { cookie: admin })).status).toBe(204)
  expect(
    (await call(s.base, 'POST', '/api/users', { cookie: admin, ...json({ username: 'player', name: 'New', role: 'player', password: 'new-player-pass-1' }) }))
      .status,
  ).toBe(201)
  await lockOut('player')
  expect((await login(s.base, 'player', 'new-player-pass-1', from({ Cookie: p.device }))).r.status).toBe(429)
  s.srv.close()
})

test('sign-in: guesses sent at once are counted before hashing, so no more than 5 get checked per username and address', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin, player: PW.player })
  const rs = await Promise.all(Array.from({ length: 12 }, () => login(s.base, 'player', 'wrong-password')))
  expect(rs.filter(x => x.r.status === 401).length).toBe(5)
  expect(rs.filter(x => x.r.status === 429).length).toBe(7)
  expect((await login(s.base, 'admin', PW.admin)).r.status).toBe(200) // a success takes its own count back
  expect((await login(s.base, 'admin', PW.admin)).r.status).toBe(200)
  s.srv.close()
})

test('change password: two at once from one session with the same current password: only one goes through', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { player: PW.player })
  const p = await login(s.base, 'player', PW.player)
  const change = (pw: string) => call(s.base, 'POST', '/api/auth/password', { cookie: p.cookie, ...json({ current: PW.player, password: pw }) })
  const rs = await Promise.all([change('player-password-7'), change('player-password-8')])
  expect(rs.filter(r => r.status === 204)).toHaveLength(1)
  s.srv.close()
})

test('password hashing: a few at a time, a short queue, the rest refused before hashing', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin }, { trustProxy: '127.0.0.1' })
  const rs = await Promise.all(Array.from({ length: 40 }, (_, i) => login(s.base, `nobody${i}`, 'wrong-password', { 'X-Forwarded-For': `198.51.100.${i}` })))
  const busy = rs.filter(x => x.r.status === 429)
  expect(rs.filter(x => x.r.status === 401).length).toBeGreaterThanOrEqual(12) // 4 hashing + 8 waiting
  expect(busy.length).toBeGreaterThan(0)
  expect([await busy[0].r.json(), busy[0].r.headers.get('retry-after')]).toEqual([{ error: 'the server is busy: try again in a moment' }, '1'])
  expect((await login(s.base, 'admin', PW.admin)).r.status).toBe(200) // and it recovers
  s.srv.close()
})

test('runners: a save waiting while its account is renamed lands in the new folder; a new account can’t take an old folder', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin, player: PW.player })
  const admin = (await login(s.base, 'admin', PW.admin)).cookie,
    player = (await login(s.base, 'player', PW.player)).cookie
  const id = (await (await call(s.base, 'GET', '/api/auth/me', { cookie: player })).json()).user.id
  const body = runner('late', 'Late')
  const saved = new Promise<number>((ok, no) => {
    const req = request(
      `${s.base}/api/characters/late`,
      { method: 'PUT', headers: { Origin: s.base, Cookie: player, 'Content-Length': Buffer.byteLength(body) } },
      res => {
        res.resume()
        ok(res.statusCode ?? 0)
      },
    )
    req.on('error', no)
    req.write(body.slice(0, 20))
    setTimeout(async () => {
      // the account is renamed while the body is still coming
      expect((await call(s.base, 'PUT', `/api/users/${id}`, { cookie: admin, ...json({ username: 'kim' }) })).status).toBe(200)
      req.end(body.slice(20))
    }, 200)
  })
  expect(await saved).toBe(201)
  expect(readdirSync(s.chars).sort()).toEqual(['kim'])
  expect(readdirSync(join(s.chars, 'kim'))).toEqual(['Late.xml'])
  mkdirSync(join(s.chars, 'leftover'))
  const add = await call(s.base, 'POST', '/api/users', {
    cookie: admin,
    ...json({ username: 'leftover', name: 'L', role: 'player', password: 'long-enough-1' }),
  })
  expect([add.status, (await add.json()).error]).toEqual([409, 'characters/leftover already exists; move it away first'])
  s.srv.close()
})

test('rename: when users.xml can’t be saved the runner folder moves back and the account keeps its name', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin, player: PW.player })
  const admin = (await login(s.base, 'admin', PW.admin)).cookie,
    player = (await login(s.base, 'player', PW.player)).cookie
  expect((await call(s.base, 'PUT', '/api/characters/p1', { cookie: player, body: runner('p1', 'Pats Runner') })).status).toBe(201)
  const id = (await (await call(s.base, 'GET', '/api/auth/me', { cookie: player })).json()).user.id
  const users = join(s.lib, '.config', 'users.xml'),
    saved = readFileSync(users, 'utf8')
  rmSync(users)
  mkdirSync(users) // the atomic write's rename onto users.xml fails
  expect((await call(s.base, 'PUT', `/api/users/${id}`, { cookie: admin, ...json({ username: 'kim' }) })).status).toBe(500)
  expect(readdirSync(s.chars)).toEqual(['player'])
  expect(readdirSync(join(s.chars, 'player'))).toEqual(['Pats-Runner.xml'])
  const list = await (await call(s.base, 'GET', '/api/users', { cookie: admin })).json()
  expect(list.find((u: { id: string }) => u.id === id).username).toBe('player')
  rmSync(users, { recursive: true })
  writeFileSync(users, saved)
  expect((await call(s.base, 'PUT', `/api/users/${id}`, { cookie: admin, ...json({ username: 'kim' }) })).status).toBe(200)
  expect(readdirSync(s.chars)).toEqual(['kim'])
  s.srv.close()
})

test('rename: when the folder can’t move back either, the users.xml error is the one reported and the failed move is logged', async () => {
  const lib = join(mkdtempSync(join(tmpdir(), 'ca2-auth-')), 'library'),
    users = join(lib, '.config', 'users.xml')
  mkdirSync(join(lib, '.config'), { recursive: true })
  writeFileSync(
    users,
    await usersFile([
      { username: 'admin', role: 'admin', password: PW.admin },
      { username: 'player', role: 'player', password: PW.player },
    ]),
  )
  const moves: string[] = [],
    errors: string[] = []
  const runners = {
    count: async () => 0,
    free: async () => {},
    retire: async () => {},
    async rename(from: string, to: string) {
      moves.push(`${from}>${to}`)
      if (moves.length > 1) throw new Error('the disk said no')
    },
  }
  const auth = authApi({
    libraryDir: lib,
    lock: (fn: () => unknown) => fn(),
    track: (fn: () => unknown) => fn(),
    runners,
    log: { log: () => {}, error: (m: string) => errors.push(m), warn: () => {} },
  })
  const target = readFileSync(users, 'utf8').match(/<user id="([0-9a-f]+)" username="player"/)![1]
  rmSync(users)
  mkdirSync(users) // saving users.xml fails
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ username: 'kim' }))]), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
  })
  const who = { id: 'x', username: 'admin', role: 'admin' }
  const err = await auth.handle(req, {}, new URL(`http://x/api/users/${target}`), () => {}, who).catch((e: Error) => e)
  expect(moves).toEqual(['player>kim', 'kim>player'])
  expect(err).toBeInstanceOf(Error)
  expect(err.message).not.toContain('the disk said no') // the save's error, not the move back's
  expect(errors).toEqual([expect.stringContaining('move characters/kim to characters/player (the disk said no)')])
  expect(auth.usernames()).toContain('player')
  auth.stop()
})

test('sessions: at most 20 per account (the oldest goes); files with secrets are private (0600)', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin })
  const cookies: string[] = []
  for (let i = 0; i < 21; i++) cookies.push((await login(s.base, 'admin', PW.admin)).cookie)
  expect((await call(s.base, 'GET', '/api/users', { cookie: cookies[0] })).status).toBe(401)
  expect((await call(s.base, 'GET', '/api/users', { cookie: cookies[1] })).status).toBe(200)
  expect((await call(s.base, 'GET', '/api/users', { cookie: cookies[20] })).status).toBe(200)
  await issueReset(s.lib, 'admin')
  if (process.platform !== 'win32')
    for (const f of ['users.xml', 'sessions.xml', 'reset.xml', 'device-key.xml']) expect(statSync(join(s.lib, '.config', f)).mode & 0o777, f).toBe(0o600)
  s.srv.close()
})

test('recovery: a code used twice at once works once; a file claiming a longer life is refused', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin, player: PW.player })
  const code = await issueReset(s.lib, 'player')
  secrets.add(code)
  const reset = () => call(s.base, 'POST', '/api/setup/reset', json({ username: 'player', code, password: 'player-password-7' }))
  expect((await Promise.all([reset(), reset()])).map(r => r.status).sort()).toEqual([204, 403])
  const late = await issueReset(s.lib, 'player')
  secrets.add(late)
  const file = join(s.lib, '.config', 'reset.xml')
  writeFileSync(file, readFileSync(file, 'utf8').replace(/expires="[^"]+"/, `expires="${new Date(Date.now() + 3600e3).toISOString()}"`))
  expect((await call(s.base, 'POST', '/api/setup/reset', json({ username: 'player', code: late, password: 'player-password-8' }))).status).toBe(403)
  s.srv.close()
})

test('a slow sign-in body is cut off after 10 s; every response carries the security headers', async () => {
  const s = await start(mkdtempSync(join(tmpdir(), 'ca2-auth-')), { admin: PW.admin })
  const t0 = Date.now()
  const closed = await new Promise<string>(ok => {
    const req = request(
      `${s.base}/api/auth/login`,
      { method: 'POST', headers: { Origin: s.base, 'Content-Type': 'application/json', 'Content-Length': 100 } },
      res => {
        res.resume()
        res.on('end', () => ok(`status ${res.statusCode}`))
      },
    )
    req.on('error', () => ok('closed'))
    req.write('{"username"')
  })
  expect(closed).toBe('closed')
  expect(Date.now() - t0).toBeGreaterThanOrEqual(9500)
  for (const path of ['/', '/api/health', '/api/characters', '/data/sources.xml']) {
    const h = (await fetch(`${s.base}${path}`)).headers
    expect([h.get('x-content-type-options'), h.get('referrer-policy'), h.get('x-frame-options')], path).toEqual(['nosniff', 'same-origin', 'DENY'])
    expect(h.get('content-security-policy'), path).toContain("frame-ancestors 'none'")
  }
  s.srv.close()
})

test('no password, code or session token ever reaches the log', () => {
  expect(logged.some(l => l.startsWith('signed in: admin from 127.0.0.1'))).toBe(true)
  expect(logged.some(l => l.startsWith('sign-in failed: "admin" from 203.0.113.5'))).toBe(true)
  for (const secret of secrets) for (const l of logged) if (!/Setup code for the first admin/.test(l)) expect(l).not.toContain(secret)
})
