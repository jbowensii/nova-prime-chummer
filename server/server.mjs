// Chummer Anarchy 2.0 server: serves the built app and stores runners as XML files.
// No dependencies. LAN use, no login (see docs/deploy-tower04.md).
//
//   GET    /api/health                   -> { ok, storage: "server" }
//   GET    /api/characters               -> [{ file, rev, xml }]
//   PUT    /api/characters/:id           body: character XML
//          If-Match: <rev>                  refuse with 409 if the stored file has moved on
//          ?force=1                         overwrite anyway
//          ?filename=<name>                 file name for a new runner (else from the street name)
//   DELETE /api/characters/:id           moves the file to .trash/ (never hard-deletes)
//   /api/books, /api/review, /api/ai-*, /api/edits   the PDF importer and catalog edits (server/books.mjs); LIBRARY_DIR is never served
//   /custom/*                            house-rule overlays from CUSTOM_DIR
//   everything else                      the built app (STATIC_DIR)
import { createServer as httpServer } from 'node:http'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { booksApi } from './books.mjs'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.xsd': 'application/xml' }
const MAX_BODY = 5 * 1024 * 1024
const ID = /^[A-Za-z0-9._-]{1,80}$/

const rootAttr = (xml, name) => xml.match(new RegExp(`<ca2:character\\b[^>]*\\s${name}="([^"]*)"`))?.[1]
const slug = s => (s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'runner'

function setRev(xml, rev) {
  return xml.replace(/<ca2:character\b[^>]*>/, tag =>
    /\srev="[^"]*"/.test(tag) ? tag.replace(/\srev="[^"]*"/, ` rev="${rev}"`) : tag.replace(/\sid="/, ` rev="${rev}" id="`))
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..') // where `python -m importer` runs
const inside = (path, dir) => path === dir || path.startsWith(dir + sep)

export function createServer({ staticDir, charDir, customDir, libraryDir, python = 'python3' }) {
  staticDir = resolve(staticDir); charDir = resolve(charDir); customDir = resolve(customDir)
  libraryDir = resolve(libraryDir ?? join(charDir, '..', 'library'))
  const books = booksApi({ customDir, libraryDir, python, importerRoot: ROOT })

  async function index() {
    await mkdir(charDir, { recursive: true })
    const out = []
    for (const file of (await readdir(charDir)).filter(f => f.endsWith('.xml'))) {
      const xml = await readFile(join(charDir, file), 'utf8')
      out.push({ file, id: rootAttr(xml, 'id'), rev: Number(rootAttr(xml, 'rev') ?? 0), xml })
    }
    return out
  }

  async function freeName(base) {
    const taken = new Set((await readdir(charDir)).map(f => f.toLowerCase()))
    for (let i = 1; ; i++) {
      const name = `${base}${i > 1 ? `-${i}` : ''}.xml`
      if (!taken.has(name.toLowerCase())) return name
    }
  }

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

  async function api(req, res, url) {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, storage: 'server' })
    if (await books.handle(req, res, url, send) !== false) return
    if (url.pathname === '/api/characters' && req.method === 'GET')
      return send(res, 200, (await index()).map(({ file, rev, xml }) => ({ file, rev, xml })))
    const m = url.pathname.match(/^\/api\/characters\/([^/]+)$/)
    if (!m) return send(res, 404, { error: 'not found' })
    const id = decodeURIComponent(m[1])
    if (!ID.test(id)) return send(res, 400, { error: 'bad id' })
    const existing = (await index()).find(c => c.id === id)

    if (req.method === 'DELETE') {
      if (!existing) return send(res, 404, { error: 'no such runner' })
      await mkdir(join(charDir, '.trash'), { recursive: true })
      await rename(join(charDir, existing.file), join(charDir, '.trash', `${existing.file.replace(/\.xml$/, '')}-${Date.now()}.xml`))
      res.writeHead(204).end()
      return
    }
    if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })

    const xml = await readBody(req)
    if (!/<ca2:character\b[^>]*xmlns:ca2="urn:chummer-anarchy2:character:1"/.test(xml) || rootAttr(xml, 'id') !== id)
      return send(res, 400, { error: 'body is not a character file for this id' })
    const ifMatch = req.headers['if-match']
    if (existing && url.searchParams.get('force') !== '1' && String(existing.rev) !== String(ifMatch ?? ''))
      return send(res, 409, { error: 'conflict', rev: existing.rev, file: existing.file, updatedAt: rootAttr(existing.xml, 'updatedAt') })
    const rev = (existing?.rev ?? 0) + 1
    const file = existing?.file ?? await freeName(slug(url.searchParams.get('filename') || rootAttr(xml, 'streetName') || rootAttr(xml, 'name')))
    const tmp = join(charDir, `.${file}.tmp`)
    await writeFile(tmp, setRev(xml, rev), 'utf8')
    await rename(tmp, join(charDir, file))
    return send(res, existing ? 200 : 201, { rev, file })
  }

  const server = httpServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x')
      if (url.pathname.startsWith('/api/')) return await api(req, res, url)
      if (url.pathname.startsWith('/custom/')) {
        if (await serveFile(res, customDir, url.pathname.slice('/custom'.length))) return
        return send(res, 404, 'not found', 'text/plain')
      }
      if (await serveFile(res, staticDir, url.pathname)) return
      if (!extname(url.pathname) && await serveFile(res, staticDir, '/index.html')) return // SPA
      send(res, 404, 'not found', 'text/plain')
    } catch (e) {
      if (res.headersSent) return res.destroy()
      const code = [400, 404, 409, 413, 415, 502].includes(e.code) ? e.code : 500
      send(res, code, { error: code === 500 ? 'server error' : e.message })
      if (code === 500) console.error(e.stack) // never a request body
    }
  })
  server.stopJobs = books.stop
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
  })
  server.listen(port, () => console.log(`chummer-anarchy2 on :${port}`))
  // docker stop: end the importer job too (the next start marks its book interrupted)
  const quit = () => { server.stopJobs(); server.close(); setTimeout(() => process.exit(0), 2000).unref() }
  process.on('SIGTERM', quit)
  process.on('SIGINT', quit)
}
