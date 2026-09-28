// Accounts: users (library/.config/users.xml), sessions (sessions.xml, hashed), sign-in with lockout, the first-admin
// setup code, the recovery code (server/users.mjs reset), the Origin check, the trusted proxy and the role table.
// See docs/superpowers/specs/2026-09-28-accounts-design.md §2–§4. No dependencies: node:crypto and node:net.
//
//   POST   /api/auth/login          { username, password } -> { user } + cookie; 401 wrong, 429 paused (5 tries, 15 min)
//   POST   /api/auth/logout         -> 204, the session ends
//   GET    /api/auth/me             -> { user | null, setup } (public; setup: no account exists yet)
//   POST   /api/auth/password       { current, password } -> 204; the user's other sessions end
//   POST   /api/setup               { code, username, name, password } -> 201 { user } + cookie: the first admin (404 once any
//                                   account exists); top-level runners move into the admin's folder
//   POST   /api/setup/reset         { username, code, password } -> 204: the recovery code `node server/users.mjs reset <user>`
//                                   printed; the account signs in with this password from now on, its sessions end
//   GET    /api/users               admin: -> [user]
//   POST   /api/users               admin: { username, name, email?, role, method, password? } -> 201 { user }
//   PUT    /api/users/:id           admin: any of { username, name, email, role, method, enabled } -> { user }; a new
//                                   username renames the runner folder; disabling ends the sessions
//   DELETE /api/users/:id           admin: -> 204; 409 while the user has runners
//   POST   /api/users/:id/reset-password  admin: { password } -> 204; every session of that user ends
//   POST   /api/users/:id/move-runner     admin: { file, to: <user id> } -> { file } (its name in the new folder)
// There is always an enabled admin: the last one can't be demoted, disabled or deleted (409).
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { chmod, mkdir, readFile, rm } from 'node:fs/promises'
import { BlockList, isIP } from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { attr, esc, rootTag, writeAtomic } from './books.mjs'

const scrypt = promisify(scryptCb)
const NS = 'urn:chummer-anarchy2:config:1'
// the spec's [a-z0-9._-]{2,32}, starting with a letter or digit: a username is a folder in characters/ (never ".trash")
export const USERNAME = /^[a-z0-9][a-z0-9._-]{1,31}$/
const USER_ID = /^[0-9a-f]{12}$/
const EMAIL = /^[^\s@<>"&]{1,64}@[^\s@<>"&]{1,190}$/
const ROLES = ['admin', 'editor', 'player'], METHODS = ['password', 'authelia'] // authelia: signs in through OIDC only (Task 5)
const SCRYPT = { N: 2 ** 15, r: 8, p: 1 }
const MIN_PASSWORD = 10, MAX_PASSWORD = 1024
const MINUTE = 60e3, DAY = 24 * 60 * MINUTE
const TTL = 30 * DAY, LOCK = 15 * MINUTE, TRIES = 5, RESET_TTL = 15 * MINUTE
const COOKIE = 'ca2_session'
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O, 1/I
// eslint-disable-next-line no-control-regex
const oneLine = s => String(s ?? '').replace(/[\x00-\x1f\x7f]/g, '').trim()
const iso = (t = Date.now()) => new Date(t).toISOString().replace(/\.\d+Z$/, 'Z')
const sha256 = s => createHash('sha256').update(s).digest()
const same = (a, b) => timingSafeEqual(sha256(String(a)), sha256(String(b)))
const fail = (code, message) => Object.assign(new Error(message), { code })
const code = () => Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')).join('-')

export async function hashPassword(password, { N, r, p } = SCRYPT) {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 64, { N, r, p, maxmem: 256 * N * r })
  return { N, r, p, salt: salt.toString('base64'), hash: key.toString('base64') }
}
async function passwordIs(password, h) {
  const want = Buffer.from(h.hash, 'base64')
  const got = await scrypt(password, Buffer.from(h.salt, 'base64'), want.length, { N: h.N, r: h.r, p: h.p, maxmem: 256 * h.N * h.r })
  return timingSafeEqual(got, want)
}
let dummy // an unknown username costs the same scrypt as a known one
const checkPassword = async (password, h) => h ? passwordIs(password, h) : (await passwordIs(password, dummy ??= await hashPassword('x'.repeat(MIN_PASSWORD))), false)

// ---- the files ----
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n'
function usersXml(users) {
  const row = u => `  <user id="${u.id}" username="${u.username}" name="${esc(u.name)}"${u.email ? ` email="${esc(u.email)}"` : ''} role="${u.role
  }" method="${u.method}" enabled="${u.enabled}" created="${u.created}"${u.lastLogin ? ` lastLogin="${u.lastLogin}"` : ''}${u.password
    ? `>\n    <password algorithm="scrypt" N="${u.password.N}" r="${u.password.r}" p="${u.password.p}" salt="${u.password.salt}" hash="${u.password.hash}"/>\n  </user>`
    : '/>'}\n`
  return `${HEAD}<!-- Accounts (users.xsd). Written by the server; passwords only as scrypt hashes. -->\n<ca2:users xmlns:ca2="${NS}" version="1">\n${users.map(row).join('')}</ca2:users>\n`
}
/** users.xml's accounts; throws on anything users.xsd wouldn't allow (the server then refuses sign-ins and setup). */
export function parseUsers(xml) {
  if (!/<ca2:users\b/.test(xml)) throw new Error('not a users file')
  return [...xml.matchAll(/<user\b[^>]*?(?:\/>|>[\s\S]*?<\/user>)/g)].map(([m]) => {
    const tag = rootTag(m, 'user'), pw = rootTag(m, 'password'), num = n => Number(attr(pw, n))
    const u = { id: attr(tag, 'id'), username: attr(tag, 'username'), name: attr(tag, 'name') ?? '', email: attr(tag, 'email') ?? '',
      role: attr(tag, 'role'), method: attr(tag, 'method'), enabled: attr(tag, 'enabled') === 'true', created: attr(tag, 'created'),
      lastLogin: attr(tag, 'lastLogin'), password: pw ? { N: num('N'), r: num('r'), p: num('p'), salt: attr(pw, 'salt'), hash: attr(pw, 'hash') } : null }
    if (!USER_ID.test(u.id ?? '') || !USERNAME.test(u.username ?? '') || !ROLES.includes(u.role) || !METHODS.includes(u.method)
      || (pw && !(u.password.N > 1 && u.password.r > 0 && u.password.p > 0 && u.password.salt && u.password.hash)))
      throw new Error(`a <user> entry isn’t valid: ${m.replace(/\s(salt|hash)="[^"]*"/g, '').slice(0, 200)}`)
    return u
  })
}
const pub = u => ({ id: u.id, username: u.username, name: u.name, email: u.email || null, role: u.role, method: u.method,
  enabled: u.enabled, created: u.created, lastLogin: u.lastLogin ?? null })

/** The recovery code for `username` (server/users.mjs reset): only its hash goes to library/.config/reset.xml (mode 600),
 *  which the running server reads at /api/setup/reset and deletes when used. A new code replaces the old one. */
export async function issueReset(libraryDir, username) {
  const name = oneLine(username).toLowerCase()
  let users
  try { users = parseUsers(await readFile(join(libraryDir, '.config', 'users.xml'), 'utf8')) } catch (e) {
    throw new Error(e.code === 'ENOENT' ? 'there are no accounts yet: use the setup code in the server log' : `couldn’t read users.xml: ${e.message}`)
  }
  if (!users.some(u => u.username === name)) throw new Error(`there is no account "${name}"`)
  const c = code(), path = join(libraryDir, '.config', 'reset.xml')
  await writeAtomic(path, `${HEAD}<ca2:reset xmlns:ca2="${NS}" version="1" user="${name}" hash="${sha256(c).toString('hex')}" expires="${iso(Date.now() + RESET_TTL)}"/>\n`)
  await chmod(path, 0o600).catch(() => {})
  return c
}

/** A users.xml with these accounts ({ username, password, role?, name? }): for seeding tests and the e2e server. */
export async function usersFile(list) {
  const users = []
  for (const { username, password, role = 'admin', name = username } of list)
    users.push({ id: randomBytes(6).toString('hex'), username, name, email: '', role, method: 'password', enabled: true, created: iso(),
      password: await hashPassword(password) })
  return usersXml(users)
}

/** TRUST_PROXY: comma-separated IPs or CIDRs ("" = none). */
export function proxyList(spec = '') {
  const list = new BlockList()
  for (const raw of String(spec).split(',').map(s => s.trim()).filter(Boolean)) {
    const [ip, bits, extra] = raw.split('/')
    const v = isIP(ip)
    if (!v || extra !== undefined || (bits !== undefined && !(/^\d+$/.test(bits) && Number(bits) <= (v === 4 ? 32 : 128))))
      throw new Error(`TRUST_PROXY: "${raw}" isn’t an IP address or CIDR`)
    const type = v === 4 ? 'ipv4' : 'ipv6'
    if (bits === undefined) list.addAddress(ip, type)
    else list.addSubnet(ip, Number(bits), type)
  }
  return list
}
const plainIp = a => a?.startsWith('::ffff:') && isIP(a.slice(7)) === 4 ? a.slice(7) : a ?? ''
const first = h => String(h ?? '').split(',')[0].trim()

/** Who may call a route: public, user (any signed-in account), editor (admin or editor) or admin. */
export function need(path, method) {
  if (path === '/api/health' || (path === '/api/auth/me' && method === 'GET')
    || (method === 'POST' && ['/api/auth/login', '/api/setup', '/api/setup/reset'].includes(path))) return 'public'
  if (/^\/api\/(books|review|ai-settings|ai-keys|ai-models|backup|restore|datapack|users)(\/|$)/.test(path)) return 'admin'
  if (/^\/api\/edits(\/|$)/.test(path) && method !== 'GET' && method !== 'HEAD') return 'editor'
  return 'user'
}

/** `lock`: the characters' write lock (shared with server.mjs); `runners`: runner-folder moves, run under it; `track`:
 *  books.track, so file writes are counted (a restore waits for them, and they are refused while it runs). */
export function authApi({ libraryDir, trustProxy = '', lock, track, runners, log = console }) {
  const config = join(libraryDir, '.config')
  const usersPath = join(config, 'users.xml'), sessionsPath = join(config, 'sessions.xml'), resetPath = join(config, 'reset.xml')
  const proxies = proxyList(trustProxy)
  const trusted = a => isIP(a) > 0 && proxies.check(a, isIP(a) === 4 ? 'ipv4' : 'ipv6')
  let users = [], broken = false, setupCode = null
  const sessions = new Map() // sha256(token) hex -> { user: id, created, seen } (ms)
  let dirty = false, persisting = Promise.resolve()
  const fails = new Map() // "<key>|<ip>" -> { n, until }

  function load() {
    users = []; broken = false; setupCode = null
    let xml = null
    try { xml = readFileSync(usersPath, 'utf8') } catch { /* no accounts yet */ }
    try { if (xml != null) users = parseUsers(xml) } catch (e) {
      broken = true
      log.error(`library/.config/users.xml can’t be read (${e.message}); nobody can sign in until it is fixed or restored`)
    }
    if (!users.length && !broken) {
      setupCode = code()
      log.log(`No accounts yet. Setup code for the first admin: ${setupCode} (it changes on every restart)`)
    }
  }
  function loadSessions() {
    sessions.clear()
    let xml = ''
    try { xml = readFileSync(sessionsPath, 'utf8') } catch { return }
    for (const [m] of xml.matchAll(/<session\b[^>]*>/g)) {
      const s = { user: attr(m, 'user'), created: Date.parse(attr(m, 'created')), seen: Date.parse(attr(m, 'seen')) }
      if (/^[0-9a-f]{64}$/.test(attr(m, 'hash') ?? '') && users.some(u => u.id === s.user) && Date.now() - s.seen < TTL) sessions.set(attr(m, 'hash'), s)
    }
  }
  load()
  loadSessions()

  const sessionsXml = () => `${HEAD}<ca2:sessions xmlns:ca2="${NS}" version="1">\n${[...sessions].map(([h, s]) =>
    `  <session hash="${h}" user="${s.user}" created="${iso(s.created)}" seen="${iso(s.seen)}"/>\n`).join('')}</ca2:sessions>\n`
  /** sessions.xml now (a session began or ended) or when due (only last-seen times changed): one write at a time,
   *  counted by track, skipped while a restore runs (it ends every session anyway). */
  function persist() {
    dirty = true
    persisting = persisting.then(async () => {
      if (!dirty) return
      try {
        await track(async () => {
          dirty = false
          await mkdir(config, { recursive: true })
          await writeAtomic(sessionsPath, sessionsXml())
        })
      } catch (e) { dirty = true; if (e.code !== 409) log.error(`couldn’t save sessions.xml: ${e.message}`) }
    })
    return persisting
  }
  const timer = setInterval(() => { if (dirty) void persist() }, MINUTE).unref() // last-seen times: at most once a minute
  const saveUsers = async () => { await mkdir(config, { recursive: true }); await writeAtomic(usersPath, usersXml(users)) }
  function endSessions(userId, keep) {
    for (const [h, s] of sessions) if (s.user === userId && h !== keep) sessions.delete(h)
    return persist()
  }

  // ---- the request ----
  /** The client's address, whether the request came over https, and the public origin; X-Forwarded-For/-Proto/-Host
   *  count only from a TRUST_PROXY peer. */
  function context(req) {
    const peer = plainIp(req.socket.remoteAddress)
    let ip = peer, https = !!req.socket.encrypted, host = String(req.headers.host ?? '')
    if (trusted(peer)) {
      // the nearest address the trusted proxies didn't add themselves is the client's
      const chain = String(req.headers['x-forwarded-for'] ?? '').split(',').map(s => plainIp(s.trim())).filter(s => isIP(s))
      for (let i = chain.length - 1; i >= 0; i--) { ip = chain[i]; if (!trusted(ip)) break }
      const proto = first(req.headers['x-forwarded-proto']).toLowerCase()
      if (proto === 'https' || proto === 'http') https = proto === 'https'
      if (first(req.headers['x-forwarded-host'])) host = first(req.headers['x-forwarded-host'])
    }
    let origin = null
    try { origin = new URL(`${https ? 'https' : 'http'}://${host}`).origin } catch { /* a malformed Host matches nothing */ }
    return { ip, https, origin }
  }
  function sameOrigin(req, ctx) {
    let o = req.headers.origin
    if (!o && req.headers.referer) try { o = new URL(req.headers.referer).origin } catch { return false }
    return !!o && !!ctx.origin && o.toLowerCase() === ctx.origin.toLowerCase()
  }
  const cookieOf = req => String(req.headers.cookie ?? '').match(/(?:^|;\s*)ca2_session=([A-Za-z0-9_-]{20,100})(?:;|$)/)?.[1]
  const setCookie = (res, ctx, token, age = TTL / 1000) => res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${ctx.https ? '; Secure' : ''}`)
  function startSession(res, ctx, u) {
    const token = randomBytes(32).toString('base64url')
    sessions.set(sha256(token).toString('hex'), { user: u.id, created: Date.now(), seen: Date.now() })
    setCookie(res, ctx, token)
    return persist()
  }

  /** The signed-in user (null: none), sliding the session's 30 days; the cookie is renewed when an hour has passed. */
  function session(req, res, ctx = context(req)) {
    const token = cookieOf(req)
    if (!token) return null
    const h = sha256(token).toString('hex'), s = sessions.get(h), now = Date.now()
    const u = s && users.find(x => x.id === s.user)
    if (!s || !u || !u.enabled || now - s.seen > TTL) {
      if (s) { sessions.delete(h); void persist() }
      return null
    }
    if (now - s.seen > 60 * MINUTE) setCookie(res, ctx, token)
    s.seen = now
    dirty = true
    return Object.assign(Object.create(null), u, { session: h })
  }

  /** Before any /api route: the Origin check on every non-GET, then the role table. -> the user, null (a public route,
   *  nobody signed in) or false (refused; the response is sent). */
  function gate(req, res, url, send) {
    const ctx = req.ctx = context(req)
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req, ctx)) {
      send(res, 403, { error: 'this request didn’t come from the app’s own page' })
      return false
    }
    const level = need(url.pathname, req.method), u = session(req, res, ctx)
    if (level === 'public') return u
    if (!u) {
      send(res, 401, { error: 'sign in first' })
      return false
    }
    if ((level === 'admin' && u.role !== 'admin') || (level === 'editor' && u.role === 'player')) {
      send(res, 403, { error: 'your account can’t do this' })
      return false
    }
    return u
  }

  // ---- lockout ----
  function locked(key, ip) {
    const f = fails.get(`${key}|${ip}`)
    if (f?.until > Date.now()) throw fail(429, 'too many tries: paused for 15 minutes')
  }
  function failed(key, ip) {
    if (fails.size > 10000) for (const [k, f] of fails) if (!(f.until > Date.now())) fails.delete(k) // ponytail: in memory, pruned when big
    const k = `${key}|${ip}`, f = fails.get(k)
    const n = f?.until && f.until <= Date.now() ? 1 : (f?.n ?? 0) + 1 // after a pause, counting starts again
    fails.set(k, { n, until: n >= TRIES ? Date.now() + LOCK : 0 })
  }

  // ---- checks ----
  async function json(req) {
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) throw fail(415, 'send JSON (application/json)')
    const chunks = []
    let size = 0
    for await (const c of req) {
      if ((size += c.length) > 16384) throw fail(413, 'too large')
      chunks.push(c)
    }
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (v && typeof v === 'object' && !Array.isArray(v)) return v
    } catch { /* below */ }
    throw fail(400, 'send a JSON object')
  }
  const password = p => {
    if (typeof p !== 'string' || p.length < MIN_PASSWORD) throw fail(400, `a password needs at least ${MIN_PASSWORD} characters`)
    if (p.length > MAX_PASSWORD) throw fail(400, 'that password is too long')
    return p
  }
  /** The account fields in `b` (all of them for a new account), checked. */
  function fields(b, current) {
    const out = {}
    if (!current || 'username' in b) {
      const n = oneLine(b.username).toLowerCase()
      if (!USERNAME.test(n)) throw fail(400, 'a username is 2–32 characters: a–z, 0–9, dots, dashes and underscores, starting with a letter or digit')
      if (users.some(u => u.username === n && u !== current)) throw fail(409, `the username ${n} is taken`)
      out.username = n
    }
    if (!current || 'name' in b) {
      const n = oneLine(b.name)
      if (!n || n.length > 80) throw fail(400, 'a name is 1–80 characters')
      out.name = n
    }
    if ('email' in b) {
      const e = oneLine(b.email ?? '').toLowerCase()
      if (e && !EMAIL.test(e)) throw fail(400, 'that email address doesn’t look right')
      if (e && users.some(u => u.email === e && u !== current)) throw fail(409, 'another account has that email address')
      out.email = e
    }
    if (!current || 'role' in b) {
      if (!ROLES.includes(b.role)) throw fail(400, 'role is admin, editor or player')
      out.role = b.role
    }
    if (!current || 'method' in b) {
      const m = b.method ?? 'password'
      if (!METHODS.includes(m)) throw fail(400, 'method is password or authelia')
      out.method = m
    }
    if (current && 'enabled' in b) {
      if (typeof b.enabled !== 'boolean') throw fail(400, 'enabled is true or false')
      out.enabled = b.enabled
    }
    return out
  }
  const byId = id => {
    const u = users.find(x => x.id === id)
    if (!u) throw fail(404, 'no such account')
    return u
  }
  /** The last enabled admin stays one. */
  function keepAnAdmin(u, after) {
    const isAdmin = x => x.role === 'admin' && x.enabled
    if (isAdmin(u) && !(after && isAdmin(after)) && !users.some(x => x !== u && isAdmin(x)))
      throw fail(409, 'there must always be an enabled admin: make another account admin first')
  }

  // ---- routes ----
  async function login(req, res, send) {
    const ctx = req.ctx, b = await json(req)
    const name = oneLine(b.username).toLowerCase().slice(0, 64)
    locked(name, ctx.ip)
    const u = users.find(x => x.username === name)
    const usable = u?.enabled && u.method === 'password' && u.password
    const ok = await checkPassword(String(b.password ?? '').slice(0, MAX_PASSWORD), usable ? u.password : null) && usable
    if (!ok) {
      failed(name, ctx.ip)
      log.log(`sign-in failed: "${name}" from ${ctx.ip}`)
      throw fail(401, 'wrong username or password')
    }
    fails.delete(`${name}|${ctx.ip}`)
    log.log(`signed in: ${u.username} from ${ctx.ip}`)
    await lock(async () => { u.lastLogin = iso(); await saveUsers() })
    await startSession(res, ctx, u)
    return send(res, 200, { user: pub(u) })
  }

  async function setup(req, res, send) {
    if (users.length || broken) return send(res, 404, { error: 'not found' })
    const ctx = req.ctx, b = await json(req)
    locked('setup', ctx.ip)
    if (!setupCode || !same(oneLine(b.code).toUpperCase(), setupCode)) {
      failed('setup', ctx.ip)
      throw fail(403, 'that setup code is wrong: use the one in the server log')
    }
    const f = fields({ ...b, role: 'admin', method: 'password' })
    const pw = await hashPassword(password(b.password))
    const u = await lock(async () => {
      if (users.length || !setupCode) throw fail(404, 'not found')
      setupCode = null // single use
      const u = { id: randomBytes(6).toString('hex'), email: '', ...f, enabled: true, created: iso(), lastLogin: iso(), password: pw }
      users = [u]
      await saveUsers()
      await runners.adopt(u.username) // the upgrade: runners from before accounts become the admin's
      return u
    })
    log.log(`first admin created: ${u.username} from ${ctx.ip}`)
    await startSession(res, ctx, u)
    return send(res, 201, { user: pub(u) })
  }

  async function recover(req, res, send) {
    const ctx = req.ctx, b = await json(req)
    locked('reset', ctx.ip)
    const tag = rootTag(await readFile(resetPath, 'utf8').catch(() => ''), 'ca2:reset')
    const name = oneLine(b.username).toLowerCase()
    const u = users.find(x => x.username === name)
    const ok = tag && u && attr(tag, 'user') === name && Date.parse(attr(tag, 'expires')) > Date.now()
      && same(sha256(oneLine(b.code).toUpperCase()).toString('hex'), attr(tag, 'hash'))
    if (!ok) {
      failed('reset', ctx.ip)
      throw fail(403, 'that recovery code is wrong or has expired: run users.mjs reset again')
    }
    const pw = await hashPassword(password(b.password))
    await lock(async () => {
      Object.assign(u, { password: pw, method: 'password' })
      await saveUsers()
      await rm(resetPath, { force: true }) // single use
    })
    await endSessions(u.id)
    log.log(`password reset with a recovery code: ${u.username} from ${ctx.ip}`)
    return send(res, 204, '', 'text/plain')
  }

  async function users_(req, res, url, send, who) {
    const p = url.pathname, method = req.method
    if (p === '/api/users' && method === 'GET') {
      const list = []
      for (const u of users) list.push({ ...pub(u), runners: await runners.count(u.username) })
      return send(res, 200, list)
    }
    if (p === '/api/users' && method === 'POST') {
      const b = await json(req), f = fields(b)
      const pw = f.method === 'password' ? await hashPassword(password(b.password)) : null
      const u = await lock(async () => {
        fields(f) // still free after the hash
        const u = { id: randomBytes(6).toString('hex'), email: '', ...f, enabled: true, created: iso(), password: pw }
        users.push(u)
        await saveUsers()
        return u
      })
      log.log(`account created: ${u.username} (${u.role}) by ${who.username}`)
      return send(res, 201, { user: pub(u) })
    }
    const m = p.match(/^\/api\/users\/([0-9a-f]{12})(?:\/(reset-password|move-runner))?$/)
    if (!m) return send(res, 404, { error: 'not found' })
    const [, id, action] = m
    if (!action && method === 'PUT') {
      const b = await json(req)
      const u = await lock(async () => {
        const u = byId(id), f = fields(b, u), after = { ...u, ...f }
        keepAnAdmin(u, after)
        if (f.username && f.username !== u.username) await runners.rename(u.username, f.username)
        const end = after.enabled === false || after.method !== u.method
        if (f.method && f.method !== 'password') f.password = null // an Authelia account has no app password
        Object.assign(u, f)
        await saveUsers()
        if (end) await endSessions(u.id)
        return u
      })
      log.log(`account changed: ${u.username} by ${who.username}`)
      return send(res, 200, { user: pub(u) })
    }
    if (!action && method === 'DELETE') {
      await lock(async () => {
        const u = byId(id)
        keepAnAdmin(u, null)
        if (await runners.count(u.username)) throw fail(409, 'this account still has runners: move them to another account first')
        await runners.retire(u.username)
        users = users.filter(x => x !== u)
        await saveUsers()
        await endSessions(u.id)
        log.log(`account deleted: ${u.username} by ${who.username}`)
      })
      return send(res, 204, '', 'text/plain')
    }
    if (action === 'reset-password' && method === 'POST') {
      const pw = await hashPassword(password((await json(req)).password))
      const u = await lock(async () => {
        const u = byId(id)
        Object.assign(u, { password: pw, method: 'password' })
        await saveUsers()
        return u
      })
      await endSessions(u.id)
      log.log(`password reset: ${u.username} by ${who.username}`)
      return send(res, 204, '', 'text/plain')
    }
    if (action === 'move-runner' && method === 'POST') {
      const b = await json(req)
      if (typeof b.file !== 'string' || !/^[^/\\]{1,120}\.xml$/.test(b.file) || b.file.startsWith('.')) throw fail(400, 'file is a runner’s file name')
      const file = await lock(async () => {
        const from = byId(id), to = byId(String(b.to))
        if (from === to) throw fail(400, 'that runner already belongs to this account')
        return runners.move(from.username, b.file, to.username)
      })
      return send(res, 200, { file })
    }
    return send(res, 405, { error: 'method not allowed' })
  }

  /** The accounts routes; false for any other path. */
  async function handle(req, res, url, send, who) {
    const p = url.pathname, method = req.method
    if (p === '/api/auth/me' && method === 'GET') return send(res, 200, { user: who ? pub(who) : null, setup: !users.length && !broken })
    if (p === '/api/auth/login' && method === 'POST') return login(req, res, send)
    if (p === '/api/setup' && method === 'POST') return setup(req, res, send)
    if (p === '/api/setup/reset' && method === 'POST') return recover(req, res, send)
    if (p === '/api/auth/logout' && method === 'POST') {
      sessions.delete(who.session)
      await persist()
      setCookie(res, req.ctx, '', 0)
      return send(res, 204, '', 'text/plain')
    }
    if (p === '/api/auth/password' && method === 'POST') {
      const b = await json(req)
      const u = users.find(x => x.id === who.id)
      if (u.method !== 'password') throw fail(400, 'this account signs in with Authelia')
      locked(u.username, req.ctx.ip)
      if (!await checkPassword(String(b.current ?? '').slice(0, MAX_PASSWORD), u.password)) {
        failed(u.username, req.ctx.ip)
        throw fail(400, 'your current password is wrong')
      }
      const pw = await hashPassword(password(b.password))
      await lock(async () => { u.password = pw; await saveUsers() })
      await endSessions(u.id, who.session) // every other session
      log.log(`password changed: ${u.username}`)
      return send(res, 204, '', 'text/plain')
    }
    if (/^\/api\/(auth|setup)(\/|$)/.test(p)) return send(res, 404, { error: 'not found' })
    if (p === '/api/users' || p.startsWith('/api/users/')) return users_(req, res, url, send, who)
    return false
  }

  return {
    gate, handle, session, context,
    usernames: () => users.map(u => u.username),
    /** After a restore: the restored accounts; every session ends. No users.xml (a backup from before accounts): setup mode. */
    async reload() {
      load()
      sessions.clear()
      await persist()
    },
    /** Shutdown: sessions.xml now (synchronously, the process is about to exit). */
    stop() {
      clearInterval(timer)
      if (!dirty) return
      try {
        const tmp = `${sessionsPath}.${randomBytes(4).toString('hex')}.tmp`
        writeFileSync(tmp, sessionsXml(), { encoding: 'utf8', flag: 'wx' })
        renameSync(tmp, sessionsPath)
        dirty = false
      } catch (e) { log.error(`couldn’t save sessions.xml: ${e.message}`) }
    },
  }
}
