// Books API: PDF uploads into the Library, one importer job at a time, AI settings and the review queue.
// The server only moves requests and spawns `python -m importer …` (argument arrays, no shell); every
// data file is written by the importer, except upload.xml (the uploaded name), ai-providers.xml
// (the user's choices, as sent) and a failed job's status.xml.
//
//   POST   /api/books                 body: the PDF (application/pdf, X-Filename) -> 202 { id }, queues an import
//   GET    /api/books                 -> [{ id, file, state, message, source, name, canon, recipe, imported, counts, busy }]
//   GET    /api/books/:id/report      -> import.xml
//   POST   /api/books/:id/reimport    clears the book's outputs, then imports again
//   DELETE /api/books/:id[?files=1]   clears the book's outputs (files=1: also its Library folder)
//   POST   /api/books/:id/ai[?dryRun=1]  AI proposals for a needs-ai book (dryRun: { parts, provider }, sends nothing)
//   GET    /api/review/:id            -> review.xml
//   PUT    /api/review/:id            body: review.xml with decisions; ?apply=1&source=&name=&canon= writes the overlay
//   GET    /api/ai-settings           -> ai-providers.xml plus <key provider set="true|false"/> (never a key)
//   PUT    /api/ai-settings           body: ai-providers.xml
//   PUT    /api/ai-keys               body: <key provider="…">…</key> elements; each is stored, an empty one removed
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'

const MAX_PDF = 500 * 1024 * 1024
const MAX_XML = 5 * 1024 * 1024
const JOB_TIMEOUT = 6 * 3600 * 1000 // ponytail: one cap for all jobs; an AI run over a big book takes hours (it resumes if cut)
const BOOK_ID = /^[a-z0-9][a-z0-9-]{0,40}$/
const SOURCE_ID = /^[A-Z][A-Z0-9-]{0,19}$/
const PROVIDERS = ['anthropic', 'openai', 'gemini', 'anythingllm']
const CONFIG_NS = 'urn:chummer-anarchy2:config:1'

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
// eslint-disable-next-line no-control-regex
const clean = s => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
const attr = (tag, name) => { const v = tag?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]; return v == null ? undefined : unesc(v) }
const rootTag = (xml, name) => xml?.match(new RegExp(`<${name}\\b[^>]*>`))?.[0]
const readOr = (path, fallback = null) => readFile(path, 'utf8').catch(() => fallback)
const fail = (code, message) => Object.assign(new Error(message), { code })

/** The uploaded file name without any path, safe to show and pass as an argument. */
export function safeName(header) {
  let name = String(header || '')
  try { name = decodeURIComponent(name) } catch { /* keep as sent */ }
  name = clean(name.split(/[\\/]/).pop()).replace(/[^\p{L}\p{N} ._()'&,+-]/gu, '_').replace(/^[\s.-]+/, '').trim().slice(-120)
  return name || 'book.pdf'
}

async function writeAtomic(path, text) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, text, { encoding: 'utf8', flag: 'wx' })
  await rename(tmp, path)
}

export function booksApi({ customDir, libraryDir, python = 'python3', importerRoot }) {
  const [cmd, ...pre] = [].concat(python)
  const config = join(libraryDir, '.config')
  const queue = []
  let running = null

  const bookDir = id => {
    if (!BOOK_ID.test(id)) throw fail(400, 'bad book id')
    return join(libraryDir, id)
  }
  const busy = id => running?.id === id || queue.some(j => j.id === id)

  /** Keys, bearer tokens and key-looking strings out of worker output before it reaches status.xml. */
  async function redact(text) {
    const keys = [...(await readOr(join(config, 'ai-keys.xml'), '')).matchAll(/<key\b[^>]*>([^<]+)<\/key>/g)].map(m => unesc(m[1]).trim())
    for (const k of keys.filter(k => k.length >= 4)) text = text.split(k).join('[key]')
    return text.replace(/\b(sk-|AIza|xai-|gsk_)[\w-]{6,}/g, '[key]').replace(/(Bearer|x-api-key:?|api[_-]?key[=:])\s*\S+/gi, '$1 [key]')
  }

  function importer(args, { input, timeout = JOB_TIMEOUT } = {}) {
    return new Promise(done => {
      let out = '', err = ''
      const p = spawn(cmd, [...pre, '-m', 'importer', ...args], { cwd: importerRoot, timeout, windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'] })
      p.stdout.on('data', d => { out = (out + d).slice(-65536) })
      p.stderr.on('data', d => { err = (err + d).slice(-4000) })
      p.on('error', e => { err += e.message })
      p.on('close', (code, signal) => done({ code: code ?? -1, signal, out, err: signal ? `${err}\nstopped (${signal}, after ${timeout / 1000}s at most)` : err }))
      p.stdin.on('error', () => {})
      p.stdin.end(input ?? '')
    })
  }

  async function setStatus(id, state, message = '') {
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n<status state="${state}" updated="${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}">${esc(clean(message))}</status>\n`
    await writeAtomic(join(libraryDir, id, 'status.xml'), text).catch(() => {}) // the folder may be gone (delete with files)
  }

  function enqueue(id, steps) {
    queue.push({ id, steps })
    pump()
  }

  async function pump() {
    if (running || !queue.length) return
    running = queue.shift()
    try {
      for (const args of running.steps) {
        const r = await importer(args)
        if (r.code === 0) continue
        const st = attr(rootTag(await readOr(join(libraryDir, running.id, 'status.xml')), 'status'), 'state')
        const why = (await redact(r.err)).trim().split('\n').slice(-12).join('\n')
        // the importer records its own failures cleanly; anything else (crash, timeout, no Python) is ours to report
        if (st !== 'failed' || r.signal) await setStatus(running.id, 'failed', why || `the importer stopped with exit code ${r.code}`)
        break
      }
    } finally {
      running = null
      pump()
    }
  }

  async function book(id) {
    const dir = join(libraryDir, id)
    const [imp, status, upload] = await Promise.all(['import.xml', 'status.xml', 'upload.xml'].map(f => readOr(join(dir, f))))
    const it = rootTag(imp, 'import'), st = rootTag(status, 'status')
    const counts = Object.fromEntries([...(imp ?? '').matchAll(/<file\b[^>]*>/g)].map(m => [attr(m[0], 'name'), Number(attr(m[0], 'entries'))]))
    return {
      id, file: attr(rootTag(upload, 'upload'), 'file') ?? attr(it, 'file'), state: busy(id) && running?.id !== id ? 'queued' : attr(st, 'state') ?? 'queued',
      message: status ? unesc(status.replace(/^[\s\S]*?<status\b[^>]*>|<\/status>[\s\S]*$/g, '')) : '',
      source: attr(it, 'source'), name: attr(it, 'name'), canon: attr(it, 'canon') === undefined ? undefined : attr(it, 'canon') === 'true',
      recipe: attr(it, 'recipe'), imported: attr(it, 'imported'), counts, busy: busy(id),
    }
  }

  async function body(req, max = MAX_XML) {
    const chunks = []
    let size = 0
    for await (const c of req) {
      if ((size += c.length) > max) throw fail(413, 'file too large')
      chunks.push(c)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  /** One XML document from a client: no DTD (entity expansion), the expected root. */
  const xmlBody = (text, root) => {
    if (/<!DOCTYPE|<!ENTITY/i.test(text) || !new RegExp(`^\\s*(<\\?xml[^>]*\\?>\\s*)?(<!--[\\s\\S]*?-->\\s*)*<${root}[\\s>/]`).test(text))
      throw fail(400, `body is not a ${root} document`)
    return text
  }

  async function upload(req, res, send) {
    if (!/^application\/pdf\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'only PDF files can be uploaded' })
    if (Number(req.headers['content-length']) > MAX_PDF) {
      res.setHeader('Connection', 'close')
      return send(res, 413, { error: 'the file is larger than 500 MB' })
    }
    const id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
    const dir = join(libraryDir, id), file = safeName(req.headers['x-filename'])
    await mkdir(dir, { recursive: true })
    const sha = createHash('sha256')
    let size = 0
    try {
      await pipeline(req, async function* (src) {
        for await (const c of src) {
          if ((size += c.length) > MAX_PDF) throw fail(413, 'the file is larger than 500 MB')
          sha.update(c)
          yield c
        }
      }, createWriteStream(join(dir, 'original.pdf'), { flags: 'wx' }))
      const fh = await open(join(dir, 'original.pdf'))
      const head = Buffer.alloc(5)
      await fh.read(head, 0, 5, 0).finally(() => fh.close())
      if (head.toString('latin1') !== '%PDF-') throw fail(415, 'this file is not a PDF')
    } catch (e) {
      await rm(dir, { recursive: true, force: true })
      if (e.code === 413) res.setHeader('Connection', 'close')
      return send(res, typeof e.code === 'number' ? e.code : 500, { error: e.code === 413 || e.code === 415 ? e.message : 'upload failed' })
    }
    await writeAtomic(join(dir, 'upload.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<upload file="${esc(file)}" size="${size}" sha256="${sha.digest('hex')}" uploaded="${new Date().toISOString()}"/>\n`)
    await setStatus(id, 'queued')
    enqueue(id, [['run', dir, '--custom', customDir, '--file', file]])
    return send(res, 202, { id })
  }

  async function aiSettings() {
    const xml = (await readOr(join(config, 'ai-providers.xml'), `<ca2:aiproviders xmlns:ca2="${CONFIG_NS}" version="1"/>`))
      .replace(/^\s*<\?xml[^>]*\?>\s*/, '').trim()
    const keys = await readOr(join(config, 'ai-keys.xml'), '')
    const set = p => new RegExp(`<key\\s+provider="${p}"\\s*>\\s*[^<\\s]`).test(keys)
    const summary = PROVIDERS.map(p => `  <key provider="${p}" set="${set(p)}"/>\n`).join('')
    const out = /\/>$/.test(xml) && !/<\/ca2:aiproviders>$/.test(xml)
      ? xml.replace(/\s*\/>$/, `>\n${summary}</ca2:aiproviders>`)
      : xml.replace(/<\/ca2:aiproviders>$/, `${summary}</ca2:aiproviders>`)
    return `<?xml version="1.0" encoding="UTF-8"?>\n${out}\n`
  }

  // never log or echo this route's body: it holds API keys
  async function putKeys(req) {
    const text = await body(req, 64 * 1024)
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw fail(400, 'bad keys document')
    const keys = [...text.matchAll(/<key\s+provider="([a-z]+)"\s*(?:\/>|>([^<]*)<\/key>)/g)].filter(m => PROVIDERS.includes(m[1]))
    if (!keys.length) throw fail(400, 'no <key provider="…"> for a known provider')
    for (const [, provider, value = ''] of keys) {
      const r = await importer(['set-key', libraryDir, provider], { input: unesc(value).trim(), timeout: 30000 })
      if (r.code !== 0) throw fail(500, 'couldn’t store the key: ' + (await redact(r.err)).trim().split('\n').pop())
    }
  }

  async function handle(req, res, url, send) {
    const p = url.pathname, method = req.method
    if (p === '/api/books' && method === 'POST') return upload(req, res, send)
    if (p === '/api/books' && method === 'GET') {
      await mkdir(libraryDir, { recursive: true })
      const ids = (await readdir(libraryDir, { withFileTypes: true })).filter(d => d.isDirectory() && BOOK_ID.test(d.name)).map(d => d.name).sort()
      return send(res, 200, await Promise.all(ids.map(book)))
    }
    if (p === '/api/ai-settings' && method === 'GET') return send(res, 200, await aiSettings(), 'application/xml; charset=utf-8')
    if (p === '/api/ai-settings' && method === 'PUT') {
      const xml = xmlBody(await body(req), 'ca2:aiproviders')
      if (!xml.includes(`xmlns:ca2="${CONFIG_NS}"`) || /<key\b/.test(xml)) throw fail(400, 'provider settings only; keys go to /api/ai-keys')
      await mkdir(config, { recursive: true })
      await writeAtomic(join(config, 'ai-providers.xml'), xml)
      return send(res, 204, '', 'text/plain')
    }
    if (p === '/api/ai-keys' && method === 'PUT') {
      await putKeys(req)
      return send(res, 204, '', 'text/plain')
    }

    const m = p.match(/^\/api\/(books|review)\/([^/]+)(?:\/(report|reimport|ai))?$/)
    if (!m) return false
    const [, area, rawId, action] = m
    let id
    try { id = decodeURIComponent(rawId) } catch { throw fail(400, 'bad book id') }
    const dir = bookDir(id)
    const status = await readOr(join(dir, 'status.xml'))
    const hasUpload = await readOr(join(dir, 'upload.xml')) ?? await readOr(join(dir, 'import.xml'))
    if (status == null && hasUpload == null) return send(res, 404, { error: 'no such book' })
    const imp = rootTag(await readOr(join(dir, 'import.xml')), 'import')
    const state = attr(rootTag(status, 'status'), 'state')
    const needsQuiet = () => { if (busy(id)) throw fail(409, 'this book is busy; wait for it to finish') }

    if (area === 'review') {
      if (method === 'GET') {
        const xml = await readOr(join(dir, 'review.xml'))
        return xml == null ? send(res, 404, { error: 'no proposals for this book' }) : send(res, 200, xml, 'application/xml; charset=utf-8')
      }
      if (method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
      needsQuiet()
      const q = url.searchParams, apply = q.get('apply') === '1'
      const source = q.get('source') ?? '', name = (q.get('name') ?? '').trim(), canon = q.get('canon')
      if (apply && (!SOURCE_ID.test(source) || !name || name.length > 120 || !['true', 'false'].includes(canon)))
        throw fail(400, 'apply needs source (A–Z, 0–9, -), name and canon=true|false')
      if (await readOr(join(dir, 'review.xml')) == null) return send(res, 404, { error: 'no proposals for this book' })
      await writeAtomic(join(dir, 'review.xml'), xmlBody(await body(req), 'review'))
      if (!apply) return send(res, 204, '', 'text/plain')
      await setStatus(id, 'queued')
      enqueue(id, [['apply-review', dir, '--custom', customDir, '--source', source, '--name', clean(name), '--canon', canon]])
      return send(res, 202, { id })
    }

    if (action === 'report' && method === 'GET')
      return imp ? send(res, 200, await readFile(join(dir, 'import.xml'), 'utf8'), 'application/xml; charset=utf-8') : send(res, 404, { error: 'not imported yet' })
    if (action === 'reimport' && method === 'POST') {
      needsQuiet()
      const file = attr(imp, 'file') ?? attr(rootTag(hasUpload, 'upload'), 'file')
      await setStatus(id, 'queued')
      enqueue(id, [['remove', dir, '--custom', customDir], ['run', dir, '--custom', customDir, ...(file ? ['--file', file] : [])]])
      return send(res, 202, { id })
    }
    if (action === 'ai' && method === 'POST') {
      needsQuiet()
      if (attr(imp, 'source') || !['needs-ai', 'failed', 'review'].includes(state))
        throw fail(409, 'AI proposals are for books no recipe knows')
      const args = ['propose', dir, '--library', libraryDir]
      if (url.searchParams.get('dryRun') === '1') {
        const r = await importer([...args, '--dry-run'], { timeout: 120000 })
        const res0 = rootTag(r.out, 'result')
        if (r.code !== 0 || !res0) throw fail(500, 'couldn’t count the parts: ' + (await redact(r.err)).trim().split('\n').pop())
        return send(res, 200, { parts: Number(attr(res0, 'parts')), provider: attr(res0, 'provider') || null })
      }
      await setStatus(id, 'queued')
      enqueue(id, [args])
      return send(res, 202, { id })
    }
    if (!action && method === 'DELETE') {
      needsQuiet()
      await setStatus(id, 'queued')
      enqueue(id, [['remove', dir, '--custom', customDir, ...(url.searchParams.get('files') === '1' ? ['--files'] : [])]])
      return send(res, 202, { id })
    }
    return send(res, 405, { error: 'method not allowed' })
  }

  return { handle, libraryDir: resolve(libraryDir) }
}
