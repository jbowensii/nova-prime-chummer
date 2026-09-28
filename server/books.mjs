// Books API: PDF uploads into the Library, one importer job at a time, AI settings and the review queue.
// The server only moves requests and spawns `python -m importer …` (argument arrays, no shell); every
// data file is written by the importer, except upload.xml (the uploaded name) and a failed job's status.xml.
//
//   POST   /api/books                 body: the PDF (application/pdf, X-Filename) -> 202 { id }, queues an import
//   GET    /api/books                 -> [{ id, file, state, message, source, name, canon, recipe, imported, counts, busy, review }]
//   GET    /api/books/:id/report      -> import.xml
//   POST   /api/books/:id/reimport    clears the book's outputs, then imports again
//   DELETE /api/books/:id[?files=1]   clears the book's outputs (files=1: also its Library folder)
//   POST   /api/books/:id/ai[?dryRun=1|fresh=1]  AI proposals for a needs-ai book (dryRun: { parts, provider }, sends
//                                     nothing; fresh: replace finished proposals, which are otherwise kept)
//   GET    /api/review/:id            -> review.xml
//   PUT    /api/review/:id            body: review.xml with decisions; ?apply=1&source=&name=&canon= writes the overlay
//   GET    /api/ai-settings           -> ai-providers.xml plus <key provider set="true|false"/> (never a key)
//   PUT    /api/ai-settings           body: ai-providers.xml -> { cleared: [provider…] } (keys cleared: base URL changed); 400 when refused
//   PUT    /api/ai-keys               body: <key provider="…">…</key> elements; each is stored, an empty one removed
//   GET    /api/ai-models?provider=   -> { models: [id…] }, asked with the saved key and address; 400 bad provider, 502 { error }
//   GET    /api/edits                 -> [{ kind, id }] the entries in custom/edits/edits.xml
//   PUT    /api/edits/:kind/:id       body: <edit><amp|item|rule …/><description>…</description></edit> -> 204; 400 { error: why }
//   DELETE /api/edits/:kind/:id       drops the edit (the book's version shows again) -> { removed }
//   POST   /api/edits/sources         body: { id, name } -> 204, a house-rule source (canon="false"); 400 { error: why }
//   GET    /api/backup[?keys=1]       -> the zip of characters/, custom/ and library/ (keys=1: with the API keys)
//   POST   /api/restore?preview=1     body: a backup zip -> { token, manifest }; the zip waits 30 min for its token
//   POST   /api/restore/:token        replaces all three folders from that zip (a safety backup is kept) -> { ok }
//                                     409 while a job or a write runs; nothing else writes while it runs
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, readdirSync, rmSync } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'

const MAX_PDF = 500 * 1024 * 1024
const MAX_ZIP = 5 * 1024 ** 3
const TOKEN_TTL = 30 * 60 * 1000
const RESTORE_TIMEOUT = 4 * 3600 * 1000 // the safety backup and the unpack each copy everything
const TEMP_ZIP = /^(download|upload)-[0-9a-f]+\.zip$|^\.backup\..*\.tmp$/ // ours and a killed backup's, in library/.backups
const MAX_XML = 5 * 1024 * 1024
const JOB_TIMEOUT = 6 * 3600 * 1000 // ponytail: one cap for all jobs; an AI run over a big book takes hours (it resumes if cut)
const BOOK_ID = /^[a-z0-9][a-z0-9-]{0,40}$/
const SOURCE_ID = /^[A-Z][A-Z0-9-]{0,19}$/
const EDIT_KINDS = { amps: 'amp', items: 'item', rules: 'rule' }
const ENTRY_ID = /^[a-z0-9][a-z0-9.-]{0,99}$/ // importer/edits.py's ID, bounded
const MAX_EDIT = 1024 * 1024 + 4096 // the importer's cap on one entry and its description, plus the <edit> wrapper
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

export function booksApi({ charDir, customDir, libraryDir, python = 'python3', importerRoot, version = 'unknown' }) {
  const [cmd, ...pre] = [].concat(python)
  const config = join(libraryDir, '.config')
  const backups = join(libraryDir, '.backups')
  const queue = []
  let running = null, child = null, listChild = null
  let listChain = Promise.resolve() // model lists: one at a time, so repeated clicks can't pile up processes
  // key writes (read-modify-write in the importer) and edits (one fixed .tmp name): each one at a time
  const chains = { key: Promise.resolve(), edit: Promise.resolve() }
  let writes = 0, zipping = 0, restoring = false
  const tokens = new Map() // restore token -> { file, timer }
  const spawned = new Set() // backup processes, stopped with the server

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

  function importer(args, { input, timeout = JOB_TIMEOUT, tag } = {}) {
    return new Promise(done => {
      let out = '', err = ''
      const p = spawn(cmd, [...pre, '-m', 'importer', ...args], { cwd: importerRoot, timeout, windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, // else Windows' code page mangles the ’ in messages
        stdio: ['pipe', 'pipe', 'pipe'] })
      if (args[0] === 'list-models') listChild = p
      else if (args[0] === 'backup') { p.tag = tag; spawned.add(p); p.on('close', () => spawned.delete(p)) }
      else if (!['set-key', 'set-settings', 'edit', 'restore'].includes(args[0]) && !args.includes('--dry-run')) child = p
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

  const noRestore = () => { if (restoring) throw fail(409, 'a restore is running; try again when it’s done') }

  function enqueue(id, steps) {
    noRestore()
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

  /** The first KB of a file (review.xml can be large; its root tag is all the list needs), or null. */
  async function head(path) {
    const fh = await open(path).catch(() => null)
    if (!fh) return null
    const buf = Buffer.alloc(1024)
    const { bytesRead } = await fh.read(buf, 0, 1024, 0).finally(() => fh.close())
    return buf.subarray(0, bytesRead).toString('utf8')
  }

  async function book(id) {
    const dir = join(libraryDir, id)
    const [imp, status, upload, reviewHead] = await Promise.all([...['import.xml', 'status.xml', 'upload.xml'].map(f => readOr(join(dir, f))), head(join(dir, 'review.xml'))])
    const rv = rootTag(reviewHead, 'review')
    const it = rootTag(imp, 'import'), st = rootTag(status, 'status')
    const counts = Object.fromEntries([...(imp ?? '').matchAll(/<file\b[^>]*>/g)].map(m => [attr(m[0], 'name'), Number(attr(m[0], 'entries'))]))
    return {
      id, file: attr(rootTag(upload, 'upload'), 'file') ?? attr(it, 'file'), state: busy(id) && running?.id !== id ? 'queued' : attr(st, 'state') ?? 'queued',
      message: status ? unesc(status.replace(/^[\s\S]*?<status\b[^>]*>|<\/status>[\s\S]*$/g, '')) : '',
      source: attr(it, 'source'), name: attr(it, 'name'), canon: attr(it, 'canon') === undefined ? undefined : attr(it, 'canon') === 'true',
      recipe: attr(it, 'recipe'), imported: attr(it, 'imported'), counts, busy: busy(id),
      review: rv ? (attr(rv, 'done') === attr(rv, 'parts') ? 'done' : 'partial') : undefined,
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
    for (const [, provider, value = ''] of keys) await setKey(provider, unesc(value).trim())
  }

  /** `fn` after the chain's previous call; counted as a write, so a restore waits for it and it can't start during one. */
  function serial(chain, fn) {
    noRestore()
    writes++
    const run = chains[chain].then(fn).finally(() => { writes-- })
    chains[chain] = run.catch(() => {})
    return run
  }

  function setKey(provider, value) {
    return serial('key', async () => {
      const r = await importer(['set-key', libraryDir, provider], { input: value, timeout: 30000 })
      if (r.code !== 0) throw fail(500, 'couldn’t store the key: ' + (await redact(r.err)).trim().split('\n').pop())
    })
  }

  /** Save ai-providers.xml through the importer: the parser that later reads the file for a call is the one that
   *  checks it and compares base URLs (a provider whose address changed has its key cleared first; a key is only
   *  sent to the address it was entered for). Queued with the key writes, which it may make. */
  function putSettings(xml) {
    return serial('key', async () => {
      const r = await importer(['set-settings', '--library', libraryDir], { input: xml, timeout: 30000 })
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(400, why || 'these aren’t provider settings')
      const out = rootTag(r.out, 'result')
      if (r.code !== 0 || !out) throw fail(500, 'couldn’t save the settings: ' + why)
      return (attr(out, 'cleared') ?? '').split(' ').filter(Boolean)
    })
  }

  /** The provider's model ids. Read-only, so outside the job queue and the key chain but one at a time; the importer
   *  reads the saved address before the key, and only the provider id comes from the request. */
  async function listModels(provider) {
    if (!PROVIDERS.includes(provider)) throw fail(400, 'unknown provider')
    const run = listChain.then(() => importer(['list-models', provider, '--library', libraryDir], { timeout: 60000 }))
    listChain = run
    const r = await run
    if (r.code === 0) return r.out.split('\n').map(s => s.trim()).filter(Boolean)
    const why = (await redact(r.err)).trim().split('\n').pop()
    throw fail(502, r.code === 3 && why ? why : 'the importer couldn’t ask the provider' + (why ? `: ${why}` : ''))
  }

  /** One `importer edit …` call after the previous one; exit 3 is a refusal whose reason goes back as a 400. */
  function edit(args, input) {
    return serial('edit', async () => {
      const r = await importer(['edit', ...args, '--custom', customDir], { input, timeout: 60000 })
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(400, why || 'the importer refused the edit')
      if (r.code !== 0) throw fail(500, 'couldn’t save the edit: ' + why)
      return r.out
    })
  }

  async function edits(req, res, url, send) {
    const p = url.pathname, method = req.method
    if (p === '/api/edits' && method === 'GET') {
      const xml = (await readOr(join(customDir, 'edits', 'edits.xml'), '')).replace(/<!--[\s\S]*?-->/g, '')
      const kind = Object.fromEntries(Object.entries(EDIT_KINDS).map(([k, t]) => [t, k]))
      return send(res, 200, [...xml.matchAll(/<(amp|item|rule)\b[^>]*>/g)].map(m => ({ kind: kind[m[1]], id: attr(m[0], 'id') })))
    }
    if (p === '/api/edits/sources') {
      if (method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'send the source as application/json' })
      let b
      try { b = JSON.parse(await body(req, 4096)) } catch (e) { throw e.code === 413 ? e : fail(400, 'send { id, name } as JSON') }
      const name = clean(String(b?.name ?? '')).trim()
      if (!SOURCE_ID.test(b?.id ?? '') || !name || name.length > 120) throw fail(400, 'a source needs an id (A–Z, 0–9, -, starting with a letter) and a name')
      await edit(['add-source', b.id, `--name=${name}`]) // one argument: a name starting with "-" isn't an option
      return send(res, 204, '', 'text/plain')
    }
    const m = p.match(/^\/api\/edits\/([a-z]+)\/([^/]+)$/)
    if (!m) return send(res, 404, { error: 'not found' })
    let id
    try { id = decodeURIComponent(m[2]) } catch { throw fail(400, 'bad entry id') }
    if (!EDIT_KINDS[m[1]]) throw fail(400, 'kind is amps, items or rules')
    if (!ENTRY_ID.test(id)) throw fail(400, 'bad entry id')
    if (method === 'PUT') {
      await edit(['set', m[1], id], xmlBody(await body(req, MAX_EDIT), 'edit'))
      return send(res, 204, '', 'text/plain')
    }
    if (method === 'DELETE') return send(res, 200, { removed: attr(rootTag(await edit(['remove', m[1], id]), 'result'), 'removed') === 'true' })
    return send(res, 405, { error: 'method not allowed' })
  }

  /** After a restart no job is running, so a book left mid-job would look stuck forever. */
  async function sweep() {
    const live = ['queued', 'converting', 'identifying', 'extracting', 'proposing', 'applying']
    for (const d of await readdir(libraryDir, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory() || !BOOK_ID.test(d.name) || busy(d.name)) continue
      const st = attr(rootTag(await readOr(join(libraryDir, d.name, 'status.xml')), 'status'), 'state')
      if (live.includes(st)) await setStatus(d.name, 'failed', 'Interrupted by a restart — re-import')
    }
  }
  sweep()
  // zips left by a stop mid-download or mid-preview
  try {
    for (const f of readdirSync(backups, { withFileTypes: true }))
      if (f.isFile() && TEMP_ZIP.test(f.name)) rmSync(join(backups, f.name), { force: true })
  } catch { /* no .backups yet */ }

  const dirArgs = () => ['--characters', charDir, '--custom', customDir, '--library', libraryDir, '--version', version]
  const tempZip = kind => join(backups, `${kind}-${randomBytes(12).toString('hex')}.zip`)

  /** The zip is made in library/.backups (never backed up itself), streamed, then removed, also when the client goes. */
  async function download(req, res, url, send) {
    noRestore()
    await mkdir(backups, { recursive: true })
    const out = tempZip('download')
    let gone = false
    const drop = () => rm(out, { force: true })
    res.on('close', () => { gone = true; for (const p of spawned) if (p.tag === out) p.kill(); void drop() })
    zipping++
    let r
    try {
      r = await importer(['backup', ...dirArgs(), '--out', out, ...(url.searchParams.get('keys') === '1' ? ['--keys'] : [])],
        { timeout: RESTORE_TIMEOUT, tag: out })
    } finally { zipping-- }
    if (gone) return drop()
    if (r.code !== 0) {
      await drop()
      return send(res, 500, { error: 'couldn’t make the backup: ' + (await redact(r.err)).trim().split('\n').pop() })
    }
    const date = new Date().toISOString().slice(0, 10)
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': (await stat(out)).size,
      'Content-Disposition': `attachment; filename="chummer-anarchy2-backup-${date}.zip"`, 'Cache-Control': 'no-store' })
    await pipeline(createReadStream(out), res).catch(() => {}) // a client that leaves mid-way: 'close' removes the file
  }

  const forget = token => {
    const t = tokens.get(token)
    if (!t) return null
    tokens.delete(token)
    clearTimeout(t.timer)
    return t.file
  }

  /** The upload to a temp zip, checked by `restore --check`; one pending restore at a time (a new preview drops the old). */
  async function preview(req, res, send) {
    noRestore()
    if (Number(req.headers['content-length']) > MAX_ZIP) {
      res.setHeader('Connection', 'close')
      return send(res, 413, { error: 'the file is larger than 5 GB' })
    }
    await mkdir(backups, { recursive: true })
    const file = tempZip('upload')
    let size = 0
    try {
      await pipeline(req, async function* (src) {
        for await (const c of src) {
          if ((size += c.length) > MAX_ZIP) throw fail(413, 'the file is larger than 5 GB')
          yield c
        }
      }, createWriteStream(file, { flags: 'wx', mode: 0o600 }))
      if ((await head(file))?.slice(0, 4) !== 'PK\x03\x04') throw fail(415, 'this file isn’t a backup (not a zip file)')
      const r = await importer(['restore', '--check', file], { timeout: 10 * 60000 })
      if (r.code === 3) throw fail(400, (await redact(r.err)).trim().split('\n').pop() || 'this file isn’t a backup from this app')
      const m = rootTag(r.out, 'backup')
      if (r.code !== 0 || !m) throw Object.assign(fail(500, 'couldn’t check the file: ' + (await redact(r.err)).trim().split('\n').pop()), { say: true })
      const folders = Object.fromEntries([...r.out.matchAll(/<folder\b[^>]*>/g)].map(f => [attr(f[0], 'name'), { files: Number(attr(f[0], 'files')), bytes: Number(attr(f[0], 'bytes')) }]))
      await Promise.all([...tokens.keys()].map(t => rm(forget(t), { force: true })))
      const token = randomBytes(16).toString('hex')
      tokens.set(token, { file, timer: setTimeout(() => void rm(forget(token) ?? file, { force: true }), TOKEN_TTL).unref() })
      return send(res, 200, { token, manifest: { app: attr(m, 'app'), created: attr(m, 'created'), keys: attr(m, 'keys') === 'yes',
        files: Number(attr(m, 'files')), bytes: Number(attr(m, 'bytes')), folders } })
    } catch (e) {
      await rm(file, { force: true })
      if (e.code === 413) res.setHeader('Connection', 'close')
      if (typeof e.code === 'number' && e.code !== 500) throw e
      return send(res, 500, { error: e.say ? e.message : 'upload failed' })
    }
  }

  async function restore(token, send, res) {
    if (!/^[0-9a-f]{32}$/.test(token)) throw fail(404, 'this restore has expired; choose the file again')
    noRestore()
    if (running || queue.length) throw fail(409, 'a book is being imported or read by AI; try again when it’s done')
    if (writes || zipping) throw fail(409, 'a save or a backup is running; try again in a moment')
    const file = forget(token)
    if (!file) throw fail(404, 'this restore has expired; choose the file again')
    restoring = true
    let r
    try {
      r = await importer(['restore', '--apply', file, ...dirArgs()], { timeout: RESTORE_TIMEOUT })
    } finally {
      restoring = false
      await rm(file, { force: true })
    }
    await sweep()
    const why = (await redact(r.err)).trim().split('\n').pop()
    if (r.code === 3) throw fail(400, why || 'the backup was refused')
    if (r.code !== 0) return send(res, 500, { error: `the restore failed (${why || `exit code ${r.code}`}); the server’s earlier data is in its safety backup in library/.backups` })
    return send(res, 200, { ok: true })
  }

  async function handle(req, res, url, send) {
    const p = url.pathname, method = req.method
    if (p === '/api/backup' && method === 'GET') return download(req, res, url, send)
    if (p === '/api/restore' && method === 'POST' && url.searchParams.get('preview') === '1') return preview(req, res, send)
    const rt = p.match(/^\/api\/restore\/([^/]+)$/)
    if (rt && method === 'POST') return restore(rt[1], send, res)
    if (p === '/api/restore' || rt) return send(res, 405, { error: 'method not allowed' })
    if (restoring && method !== 'GET') throw fail(409, 'a restore is running; try again when it’s done')
    if (p === '/api/books' && method === 'POST') return upload(req, res, send)
    if (p === '/api/books' && method === 'GET') {
      await mkdir(libraryDir, { recursive: true })
      const ids = (await readdir(libraryDir, { withFileTypes: true })).filter(d => d.isDirectory() && BOOK_ID.test(d.name)).map(d => d.name).sort()
      return send(res, 200, await Promise.all(ids.map(book)))
    }
    if (p === '/api/ai-settings' && method === 'GET') return send(res, 200, await aiSettings(), 'application/xml; charset=utf-8')
    if (p === '/api/ai-settings' && method === 'PUT') {
      const cleared = await putSettings(await body(req))
      return send(res, 200, cleared.length ? { cleared, message: 'Key cleared because the address changed — enter it again' } : { cleared })
    }
    if (p === '/api/ai-models' && method === 'GET') return send(res, 200, { models: await listModels(url.searchParams.get('provider') ?? '') })
    if (p === '/api/edits' || p.startsWith('/api/edits/')) return edits(req, res, url, send)
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
      if (attr(imp, 'recipe') === 'ai') throw fail(409, 'a book read by AI can’t be re-imported; remove it, or apply its review again')
      const file = attr(imp, 'file') ?? attr(rootTag(hasUpload, 'upload'), 'file')
      await setStatus(id, 'queued')
      enqueue(id, [['remove', dir, '--custom', customDir], ['run', dir, '--custom', customDir, ...(file ? ['--file', file] : [])]])
      return send(res, 202, { id })
    }
    if (action === 'ai' && method === 'POST') {
      needsQuiet()
      if (attr(imp, 'source') || !['needs-ai', 'failed', 'review'].includes(state))
        throw fail(409, 'AI proposals are for books no recipe knows')
      const args = ['propose', dir, '--library', libraryDir, ...(url.searchParams.get('fresh') === '1' ? ['--fresh'] : [])]
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

  // shutdown: stop the running importer (the next start marks its book interrupted) and any model list
  // and backups being made; pending restore uploads are deleted
  const stop = () => {
    child?.kill(); listChild?.kill()
    for (const p of spawned) p.kill()
    for (const t of [...tokens.keys()]) rmSync(forget(t), { force: true })
  }
  return { handle, stop, restoring: () => restoring, libraryDir: resolve(libraryDir) }
}
