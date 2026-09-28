// Chummer Anarchy 2.0 server: serves the built app and stores runners as XML files, one folder per account
// (characters/<username>/, deleted ones in its .trash/). No dependencies. Accounts, sessions and the role table:
// server/auth.mjs; every /api route but health, sign-in, setup and /api/auth/me needs a session, and so does /custom/.
//
//   GET    /api/health                   -> { ok, storage: "server" }
//   GET    /api/characters               -> [{ file, rev, xml, owner }] the caller's runners; admin and editors: everyone's
//                                           (owner: the username). PUT and DELETE act on the caller's own only (403 on
//                                           a runner id another account holds)
//   PUT    /api/characters/:id           body: character XML
//          If-Match: <rev>                  refuse with 409 if the stored file has moved on
//          ?force=1                         overwrite anyway
//          ?filename=<name>                 file name for a new runner (else from the street name)
//   DELETE /api/characters/:id           moves the file to .trash/ (never hard-deletes)
//   /api/auth/*, /api/setup*, /api/users* accounts (server/auth.mjs)
//   /api/books, /api/review, /api/ai-*, /api/edits, /api/backup, /api/restore, /api/datapack   the PDF importer, catalog
//                                        edits, backup and restore, data packs (server/books.mjs); LIBRARY_DIR is never served
//   /custom/*                            house-rule overlays from CUSTOM_DIR
//   everything else                      the built app (STATIC_DIR)
import { createServer as httpServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rmdir, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { authApi } from './auth.mjs'
import { booksApi } from './books.mjs'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.xsd': 'application/xml' }
const MAX_BODY = 5 * 1024 * 1024
const ID = /^[A-Za-z0-9._-]{1,80}$/

const rootAttr = (xml, name) => xml.match(new RegExp(`<ca2:character\\b[^>]*\\s${name}="([^"]*)"`))?.[1]
const slug = s => (s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'runner'
const fail = (code, message) => Object.assign(new Error(message), { code })

function setRev(xml, rev) {
  return xml.replace(/<ca2:character\b[^>]*>/, tag =>
    /\srev="[^"]*"/.test(tag) ? tag.replace(/\srev="[^"]*"/, ` rev="${rev}"`) : tag.replace(/\sid="/, ` rev="${rev}" id="`))
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..') // where `python -m importer` runs
const inside = (path, dir) => path === dir || path.startsWith(dir + sep)
// the app version for backups: VERSION (written by the Dockerfile, which ships no package.json), else package.json
const VERSION = (() => {
  try { return readFileSync(join(ROOT, 'VERSION'), 'utf8').trim() } catch { /* not in the image */ }
  try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version } catch { return 'unknown' }
})()

export function createServer({ staticDir, charDir, customDir, libraryDir, python = 'python3', restoreTtl, downloadTtl, trustProxy = '' }) {
  staticDir = resolve(staticDir); charDir = resolve(charDir); customDir = resolve(customDir)
  libraryDir = resolve(libraryDir ?? join(charDir, '..', 'library'))
  let auth = null
  const books = booksApi({ charDir, customDir, libraryDir, python, importerRoot: ROOT, version: VERSION, restoreTtl, downloadTtl,
    onRestore: () => auth.reload() })
  // runner writes, and the account changes that move runner folders: one at a time
  // ponytail: one lock for every account's runners; per-folder locks if saves ever queue up
  let chain = Promise.resolve()
  const lock = fn => { const run = chain.then(fn); chain = run.catch(() => {}); return run }
  const folder = username => join(charDir, username) // auth.mjs's USERNAME: no separators, never starts with a dot

  async function index(dir) {
    const out = []
    for (const file of (await readdir(dir).catch(() => [])).filter(f => f.endsWith('.xml'))) {
      const xml = await readFile(join(dir, file), 'utf8')
      out.push({ file, id: rootAttr(xml, 'id'), rev: Number(rootAttr(xml, 'rev') ?? 0), xml })
    }
    return out
  }

  async function freeName(dir, base) {
    const taken = new Set((await readdir(dir).catch(() => [])).map(f => f.toLowerCase()))
    for (let i = 1; ; i++) {
      const name = `${base}${i > 1 ? `-${i}` : ''}.xml`
      if (!taken.has(name.toLowerCase())) return name
    }
  }
  const exists = path => stat(path).then(() => true, () => false)
  const base = file => file.replace(/\.xml$/, '')
  /** Every file of the folder `from` into `to`, each under a free name there (prefixed). */
  async function moveAll(from, to, prefix = '') {
    const files = (await readdir(from, { withFileTypes: true }).catch(() => [])).filter(d => d.isFile())
    if (files.length) await mkdir(to, { recursive: true })
    for (const f of files) await rename(join(from, f.name), join(to, await freeName(to, prefix + base(f.name))))
  }
  /** Runner folders for auth.mjs, which calls these under `lock`. */
  const runners = {
    count: async u => (await readdir(folder(u)).catch(() => [])).filter(f => f.endsWith('.xml')).length,
    async rename(from, to) {
      if (!await exists(folder(from))) return
      if (await exists(folder(to))) throw fail(409, `characters/${to} already exists; move it away first`)
      await rename(folder(from), folder(to))
    },
    /** The upgrade: runners at the top of characters/ (and its .trash/) from before accounts go to the first admin. */
    async adopt(u) {
      const top = (await readdir(charDir, { withFileTypes: true }).catch(() => [])).filter(d => d.isFile() && d.name.endsWith('.xml'))
      if (top.length) await mkdir(folder(u), { recursive: true })
      for (const f of top) await rename(join(charDir, f.name), join(folder(u), await freeName(folder(u), base(f.name))))
      await moveAll(join(charDir, '.trash'), join(folder(u), '.trash'))
      await rmdir(join(charDir, '.trash')).catch(() => {})
    },
    async move(from, file, to) {
      if (!await exists(join(folder(from), file))) throw fail(404, 'no such runner')
      await mkdir(folder(to), { recursive: true })
      const name = await freeName(folder(to), base(file))
      await rename(join(folder(from), file), join(folder(to), name))
      return name
    },
    /** A deleted account (no runners left): its trash goes to characters/.trash/, named after it; then its folder goes. */
    async retire(u) {
      await moveAll(join(folder(u), '.trash'), join(charDir, '.trash'), `${u}-`)
      await rmdir(join(folder(u), '.trash')).catch(() => {})
      await rmdir(folder(u)).catch(() => {})
    },
  }
  auth = authApi({ libraryDir, trustProxy, lock, track: books.track, runners })

  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
    res.end(type === 'application/json' ? JSON.stringify(body) : body)
  }

  async function readBody(req) {
    const chunks = []
    let size = 0
    for await (const c of req) {
      size += c.length
      if (size > MAX_BODY) throw Object.assign(new Error('file too large'), { code: 413 })
      chunks.push(c)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  async function serveFile(res, base, rel) {
    const path = resolve(base, '.' + rel)
    if (!inside(path, base)) return send(res, 403, { error: 'forbidden' })
    if (inside(path, libraryDir)) return null // even when the Library is mounted inside a served folder
    try {
      const s = await stat(path)
      if (s.isDirectory()) return serveFile(res, base, rel.replace(/\/?$/, '/index.html'))
      const ext = extname(path)
      res.writeHead(200, { 'Content-Type': TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
      res.end(await readFile(path))
    } catch {
      return null
    }
    return true
  }

  async function api(req, res, url, who) {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, storage: 'server' })
    if (await auth.handle(req, res, url, send, who) !== false) return
    if (await books.handle(req, res, url, send, who) !== false) return
    if (url.pathname === '/api/characters' && req.method === 'GET') {
      const owners = [who.username, ...(who.role === 'player' ? [] : auth.usernames().filter(u => u !== who.username))]
      const out = []
      for (const owner of owners) for (const { file, rev, xml } of await index(folder(owner))) out.push({ file, rev, xml, owner })
      return send(res, 200, out)
    }
    const m = url.pathname.match(/^\/api\/characters\/([^/]+)$/)
    if (!m) return send(res, 404, { error: 'not found' })
    const id = decodeURIComponent(m[1])
    if (!ID.test(id)) return send(res, 400, { error: 'bad id' })
    if (req.method !== 'DELETE' && req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
    const xml = req.method === 'PUT' ? await readBody(req) : null
    if (xml != null && (!/<ca2:character\b[^>]*xmlns:ca2="urn:chummer-anarchy2:character:1"/.test(xml) || rootAttr(xml, 'id') !== id))
      return send(res, 400, { error: 'body is not a character file for this id' })
    const dir = folder(who.username)
    return lock(async () => {
      const existing = (await index(dir)).find(c => c.id === id)
      if (!existing) for (const u of auth.usernames())
        if (u !== who.username && (await index(folder(u))).some(c => c.id === id))
          return send(res, 403, { error: 'this runner belongs to another account; only its owner can change it' })
      if (req.method === 'DELETE') {
        if (!existing) return send(res, 404, { error: 'no such runner' })
        await mkdir(join(dir, '.trash'), { recursive: true })
        await rename(join(dir, existing.file), join(dir, '.trash', `${base(existing.file)}-${Date.now()}.xml`))
        res.writeHead(204).end()
        return
      }
      const ifMatch = req.headers['if-match']
      if (existing && url.searchParams.get('force') !== '1' && String(existing.rev) !== String(ifMatch ?? ''))
        return send(res, 409, { error: 'conflict', rev: existing.rev, file: existing.file, updatedAt: rootAttr(existing.xml, 'updatedAt') })
      const rev = (existing?.rev ?? 0) + 1
      await mkdir(dir, { recursive: true })
      const file = existing?.file ?? await freeName(dir, slug(url.searchParams.get('filename') || rootAttr(xml, 'streetName') || rootAttr(xml, 'name')))
      const tmp = join(dir, `.${file}.tmp`)
      await writeFile(tmp, setRev(xml, rev), 'utf8')
      await rename(tmp, join(dir, file))
      return send(res, existing ? 200 : 201, { rev, file })
    })
  }

  const server = httpServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x')
      if (url.pathname.startsWith('/api/')) {
        const who = auth.gate(req, res, url, send) // the Origin check and the role table
        if (who === false) return
        // every write except backup and restore themselves is counted for its whole life: a restore waits for it, and it
        // is refused while a restore runs
        return await (req.method === 'GET' || /^\/api\/(backup|restore)(\/|$)/.test(url.pathname)
          ? api(req, res, url, who) : books.track(() => api(req, res, url, who)))
      }
      if (url.pathname.startsWith('/custom/')) { // imported book data: signed-in users only
        if (!auth.session(req, res)) return send(res, 401, 'sign in first', 'text/plain')
        if (await serveFile(res, customDir, url.pathname.slice('/custom'.length))) return
        return send(res, 404, 'not found', 'text/plain')
      }
      if (await serveFile(res, staticDir, url.pathname)) return
      if (!extname(url.pathname) && await serveFile(res, staticDir, '/index.html')) return // SPA
      send(res, 404, 'not found', 'text/plain')
    } catch (e) {
      if (res.headersSent) return res.destroy()
      const code = [400, 401, 403, 404, 409, 413, 415, 429, 502].includes(e.code) ? e.code : 500
      send(res, code, { error: code === 500 ? 'server error' : e.message })
      if (code === 500) console.error(e.stack) // never a request body
    }
  })
  server.requestTimeout = 3600 * 1000 // a 20 GB backup upload over a slow network (Node's default is 5 min)
  server.stopJobs = () => { books.stop(); auth.stop() }
  server.started = books.started // the start-up checks (interrupted jobs, core data re-import) have queued their jobs
  return server
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 80)
  const server = createServer({
    staticDir: process.env.STATIC_DIR ?? new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
    charDir: process.env.CHAR_DIR ?? '/data/characters',
    customDir: process.env.CUSTOM_DIR ?? '/data/custom',
    libraryDir: process.env.LIBRARY_DIR ?? '/data/library',
    python: process.env.PYTHON ?? 'python3',
    trustProxy: process.env.TRUST_PROXY ?? '', // comma-separated IPs or CIDRs of the reverse proxy
  })
  server.listen(port, () => console.log(`chummer-anarchy2 on :${port}`))
  // docker stop: end the importer job too (the next start marks its book interrupted); sessions.xml is saved
  const quit = () => { server.stopJobs(); server.close(); setTimeout(() => process.exit(0), 2000).unref() }
  process.on('SIGTERM', quit)
  process.on('SIGINT', quit)
}
