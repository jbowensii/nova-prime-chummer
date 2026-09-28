// Sign in with Authelia (OpenID Connect): authorization code + PKCE (S256), the ID token verified here with node:crypto.
// See docs/superpowers/specs/2026-09-28-accounts-design.md §3. No dependencies: node:crypto and the built-in fetch.
//
//   GET  /api/auth/oidc/start       public: -> 302 to the issuer (state, nonce, PKCE kept here for 10 minutes, single use;
//                                   a short cookie ties them to this browser)
//   GET  /api/auth/oidc/callback    public: code + state -> the ID token checked, the account matched -> 302 to / with a
//                                   session, or to /?signin=<no-account|expired|denied|failed|off> (no details in the URL)
//   GET  /api/auth-settings         admin: -> { issuer, clientId, tokenAuth, enabled, secretSet, redirectUri } (never the secret)
//   PUT  /api/auth-settings         admin: any of { issuer, clientId, tokenAuth, enabled, secret } -> the same; a new issuer
//                                   drops the stored secret unless a new one comes with it
//   POST /api/auth-settings/test    admin: { issuer } -> { ok, message }: fetches the discovery document
// library/.config/auth.xml: issuer, client id, enabled (auth.xsd); auth-secret.xml (0600): the client secret and the issuer it
// belongs to (a secret never goes to another issuer). Tokens are never logged or put in a URL.
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { chmod, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { attr, esc, rootTag, writeAtomic } from './books.mjs'

const NS = 'urn:chummer-anarchy2:config:1'
const MINUTE = 60e3
const STATE_TTL = 10 * MINUTE, MAX_STATES = 1000
const LEEWAY = 60 // seconds, for exp / iat / nbf
const DISCOVERY_TTL = 60 * MINUTE, JWKS_TTL = 60 * MINUTE
const SCOPE = 'openid profile email'
const TOKEN_AUTH = ['client_secret_basic', 'client_secret_post']
// the only ID token algorithms taken; `none` and the HMAC ones (keyed by the client secret) never are
const ALGS = { RS256: { kty: 'RSA' }, ES256: { kty: 'EC', crv: 'P-256', dsaEncoding: 'ieee-p1363' } }
const SECRET_MODE = 0o600
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n'
// eslint-disable-next-line no-control-regex
const oneLine = s => String(s ?? '').replace(/[\x00-\x1f\x7f]/g, '').trim()
const sha256 = s => createHash('sha256').update(s).digest()
const rand = () => randomBytes(32).toString('base64url')
const fail = (code, message) => Object.assign(new Error(message), { code })
/** A refused sign-in: `key` goes to the sign-in page (?signin=key), `message` only to the log. */
const refuse = (key, message) => Object.assign(new Error(message), { key })

const LOCAL = ['localhost', '127.0.0.1', '[::1]']
/** https, or http to this machine (tests); no user:password@, no fragment. */
export function checkUrl(u, what = 'the address') {
  let url
  try { url = new URL(u) } catch { throw refuse('failed', `${what} isn’t a web address`) }
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && (LOCAL.includes(url.hostname) || url.hostname.endsWith('.localhost')))))
    throw refuse('failed', `${what} must start with https://`)
  if (url.username || url.password || url.hash) throw refuse('failed', `${what} can’t hold a user name, password or #fragment`)
  return url
}

/** JSON from `url`: `timeout` ms for the whole answer, `max` bytes at most, redirects not followed. -> { status, type, body } */
export async function fetchJson(url, { method = 'GET', headers = {}, body, timeout = 5000, max = 64 * 1024, what = 'the issuer' } = {}) {
  checkUrl(url, `${what}’s address`)
  let r, text = ''
  try {
    r = await fetch(url, { method, headers: { Accept: 'application/json', ...headers }, body, redirect: 'error', signal: AbortSignal.timeout(timeout) })
    if (Number(r.headers.get('content-length')) > max) throw refuse('failed', `${what}’s answer is too large`)
    const chunks = []
    let size = 0
    for await (const c of r.body ?? []) {
      if ((size += c.length) > max) throw refuse('failed', `${what}’s answer is too large`)
      chunks.push(c)
    }
    text = Buffer.concat(chunks).toString('utf8')
  } catch (e) {
    if (e.key) throw e
    throw refuse('failed', e.name === 'TimeoutError' || e.name === 'AbortError' ? `${what} didn’t answer within ${timeout / 1000} seconds`
      : `couldn’t reach ${what} (${oneLine(e.cause?.code ?? e.message).slice(0, 80)})`)
  }
  let json = null
  try { json = JSON.parse(text) } catch { /* below */ }
  return { status: r.status, type: String(r.headers.get('content-type') ?? ''), body: json && typeof json === 'object' && !Array.isArray(json) ? json : null }
}

/** `auth`: server/auth.mjs's authApi (json(), signInExternal(), context). Options for tests: fetch timeout, answer size cap, the
 *  shortest gap between two key-set fetches for an unknown kid. */
export function oidcApi({ libraryDir, auth, log = console, timeout = 5000, maxBytes = 64 * 1024, jwksGap = MINUTE }) {
  const config = join(libraryDir, '.config')
  const settingsPath = join(config, 'auth.xml'), secretPath = join(config, 'auth-secret.xml')
  const states = new Map() // state -> { nonce, verifier, bind: sha256(cookie), redirectUri, issuer, clientId, created }, oldest first
  const discovered = new Map() // issuer -> { doc, at }
  const keySets = new Map() // jwks_uri -> { keys, at }
  const opts = what => ({ timeout, max: maxBytes, what })

  // ---- settings ----
  const read = path => { try { return readFileSync(path, 'utf8') } catch { return '' } }
  function settings() {
    const tag = rootTag(read(settingsPath), 'oidc')
    const s = { issuer: attr(tag, 'issuer') ?? '', clientId: attr(tag, 'client') ?? '', tokenAuth: attr(tag, 'tokenAuth') ?? TOKEN_AUTH[0],
      enabled: attr(tag, 'enabled') === 'true' }
    const sec = rootTag(read(secretPath), 'ca2:authsecret')
    s.secret = sec && attr(sec, 'issuer') === s.issuer ? attr(sec, 'secret') ?? '' : '' // a secret is only for the issuer it was given for
    if (!TOKEN_AUTH.includes(s.tokenAuth)) s.tokenAuth = TOKEN_AUTH[0]
    s.on = s.enabled && !!(s.issuer && s.clientId && s.secret)
    return s
  }
  const view = (s, ctx) => ({ issuer: s.issuer, clientId: s.clientId, tokenAuth: s.tokenAuth, enabled: s.on, secretSet: !!s.secret,
    redirectUri: ctx.origin ? `${ctx.origin}/api/auth/oidc/callback` : null })

  async function save(req) {
    const b = await auth.json(req), old = settings(), s = { ...old }
    if ('issuer' in b) {
      const v = oneLine(b.issuer)
      if (v.length > 300) throw fail(400, 'the issuer address is too long')
      if (v) try { const u = checkUrl(v, 'the issuer address'); if (u.search) throw refuse('failed', 'the issuer address can’t have a ?query') } catch (e) { throw fail(400, e.message) }
      s.issuer = v
    }
    if ('clientId' in b) {
      const v = oneLine(b.clientId)
      if (v && !/^[\x21-\x7e]{1,100}$/.test(v)) throw fail(400, 'a client ID is up to 100 letters, digits and symbols, no spaces')
      s.clientId = v
    }
    if ('tokenAuth' in b) {
      if (!TOKEN_AUTH.includes(b.tokenAuth)) throw fail(400, 'tokenAuth is client_secret_basic or client_secret_post')
      s.tokenAuth = b.tokenAuth
    }
    let secret = null // a new one to store
    if (typeof b.secret === 'string' && b.secret !== '') {
      // eslint-disable-next-line no-control-regex
      if (b.secret.length > 512 || /[\x00-\x1f\x7f]/.test(b.secret)) throw fail(400, 'that client secret isn’t valid: up to 512 characters, on one line')
      secret = b.secret
    }
    if ('enabled' in b && typeof b.enabled !== 'boolean') throw fail(400, 'enabled is true or false')
    const complete = !!(s.issuer && s.clientId && (secret || (s.issuer === old.issuer && old.secret)))
    if (b.enabled === true && !complete) throw fail(400, 'enter the issuer address, client ID and client secret before turning it on')
    const enabled = ('enabled' in b ? b.enabled : old.enabled) && complete // a new issuer without its secret turns it off
    await mkdir(config, { recursive: true })
    await writeAtomic(settingsPath, `${HEAD}<!-- Sign-in settings (auth.xsd). The client secret is in auth-secret.xml. -->\n<ca2:auth xmlns:ca2="${NS}" version="1">\n` +
      `  <oidc enabled="${enabled}" issuer="${esc(s.issuer)}" client="${esc(s.clientId)}" tokenAuth="${s.tokenAuth}"/>\n</ca2:auth>\n`)
    if (secret) {
      await writeAtomic(secretPath, `${HEAD}<ca2:authsecret xmlns:ca2="${NS}" version="1" issuer="${esc(s.issuer)}" secret="${esc(secret)}"/>\n`, SECRET_MODE)
      await chmod(secretPath, SECRET_MODE).catch(() => {})
    } else if (s.issuer !== old.issuer) await rm(secretPath, { force: true }) // a secret never follows a new issuer
    const now = settings()
    log.log(`sign-in settings changed: Authelia ${now.on ? 'on' : 'off'}, issuer ${now.issuer || 'none'}${secret ? ', new client secret' : ''}`)
    return now
  }

  // ---- the issuer ----
  /** The issuer's discovery document, checked (cached an hour; `fresh` skips the cache). */
  async function discover(issuer, fresh = false) {
    const hit = discovered.get(issuer)
    if (!fresh && hit && Date.now() - hit.at < DISCOVERY_TTL) return hit.doc
    const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
    checkUrl(issuer, 'the issuer address')
    const r = await fetchJson(url, opts('the issuer'))
    if (r.status !== 200) throw refuse('failed', `the issuer answered ${r.status} for its discovery document (${url})`)
    const d = r.body
    if (!d) throw refuse('failed', 'the issuer’s discovery document isn’t JSON')
    if (d.issuer !== issuer) throw refuse('failed', `the issuer calls itself ${oneLine(d.issuer).slice(0, 200) || 'nothing'}: enter exactly that address`)
    for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
      if (typeof d[k] !== 'string') throw refuse('failed', `the issuer’s discovery document has no ${k}`)
      checkUrl(d[k], `the issuer’s ${k}`)
    }
    if (d.userinfo_endpoint != null) checkUrl(String(d.userinfo_endpoint), 'the issuer’s userinfo_endpoint')
    if (Array.isArray(d.code_challenge_methods_supported) && !d.code_challenge_methods_supported.includes('S256'))
      throw refuse('failed', 'the issuer doesn’t offer PKCE with S256')
    discovered.set(issuer, { doc: d, at: Date.now() })
    return d
  }

  async function loadKeys(uri) {
    const r = await fetchJson(uri, opts('the issuer’s key set'))
    if (r.status !== 200 || !Array.isArray(r.body?.keys)) throw refuse('failed', `the issuer’s key set answered ${r.status} without keys`)
    const set = { keys: r.body.keys.slice(0, 50), at: Date.now() }
    keySets.set(uri, set)
    return set
  }
  function pick(keys, kid, alg) {
    const a = ALGS[alg]
    const fit = keys.filter(k => k && typeof k === 'object' && k.kty === a.kty && (!a.crv || k.crv === a.crv) && (k.use ?? 'sig') === 'sig'
      && (k.alg === undefined || k.alg === alg))
    const k = kid !== undefined ? fit.find(x => x.kid === kid) : fit.length === 1 ? fit[0] : undefined
    if (!k) return null
    try {
      const key = createPublicKey({ key: k, format: 'jwk' })
      if (a.kty === 'RSA' && key.asymmetricKeyDetails?.modulusLength < 2048) return null
      return key
    } catch { return null }
  }
  /** The issuer's key for this token; an unknown kid fetches the key set again, at most once per `jwksGap` (rotation). */
  async function keyFor(d, kid, alg) {
    let set = keySets.get(d.jwks_uri)
    if (!set || Date.now() - set.at > JWKS_TTL) set = await loadKeys(d.jwks_uri)
    let key = pick(set.keys, kid, alg)
    if (!key && Date.now() - set.at >= jwksGap) key = pick((await loadKeys(d.jwks_uri)).keys, kid, alg)
    if (!key) throw refuse('failed', `no ${alg} key${kid !== undefined ? ` "${oneLine(kid).slice(0, 60)}"` : ''} in the issuer’s key set`)
    return key
  }

  const part = s => {
    if (!/^[A-Za-z0-9_-]+$/.test(s)) throw refuse('failed', 'the ID token isn’t a JWT')
    try { const v = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); if (v && typeof v === 'object' && !Array.isArray(v)) return v } catch { /* below */ }
    throw refuse('failed', 'the ID token isn’t a JWT')
  }
  /** The ID token's claims, once its signature, issuer, audience, times and nonce check out. */
  async function verifyIdToken(token, d, clientId, nonce) {
    if (typeof token !== 'string' || token.length > 16384) throw refuse('failed', 'the token endpoint sent no ID token')
    const bits = token.split('.')
    if (bits.length !== 3 || !bits[2]) throw refuse('failed', 'the ID token isn’t a signed JWT')
    const header = part(bits[0]), claims = part(bits[1])
    const a = Object.hasOwn(ALGS, header.alg) ? ALGS[header.alg] : null
    if (!a) throw refuse('failed', `the ID token is signed with ${oneLine(header.alg).slice(0, 20) || 'nothing'}; only RS256 and ES256 are taken`)
    if (header.crit !== undefined) throw refuse('failed', 'the ID token has critical header parameters')
    if (!/^[A-Za-z0-9_-]+$/.test(bits[2])) throw refuse('failed', 'the ID token’s signature isn’t valid')
    const key = await keyFor(d, header.kid, header.alg)
    let good = false
    try { good = verify('sha256', Buffer.from(`${bits[0]}.${bits[1]}`), { key, dsaEncoding: a.dsaEncoding }, Buffer.from(bits[2], 'base64url')) } catch { /* false */ }
    if (!good) throw refuse('failed', 'the ID token’s signature is wrong')
    const now = Date.now() / 1000
    if (claims.iss !== d.issuer) throw refuse('failed', 'the ID token is from another issuer')
    const aud = claims.aud
    if (!(aud === clientId || (Array.isArray(aud) && aud.includes(clientId)))) throw refuse('failed', 'the ID token is for another client')
    if ((Array.isArray(aud) && aud.length > 1) || claims.azp !== undefined)
      if (claims.azp !== clientId) throw refuse('failed', 'the ID token was issued to another client (azp)')
    if (typeof claims.exp !== 'number' || now > claims.exp + LEEWAY) throw refuse('failed', 'the ID token has expired')
    if (typeof claims.iat !== 'number' || claims.iat > now + LEEWAY) throw refuse('failed', 'the ID token is dated in the future')
    if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now + LEEWAY)) throw refuse('failed', 'the ID token isn’t valid yet')
    if (typeof claims.nonce !== 'string' || !timingSafeEqual(sha256(claims.nonce), sha256(nonce))) throw refuse('failed', 'the ID token’s nonce is wrong')
    if (typeof claims.sub !== 'string' || !claims.sub) throw refuse('failed', 'the ID token has no subject')
    return claims
  }

  async function exchange(d, s, code, entry) {
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: entry.redirectUri, code_verifier: entry.verifier })
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (s.tokenAuth === 'client_secret_post') { form.set('client_id', s.clientId); form.set('client_secret', s.secret) }
    // RFC 6749 §2.3.1: each part form-encoded before base64
    else headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(s.clientId)}:${encodeURIComponent(s.secret)}`).toString('base64')}`
    const r = await fetchJson(d.token_endpoint, { ...opts('the token endpoint'), method: 'POST', headers, body: form.toString() })
    if (r.status !== 200 || !r.body) throw refuse('failed', `the token endpoint answered ${r.status}${r.body?.error ? ` (${oneLine(r.body.error).slice(0, 60)})` : ''}`)
    return r.body
  }

  /** Authelia keeps preferred_username and email out of the ID token (they come from the userinfo endpoint). */
  async function userinfo(d, accessToken, sub) {
    const r = await fetchJson(d.userinfo_endpoint, { ...opts('the userinfo endpoint'), headers: { Authorization: `Bearer ${accessToken}` } })
    if (r.status !== 200 || !/^application\/json\b/i.test(r.type) || !r.body)
      throw refuse('failed', `the userinfo endpoint answered ${r.status} ${oneLine(r.type).slice(0, 40)} (set userinfo_signed_response_alg: none)`)
    if (r.body.sub !== sub) throw refuse('failed', 'the userinfo endpoint answered for another subject')
    return r.body
  }

  // ---- the flow ----
  const cookieName = ctx => ctx.https ? '__Host-ca2_oidc' : 'ca2_oidc'
  const cookie = (res, ctx, value, age) => res.setHeader('Set-Cookie', [...[].concat(res.getHeader('Set-Cookie') ?? []),
    `${cookieName(ctx)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${ctx.https ? '; Secure' : ''}`])
  const go = (res, where) => { res.writeHead(302, { Location: where, 'Cache-Control': 'no-store' }); res.end() }

  async function start(req, res) {
    const ctx = req.ctx, s = settings()
    if (!s.on) return go(res, '/?signin=off')
    let d
    try {
      if (!ctx.origin) throw refuse('failed', 'the request has no usable Host')
      d = await discover(s.issuer)
    } catch (e) {
      log.error(`Authelia sign-in couldn’t start: ${e.key ? e.message : 'error'} (from ${ctx.ip})`)
      return go(res, '/?signin=failed')
    }
    const now = Date.now()
    // ponytail: one bounded map; a flood of starts pushes out the oldest waiting ones (those people just try again)
    for (const [k, v] of states) if (now - v.created > STATE_TTL || states.size >= MAX_STATES) states.delete(k); else break
    const state = rand(), bind = rand(), verifier = rand(), nonce = rand()
    const redirectUri = `${ctx.origin}/api/auth/oidc/callback`
    states.set(state, { nonce, verifier, bind: sha256(bind), redirectUri, issuer: s.issuer, clientId: s.clientId, created: now })
    cookie(res, ctx, bind, STATE_TTL / 1000)
    const u = new URL(d.authorization_endpoint)
    for (const [k, v] of Object.entries({ response_type: 'code', client_id: s.clientId, redirect_uri: redirectUri, scope: SCOPE, state, nonce,
      code_challenge: sha256(verifier).toString('base64url'), code_challenge_method: 'S256' })) u.searchParams.set(k, v)
    return go(res, u.href)
  }

  async function callback(req, res, url) {
    const ctx = req.ctx, q = url.searchParams
    const state = q.get('state') ?? '', entry = states.get(state)
    if (entry) states.delete(state) // single use, whatever happens next
    const bound = String(req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${cookieName(ctx)}=([A-Za-z0-9_-]{43})(?:;|$)`))?.[1]
    cookie(res, ctx, '', 0)
    try {
      if (!entry || Date.now() - entry.created > STATE_TTL) throw refuse('expired', 'an unknown, used or expired state')
      if (!bound || !timingSafeEqual(sha256(bound), entry.bind)) throw refuse('expired', 'the state was started in another browser')
      if (q.get('error')) throw refuse('denied', `the issuer said ${oneLine(q.get('error')).slice(0, 60)}`)
      const code = q.get('code') ?? ''
      if (!code || code.length > 2048) throw refuse('failed', 'the issuer sent no code')
      const s = settings()
      if (!s.on || s.issuer !== entry.issuer || s.clientId !== entry.clientId) throw refuse('failed', 'the sign-in settings changed meanwhile')
      const d = await discover(s.issuer)
      const tokens = await exchange(d, s, code, entry)
      let claims = await verifyIdToken(tokens.id_token, d, s.clientId, entry.nonce)
      if (claims.preferred_username === undefined && claims.email === undefined && d.userinfo_endpoint && typeof tokens.access_token === 'string')
        claims = { ...await userinfo(d, tokens.access_token, claims.sub), sub: claims.sub }
      const who = { username: typeof claims.preferred_username === 'string' ? claims.preferred_username : '',
        email: typeof claims.email === 'string' ? claims.email : '', emailVerified: claims.email_verified }
      const u = await auth.signInExternal(res, ctx, who)
      if (!u) throw refuse('no-account', `no enabled Authelia account here for "${oneLine(who.username || who.email).slice(0, 80)}"`)
      return go(res, '/')
    } catch (e) {
      log.log(`Authelia sign-in refused from ${ctx.ip}: ${e.key ? e.message : 'an error'}`)
      if (!e.key) log.error(e.stack)
      return go(res, `/?signin=${e.key ?? 'failed'}`)
    }
  }

  async function test(req) {
    const b = await auth.json(req)
    const issuer = oneLine(b.issuer ?? settings().issuer)
    if (!issuer) return { ok: false, message: 'enter the issuer address first' }
    try {
      const d = await discover(issuer, true)
      const algs = Array.isArray(d.id_token_signing_alg_values_supported) ? d.id_token_signing_alg_values_supported.filter(a => ALGS[a]) : []
      return { ok: true, message: `found the issuer: it signs ID tokens with ${algs.length ? algs.join(' or ') : 'an algorithm it doesn’t list (RS256 or ES256 is needed)'}` }
    } catch (e) {
      return { ok: false, message: e.key ? e.message : 'the test failed' }
    }
  }

  /** The routes here; false for any other path. */
  async function handle(req, res, url, send) {
    const p = url.pathname, method = req.method
    if (p === '/api/auth/oidc/start' && method === 'GET') return start(req, res)
    if (p === '/api/auth/oidc/callback' && method === 'GET') return callback(req, res, url)
    if (p === '/api/auth-settings' && method === 'GET') return send(res, 200, view(settings(), req.ctx))
    if (p === '/api/auth-settings' && method === 'PUT') return send(res, 200, view(await save(req), req.ctx))
    if (p === '/api/auth-settings/test' && method === 'POST') return send(res, 200, await test(req))
    if (p.startsWith('/api/auth/oidc/') || p === '/api/auth-settings' || p.startsWith('/api/auth-settings/')) return send(res, 404, { error: 'not found' })
    return false
  }

  return { handle, enabled: () => settings().on }
}
