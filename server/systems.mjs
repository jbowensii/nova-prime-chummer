// Game systems as packages (Phase 3; docs/plans/desktop-app-foundry-model-2026-10-22.md). Each game's folder
// <Data>/systems/<disk>/ may hold a system.json: { id, title, version, compatibility:{minCore,verifiedCore}, provides:[], enabled }.
// Missing manifest + data present -> a default one is written; no data yet -> one is synthesized in memory only.
// Install/update takes a zip (system.json at its root, id = the target) from a file upload or a URL. The old tree
// (everything but the account data: characters, npcs, designs, compendiums) is MOVED to <root>/_to_delete/<ISO>/<disk>/, never deleted.
// The zip reader is here (node has none): stored/deflate entries only. The systems' code stays in the app; a package carries data.
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { dirname, join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { fail, writeAtomic } from './common.mjs'
import { DISK, PRIVATE } from './layout.mjs'

const MAX_ZIP = 200 * 1024 * 1024 // the file; ponytail: read into memory, stream to disk if packages outgrow this
const MAX_UNPACKED = 1024 * 1024 * 1024
const MAX_ENTRIES = 50000
const TITLE = { sr6: 'Shadowrun 6e', anarchy2: 'Shadowrun Anarchy 2' }
const PROVIDES = ['rules', 'recipes', 'data']
const num = v => String(v).split('.').map(Number)
const cmp = (a, b) => {
  const x = num(a),
    y = num(b)
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
  return 0
}
const semver = v => typeof v === 'string' && /^\d+\.\d+\.\d+([-+][\w.-]+)?$/.test(v)

/** The entries of a zip buffer: [{ name, data() }]. Throws a 400 for anything malformed. */
export function readZip(buf) {
  const bad = () => fail(400, 'this file isn’t a valid system package (damaged zip)')
  let e = buf.length - 22
  while (e >= 0 && e > buf.length - 22 - 65535 && buf.readUInt32LE(e) !== 0x06054b50) e--
  if (e < 0 || buf.readUInt32LE(e) !== 0x06054b50) throw bad()
  const n = buf.readUInt16LE(e + 10)
  if (n > MAX_ENTRIES) throw fail(400, 'the package has too many files')
  let p = buf.readUInt32LE(e + 16),
    total = 0
  const out = []
  for (let i = 0; i < n; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw bad()
    const flags = buf.readUInt16LE(p + 8),
      method = buf.readUInt16LE(p + 10),
      csize = buf.readUInt32LE(p + 20),
      usize = buf.readUInt32LE(p + 24),
      nl = buf.readUInt16LE(p + 28),
      xl = buf.readUInt16LE(p + 30),
      cl = buf.readUInt16LE(p + 32),
      off = buf.readUInt32LE(p + 42),
      name = buf.toString('utf8', p + 46, p + 46 + nl)
    p += 46 + nl + xl + cl
    if (flags & 1) throw fail(400, 'encrypted packages aren’t supported')
    if (name.endsWith('/')) continue
    if ((total += usize) > MAX_UNPACKED) throw fail(400, 'the package unpacks to more than 1 GB')
    if (method !== 0 && method !== 8) throw fail(400, 'the package uses an unsupported compression')
    out.push({
      name,
      data() {
        if (off + 30 > buf.length || buf.readUInt32LE(off) !== 0x04034b50) throw bad()
        const s = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28)
        if (s + csize > buf.length) throw bad()
        const raw = buf.subarray(s, s + csize)
        let d
        try {
          d = method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: usize + 1 })
        } catch {
          throw bad()
        }
        if (d.length !== usize) throw bad()
        return d
      },
    })
  }
  return out
}

/** Move every non-private entry of dir aside, then the staged entries in; on any failure put everything back, then rethrow. */
export async function swapIn(dir, stage, aside, mv = rename) {
  const moved = [],
    placed = []
  try {
    for (const name of await readdir(dir)) {
      if (PRIVATE.has(name)) continue
      await mkdir(aside, { recursive: true })
      await mv(join(dir, name), join(aside, name))
      moved.push(name)
    }
    for (const name of await readdir(stage)) {
      await mv(join(stage, name), join(dir, name))
      placed.push(name)
    }
  } catch (err) {
    // ponytail: best-effort restore; a failing restore leaves the remainder in aside (nothing is deleted)
    for (const name of placed.reverse()) await rename(join(dir, name), join(stage, name)).catch(() => {})
    for (const name of moved.reverse()) await rename(join(aside, name), join(dir, name)).catch(() => {})
    throw err
  }
}

/** True for loopback, link-local, private, ULA and unspecified addresses (v4, v6, v4-mapped). */
export function isInternalIp(ip) {
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  const h = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip) // URL parsing turns ::ffff:1.2.3.4 into hex
  if (m) ip = m[1]
  else if (h) ip = [parseInt(h[1], 16) >> 8, parseInt(h[1], 16) & 255, parseInt(h[2], 16) >> 8, parseInt(h[2], 16) & 255].join('.')
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  const l = ip.toLowerCase()
  return l === '::' || l === '::1' || /^f[cd]/.test(l) || /^fe[89ab]/.test(l)
}

/** layout, version (app). Returns { list, setEnabled, install, installUrl, MAX_ZIP }. */
export function systemsApi({ layout, version }) {
  const live = layout.kind === 'data'
  const dirOf = game => layout.games[game].custom
  const fileOf = game => join(dirOf(game), 'system.json')
  const must = disk => {
    if (!live) throw fail(409, 'game systems need the Data folder layout')
    const game = Object.keys(DISK).find(g => DISK[g] === disk)
    if (!game) throw fail(404, 'unknown system')
    return game
  }

  async function count(dir, pred) {
    let n = 0
    for (const e of await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => [])) if (e.isFile() && pred(e)) n++
    return n
  }
  const hasData = async dir => (await readdir(dir).catch(() => [])).some(f => f !== 'system.json')
  const defaults = game => ({
    id: DISK[game],
    title: TITLE[DISK[game]],
    version,
    compatibility: { minCore: version, verifiedCore: version },
    provides: PROVIDES,
    enabled: true,
  })

  /** The manifest on disk, else the default (written first when the system has data). */
  async function manifest(game) {
    try {
      const m = JSON.parse(await readFile(fileOf(game), 'utf8'))
      if (m && typeof m === 'object' && !Array.isArray(m)) return { ...defaults(game), ...m, id: DISK[game], enabled: m.enabled !== false }
    } catch {
      /* missing or unreadable: the default */
    }
    const m = defaults(game)
    if (await hasData(dirOf(game))) await writeAtomic(fileOf(game), JSON.stringify(m, null, 2) + '\n').catch(() => {})
    return m
  }

  async function status(game) {
    const imp = join(dirOf(game), 'imported')
    return {
      coreImported: (await count(join(imp, 'core'), () => true)) > 0,
      books: (await readdir(layout.games[game].library, { withFileTypes: true }).catch(() => [])).filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .length,
      catalog: await count(imp, e => e.name.endsWith('.xml')),
    }
  }

  async function list() {
    if (!live) return []
    const out = []
    for (const game of Object.keys(DISK)) {
      const created = !!(await stat(dirOf(game)).catch(() => null))
      out.push({ ...(await manifest(game)), game, status: created ? 'installed' : 'not created yet', ...(await status(game)) })
    }
    return out
  }

  async function setEnabled(disk, enabled) {
    const game = must(disk)
    if (typeof enabled !== 'boolean') throw fail(400, 'send { enabled: true|false }')
    await mkdir(dirOf(game), { recursive: true })
    await writeAtomic(fileOf(game), JSON.stringify({ ...(await manifest(game)), enabled }, null, 2) + '\n')
    return list()
  }

  /** Validate a package zip and put it in place; the old tree is moved aside. */
  async function install(disk, buf) {
    const game = must(disk)
    if (buf.length > MAX_ZIP) throw fail(413, 'the package is larger than 200 MB')
    if (buf.subarray(0, 4).toString('latin1') !== 'PK\x03\x04') throw fail(415, 'this file isn’t a system package (not a zip file)')
    const files = readZip(buf)
    for (const f of files) {
      const parts = f.name.split('/')
      if (f.name.includes('\\') || /^[A-Za-z]:/.test(f.name) || parts.some(s => s === '..' || s === '' || s === '.'))
        throw fail(400, 'the package has an unsafe file name')
      if (PRIVATE.has(parts[0])) throw fail(400, `the package may not carry ${parts[0]}/ (account data)`)
      if (parts[0] === '_to_delete') throw fail(400, 'the package may not carry _to_delete/')
    }
    const mf = files.find(f => f.name === 'system.json')
    if (!mf) throw fail(400, 'not a system package: system.json is missing at its root')
    let m
    try {
      m = JSON.parse(mf.data().toString('utf8'))
    } catch {
      throw fail(400, 'system.json isn’t valid JSON')
    }
    if (!m || m.id !== disk) throw fail(400, `this package is for ${String(m?.id).slice(0, 40)}, not ${disk}`)
    if (!semver(m.version)) throw fail(400, 'system.json: version must look like 1.2.3')
    const min = m.compatibility?.minCore
    if (min !== undefined && (!semver(min) || cmp(min, version) > 0))
      throw fail(409, `this package needs core ${String(min).slice(0, 20)} or newer; this is ${version}`)

    const dir = dirOf(game),
      stage = join(layout.backups, `.install-${randomBytes(6).toString('hex')}`)
    await mkdir(stage, { recursive: true })
    try {
      for (const f of files) {
        const to = join(stage, ...f.name.split('/'))
        await mkdir(dirname(to), { recursive: true })
        await writeFile(to, f.data(), { flag: 'wx' })
      }
      await mkdir(dir, { recursive: true })
      await swapIn(dir, stage, join(layout.root, '_to_delete', new Date().toISOString().replace(/[:.]/g, '-'), disk))
    } finally {
      await rm(stage, { recursive: true, force: true }) // our own temp folder
    }
    return list()
  }

  async function installUrl(disk, url) {
    must(disk)
    let u
    try {
      u = new URL(url)
    } catch {
      throw fail(400, 'that isn’t a web address')
    }
    // every hop is checked (GitHub release links redirect, and a redirect must not reach the LAN).
    // ponytail: DNS could still change between the lookup and the fetch; pin the vetted address if this ever faces untrusted admins
    let r
    for (let hops = 0; ; hops++) {
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw fail(400, 'only http(s) addresses work')
      try {
        const host = u.hostname.replace(/^\[|\]$/g, '')
        const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
        if (addrs.some(a => isInternalIp(a.address))) throw fail(400, 'that address points to this machine or a private network')
      } catch (e) {
        throw e.code ? e : fail(502, 'couldn’t look up that address')
      }
      try {
        r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(120000) })
      } catch {
        throw fail(502, 'couldn’t download the package')
      }
      const to = r.status >= 300 && r.status < 400 && r.headers.get('location')
      if (!to) break
      if (hops === 5) throw fail(502, 'too many redirects')
      u = new URL(to, u)
    }
    if (!r.ok) throw fail(502, `the download failed (${r.status})`)
    if (Number(r.headers.get('content-length')) > MAX_ZIP) throw fail(413, 'the package is larger than 200 MB')
    const chunks = []
    let size = 0
    for await (const c of r.body) {
      if ((size += c.length) > MAX_ZIP) throw fail(413, 'the package is larger than 200 MB')
      chunks.push(c)
    }
    return install(disk, Buffer.concat(chunks))
  }

  return { list, setEnabled, install, installUrl, MAX_ZIP }
}
