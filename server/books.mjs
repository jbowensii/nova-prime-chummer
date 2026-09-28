// Books API: PDF uploads into the Library, one importer job at a time, AI settings and the review queue.
// The server only moves requests and spawns `python -m importer …` (argument arrays, no shell); every
// data file is written by the importer, except upload.xml (the uploaded name) and a failed job's status.xml.
//
//   POST   /api/books                 body: the PDF (application/pdf, X-Filename) -> 202 { id }, queues an import
//   GET    /api/books                 -> [{ id, file, state, message, source, name, canon, recipe, imported, counts, busy, review, coreUnread }]
//   GET    /api/books/:id/report      -> import.xml
//   POST   /api/books/:id/reimport    clears the book's outputs, then imports again
//   DELETE /api/books/:id[?files=1]   clears the book's outputs (files=1: also its Library folder)
//   POST   /api/books/:id/ai[?dryRun=1|fresh=1]  AI proposals for a needs-ai book, or for the weapons/armor tables a recipe
//                                     couldn't read (dryRun: { parts, provider }, sends nothing; fresh: replace finished
//                                     proposals, which are otherwise kept)
//   GET    /api/review/:id            -> review.xml
//   PUT    /api/review/:id            body: review.xml with decisions; ?apply=1&source=&name=&canon= writes the overlay
//                                     (a review of core tables, core="true": ?apply=1 writes custom/imported/core/)
//   GET    /api/ai-settings           -> ai-providers.xml plus <key provider set="true|false"/> (never a key)
//   PUT    /api/ai-settings           body: ai-providers.xml -> { cleared: [provider…] } (keys cleared: base URL changed); 400 when refused
//   PUT    /api/ai-keys               body: <key provider="…">…</key> elements; each is stored, an empty one removed
//   GET    /api/ai-models?provider=   -> { models: [id…] }, asked with the saved key and address; 400 bad provider, 502 { error }
//   GET    /api/edits                 -> [{ kind, id }] the entries in custom/edits/edits.xml
//   PUT    /api/edits/:kind/:id       body: <edit><amp|item|rule …/><description>…</description></edit> -> 204; 400 { error: why }
//   DELETE /api/edits/:kind/:id       drops the edit (the book's version shows again) -> { removed }
//   POST   /api/edits/sources         body: { id, name } -> 204, a house-rule source (canon="false"); 400 { error: why }
//   POST   /api/backup[?keys=1]       makes the zip of characters/, custom/ and library/ (keys=1: with the API keys) -> { token };
//                                     one at a time (409); the zip waits 10 min for its token
//   GET    /api/backup/:token         the zip, once, as chummer-anarchy2-backup-<date>.zip
//   POST   /api/restore?preview=1     body: a backup zip -> { token, manifest }; the zip waits 30 min for its token
//   POST   /api/restore/:token        replaces all three folders from that zip (a safety backup is kept) -> { ok }
//                                     409 while a job, a write or a backup runs; every other write gets 409 while it runs
//   POST   /api/datapack              ADMIN ONLY (Task 3 guards it): makes the data pack of custom/imported/core/ -> { token };
//                                     the zip waits 10 min for its token; 409 when there is no core data
//   GET    /api/datapack/:token       ADMIN ONLY: the pack, once, as chummer-anarchy2-datapack-<date>.zip
//   POST   /api/datapack/import       ADMIN ONLY: body: a data pack zip (50 MB at most) -> { files: [name…] }, the core files it
//                                     replaced (importer/datapack.py checks it all first); 409 while a job or another pack runs,
//                                     and jobs wait for it. Both are counted writes (track), so a restore and they exclude each other.
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, readdirSync, rmSync } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'

const MAX_PDF = 500 * 1024 * 1024
const MAX_PACK = 50 * 1024 * 1024
const MAX_ZIP = 20 * 1024 ** 3 // restore --check's limit on what a zip unpacks to: any backup the app makes fits
const RESTORE_TIMEOUT = 4 * 3600 * 1000 // the safety backup and the unpack each copy everything
// ours in library/.backups (a download's folder holds its zip), and a killed restore's safety-backup temp
const TEMP_ZIP = /^(download|pack)-[0-9a-f]+$|^(upload|pack)-[0-9a-f]+\.zip$|^\.backup\..*\.tmp$/
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
/** The core files a recipe couldn't read (import.xml rows kind="core-unread"); the AI can read the weapons and armor tables. */
const coreUnread = imp => [...(imp ?? '').matchAll(/<row\b[^>]*\skind="core-unread"[^>]*>/g)].map(m => attr(m[0], 'file'))
const CORE_AI = ['weapons.xml', 'armor.xml']
// the core files (as src/engine/load.ts CORE_FILES, importer/__init__.py CORE_FILES)
const CORE_FILES = ['ampeffects', 'amptypes', 'armor', 'attributes', 'levels', 'lifestyles', 'metatypes', 'packages', 'pricing', 'skills',
  'vehicles', 'weapons']
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

export function booksApi({ charDir, customDir, libraryDir, python = 'python3', importerRoot, version = 'unknown', restoreTtl = 30 * 60 * 1000, downloadTtl = 10 * 60 * 1000 }) {
  const [cmd, ...pre] = [].concat(python)
  const config = join(libraryDir, '.config')
  const backups = join(libraryDir, '.backups')
  const queue = []
  let running = null, child = null, listChild = null
  let listChain = Promise.resolve() // model lists: one at a time, so repeated clicks can't pile up processes
  // key writes (read-modify-write in the importer) and edits (one fixed .tmp name): each one at a time
  const chains = { key: Promise.resolve(), edit: Promise.resolve() }
  let writes = 0, zipping = 0, restoring = false
  let packing = false // a data pack being made or imported: one at a time, and no job starts meanwhile
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
        // PYTHONIOENCODING: else Windows' code page mangles the ’ in messages; CA2_CUSTOM_DIR: where the core files are
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', CA2_CUSTOM_DIR: customDir },
        stdio: ['pipe', 'pipe', 'pipe'] })
      if (args[0] === 'list-models') listChild = p
      else if (args[0] === 'backup') { p.tag = tag; spawned.add(p); p.on('close', () => spawned.delete(p)) }
      else if (!['set-key', 'set-settings', 'edit', 'restore', 'datapack'].includes(args[0]) && !args.includes('--dry-run')) child = p
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

  /** A request that writes: refused (409) during a restore, and counted from its first line to its last so a restore waits
   *  for it. server.mjs runs every non-GET request except backup and restore themselves through this. */
  function track(fn) {
    noRestore()
    writes++
    return Promise.resolve().then(fn).finally(() => { writes-- })
  }

  const noRestore = () => { if (restoring) throw fail(409, 'a restore is running; try again when it’s done') }

  function enqueue(id, steps) {
    queue.push({ id, steps })
    pump()
  }

  async function pump() {
    if (running || packing || !queue.length) return
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
      coreUnread: coreUnread(imp),
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

  /** `fn` after the chain's previous call (the request is counted by track()). */
  function serial(chain, fn) {
    const run = chains[chain].then(fn)
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
  /** The upgrade path to core data built by the import: a server whose custom/imported/core/ lacks any of the 12 core files
   *  and whose Library holds the core rulebook re-imports it, then the Conversion Guide and DHSA (their Tasking, Emerged
   *  and implant grades were core data before and now come with their books). Tried once per CRB file and app version
   *  (library/<id>/core-rebuild.xml): a book that can't give the whole core isn't re-imported on every start; a new
   *  upload, a new version or the admin's Re-import tries again.
   *  A data pack's import marks that CRB file done for good (pack=, any version: the core came from the pack), so a
   *  restart never re-imports the book over the pack; a different CRB file (a new upload) still is. */
  async function rebuildCore() {
    const have = await Promise.all(CORE_FILES.map(n => stat(join(customDir, 'imported', 'core', `${n}.xml`)).then(() => true, () => false)))
    if (have.every(Boolean)) return
    const books = await coreBooks()
    const crb = books.find(b => b.order === 0)
    if (!crb) return
    const marker = join(libraryDir, crb.id, 'core-rebuild.xml')
    const tried = rootTag(await readOr(marker), 'rebuild')
    if (tried && attr(tried, 'sha256') === crb.sha && (attr(tried, 'version') === version || attr(tried, 'pack'))) return
    await writeAtomic(marker, `<?xml version="1.0" encoding="UTF-8"?>\n<rebuild sha256="${esc(crb.sha)}" version="${esc(version)}" tried="${new Date().toISOString()}"/>\n`)
    for (const b of books.sort((x, y) => x.order - y.order)) {
      const dir = join(libraryDir, b.id)
      await setStatus(b.id, 'queued', 'Re-importing to build the core data')
      enqueue(b.id, [['remove', dir, '--custom', customDir], ['run', dir, '--custom', customDir, ...(b.file ? ['--file', b.file] : [])]])
    }
  }
  /** The Library's books whose recipe builds or completes the core (CRB, CG, DHSA), with their order and file. */
  async function coreBooks() {
    const books = []
    for (const d of await readdir(libraryDir, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory() || !BOOK_ID.test(d.name) || busy(d.name)) continue
      const imp = rootTag(await readOr(join(libraryDir, d.name, 'import.xml')), 'import')
      const order = ['crb', 'cg', 'dhsa'].indexOf(attr(imp, 'recipe'))
      if (order >= 0) books.push({ id: d.name, order, file: attr(imp, 'file'), sha: attr(imp, 'sha256') ?? '' })
    }
    return books
  }
  const started = sweep().then(rebuildCore).catch(e => console.error(e.stack))
  // zips left by a stop mid-download, mid-preview or mid-restore
  try {
    for (const f of readdirSync(backups, { withFileTypes: true }))
      if (TEMP_ZIP.test(f.name)) rmSync(join(backups, f.name), { recursive: true, force: true })
  } catch { /* no .backups yet */ }
  // a killed restore's unpack and swap folders, at the top of each data folder (importer/backup.py; the safety backup
  // in library/.backups holds everything the old ones did)
  for (const d of [charDir, customDir, libraryDir]) {
    try {
      for (const f of readdirSync(d)) if (/^\.restore-(old|new)-/.test(f)) rmSync(join(d, f), { recursive: true, force: true })
    } catch { /* no folder yet */ }
  }

  const dirArgs = () => ['--characters', charDir, '--custom', customDir, '--library', libraryDir, '--version', version]
  const tempZip = kind => join(backups, `${kind}-${randomBytes(12).toString('hex')}.zip`)

  /** Tokens for a made backup (downloads) and an uploaded one (uploads): random, single use, and each map holds one at
   *  a time (a new one drops the old). The path is deleted on expiry, on replacement and on stop; on use, by the caller. */
  const downloads = new Map(), uploads = new Map(), packs = new Map() // token -> { path, timer }
  const take = (map, token) => {
    const t = map.get(token)
    if (!t) return null
    map.delete(token)
    clearTimeout(t.timer)
    return t.path
  }
  async function issue(map, path, ttl) {
    await Promise.all([...map.keys()].map(t => rm(take(map, t), { recursive: true, force: true })))
    const token = randomBytes(16).toString('hex')
    map.set(token, { path, timer: setTimeout(() => void rm(take(map, token) ?? path, { recursive: true, force: true }), ttl).unref() })
    return token
  }

  /** Step 1 of a download: make the zip in its own folder in library/.backups (never backed up itself). One at a time
   *  (each is a full copy of the Library on its disk), counted in `zipping` from the first line so a restore can't start
   *  under it. A client that leaves stops it; the folder goes with a killed backup's partial .tmp. -> { token }
   *  ponytail: not a point-in-time snapshot. Saves and imports may run meanwhile; each file is written atomically, so
   *  every file is whole but two files can be from different moments. Refuse while `writes`/`running` if that matters. */
  async function makeBackup(req, res, url, send) {
    noRestore()
    if (zipping) throw fail(409, 'a backup is already being made; wait for it to finish')
    zipping++
    const folder = join(backups, `download-${randomBytes(12).toString('hex')}`), out = join(folder, 'backup.zip')
    let gone = false, r
    res.on('close', () => {
      if (res.writableFinished) return
      gone = true
      for (const p of spawned) if (p.tag === out) p.kill()
    })
    try {
      await mkdir(folder, { recursive: true })
      r = await importer(['backup', ...dirArgs(), '--out', out, ...(url.searchParams.get('keys') === '1' ? ['--keys'] : [])],
        { timeout: RESTORE_TIMEOUT, tag: out })
    } finally { zipping-- }
    if (gone || r.code !== 0) {
      await rm(folder, { recursive: true, force: true }).catch(() => {}) // after the process has let go of its files (Windows)
      return gone ? undefined : send(res, 500, { error: 'couldn’t make the backup: ' + (await redact(r.err)).trim().split('\n').pop() })
    }
    return send(res, 200, { token: await issue(downloads, folder, downloadTtl) })
  }

  /** Step 2: the browser goes here, so the zip streams straight to disk with the browser's own progress. `kind`: backup or
   *  datapack (its token map, its zip's name in the token's folder, the download's name). */
  async function sendZip(kind, token, res) {
    const folder = /^[0-9a-f]{32}$/.test(token) ? take(kind === 'backup' ? downloads : packs, token) : null
    if (!folder) throw fail(404, kind === 'backup' ? 'this backup has expired; make it again' : 'this data pack has expired; make it again')
    res.on('close', () => void rm(folder, { recursive: true, force: true }).catch(() => {}))
    const out = join(folder, `${kind}.zip`), date = new Date().toISOString().slice(0, 10)
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': (await stat(out)).size,
      'Content-Disposition': `attachment; filename="chummer-anarchy2-${kind}-${date}.zip"`, 'Cache-Control': 'no-store' })
    await pipeline(createReadStream(out), res).catch(() => {}) // a client that leaves mid-way: 'close' removes the folder
  }

  /** The upload to a temp zip, checked by `restore --check`; one pending restore at a time (a new preview drops the old). */
  async function preview(req, res, send) {
    noRestore()
    if (Number(req.headers['content-length']) > MAX_ZIP) {
      res.setHeader('Connection', 'close')
      return send(res, 413, { error: 'the file is larger than 20 GB' })
    }
    await mkdir(backups, { recursive: true })
    const file = tempZip('upload')
    let size = 0
    try {
      await pipeline(req, async function* (src) {
        for await (const c of src) {
          if ((size += c.length) > MAX_ZIP) throw fail(413, 'the file is larger than 20 GB')
          yield c
        }
      }, createWriteStream(file, { flags: 'wx', mode: 0o600 }))
      if ((await head(file))?.slice(0, 4) !== 'PK\x03\x04') throw fail(415, 'this file isn’t a backup (not a zip file)')
      const r = await importer(['restore', '--check', file], { timeout: 10 * 60000 })
      if (r.code === 3) throw fail(400, (await redact(r.err)).trim().split('\n').pop() || 'this file isn’t a backup from this app')
      const m = rootTag(r.out, 'backup')
      if (r.code !== 0 || !m) throw Object.assign(fail(500, 'couldn’t check the file: ' + (await redact(r.err)).trim().split('\n').pop()), { say: true })
      const folders = Object.fromEntries([...r.out.matchAll(/<folder\b[^>]*>/g)].map(f => [attr(f[0], 'name'), { files: Number(attr(f[0], 'files')), bytes: Number(attr(f[0], 'bytes')) }]))
      const token = await issue(uploads, file, restoreTtl)
      return send(res, 200, { token, manifest: { app: attr(m, 'app'), created: attr(m, 'created'), keys: attr(m, 'keys') === 'yes',
        files: Number(attr(m, 'files')), bytes: Number(attr(m, 'bytes')), folders } })
    } catch (e) {
      await rm(file, { force: true })
      if (e.code === 413) res.setHeader('Connection', 'close')
      if (typeof e.code === 'number' && e.code !== 500) throw e
      return send(res, 500, { error: e.say ? e.message : 'upload failed' })
    }
  }

  /** Data pack step 1: `datapack export` into its own folder in library/.backups. The request is a counted write (track),
   *  so no restore runs under it. -> { token } for sendZip('datapack'). */
  async function makePack(res, send) {
    if (packing) throw fail(409, 'a data pack is being made or loaded; try again when it’s done')
    packing = true
    const folder = join(backups, `pack-${randomBytes(12).toString('hex')}`)
    let r
    try {
      await mkdir(folder, { recursive: true })
      r = await importer(['datapack', 'export', '--custom', customDir, '--out', join(folder, 'datapack.zip'), '--version', version], { timeout: 5 * 60000 })
    } finally {
      packing = false
      pump()
    }
    if (r.code !== 0) {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(409, why || 'there is no core data to put in a pack')
      return send(res, 500, { error: 'couldn’t make the data pack: ' + why })
    }
    return send(res, 200, { token: await issue(packs, folder, downloadTtl) })
  }

  /** Upload a data pack and import it: `datapack import` checks everything (names, sizes, manifest, hashes, schemas) before
   *  it swaps the pack's core files in, all or none. Refused while a job runs; jobs queued meanwhile wait (pump). */
  async function importPack(req, res, send) {
    if (Number(req.headers['content-length']) > MAX_PACK) {
      res.setHeader('Connection', 'close')
      return send(res, 413, { error: 'the file is larger than 50 MB' })
    }
    if (packing) throw fail(409, 'a data pack is being made or loaded; try again when it’s done')
    if (running || queue.length) throw fail(409, 'a book is being imported or read by AI; try again when it’s done')
    packing = true
    const file = tempZip('pack')
    let size = 0
    try {
      await mkdir(backups, { recursive: true })
      await pipeline(req, async function* (src) {
        for await (const c of src) {
          if ((size += c.length) > MAX_PACK) throw fail(413, 'the file is larger than 50 MB')
          yield c
        }
      }, createWriteStream(file, { flags: 'wx', mode: 0o600 }))
      if ((await head(file))?.slice(0, 4) !== 'PK\x03\x04') throw fail(415, 'this file isn’t a data pack (not a zip file)')
      const r = await importer(['datapack', 'import', file, '--custom', customDir], { timeout: 5 * 60000 })
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(400, why || 'this file isn’t a data pack from this app')
      const out = rootTag(r.out, 'result')
      if (r.code !== 0 || !out) throw Object.assign(fail(500, 'couldn’t load the data pack: ' + why), { say: true })
      // the core now comes from the pack: the start-up re-import leaves it alone (rebuildCore)
      const crb = (await coreBooks()).find(b => b.order === 0)
      if (crb) await writeAtomic(join(libraryDir, crb.id, 'core-rebuild.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<rebuild sha256="${esc(crb.sha)}" version="${esc(version)}" pack="${new Date().toISOString()}"/>\n`)
      return send(res, 200, { files: (attr(out, 'files') ?? '').split(' ').filter(Boolean) })
    } catch (e) {
      if (e.code === 413) res.setHeader('Connection', 'close')
      if (typeof e.code === 'number' && e.code !== 500) throw e
      return send(res, 500, { error: e.say ? e.message : 'upload failed' })
    } finally {
      packing = false
      await rm(file, { force: true })
      pump()
    }
  }

  async function restore(token, send, res) {
    if (!/^[0-9a-f]{32}$/.test(token)) throw fail(404, 'this restore has expired; choose the file again')
    noRestore()
    if (running || queue.length) throw fail(409, 'a book is being imported or read by AI; try again when it’s done')
    if (writes) throw fail(409, 'a save or an upload is running; try again when it’s done')
    if (zipping) throw fail(409, 'a backup is being made; try again when it’s done')
    const file = take(uploads, token)
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
    void rebuildCore().catch(e => console.error(e.stack)) // a backup from before the core data was imported
    const why = (await redact(r.err)).trim().split('\n').pop()
    if (r.code === 3) throw fail(400, why || 'the backup was refused')
    if (r.code !== 0) return send(res, 500, { error: `the restore failed (${why || `exit code ${r.code}`}); the server’s earlier data is in its safety backup in library/.backups` })
    return send(res, 200, { ok: true })
  }

  async function handle(req, res, url, send) {
    const p = url.pathname, method = req.method
    if (p === '/api/backup' && method === 'POST') return makeBackup(req, res, url, send)
    const bt = p.match(/^\/api\/backup\/([^/]+)$/)
    if (bt && method === 'GET') return sendZip('backup', bt[1], res)
    if (p === '/api/backup' || bt) return send(res, 405, { error: 'method not allowed' })
    if (p === '/api/restore' && method === 'POST' && url.searchParams.get('preview') === '1') return preview(req, res, send)
    const rt = p.match(/^\/api\/restore\/([^/]+)$/)
    if (rt && method === 'POST') return restore(rt[1], send, res)
    if (p === '/api/restore' || rt) return send(res, 405, { error: 'method not allowed' })
    // data packs: ADMIN ONLY once accounts exist (Task 3)
    if (p === '/api/datapack' && method === 'POST') return makePack(res, send)
    if (p === '/api/datapack/import' && method === 'POST') return importPack(req, res, send)
    const pt = p.match(/^\/api\/datapack\/([^/]+)$/)
    if (pt && method === 'GET' && pt[1] !== 'import') return sendZip('datapack', pt[1], res)
    if (p === '/api/datapack' || pt) return send(res, 405, { error: 'method not allowed' })
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
      const old = await readOr(join(dir, 'review.xml'))
      if (old == null) return send(res, 404, { error: 'no proposals for this book' })
      const core = attr(rootTag(old, 'review'), 'core') === 'true' // rows for the core tables a recipe couldn't read
      if (apply && !core && (!SOURCE_ID.test(source) || !name || name.length > 120 || !['true', 'false'].includes(canon)))
        throw fail(400, 'apply needs source (A–Z, 0–9, -), name and canon=true|false')
      await writeAtomic(join(dir, 'review.xml'), xmlBody(await body(req), 'review'))
      if (!apply) return send(res, 204, '', 'text/plain')
      await setStatus(id, 'queued')
      enqueue(id, [core ? ['apply-review', dir, '--custom', customDir, '--core']
        : ['apply-review', dir, '--custom', customDir, '--source', source, '--name', clean(name), '--canon', canon]])
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
      // a recipe's book only for the core tables it couldn't read
      const core = !!attr(imp, 'source') && coreUnread(await readOr(join(dir, 'import.xml'))).some(f => CORE_AI.includes(f))
      if (core ? !['done', 'failed', 'review'].includes(state) : attr(imp, 'source') || !['needs-ai', 'failed', 'review'].includes(state))
        throw fail(409, 'AI proposals are for books no recipe knows, or core tables a recipe couldn’t read')
      const args = ['propose', dir, '--library', libraryDir, ...(url.searchParams.get('fresh') === '1' ? ['--fresh'] : []), ...(core ? ['--core'] : [])]
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
  // and backups being made; pending restore uploads and unfetched backups are deleted
  const stop = () => {
    child?.kill(); listChild?.kill()
    for (const p of spawned) p.kill()
    for (const map of [uploads, downloads, packs]) for (const t of [...map.keys()]) rmSync(take(map, t), { recursive: true, force: true })
  }
  return { handle, stop, track, started, libraryDir: resolve(libraryDir) }
}
