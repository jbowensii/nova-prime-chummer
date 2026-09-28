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
import { usersFile } from '../../server/auth.mjs'
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
]

async function boot(opts: Record<string, unknown> = {}) {
  const f: Fake = await fakeIssuer()
  const dir = mkdtempSync(join(tmpdir(), 'ca2-oidc-')), lib = join(dir, 'library')
  mkdirSync(join(lib, '.config'), { recursive: true })
  writeFileSync(join(lib, '.config', 'users.xml'), await usersFile(ACCOUNTS))
  const srv: Srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom'), libraryDir: lib,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'], oidc: { timeout: 500, jwksGap: 300, ...opts } })
  await new Promise<void>(ok => srv.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${srv.address().port}`
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ username: 'admin', password: ADMIN_PW }),
    headers: { 'Content-Type': 'application/json', Origin: base } })
  const admin = r.headers.getSetCookie().find(c => /session=/.test(c))!.split(';')[0]
  const put = (body: unknown, cookie = admin) => fetch(`${base}/api/auth-settings`, { method: 'PUT', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie } })
  return { f, srv, base, lib, admin, put, close: () => { srv.close(); f.close() } }
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
    s.f.user = { sub: 'u-eve', preferred_username: 'eve-at-sso', email: 'EVE@example.test', email_verified: true }
    expect((await me(s, session((await flow(s)).cookies))).user.username).toBe('eve')
    s.f.user = { ...s.f.user, email_verified: false }
    expect((await flow(s)).location).toBe('/?signin=no-account')
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

test('discovery: an issuer naming itself differently, or too slow, can’t start a sign-in', async () => {
  const s = await boot()
  try {
    await on(s)
    s.f.discovery = { issuer: 'https://evil.example' }
    expect((await flow(s)).location).toBe('/?signin=failed')
    expect(logged.some(l => /the issuer calls itself https:\/\/evil\.example/.test(l))).toBe(true)
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
