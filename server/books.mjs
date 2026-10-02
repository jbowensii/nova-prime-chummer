// Books API: PDF uploads into the Library, one importer job at a time, AI settings and the review queue.
// Who may call each route is server/auth.mjs's role table (need()): everything here is admin only, except the
// edits and the table rules (admin and editors; GET /api/edits: anyone signed in) and the example sets (GET, anyone
// signed in); `who` is the signed-in user.
// The server only moves requests and spawns `python -m importer …` (argument arrays, no shell); every
// data file is written by the importer, except upload.xml (the uploaded name) and a failed job's status.xml.
//
//   POST   /api/books                 body: the PDF (application/pdf, X-Filename) -> 202 { id }, queues an import
//   GET    /api/books                 -> [{ id, file, state, message, source, name, canon, recipe, imported, counts, busy, review, coreUnread, coreAi }]
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
//   GET    /api/ai-models?provider=   -> { models: [id…] } (AnythingLLM: { workspaces: [{ slug, name }…] }), asked with the saved key and address; 400 bad provider, 502 { error }
//   POST   /api/ai-test?provider=     a tiny fixed prompt to the saved provider -> { ok, model, reply (200 characters, text), ms };
//                                     502 { error } in plain words; 429 while one runs or after 10 in a minute
//   GET    /api/edits                 -> [{ kind, id }] the entries in custom/edits/edits.xml
//   PUT    /api/edits/:kind/:id       body: <edit><amp|item|rule …/><description>…</description></edit> -> 204; 400 { error: why }
//                                     the entry is saved with by="<username>"
//   DELETE /api/edits/:kind/:id       drops the edit (the book's version shows again) -> { removed }
//   POST   /api/edits/sources         body: { id, name } -> 204, a house-rule source (canon="false"); 400 { error: why }
//   GET    /api/samples               anyone signed in: the example sets in custom/samples/<set>/ -> { sets: [{ id, name, canon,
//                                     samples: [{ name, href }] }] } (href relative to /custom/). Read only: the admin manages
//                                     the folder on disk; set.xml (sampleset.xsd) names a set and says whether it is canon
//   PUT    /api/table-rules           admin and editors: { rules: [{ id, on, name?, text? }] } -> 204; replaces custom/table-rules.xml
//                                     (tablerules.xsd: a book's optional rule by its id, a house rule with its name and text);
//                                     anyone signed in reads the file at /custom/table-rules.xml
//   GET    /api/ask                   anyone signed in: -> { available, limit, used } (available: an AI provider is chosen, enabled
//                                     and has its key; limit: the account's dailyQuestions, null for none; used: answered today, UTC)
//   POST   /api/ask                   anyone signed in: { question } (500 characters at most) -> { answer, sources: [{ source, page,
//                                     title }], covered, used, limit } through `importer ask` (60 s); one at a time per account and
//                                     ASK_AT_ONCE on the server (429); every question that reached the provider counts against the day's
//                                     limit, whatever came back (429 + Retry-After until UTC midnight); one the books don't cover without
//                                     asking it is free. Only the username and the time are logged; counts in library/.config/ask-counts.xml
//   POST   /api/backup[?keys=1]     makes the zip of characters/, custom/ and library/ (keys=1: with the API keys) -> { token };
//                                     one at a time (409); the zip waits 10 min for its token
//   GET    /api/backup/:token         the zip, once, as chummer-anarchy2-backup-<date>.zip
//   POST   /api/restore?preview=1     body: a backup zip -> { token, manifest }; the zip waits 30 min for its token
//   POST   /api/restore/:token        replaces all three folders from that zip (a safety backup is kept) -> { ok }
//                                     409 while a job, a write or a backup runs; every other write gets 409 while it runs
//   POST   /api/datapack              makes the data pack of custom/imported/core/ -> { token };
//                                     the zip waits 10 min for its token; 409 when there is no core data
//   GET    /api/datapack/:token       the pack, once, as chummer-anarchy2-datapack-<date>.zip
//   POST   /api/datapack/import       body: a data pack zip (50 MB at most), checked in full (importer/datapack.py check)
//                                     -> { token, pack: { app, created, files: [name…], replaces: [name…] } } (replaces: the core
//                                     files the server has now); the zip waits 30 min for its token, one pending at a time
//   POST   /api/datapack/import/:token loads that pack -> { files: [name…] }, the core files it replaced; 409 while a job or
//                                     another pack runs, and jobs wait for it. All are counted writes (track), so a restore
//                                     and they exclude each other.
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, readdirSync, readFileSync, rmSync } from 'node:fs'
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
// library/backgrounds: the background art (server/backgrounds.mjs); library/sr6: the Shadowrun 6 area's books
const BOOK_ID = /^(?!(backgrounds|sr6)$)[a-z0-9][a-z0-9-]{0,40}$/
const SOURCE_ID = /^[A-Z][A-Z0-9-]{0,19}$/
const EDIT_KINDS = { amps: 'amp', items: 'item', rules: 'rule' }
const ENTRY_ID = /^[a-z0-9][a-z0-9.-]{0,99}$/ // importer/edits.py's ID, bounded
const MAX_TABLE_RULES = 200 // tablerules.xsd
const MAX_EDIT = 1024 * 1024 + 4096 // the importer's cap on one entry and its description, plus the <edit> wrapper
const PROVIDERS = ['anthropic', 'openai', 'gemini', 'anythingllm']
const CONFIG_NS = 'urn:chummer-anarchy2:config:1'
const SET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/ // a folder in custom/samples/, and each file in it
const BUILTIN = { name: 'Built-in samples (first release)', canon: true } // custom/samples/builtin/ without a set.xml
/** The 429 when an account's daily questions are used up (limit 0: it has none). */
export const limitReached = n => n === 0 ? 'You have no questions today.'
  : `${n === 1 ? 'You’ve used today’s question.' : `You’ve used all ${n} of today’s questions.`} Ask again tomorrow.`
const MAX_QUESTION = 500 // importer/ask.py MAX_QUESTION; its provider call gives up at 50 s, the server's askTimeout (60 s) stops it
const ASK_AT_ONCE = 3 // questions being answered on the whole server (each is a Python process)

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
// eslint-disable-next-line no-control-regex
const clean = s => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
export const attr = (tag, name) => { const v = tag?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]; return v == null ? undefined : unesc(v) }
export const rootTag = (xml, name) => xml?.match(new RegExp(`<${name}\\b[^>]*>`))?.[0]
const readOr = (path, fallback = null) => readFile(path, 'utf8').catch(() => fallback)
/** The core files named by import.xml rows of `kind`: core-unread (a recipe couldn't read them; the AI can propose any
 *  table's rows) or core-ai (read by AI from that book: to check against it). */
const coreRows = (imp, kind) => [...(imp ?? '').matchAll(/<row\b[^>]*>/g)].filter(m => attr(m[0], 'kind') === kind).map(m => attr(m[0], 'file'))
const coreUnread = imp => coreRows(imp, 'core-unread')
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

export async function writeAtomic(path, text, mode = 0o666) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, text, { encoding: 'utf8', flag: 'wx', mode })
  // Windows refuses to rename over a file another request is reading at that moment (a listing, not under the write
  // lock): try again for a moment. Elsewhere rename replaces it atomically and this never loops.
  for (let i = 0; ; i++) {
    try { return await rename(tmp, path) } catch (e) {
      if (i >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || process.platform !== 'win32') { await rm(tmp, { force: true }); throw e }
      await new Promise(ok => setTimeout(ok, 10 * (i + 1)))
    }
  }
}

export function booksApi({ charDir, customDir, libraryDir, python = 'python3', importerRoot, version = 'unknown', restoreTtl = 30 * 60 * 1000, downloadTtl = 10 * 60 * 1000, askTimeout = 60000,
  onRestore = async () => {}, compendiumSources = async () => new Set() }) {
  const [cmd, ...pre] = [].concat(python)
  const config = join(libraryDir, '.config')
  const backups = join(libraryDir, '.backups')
  const queue = []
  let running = null, child = null, listChild = null, testChild = null
  let listChain = Promise.resolve() // model lists: one at a time, so repeated clicks can't pile up processes
  let testing = null; const tests = [] // connection tests: one at a time, 10 a minute (each may cost a few tokens)
  // key writes (read-modify-write in the importer) and edits (one fixed .tmp name): each one at a time
  const chains = { key: Promise.resolve(), edit: Promise.resolve(), table: Promise.resolve(), ask: Promise.resolve() }
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
      else if (args[0] === 'test-ai') testChild = p
      else if (args[0] === 'backup' || args[0] === 'ask') { p.tag = tag; spawned.add(p); p.on('close', () => spawned.delete(p)) }
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
      coreUnread: coreUnread(imp), coreAi: coreRows(imp, 'core-ai'),
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
    const hex = sha.digest('hex')
    await writeAtomic(join(dir, 'upload.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<upload file="${esc(file)}" size="${size}" sha256="${hex}" uploaded="${new Date().toISOString()}"/>\n`)
    await dropPackMarks(hex) // a book file uploaded again: chosen over a loaded data pack, as with Re-import
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

  /** Is the provider connected? `importer test-ai`: the saved address, model and key, a tiny fixed prompt. */
  async function testProvider(provider) {
    if (!PROVIDERS.includes(provider)) throw fail(400, 'unknown provider')
    if (testing) throw Object.assign(fail(429, 'a connection test is already running; wait for it'), { retryAfter: 5 })
    const now = Date.now()
    while (tests.length && tests[0] < now - 60000) tests.shift()
    if (tests.length >= 10) throw Object.assign(fail(429, 'that’s 10 tests in a minute; wait a moment'), { retryAfter: Math.ceil((tests[0] + 60000 - now) / 1000) })
    tests.push(now)
    testing = importer(['test-ai', provider, '--library', libraryDir], { timeout: 30000 })
    const r = await testing.finally(() => { testing = null })
    if (r.signal) throw fail(502, 'no answer within 30 seconds')
    const why = (await redact(r.err)).trim().split('\n').pop()
    if (r.code !== 0) throw fail(502, r.code === 3 && why ? why : 'the importer couldn’t ask the provider' + (why ? `: ${why}` : ''))
    let out
    try { out = JSON.parse(r.out.trim().split('\n').pop()) } catch { throw fail(502, 'the importer’s answer couldn’t be read') }
    const text = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() // text only, one line
    return { ok: true, model: text(out.model).slice(0, 120), reply: (await redact(text(out.reply))).slice(0, 200), ms: Math.round(Number(out.ms) || 0) }
  }

  // ---- Ask the rules ----
  const asking = new Set() // user ids with a question being answered
  const countsPath = join(config, 'ask-counts.xml')
  const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10)
  /** Today's answered questions per user id; ask-counts.xml (users.xsd askcounts) keeps them over a restart. */
  let asked = { day: utcDay(), n: new Map() }
  try {
    const xml = readFileSync(countsPath, 'utf8')
    if (attr(rootTag(xml, 'ca2:askcounts'), 'date') === asked.day)
      for (const [m] of xml.matchAll(/<count\b[^>]*>/g)) if (/^[0-9a-f]{12}$/.test(attr(m, 'user') ?? '')) asked.n.set(attr(m, 'user'), Number(attr(m, 'n')) || 0)
  } catch { /* none yet */ }
  const usedToday = id => {
    if (asked.day !== utcDay()) asked = { day: utcDay(), n: new Map() }
    return asked.n.get(id) ?? 0
  }
  const saveCounts = () => serial('ask', () => writeAtomic(countsPath, `<?xml version="1.0" encoding="UTF-8"?>\n<ca2:askcounts xmlns:ca2="${CONFIG_NS}" version="1" date="${
    asked.day}">\n${[...asked.n].map(([u, n]) => `  <count user="${u}" n="${n}"/>\n`).join('')}</ca2:askcounts>\n`)).catch(e => console.error(`couldn’t save ask-counts.xml: ${e.message}`))

  /** Is an AI provider chosen, enabled and given its key (an OpenAI-compatible server may need none, but an address)? */
  async function askAvailable() {
    const xml = await readOr(join(config, 'ai-providers.xml'), '')
    const use = attr(rootTag(xml, 'ca2:aiproviders'), 'use')
    const p = use && [...xml.matchAll(/<provider\b[^>]*>/g)].map(m => m[0]).find(t => attr(t, 'id') === use)
    if (!p || attr(p, 'enabled') !== 'true') return false
    const key = new RegExp(`<key\\s+provider="${use}"\\s*>\\s*[^<\\s]`).test(await readOr(join(config, 'ai-keys.xml'), ''))
    return key || (use === 'openai' && !!attr(p, 'baseUrl'))
  }

  async function ask(req, who) {
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) throw fail(415, 'send { question } as application/json')
    let question
    try { question = JSON.parse(await body(req, 8192)).question } catch (e) { throw e.code === 413 ? e : fail(400, 'send { question } as JSON') }
    question = typeof question === 'string' ? clean(question).replace(/\s+/g, ' ').trim() : ''
    if (!question || question.length > MAX_QUESTION) throw fail(400, `a question is 1–${MAX_QUESTION} characters`)
    if (!await askAvailable()) throw fail(409, 'Ask the rules isn’t set up: the admin chooses an AI provider and its key in AI settings')
    if (asking.has(who.id)) throw Object.assign(fail(429, 'your last question is still being answered; wait for it'), { retryAfter: 5 })
    if (asking.size >= ASK_AT_ONCE) throw Object.assign(fail(429, 'Ask the rules is busy; try again in a moment'), { retryAfter: 5 })
    const limit = who.dailyQuestions ?? null
    if (limit != null && usedToday(who.id) >= limit)
      throw Object.assign(fail(429, limitReached(limit)),
        { retryAfter: Math.ceil((Date.parse(`${utcDay()}T00:00:00Z`) + 86400e3 - Date.now()) / 1000) })
    asking.add(who.id)
    let r
    try {
      r = await importer(['ask', '--custom', customDir, '--library', libraryDir], { input: question, timeout: askTimeout })
    } finally { asking.delete(who.id) }
    console.log(`ask: ${who.username} at ${new Date().toISOString()}`) // never the question or the answer
    let out = null
    try { out = JSON.parse(r.out.trim().split('\n').pop()) } catch { /* killed or crashed: no JSON */ }
    // counted unless the importer says it never asked the provider (a timeout or a crash counts: it may have)
    if (out?.called !== false) {
      const n = usedToday(who.id) + 1 // first: at midnight this rolls the day over, and the count goes in the new one
      asked.n.set(who.id, n)
      await saveCounts()
    }
    if (r.signal) throw fail(502, `no answer within ${askTimeout / 1000} seconds; try again`)
    const why = (await redact(r.err)).trim().split('\n').pop()
    if (r.code !== 0) throw fail(502, r.code === 3 && why ? why : 'the importer couldn’t answer' + (why ? `: ${why}` : ''))
    if (!out) throw fail(502, 'the importer’s answer couldn’t be read')
    const text = s => String(s ?? '').slice(0, 200)
    const sources = (Array.isArray(out.sources) ? out.sources : []).slice(0, 8).map(s => ({ source: text(s?.source), page: text(s?.page), title: text(s?.title) }))
    return { answer: (await redact(String(out.answer ?? ''))).slice(0, 6000), sources, covered: out.covered === true, used: usedToday(who.id), limit }
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

  async function edits(req, res, url, send, who) {
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
      if ((await compendiumSources()).has(b.id)) throw fail(409, `the source id ${b.id} is a compendium’s; choose another`)
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
      await edit(['set', m[1], id, '--by', who.username], xmlBody(await body(req, MAX_EDIT), 'edit'))
      return send(res, 204, '', 'text/plain')
    }
    if (method === 'DELETE') return send(res, 200, { removed: attr(rootTag(await edit(['remove', m[1], id]), 'result'), 'removed') === 'true' })
    return send(res, 405, { error: 'method not allowed' })
  }

  /** The example sets: every custom/samples/<set>/ folder and its character files. A set without set.xml is named after
   *  its folder and isn't canon, except "builtin" (the first release's runners, built from the core rulebook only). */
  async function sampleSets(req, res, send) {
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
    const root = join(customDir, 'samples'), sets = []
    for (const d of (await readdir(root, { withFileTypes: true }).catch(() => [])).filter(d => d.isDirectory() && SET_ID.test(d.name))) {
      const tag = rootTag(await readOr(join(root, d.name, 'set.xml')), 'ca2:sampleset')
      const def = d.name === 'builtin' ? BUILTIN : { name: d.name, canon: false }
      const samples = []
      for (const f of (await readdir(join(root, d.name)).catch(() => [])).filter(f => f.endsWith('.xml') && f !== 'set.xml' && SET_ID.test(f)).sort()) {
        const ch = rootTag(await readOr(join(root, d.name, f), ''), 'ca2:character')
        if (ch) samples.push({ name: attr(ch, 'streetName') || attr(ch, 'name') || f.replace(/\.xml$/, ''), href: `samples/${d.name}/${f}` })
      }
      sets.push({ id: d.name, name: attr(tag, 'name') || def.name, canon: tag ? ['true', '1'].includes(attr(tag, 'canon')) : def.canon, samples })
    }
    return send(res, 200, { sets: sets.sort((a, b) => a.id.localeCompare(b.id)) })
  }

  /** The GM's table rules, all at once: the Rules page sends the whole list on every change. */
  async function tableRules(req, res, send) {
    if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'send the table rules as application/json' })
    let b
    try { b = JSON.parse(await body(req, 1024 * 1024)) } catch (e) { throw e.code === 413 ? e : fail(400, 'send { rules: [{ id, on, name?, text? }] } as JSON') }
    if (!Array.isArray(b?.rules) || b.rules.length > MAX_TABLE_RULES) throw fail(400, `send { rules: [{ id, on, name?, text? }] }, ${MAX_TABLE_RULES} rules at most`)
    const seen = new Set()
    const rows = b.rules.map(r => {
      const id = String(r?.id ?? ''), name = clean(String(r?.name ?? '')).trim(), text = clean(String(r?.text ?? '')).trim()
      if (!ENTRY_ID.test(id) || seen.has(id)) throw fail(400, 'each rule needs an id of its own')
      seen.add(id)
      if (typeof r.on !== 'boolean') throw fail(400, 'a rule is on (true) or off (false)')
      if (!name && text) throw fail(400, 'a house rule needs a name')
      if (name.length > 120 || text.length > 4000) throw fail(400, 'a house rule’s name is 120 characters at most, its description 4,000')
      return `  <rule id="${id}" on="${r.on}">${name ? `<name>${esc(name)}</name><text>${esc(text)}</text>` : ''}</rule>\n`
    })
    await serial('table', () => writeAtomic(join(customDir, 'table-rules.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n'
      + `<ca2:tablerules xmlns:ca2="${CONFIG_NS}" version="1">\n${rows.join('')}</ca2:tablerules>\n`))
    return send(res, 204, '', 'text/plain')
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
   *  A data pack's import marks that CRB file (pack=, files= the pack's files, no version: the book wasn't tried; the core came from the
   *  pack), so a restart doesn't re-import the book over the pack while those files are all there; once one is gone the
   *  mark no longer counts and the usual rule applies. A different CRB file is re-imported regardless.
   *  The marks are keyed on the book file's sha256, not its folder: the same PDF uploaded again to a new folder is the same
   *  book (its old folder's marks count), and that upload, like a Re-import, drops the file's pack marks (dropPackMarks). */
  async function rebuildCore() {
    const present = new Set(await readdir(join(customDir, 'imported', 'core')).catch(() => []))
    if (CORE_FILES.every(n => present.has(`${n}.xml`))) return
    const books = await coreBooks()
    const crb = books.find(b => b.order === 0)
    if (!crb) return
    const counts = t => {
      const packFiles = (attr(t, 'files') ?? '').split(' ').filter(Boolean)
      const packed = !!attr(t, 'pack') && packFiles.length > 0 && packFiles.every(f => present.has(f))
      return attr(t, 'version') === version || (packed && present.size > 0)
    }
    if ((await marks(crb.sha)).some(m => counts(m.tag))) return
    await writeAtomic(join(libraryDir, crb.id, 'core-rebuild.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rebuild sha256="${esc(crb.sha)}" version="${esc(version)}" tried="${new Date().toISOString()}"/>\n`)
    for (const b of books.sort((x, y) => x.order - y.order)) {
      const dir = join(libraryDir, b.id)
      await setStatus(b.id, 'queued', 'Re-importing to build the core data')
      enqueue(b.id, [['remove', dir, '--custom', customDir], ['run', dir, '--custom', customDir, ...(b.file ? ['--file', b.file] : [])]])
    }
  }
  /** Every Library folder's core-rebuild.xml for the book file with this sha256: [{ id, tag }]. */
  async function marks(sha) {
    const out = []
    if (!sha) return out
    for (const d of await readdir(libraryDir, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory() || !BOOK_ID.test(d.name)) continue
      const tag = rootTag(await readOr(join(libraryDir, d.name, 'core-rebuild.xml')), 'rebuild')
      if (tag && attr(tag, 'sha256') === sha) out.push({ id: d.name, tag })
    }
    return out
  }
  /** The admin chose this book file over a loaded data pack (uploaded it again, or Re-import): its pack marks go, in every
   *  folder, so the start-up rule is the usual one again. */
  async function dropPackMarks(sha) {
    for (const m of await marks(sha)) if (attr(m.tag, 'pack')) await rm(join(libraryDir, m.id, 'core-rebuild.xml'), { force: true })
  }
  /** A loaded data pack replaced these core files: a book that had them read by AI no longer says so (its core-ai rows go).
   *  A successful re-import needs nothing: it writes the book's import record afresh. */
  async function dropCoreAi(files) {
    for (const d of await readdir(libraryDir, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory() || !BOOK_ID.test(d.name)) continue
      const path = join(libraryDir, d.name, 'import.xml'), xml = await readOr(path)
      const next = xml?.replace(/[ \t]*<row\b[^>]*\/>\n?/g, r => attr(r, 'kind') === 'core-ai' && files.includes(attr(r, 'file')) ? '' : r)
      if (next !== xml) await writeAtomic(path, next)
    }
  }
  /** A pack import killed mid-swap leaves the files it had moved aside in core/.restore-old-*: put them back before
   *  anything reads the core (importer/datapack.py recover). */
  async function recoverCore() {
    const left = await readdir(join(customDir, 'imported', 'core')).catch(() => [])
    if (!left.some(n => n.startsWith('.restore-'))) return
    const r = await importer(['datapack', 'recover', '--custom', customDir], { timeout: 60000 })
    if (r.code !== 0) console.error(`couldn’t recover custom/imported/core after an interrupted data pack: ${(await redact(r.err)).trim()}`)
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
  const started = sweep().then(recoverCore).then(rebuildCore).catch(e => console.error(e.stack))
  // zips left by a stop mid-download, mid-preview or mid-restore
  try {
    for (const f of readdirSync(backups, { withFileTypes: true }))
      if (TEMP_ZIP.test(f.name)) rmSync(join(backups, f.name), { recursive: true, force: true })
  } catch { /* no .backups yet */ }
  // a killed restore's unpack and swap folders, at the top of each data folder (importer/backup.py; the safety backup
  // in library/.backups holds everything the old ones did)
  for (const d of [charDir, customDir, libraryDir]) {
    try {
      for (const f of readdirSync(d)) if (/^\.restore-(old|new|done)-/.test(f)) rmSync(join(d, f), { recursive: true, force: true })
    } catch { /* no folder yet */ }
  }

  const dirArgs = () => ['--characters', charDir, '--custom', customDir, '--library', libraryDir, '--version', version]
  const tempZip = kind => join(backups, `${kind}-${randomBytes(12).toString('hex')}.zip`)

  /** Tokens for a made backup or data pack (downloads, packs) and an uploaded one (uploads, packUploads): random, single
   *  use, and each map holds one at a time (a new one drops the old). The path is deleted on expiry, on replacement and on stop; on use, by the caller.
   *  A token works only for the account that was given it (`user`: its id; undefined: expiry and stop). */
  const downloads = new Map(), uploads = new Map(), packs = new Map(), packUploads = new Map() // token -> { path, timer, user }
  const take = (map, token, user) => {
    const t = map.get(token)
    if (!t || (user !== undefined && t.user !== user)) return null
    map.delete(token)
    clearTimeout(t.timer)
    return t.path
  }
  async function issue(map, path, ttl, user) {
    await Promise.all([...map.keys()].map(t => rm(take(map, t), { recursive: true, force: true })))
    const token = randomBytes(16).toString('hex')
    map.set(token, { path, user, timer: setTimeout(() => void rm(take(map, token) ?? path, { recursive: true, force: true }), ttl).unref() })
    return token
  }

  /** Step 1 of a download: make the zip in its own folder in library/.backups (never backed up itself). One at a time
   *  (each is a full copy of the Library on its disk), counted in `zipping` from the first line so a restore can't start
   *  under it. A client that leaves stops it; the folder goes with a killed backup's partial .tmp. -> { token }
   *  ponytail: not a point-in-time snapshot. Saves and imports may run meanwhile; each file is written atomically, so
   *  every file is whole but two files can be from different moments. Refuse while `writes`/`running` if that matters. */
  async function makeBackup(req, res, url, send, who) {
    noRestore()
    if (zipping) throw fail(409, 'a backup is already being made; wait for it to finish')
    if (packing) throw fail(409, 'a data pack is being made or loaded; try again when it’s done')
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
    return send(res, 200, { token: await issue(downloads, folder, downloadTtl, who.id) })
  }

  /** Step 2: the browser goes here, so the zip streams straight to disk with the browser's own progress. `kind`: backup or
   *  datapack (its token map, its zip's name in the token's folder, the download's name). */
  async function sendZip(kind, token, res, who) {
    const folder = /^[0-9a-f]{32}$/.test(token) ? take(kind === 'backup' ? downloads : packs, token, who.id) : null
    if (!folder) throw fail(404, kind === 'backup' ? 'this backup has expired; make it again' : 'this data pack has expired; make it again')
    res.on('close', () => void rm(folder, { recursive: true, force: true }).catch(() => {}))
    const out = join(folder, `${kind}.zip`), date = new Date().toISOString().slice(0, 10)
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': (await stat(out)).size,
      'Content-Disposition': `attachment; filename="chummer-anarchy2-${kind}-${date}.zip"`, 'Cache-Control': 'no-store' })
    await pipeline(createReadStream(out), res).catch(() => {}) // a client that leaves mid-way: 'close' removes the folder
  }

  /** The upload to a temp zip, checked by `restore --check`; one pending restore at a time (a new preview drops the old). */
  async function preview(req, res, send, who) {
    noRestore()
    if (Number(req.headers['content-length']) > MAX_ZIP) {
      res.setHeader('Connection', 'close')
      return send(res, 413, { error: 'the file is larger than 20 GB' })
    }
    await mkdir(backups, { recursive: true })
    const file = tempZip('upload')
    try {
      await receiveZip(req, file, MAX_ZIP, 'the file is larger than 20 GB', 'this file isn’t a backup (not a zip file)')
      const r = await importer(['restore', '--check', file], { timeout: 10 * 60000 })
      if (r.code === 3) throw fail(400, (await redact(r.err)).trim().split('\n').pop() || 'this file isn’t a backup from this app')
      const m = rootTag(r.out, 'backup')
      if (r.code !== 0 || !m) throw Object.assign(fail(500, 'couldn’t check the file: ' + (await redact(r.err)).trim().split('\n').pop()), { say: true })
      const folders = Object.fromEntries([...r.out.matchAll(/<folder\b[^>]*>/g)].map(f => [attr(f[0], 'name'), { files: Number(attr(f[0], 'files')), bytes: Number(attr(f[0], 'bytes')) }]))
      const token = await issue(uploads, file, restoreTtl, who.id)
      return send(res, 200, { token, manifest: { app: attr(m, 'app'), created: attr(m, 'created'), keys: attr(m, 'keys') === 'yes',
        users: Number(attr(m, 'users')), authSecret: attr(m, 'authSecret') === 'yes',
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
  async function makePack(res, send, who) {
    if (packing) throw fail(409, 'a data pack is being made or loaded; try again when it’s done')
    // a book's import rewrites the core files one by one: a pack made meanwhile could mix old and new tables
    if (running || queue.length) throw fail(409, 'a book is being imported or read by AI; try again when it’s done')
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
    return send(res, 200, { token: await issue(packs, folder, downloadTtl, who.id) })
  }

  /** The request body to a new temp `file` (0600), `max` bytes at most (413 `big`), refused (415 `notZip`) unless it
   *  starts like a zip. The caller removes the file on failure. */
  async function receiveZip(req, file, max, big, notZip) {
    let size = 0
    await pipeline(req, async function* (src) {
      for await (const c of src) {
        if ((size += c.length) > max) throw fail(413, big)
        yield c
      }
    }, createWriteStream(file, { flags: 'wx', mode: 0o600 }))
    if ((await head(file))?.slice(0, 4) !== 'PK\x03\x04') throw fail(415, notZip)
  }

  /** Data pack upload, step 1, like a restore's preview: `datapack check` reads it all (names, sizes, manifest, hashes,
   *  schemas); nothing changes yet. -> { token, pack } for loadPack; one pending pack at a time. */
  async function previewPack(req, res, send, who) {
    if (Number(req.headers['content-length']) > MAX_PACK) {
      res.setHeader('Connection', 'close')
      return send(res, 413, { error: 'the file is larger than 50 MB' })
    }
    await mkdir(backups, { recursive: true })
    const file = tempZip('pack')
    try {
      await receiveZip(req, file, MAX_PACK, 'the file is larger than 50 MB', 'this file isn’t a data pack (not a zip file)')
      const r = await importer(['datapack', 'check', file], { timeout: 5 * 60000 })
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(400, why || 'this file isn’t a data pack from this app')
      const m = rootTag(r.out, 'datapack')
      if (r.code !== 0 || !m) throw Object.assign(fail(500, `couldn’t check the data pack (${why})`), { say: true })
      const files = [...r.out.matchAll(/<file\b[^>]*>/g)].map(f => attr(f[0], 'name')).sort()
      const have = new Set(await readdir(join(customDir, 'imported', 'core')).catch(() => []))
      const token = await issue(packUploads, file, restoreTtl, who.id)
      return send(res, 200, { token, pack: { app: attr(m, 'app'), created: attr(m, 'created'), files, replaces: files.filter(f => have.has(f)) } })
    } catch (e) {
      await rm(file, { force: true })
      if (e.code === 413) res.setHeader('Connection', 'close')
      if (typeof e.code === 'number' && e.code !== 500) throw e
      return send(res, 500, { error: e.say ? e.message : 'upload failed' })
    }
  }

  /** Data pack upload, step 2: `datapack import` checks it again and swaps its core files in, all or none. Refused while
   *  a job runs; jobs queued meanwhile wait (pump). A token that gets this far is used up. */
  async function loadPack(token, res, send, who) {
    const gone = () => fail(404, 'this data pack upload has expired; choose the file again')
    if (packUploads.get(token)?.user !== who.id) throw gone()
    if (packing) throw fail(409, 'a data pack is being made or loaded; try again when it’s done')
    if (running || queue.length) throw fail(409, 'a book is being imported or read by AI; try again when it’s done')
    if (zipping) throw fail(409, 'a backup is being made; try again when it’s done') // it would copy the swap's folders
    const file = take(packUploads, token, who.id)
    packing = true
    try {
      const r = await importer(['datapack', 'import', file, '--custom', customDir], { timeout: 5 * 60000 })
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(400, why || 'this file isn’t a data pack from this app')
      const out = rootTag(r.out, 'result')
      if (r.code !== 0 || !out) return send(res, 500, { error: `couldn’t load the data pack (${why})` })
      // the core now comes from the pack: the start-up re-import leaves it alone (rebuildCore)
      const files = (attr(out, 'files') ?? '').split(' ').filter(Boolean)
      try { // the pack is in: a failed mark is logged, not reported as a failed upload
        const crb = (await coreBooks()).find(b => b.order === 0)
        if (crb) await writeAtomic(join(libraryDir, crb.id, 'core-rebuild.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rebuild sha256="${
          esc(crb.sha)}" pack="${new Date().toISOString()}" files="${esc(files.join(' '))}"/>\n`)
      } catch (e) { console.error(`the data pack is loaded, but the start-up re-import mark wasn’t written: ${e.message}`) }
      await dropCoreAi(files).catch(e => console.error(`the data pack is loaded, but a book still says it read a table by AI: ${e.message}`))
      return send(res, 200, { files })
    } finally {
      packing = false
      await rm(file, { force: true })
      pump()
    }
  }

  async function restore(token, send, res, who) {
    if (!/^[0-9a-f]{32}$/.test(token)) throw fail(404, 'this restore has expired; choose the file again')
    noRestore()
    if (running || queue.length) throw fail(409, 'a book is being imported or read by AI; try again when it’s done')
    if (writes) throw fail(409, 'a save or an upload is running; try again when it’s done')
    if (zipping) throw fail(409, 'a backup is being made; try again when it’s done')
    const file = take(uploads, token, who.id)
    if (!file) throw fail(404, 'this restore has expired; choose the file again')
    restoring = true
    let r
    try {
      r = await importer(['restore', '--apply', file, ...dirArgs()], { timeout: RESTORE_TIMEOUT })
    } finally {
      await rm(file, { force: true })
      await onRestore().catch(e => console.error(e.stack)) // the accounts come from the restored users.xml; every session ends
      restoring = false // only now: a sign-in in between would check the old accounts
    }
    await sweep()
    void rebuildCore().catch(e => console.error(e.stack)) // a backup from before the core data was imported
    const why = (await redact(r.err)).trim().split('\n').pop()
    if (r.code === 3) throw fail(400, why || 'the backup was refused')
    if (r.code !== 0) return send(res, 500, { error: `the restore failed (${why || `exit code ${r.code}`}); the server’s earlier data is in its safety backup in library/.backups` })
    return send(res, 200, { ok: true })
  }

  async function handle(req, res, url, send, who) {
    const p = url.pathname, method = req.method
    if (p === '/api/backup' && method === 'POST') return makeBackup(req, res, url, send, who)
    const bt = p.match(/^\/api\/backup\/([^/]+)$/)
    if (bt && method === 'GET') return sendZip('backup', bt[1], res, who)
    if (p === '/api/backup' || bt) return send(res, 405, { error: 'method not allowed' })
    if (p === '/api/restore' && method === 'POST' && url.searchParams.get('preview') === '1') return preview(req, res, send, who)
    const rt = p.match(/^\/api\/restore\/([^/]+)$/)
    if (rt && method === 'POST') return restore(rt[1], send, res, who)
    if (p === '/api/restore' || rt) return send(res, 405, { error: 'method not allowed' })
    if (p === '/api/datapack' && method === 'POST') return makePack(res, send, who)
    if (p === '/api/datapack/import' && method === 'POST') return previewPack(req, res, send, who)
    const lt = p.match(/^\/api\/datapack\/import\/([^/]+)$/)
    if (lt && method === 'POST') return loadPack(lt[1], res, send, who)
    if (lt) return send(res, 405, { error: 'method not allowed' })
    const pt = p.match(/^\/api\/datapack\/([^/]+)$/)
    if (pt && method === 'GET' && pt[1] !== 'import') return sendZip('datapack', pt[1], res, who)
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
    if (p === '/api/ai-test' && method === 'POST') return send(res, 200, await testProvider(url.searchParams.get('provider') ?? ''))
    if (p === '/api/ai-models' && method === 'GET') {
      const provider = url.searchParams.get('provider') ?? '', ids = await listModels(provider)
      return send(res, 200, provider === 'anythingllm' // the importer prints slug<TAB>name
        ? { workspaces: ids.map(l => ({ slug: l.split('\t')[0], name: l.slice(l.indexOf('\t') + 1) })) } : { models: ids })
    }
    if (p === '/api/ask' && method === 'GET')
      return send(res, 200, { available: await askAvailable(), limit: who.dailyQuestions ?? null, used: usedToday(who.id) })
    if (p === '/api/ask' && method === 'POST') return send(res, 200, await ask(req, who))
    if (p === '/api/ask') return send(res, 405, { error: 'method not allowed' })
    if (p === '/api/edits' || p.startsWith('/api/edits/')) return edits(req, res, url, send, who)
    if (p === '/api/table-rules') return tableRules(req, res, send)
    if (p === '/api/samples') return sampleSets(req, res, send)
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
      // the admin chose the book over a loaded data pack: its pack marks go (this folder's, and any for the same file)
      if (attr(rootTag(await readOr(join(dir, 'core-rebuild.xml')), 'rebuild'), 'pack')) await rm(join(dir, 'core-rebuild.xml'), { force: true })
      await dropPackMarks(attr(imp, 'sha256'))
      await setStatus(id, 'queued')
      enqueue(id, [['remove', dir, '--custom', customDir], ['run', dir, '--custom', customDir, ...(file ? ['--file', file] : [])]])
      return send(res, 202, { id })
    }
    if (action === 'ai' && method === 'POST') {
      needsQuiet()
      // a recipe's book only for the core tables it couldn't read
      const core = !!attr(imp, 'source') && coreUnread(await readOr(join(dir, 'import.xml'))).length > 0
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
    child?.kill(); listChild?.kill(); testChild?.kill()
    for (const p of spawned) p.kill()
    for (const map of [uploads, downloads, packs, packUploads]) for (const t of [...map.keys()]) rmSync(take(map, t), { recursive: true, force: true })
  }
  return { handle, stop, track, started, libraryDir: resolve(libraryDir) }
}
