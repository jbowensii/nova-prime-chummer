// Sign in with Authelia (server/oidc.mjs) against a made-up issuer on 127.0.0.1 (tests/fixtures/fake-issuer.mjs): the admin's
// settings, the whole code + PKCE flow, and every ID token, state and account the server must refuse.
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { validateXML } from 'xmllint-wasm'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { parseUsers, usersFile } from '../../server/auth.mjs'
// @ts-expect-error plain JS module
import { checkUrl, insecureAllowed } from '../../server/oidc.mjs'
// @ts-expect-error plain JS module
import { fakeIssuer } from '../fixtures/fake-issuer.mjs'

vi.setConfig({ testTimeout: 30000 })
const logged: string[] = []
for (const m of ['log', 'error', 'warn'] as const)
  vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(' ')) })

type Fake = Awaited<ReturnType<typeof fakeIssuer>> & Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Srv = { close: () => void; stopJobs: () => void; listen: (p: number, h: string, cb: () => void) => void; address: () => { port: number } }
const ADMIN_PW = 'admin-password-1'
const ACCOUNTS = [
  { username: 'admin', password: ADMIN_PW },
  { username: 'kim', method: 'authelia', role: 'player', name: 'Kim' },
  { username: 'eve', method: 'authelia', role: 'player', email: 'eve@example.test' },
  { username: 'pat', password: 'pat-password-1', role: 'player', email: 'pat@example.test' },
  { username: 'dis', method: 'authelia', role: 'player', enabled: false },
  { username: 'kai', method: 'authelia', role: 'admin', email: 'kai@example.test' }, // never linked: M1's target
]

async function boot(opts: Record<string, unknown> = {}, server: Record<string, unknown> = {}) {
  const f: Fake = await fakeIssuer()
  const dir = mkdtempSync(join(tmpdir(), 'ca2-oidc-')), lib = join(dir, 'library')
  mkdirSync(join(lib, '.config'), { recursive: true })
  writeFileSync(join(lib, '.config', 'users.xml'), await usersFile(ACCOUNTS))
  const srv: Srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom'), libraryDir: lib,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'], oidc: { timeout: 500, jwksGap: 300, ...opts }, ...server })
  await new Promise<void>(ok => srv.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${srv.address().port}`, origin = (server.publicUrl as string) ?? base
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ username: 'admin', password: ADMIN_PW }),
    headers: { 'Content-Type': 'application/json', Origin: origin } })
  const admin = r.headers.getSetCookie().find(c => /session=/.test(c))!.split(';')[0]
  const put = (body: unknown, cookie = admin) => fetch(`${base}/api/auth-settings`, { method: 'PUT', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie } })
  const post = (path: string, body?: unknown) => fetch(`${base}${path}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: admin } })
  const account = (username: string) => parseUsers(readFileSync(join(lib, '.config', 'users.xml'), 'utf8'))
    .find((u: { username: string }) => u.username === username)
  return { f, srv, base, lib, admin, put, post, account, close: () => { srv.close(); f.close() } }
}
type Boot = Awaited<ReturnType<typeof boot>>
const on = (s: Boot) => s.put({ issuer: s.f.base, clientId: s.f.clientId, secret: s.f.secret, enabled: true })

/** The browser's round trip: start -> the issuer -> the callback. -> where the callback sends it, its cookies, the callback URL. */
async function flow(s: Boot, { keepCookie = true } = {}) {
  const start = await fetch(`${s.base}/api/auth/oidc/start`, { redirect: 'manual' })
  const to = start.headers.get('location') ?? ''
  if (!to.startsWith(s.f.base)) return { location: to, cookies: [] as string[], callback: '', bind: '' }
  const bind = start.headers.getSetCookie().find(c => c.startsWith('ca2_oidc='))!.split(';')[0]
  const back = (await fetch(to, { redirect: 'manual' })).headers.get('location') ?? ''
  const cb = await fetch(back, { redirect: 'manual', headers: keepCookie ? { Cookie: bind } : {} })
  return { location: cb.headers.get('location'), cookies: cb.headers.getSetCookie(), callback: back, bind }
}
const session = (cookies: string[]) => cookies.find(c => /^ca2_session=/.test(c))?.split(';')[0] ?? ''
const me = async (s: Boot, cookie: string) => (await (await fetch(`${s.base}/api/auth/me`, { headers: { Cookie: cookie } })).json())

describe('with a fake issuer', () => {
  let s: Boot
  beforeAll(async () => { s = await boot() })
  afterAll(() => s.close())

  test('settings: admin only, the secret never comes back, auth.xml valid, a new issuer drops the secret', async () => {
    const get = async () => (await fetch(`${s.base}/api/auth-settings`, { headers: { Cookie: s.admin } })).json()
    expect(await get()).toEqual({ issuer: '', clientId: '', tokenAuth: 'client_secret_basic', enabled: false, secretSet: false,
      redirectUri: `${s.base}/api/auth/oidc/callback` })
    expect((await s.put({ issuer: s.f.base, clientId: 'chummer', enabled: true })).status).toBe(400) // no secret yet
    expect((await s.put({ issuer: 'http://auth.example.com' })).status).toBe(400) // not https
    expect((await s.put({ clientId: 'has space' })).status).toBe(400)
    const r = await on(s)
    expect(r.status).toBe(200)
    const text = await r.text()
    expect(text).not.toContain(s.f.secret)
    expect(JSON.parse(text)).toMatchObject({ issuer: s.f.base, clientId: 'chummer', enabled: true, secretSet: true })
    expect(JSON.stringify(await get())).not.toContain(s.f.secret)
    expect((await me(s, '')).oidc).toBe(true)
    const cfg = join(s.lib, '.config')
    for (const [file, root] of [['auth.xml', 'auth'], ['auth-secret.xml', 'authsecret']]) {
      const v = await validateXML({ xml: { fileName: file, contents: readFileSync(join(cfg, file), 'utf8') },
        schema: { fileName: 'auth.xsd', contents: readFileSync('public/data/schema/auth.xsd', 'utf8') } })
      expect(v.errors, file).toEqual([])
      expect(readFileSync(join(cfg, file), 'utf8')).toContain(`<ca2:${root} `)
    }
    expect(readFileSync(join(cfg, 'auth.xml'), 'utf8')).not.toContain(s.f.secret)
    if (process.platform !== 'win32') expect(statSync(join(cfg, 'auth-secret.xml')).mode & 0o777).toBe(0o600)

    // the Test button: fetches discovery and says plainly what it found
    const t = async (issuer: string) => (await fetch(`${s.base}/api/auth-settings/test`, { method: 'POST', body: JSON.stringify({ issuer }),
      headers: { 'Content-Type': 'application/json', Origin: s.base, Cookie: s.admin } })).json()
    expect(await t(s.f.base)).toEqual({ ok: true, message: 'found the issuer: it signs ID tokens with RS256 or ES256' })
    expect(await t(`${s.f.base}/`)).toEqual({ ok: false, message: `the issuer calls itself ${s.f.base}: enter exactly that address` })
    expect((await t('http://auth.example.com')).message).toBe('the issuer address must start with https://')
    expect((await t('http://127.0.0.1:1')).message).toMatch(/^couldn’t reach the issuer/)

    // another issuer: the stored secret goes (it is never sent to another issuer), so sign-in with Authelia is off
    const moved = await (await s.put({ issuer: `${s.f.base}/other` })).json()
    expect(moved).toMatchObject({ secretSet: false, enabled: false })
    expect((await me(s, '')).oidc).toBe(false)
    await on(s)
  })

  test('signed in (RS256), like a password sign-in: session, device cookie, last sign-in, a log line', async () => {
    const r = await flow(s)
    expect(r.location).toBe('/')
    expect(r.cookies.some(c => /^ca2_device=/.test(c))).toBe(true)
    expect(r.cookies.some(c => /^ca2_oidc=;.*Max-Age=0/.test(c))).toBe(true)
    const who = await me(s, session(r.cookies))
    expect(who.user).toMatchObject({ username: 'kim', method: 'authelia' })
    expect(who.user.lastLogin).toBeTruthy()
    expect(logged.some(l => /signed in with Authelia: kim from 127\.0\.0\.1/.test(l))).toBe(true)
    // the redirect URI went to the issuer as the public origin's callback
    expect(r.callback.startsWith(`${s.base}/api/auth/oidc/callback?`)).toBe(true)
  })

  test('ES256, client_secret_post, claims only at the userinfo endpoint, and a match by email', async () => {
    Object.assign(s.f, { alg: 'ES256', kid: 'ec1' })
    expect((await flow(s)).location).toBe('/')
    Object.assign(s.f, { alg: 'RS256', kid: 'rsa1', tokenAuth: 'client_secret_post' })
    expect((await flow(s)).location).toBe('/?signin=failed') // the server still sends basic
    await s.put({ tokenAuth: 'client_secret_post' })
    expect((await flow(s)).location).toBe('/')
    s.f.tokenAuth = 'client_secret_basic'
    await s.put({ tokenAuth: 'client_secret_basic' })
    s.f.userinfoOnly = true
    const r = await flow(s)
    expect(r.location).toBe('/')
    expect((await me(s, session(r.cookies))).user.username).toBe('kim')
    // email only when there is no username, and only verified (M2)
    s.f.user = { sub: 'u-eve', preferred_username: 'eve-at-sso', email: 'EVE@example.test', email_verified: true }
    expect((await flow(s)).location).toBe('/?signin=no-account') // a username that names no account: no email fallback
    s.f.user = { sub: 'u-eve', email: 'EVE@example.test' }
    expect((await flow(s)).location).toBe('/?signin=no-account') // email_verified missing
    s.f.user = { sub: 'u-eve', email: 'EVE@example.test', email_verified: false }
    expect((await flow(s)).location).toBe('/?signin=no-account')
    s.f.user = { sub: 'u-eve', email: 'EVE@example.test', email_verified: true }
    expect((await me(s, session((await flow(s)).cookies))).user.username).toBe('eve')
    expect(s.account('eve')).toMatchObject({ oidcIss: s.f.base, oidcSub: 'u-eve' })
    s.f.userinfoOnly = false
    s.f.user = { sub: 'u-kim', preferred_username: 'kim', email: 'kim@example.test', email_verified: true }
  })

  test.each([
    ['a bad signature', { corrupt: true }],
    ['alg none', { alg: 'none' }],
    ['HS256 (keyed by the client secret)', { alg: 'HS256' }],
    ['an RS256 header on the EC key', { alg: 'RS256', kid: 'ec1' }],
    ['another audience', { claims: { aud: 'someone-else' } }],
    ['several audiences without azp', { claims: { aud: ['chummer', 'other'] } }],
    ['another issuer', { claims: { iss: 'https://evil.example' } }],
    ['expired past the leeway', { claims: { exp: Math.floor(Date.now() / 1000) - 120 } }],
    ['not valid yet (nbf)', { claims: { nbf: Math.floor(Date.now() / 1000) + 600 } }],
    ['issued in the future', { claims: { iat: Math.floor(Date.now() / 1000) + 600 } }],
    ['the wrong nonce', { claims: { nonce: 'not-the-one' } }],
    ['no subject', { claims: { sub: undefined } }],
  ])('refused: %s', async (_, bend) => {
    Object.assign(s.f, bend)
    try {
      const r = await flow(s)
      expect(r.location).toBe('/?signin=failed')
      expect(session(r.cookies)).toBe('')
    } finally { Object.assign(s.f, { corrupt: false, alg: 'RS256', kid: 'rsa1', claims: {} }) }
  })

  test('audiences: an array with our client and azp is taken; an expired token inside the leeway is too', async () => {
    s.f.claims = { aud: ['chummer', 'other'], azp: 'chummer', exp: Math.floor(Date.now() / 1000) - 30 }
    try { expect((await flow(s)).location).toBe('/') } finally { s.f.claims = {} }
  })

  test('an unknown kid: refused within the refetch gap, then the rotated key set is fetched once', async () => {
    s.f.addKey('rsa2', 'RS256')
    s.f.kid = 'rsa2'
    try {
      await new Promise(ok => setTimeout(ok, 350))
      expect((await flow(s)).location).toBe('/?signin=failed') // rsa2 isn't published: refetched, still unknown
      s.f.published = ['rsa1', 'ec1', 'rsa2'] // the issuer rotates
      expect((await flow(s)).location).toBe('/?signin=failed') // within the gap: no refetch
      await new Promise(ok => setTimeout(ok, 350))
      expect((await flow(s)).location).toBe('/')
    } finally { s.f.kid = 'rsa1' }
  })

  test('state: unknown, reused, from another browser, expired; the issuer saying no', async () => {
    const r = await flow(s)
    expect(r.location).toBe('/')
    const replay = await fetch(r.callback, { redirect: 'manual', headers: { Cookie: r.bind } })
    expect(replay.headers.get('location')).toBe('/?signin=expired')
    const unknown = await fetch(`${s.base}/api/auth/oidc/callback?code=x&state=nope`, { redirect: 'manual' })
    expect(unknown.headers.get('location')).toBe('/?signin=expired')
    expect((await flow(s, { keepCookie: false })).location).toBe('/?signin=expired')

    const start = await fetch(`${s.base}/api/auth/oidc/start`, { redirect: 'manual' })
    const bind = start.headers.getSetCookie().find(c => c.startsWith('ca2_oidc='))!.split(';')[0]
    const back = (await fetch(start.headers.get('location')!, { redirect: 'manual' })).headers.get('location')!
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 11 * 60e3 })
    try {
      expect((await fetch(back, { redirect: 'manual', headers: { Cookie: bind } })).headers.get('location')).toBe('/?signin=expired')
    } finally { vi.useRealTimers() }

    s.f.deny = true
    try { expect((await flow(s)).location).toBe('/?signin=denied') } finally { s.f.deny = false }
  })

  test.each([
    ['an unknown user', { sub: 'x', preferred_username: 'nobody', email: 'nobody@example.test' }],
    ['a password account (by username)', { sub: 'x', preferred_username: 'pat', email: 'pat@example.test' }],
    ['a password account (by email)', { sub: 'x', preferred_username: 'pat-sso', email: 'pat@example.test' }],
    ['a disabled account', { sub: 'x', preferred_username: 'dis' }],
  ])('%s: "ask the admin for an account", nothing more', async (_, user) => {
    const keep = s.f.user
    s.f.user = user
    try {
      const r = await flow(s)
      expect(r.location).toBe('/?signin=no-account')
      expect(session(r.cookies)).toBe('')
    } finally { s.f.user = keep }
  })

  test('M1: only ASCII names match (no Unicode case folding onto an account)', async () => {
    const keep = s.f.user
    try {
      for (const user of [{ sub: 'u-attacker', preferred_username: 'Kai' }, // KELVIN SIGN: 'Kai'.toLowerCase() === 'kai'
        { sub: 'u-attacker', email: 'Kai@example.test', email_verified: true },
        { sub: 'u-attacker', preferred_username: 'Ｋａｉ' }]) { // full-width Kai
        s.f.user = user
        const r = await flow(s)
        expect(r.location, JSON.stringify(user)).toBe('/?signin=no-account')
        expect(session(r.cookies)).toBe('')
      }
    } finally { s.f.user = keep }
    expect(s.account('kai').oidcSub).toBe('')
  })

  test('N3: a sub that isn’t printable ASCII (or too long) is never stored; the sign-in is refused', async () => {
    const keep = s.f.user
    try {
      for (const sub of ['bad\u0001sub', 'with space', 'x'.repeat(256), 'caf\u00e9']) {
        s.f.user = { sub, preferred_username: 'kai' }
        const r = await flow(s)
        expect(r.location, JSON.stringify(sub)).toBe('/?signin=no-account')
        expect(session(r.cookies)).toBe('')
        expect(s.account('kai').oidcSub).toBe('')
      }
    } finally { s.f.user = keep }
  })

  test('M2: an account is linked to its Authelia subject; another subject with its name or email is refused', async () => {
    const keep = s.f.user
    try {
      expect(s.account('kim')).toMatchObject({ oidcIss: s.f.base, oidcSub: 'u-kim' }) // linked at its first sign-in
      const v = await validateXML({ xml: { fileName: 'users.xml', contents: readFileSync(join(s.lib, '.config', 'users.xml'), 'utf8') },
        schema: { fileName: 'users.xsd', contents: readFileSync('public/data/schema/users.xsd', 'utf8') } })
      expect(v.errors).toEqual([])
      const users = await (await fetch(`${s.base}/api/users`, { headers: { Cookie: s.admin } })).json()
      const kim = users.find((u: { username: string }) => u.username === 'kim')
      expect(kim).toMatchObject({ linked: true })
      expect(JSON.stringify(users)).not.toContain('u-kim') // the subject stays on the server
      // someone else in the directory now called kim (the old one renamed, or deleted and made again)
      s.f.user = { sub: 'u-other', preferred_username: 'kim', email: 'kim@example.test', email_verified: true }
      expect((await flow(s)).location).toBe('/?signin=no-account')
      s.f.user = { sub: 'u-other', email: 'eve@example.test', email_verified: true }
      expect((await flow(s)).location).toBe('/?signin=no-account')
      // the linked subject renamed in Authelia: still kim
      s.f.user = { sub: 'u-kim', preferred_username: 'kimberly' }
      expect((await me(s, session((await flow(s)).cookies))).user.username).toBe('kim')
      // Unlink (admin): the next sign-in by username links afresh
      expect((await s.post(`/api/users/${kim.id}/unlink`)).status).toBe(200)
      expect(s.account('kim').oidcSub).toBe('')
      s.f.user = { sub: 'u-kim', preferred_username: 'kim' }
      expect((await flow(s)).location).toBe('/')
      expect(s.account('kim').oidcSub).toBe('u-kim')
      // a new email for the account drops the link too
      await fetch(`${s.base}/api/users/${kim.id}`, { method: 'PUT', body: JSON.stringify({ email: 'kim2@example.test' }),
        headers: { 'Content-Type': 'application/json', Origin: s.base, Cookie: s.admin } })
      expect(s.account('kim').oidcSub).toBe('')
      expect((await flow(s)).location).toBe('/')
      // a new issuer unlinks every account
      await s.put({ issuer: `${s.f.base}/elsewhere` })
      expect([s.account('kim').oidcSub, s.account('eve').oidcSub]).toEqual(['', ''])
      await on(s)
      expect((await flow(s)).location).toBe('/')
    } finally { s.f.user = keep }
  })

  test('M3: nothing is kept per start: a flood of starts doesn’t push out a pending sign-in; a forged cookie is refused', async () => {
    const start = await fetch(`${s.base}/api/auth/oidc/start`, { redirect: 'manual' })
    const bind = start.headers.getSetCookie().find(c => c.startsWith('ca2_oidc='))!.split(';')[0]
    const back = (await fetch(start.headers.get('location')!, { redirect: 'manual' })).headers.get('location')!
    for (let i = 0; i < 1100; i += 50)
      await Promise.all(Array.from({ length: 50 }, () => fetch(`${s.base}/api/auth/oidc/start`, { redirect: 'manual' }).then(r => r.arrayBuffer())))
    const at = bind.length - 10, flipped = bind.slice(0, at) + (bind[at] === 'A' ? 'B' : 'A') + bind.slice(at + 1) // a whole 6 bits (a last char may only carry padding)
    expect((await fetch(back, { redirect: 'manual', headers: { Cookie: flipped } })).headers.get('location')).toBe('/?signin=expired')
    expect((await fetch(back, { redirect: 'manual', headers: { Cookie: bind } })).headers.get('location')).toBe('/')
    // the cookie holds everything, sealed: no state or nonce in the clear
    const url = new URL(start.headers.get('location')!)
    expect(bind).not.toContain(url.searchParams.get('state'))
    expect(bind).not.toContain(url.searchParams.get('nonce'))
    const key = join(s.lib, '.config', 'oidc-key.xml')
    const v = await validateXML({ xml: { fileName: 'oidc-key.xml', contents: readFileSync(key, 'utf8') },
      schema: { fileName: 'auth.xsd', contents: readFileSync('public/data/schema/auth.xsd', 'utf8') } })
    expect(v.errors).toEqual([])
    if (process.platform !== 'win32') expect(statSync(key).mode & 0o777).toBe(0o600)
  })

  test('a password account can’t sign in via Authelia, and an Authelia account can’t sign in with a password', async () => {
    const r = await fetch(`${s.base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ username: 'kim', password: 'anything-at-all' }),
      headers: { 'Content-Type': 'application/json', Origin: s.base } })
    expect(r.status).toBe(401)
  })

  test('slow and oversized answers are cut off', async () => {
    s.f.delay['/token'] = 1500
    try { expect((await flow(s)).location).toBe('/?signin=failed') } finally { delete s.f.delay['/token'] }
    expect(logged.some(l => /the token endpoint didn’t answer within 0.5 seconds/.test(l))).toBe(true)
    s.f.huge['/token'] = true
    try { expect((await flow(s)).location).toBe('/?signin=failed') } finally { delete s.f.huge['/token'] }
    expect(logged.some(l => /the token endpoint’s answer is too large/.test(l))).toBe(true)
    // a key set too large, fetched again for an unknown kid
    s.f.huge['/jwks'] = true
    s.f.addKey('hidden', 'RS256')
    s.f.kid = 'hidden'
    await new Promise(ok => setTimeout(ok, 350))
    try { expect((await flow(s)).location).toBe('/?signin=failed') } finally { delete s.f.huge['/jwks']; s.f.kid = 'rsa1' }
    expect(logged.some(l => /the issuer’s key set’s answer is too large/.test(l))).toBe(true)
  })

  test('no token, code or secret in any log line', () => {
    const all = logged.join('\n')
    for (const t of [...s.f.issued, s.f.secret]) expect(all).not.toContain(t)
  })
})

test('discovery: an issuer naming itself differently, endpoints elsewhere, too slow', async () => {
  const s = await boot({ failTtl: 0 })
  try {
    await on(s)
    s.f.discovery = { issuer: 'https://evil.example' }
    expect((await flow(s)).location).toBe('/?signin=failed')
    expect(logged.some(l => /the issuer calls itself https:\/\/evil\.example/.test(l))).toBe(true)
    for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'userinfo_endpoint']) {
      s.f.discovery = { [k]: 'http://localhost:1/x' } // another origin than the issuer's
      expect((await flow(s)).location, k).toBe('/?signin=failed')
      expect(logged.some(l => l.includes(`the issuer’s ${k} is on another host`)), k).toBe(true)
    }
    s.f.discovery = {}
    s.f.delay['/.well-known/openid-configuration'] = 1500
    expect((await flow(s)).location).toBe('/?signin=failed')
    delete s.f.delay['/.well-known/openid-configuration']
    expect((await flow(s)).location).toBe('/')
    // turned off: the start refuses plainly
    await s.put({ enabled: false })
    expect((await flow(s)).location).toBe('/?signin=off')
  } finally { s.close() }
})

test('a failed discovery is remembered: an issuer that is down isn’t asked on every start', async () => {
  const s = await boot()
  try {
    await on(s)
    s.f.discovery = { issuer: 'https://evil.example' }
    const before = s.f.hits['/.well-known/openid-configuration'] ?? 0
    for (let i = 0; i < 5; i++) expect((await flow(s)).location).toBe('/?signin=failed')
    expect(s.f.hits['/.well-known/openid-configuration'] - before).toBe(1)
  } finally { s.close() }
})

test('PUBLIC_URL: the redirect URI and the Origin check use it, not the Host header', async () => {
  const pub = 'https://chummer.example.com'
  const s = await boot({}, { publicUrl: pub })
  try {
    expect((await on(s)).status).toBe(200) // the admin's requests came with Origin: PUBLIC_URL
    const start = await fetch(`${s.base}/api/auth/oidc/start`, { redirect: 'manual', headers: { Host: 'evil.example' } })
    expect(new URL(start.headers.get('location')!).searchParams.get('redirect_uri')).toBe(`${pub}/api/auth/oidc/callback`)
    expect(start.headers.getSetCookie()[0]).toMatch(/^__Host-ca2_oidc=.*; Secure$/)
    const r = await fetch(`${s.base}/api/auth/login`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Origin: s.base } })
    expect(r.status).toBe(403) // the Host's own origin isn't the public one
    const got = await (await fetch(`${s.base}/api/auth-settings`, { headers: { Cookie: s.admin } })).json()
    expect(got.redirectUri).toBe(`${pub}/api/auth/oidc/callback`)
  } finally { s.close() }
  expect(() => createServer({ staticDir: 'public', charDir: tmpdir(), customDir: tmpdir(), libraryDir: mkdtempSync(join(tmpdir(), 'ca2-pub-')),
    publicUrl: 'https://x.example/app' })).toThrow(/PUBLIC_URL/)
})

test('plain http only to this machine, and only in tests or with ALLOW_INSECURE_OIDC', () => {
  expect(() => checkUrl('http://127.0.0.1:9000', 'x', false)).toThrow(/https/)
  expect(checkUrl('http://127.0.0.1:9000', 'x', true).origin).toBe('http://127.0.0.1:9000')
  expect(() => checkUrl('http://auth.localhost', 'x', true)).toThrow(/https/)
  expect(() => checkUrl('http://auth.example.com', 'x', true)).toThrow(/https/)
  const env = { NODE_ENV: process.env.NODE_ENV, ALLOW: process.env.ALLOW_INSECURE_OIDC }
  try {
    process.env.NODE_ENV = 'production'; delete process.env.ALLOW_INSECURE_OIDC
    expect(insecureAllowed()).toBe(false)
    process.env.ALLOW_INSECURE_OIDC = '1'
    expect(insecureAllowed()).toBe(true)
  } finally {
    process.env.NODE_ENV = env.NODE_ENV
    if (env.ALLOW === undefined) delete process.env.ALLOW_INSECURE_OIDC; else process.env.ALLOW_INSECURE_OIDC = env.ALLOW
  }
})
