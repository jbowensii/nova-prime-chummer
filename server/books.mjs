// Books API: PDF uploads into the Library, one importer job at a time, AI settings and the review queue.
// Who may call each route is server/auth.mjs's role table (need()): everything here is admin only, except the
// edits and the table rules (admin and editors; GET /api/edits and /api/sr6/creation: anyone signed in), SR6's
// creation rules (the server default: the admin) and the example sets (GET, anyone signed in); `who` is the signed-in user.
// The server only moves requests and spawns `python -m importer …` (argument arrays, no shell); every
// data file is written by the importer, except upload.xml (the uploaded name) and a failed job's status.xml.
//
//   POST   /api/books                 body: the PDF (application/pdf, X-Filename) -> 202 { id }, queues an import (the same
//                                     file, by sha256, as an entry: that entry, imported again; 409 while it's busy)
//   GET    /api/books                 -> [{ id, file, state, step?, message, source, extra?, name, canon, recipe, imported, counts, busy, review, coreUnread, coreAi }]
//                                     (state of a busy book: queued, importing with its step, removing; uploaded: a folder with its PDF
//                                     never imported; extra: the further sources)
//   GET    /api/books/:id/report      -> import.xml
//   POST   /api/books/:id/reimport    clears the book's outputs, then imports again
//   POST   /api/books/reimport-all    queues a re-import of every book with its original.pdf (not one read by AI, not a busy one):
//                                     -> 202 { queued: [id…], skipped: [{ id, why }] }; each is the single re-import, from the PDF
//                                     alone if that's all the folder has; book.md is reused when the importer can (run --reuse)
//   GET    /api/books/reimport-all    -> { queued, skipped } of the Re-import all still running (one a restart resumed), else empty
//                                     lists. A restart re-queues the jobs it cut off (library/.config/jobs.json, else the books'
//                                     statuses), in their order, in both games: resume()
//   DELETE /api/books/:id[?files=1]   clears the book's outputs (files=1: also its Library folder)
//   POST   /api/books/:id/ai[?dryRun=1|fresh=1]  AI proposals for a needs-ai book, or for the weapons/armor tables a recipe
//                                     couldn't read (dryRun: { parts, provider }, sends nothing; fresh: replace finished
//                                     proposals, which are otherwise kept)
//   GET    /api/review/:id            -> review.xml
//   PUT    /api/review/:id            body: review.xml with decisions; ?apply=1&source=&name=&canon= writes the overlay
//                                     (a review of core tables, core="true": ?apply=1 writes custom/imported/core/)
//   Each game has its own AI (the AI routes and Ask the rules, also under /api/sr6/): Anarchy's settings and keys in
//                                     library/.config/, SR6's in library/sr6/.config/ (its own provider, key, AnythingLLM
//                                     workspace); each game's Ask reads only its own data (importer/ask.py). The daily count is
//                                     the account's, both games together
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
//   /api/sr6/books, /api/sr6/books/:id[/report|/reimport], /api/sr6/edits[/:kind/:id]   the same for the Shadowrun 6 area
//                                     (library/sr6/, custom/sr6/, `importer sr6 …`; edit kinds: SR6_KINDS and samplefixes, existing entries only);
//                                     no AI book import, review, data pack or house sources there (404). One job queue for both games
//   GET    /api/sr6/creation          anyone signed in: the SR6 creation rules as [{ key, value, source?, page? }] ([] when none)
//   PUT    /api/sr6/creation          admin: { settings: [{ key, value, source?, page? }] } -> 204; replaces
//                                     custom/sr6/creation.xml (creation.xsd: what the admin changed from the shipped standard,
//                                     public/data/sr6/creation-defaults.xml; the client overlays it), the server's default (a campaign's own: PUT /api/sr6/campaigns/:id { creation }, campaigns.mjs);
//                                     anyone signed in reads the file at /custom/sr6/creation.xml. Anarchy has none (404)
//   GET    /api/samples               anyone signed in: the example sets in custom/samples/<set>/ -> { sets: [{ id, name, canon,
//                                     samples: [{ name, href }] }] } (href relative to /custom/). Read only: the admin manages
//                                     the folder on disk; set.xml (sampleset.xsd) names a set and says whether it is canon
//   PUT    /api/table-rules           admin and editors: { rules: [{ id, on, locked?, name?, text? }] } -> 204; replaces custom/table-rules.xml
//                                     (tablerules.xsd: a book's optional rule by its id, a house rule with its name and text);
//                                     anyone signed in reads the file at /custom/table-rules.xml
//   GET    /api/ask                   anyone signed in: -> { available, limit, used } (available: an AI provider is chosen, enabled
//                                     and has its key; limit: the account's dailyQuestions, null for none; used: answered today, UTC)
//   POST   /api/ask                   anyone signed in: { question, scope? } (500 characters at most; scope "rules": the rules only,
//                                     the Rules page's search) -> { answer, sources: [{ source, page, title, kind, id }], covered, used, limit } through `importer ask` (60 s); one at a time per account and
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
import { SR6_KINDS } from './games.mjs'

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
const MAX_SETTINGS = 500, SETTING_KEY = /^[A-Za-z0-9.:_-]{1,80}$/ // creation.xsd (SR6)
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
const STEPS = ['converting', 'identifying', 'extracting', 'proposing', 'applying'] // a job's steps, as the importer writes them
const SHA256 = /^[0-9a-f]{64}$/
const KEEP = ['done', 'skipped', 'superseded'] // an import that went through (of one file's entries, the newest of these stays)

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
// eslint-disable-next-line no-control-regex
const clean = s => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
export const attr = (tag, name) => { const v = tag?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]; return v == null ? undefined : unesc(v) }
/** The first <name …> tag, up to its first `>`. Found by a plain search: `<name\b[^>]*>` scanned to the end of the text
 *  from every later <name when the tag never closed (quadratic: a 5 MB request body held the server for minutes). */
export const rootTag = (xml, name) => {
  const m = typeof xml === 'string' ? new RegExp(`<${name}\\b`).exec(xml) : null
  const end = m ? xml.indexOf('>', m.index) : -1
  return end < 0 ? undefined : xml.slice(m.index, end + 1)
}
const readOr = (path, fallback = null) => readFile(path, 'utf8').catch(() => fallback)
/** The core files named by import.xml rows of `kind`: core-unread (a recipe couldn't read them; the AI can propose any
 *  table's rows) or core-ai (read by AI from that book: to check against it). */
const coreRows = (imp, kind) => [...(imp ?? '').matchAll(/<row\b[^>]*>/g)].filter(m => attr(m[0], 'kind') === kind).map(m => attr(m[0], 'file'))
const coreUnread = imp => coreRows(imp, 'core-unread')
// the core files (as src/engine/load.ts CORE_FILES, importer/__init__.py CORE_FILES)
const CORE_FILES = ['ampeffects', 'amptypes', 'armor', 'attributes', 'levels', 'lifestyles', 'metatypes', 'packages', 'pricing', 'skills',
  'vehicles', 'weapons']
const fail = (code, message) => Object.assign(new Error(message), { code })

/** SR6 creation settings as creation.xsd allows them: [{ key, value, source?, page? }] tidied (page a number), or a 400 for
 *  the first bad one. The server's default (PUT /api/sr6/creation) and a campaign's own (server/campaigns.mjs). */
export function creationSettings(list) {
  if (!Array.isArray(list) || list.length > MAX_SETTINGS) throw fail(400, `send settings as [{ key, value, source?, page? }], ${MAX_SETTINGS} at most`)
  const seen = new Set()
  return list.map(s => {
    const key = String(s?.key ?? ''), value = clean(String(s?.value ?? '')).trim()
    const source = s?.source == null ? '' : String(s.source), page = s?.page == null ? '' : String(s.page)
    if (!SETTING_KEY.test(key)) throw fail(400, 'a setting’s key is 1 to 80 letters, digits and . : _ -')
    if (seen.has(key)) throw fail(400, `the setting ${key} is set twice`)
    seen.add(key)
    if (!value || value.length > 200) throw fail(400, `the value of ${key} is 1 to 200 characters`)
    if (source && !SOURCE_ID.test(source)) throw fail(400, `the source of ${key} is a book id such as CRB`)
    if (page && !/^[1-9]\d{0,5}$/.test(page)) throw fail(400, `the page of ${key} is a whole number from 1`)
    return { key, value, ...source ? { source } : {}, ...page ? { page: Number(page) } : {} }
  })
}
/** One checked setting as creation.xsd's <setting/>. */
export const settingXml = s => `<setting key="${s.key}" value="${esc(s.value)}"${s.source ? ` source="${s.source}"` : ''}${s.page ? ` page="${s.page}"` : ''}/>`
/** The <setting/> tags in `xml` as [{ key, value, source?, page? }]. */
export const readSettings = xml => [...xml.matchAll(/<setting\b[^>]*>/g)].map(([t]) => {
  const source = attr(t, 'source'), page = attr(t, 'page')
  return { key: attr(t, 'key'), value: attr(t, 'value'), ...source ? { source } : {}, ...page ? { page: Number(page) } : {} }
})

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
  let stopped = false // stop(): no job step starts afterwards (a step that ended as it was killed queued the next one)
  let listChain = Promise.resolve() // model lists: one at a time, so repeated clicks can't pile up processes
  let testing = null; const tests = [] // connection tests: one at a time, 10 a minute (each may cost a few tokens)
  // key writes (read-modify-write in the importer) and edits (one fixed .tmp name): each one at a time
  const chains = { key: Promise.resolve(), edit: Promise.resolve(), table: Promise.resolve(), ask: Promise.resolve(), creation: Promise.resolve() }
  let writes = 0, zipping = 0, restoring = false
  let packing = false // a data pack being made or imported: one at a time, and no job starts meanwhile
  const spawned = new Set() // backup processes, stopped with the server

  // each game's books and catalog (server/games.mjs): Anarchy's at the top of library/ and custom/, SR6's in their sr6/
  // folders, run as `python -m importer sr6 …`. One job queue for both.
  const AREAS = { ca2: { library: libraryDir, custom: customDir, pre: [], kinds: EDIT_KINDS },
    // (samplefixes: a book sample runner's printed line corrected, importer/sr6/edits.py)
    sr6: { library: join(libraryDir, 'sr6'), custom: join(customDir, 'sr6'), pre: ['sr6'], kinds: { ...SR6_KINDS, samplefixes: 'samplefix' } } }
  const bookDir = (id, game = 'ca2') => {
    if (!BOOK_ID.test(id)) throw fail(400, 'bad book id')
    return join(AREAS[game].library, id)
  }
  const busy = (id, game = 'ca2') => (running?.game === game && running.id === id) || queue.some(j => j.game === game && j.id === id)

  /** A game's AI settings and keys: Anarchy's in library/.config, SR6's in library/sr6/.config (backup.py ALL_KEYS). */
  const aiConfig = game => join(AREAS[game].library, '.config')
  /** Keys (both games'), bearer tokens and key-looking strings out of worker output before it reaches status.xml. */
  async function redact(text) {
    const keys = (await Promise.all(Object.keys(AREAS).map(g => readOr(join(aiConfig(g), 'ai-keys.xml'), ''))))
      .flatMap(x => [...x.matchAll(/<key\b[^>]*>([^<]+)<\/key>/g)]).map(m => unesc(m[1]).trim())
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
      const cmd0 = args[0] === 'sr6' ? args[1] : args[0] // `sr6 edit` is an edit, never the job
      if (cmd0 === 'list-models') listChild = p
      else if (cmd0 === 'test-ai') testChild = p
      else if (cmd0 === 'backup' || cmd0 === 'ask') { p.tag = tag; spawned.add(p); p.on('close', () => spawned.delete(p)) }
      else if (!['set-key', 'set-settings', 'edit', 'restore', 'datapack'].includes(cmd0) && !args.includes('--dry-run')) child = p
      p.stdout.on('data', d => { out = (out + d).slice(-65536) })
      p.stderr.on('data', d => { err = (err + d).slice(-4000) })
      p.on('error', e => { err += e.message })
      // (a signal: the server stopping it, or the time limit; `stopped (SIG…` is what 0.10.2 wrote for both)
      p.on('close', (code, signal) => done({ code: code ?? -1, signal, out, err: !signal ? err : stopped ? `${err}\nstopped by a restart (${signal})`
        : `${err}\ntimed out after ${timeout / 1000}s (${signal})` }))
      p.stdin.on('error', () => {})
      p.stdin.end(input ?? '')
    })
  }

  async function setStatus(id, state, message = '', game = 'ca2') {
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n<status state="${state}" updated="${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}">${esc(clean(message))}</status>\n`
    await writeAtomic(join(AREAS[game].library, id, 'status.xml'), text).catch(() => {}) // the folder may be gone (delete with files)
  }

  /** A request that writes: refused (409) during a restore, and counted from its first line to its last so a restore waits
   *  for it. server.mjs runs every non-GET request except backup and restore themselves through this. */
  function track(fn) {
    noRestore()
    writes++
    return Promise.resolve().then(fn).finally(() => { writes-- })
  }

  const noRestore = () => { if (restoring) throw fail(409, 'a restore is running; try again when it’s done') }

  function enqueue(id, steps, game = 'ca2') {
    queue.push({ game, id, steps })
    saveJobs()
    pump()
  }

  /** The job queue (the running job first) and each game's last Re-import all, in library/.config/jobs.json, so a
   *  restart (an update recreating the container mid-queue) picks them up where they were (resume). A stop leaves the
   *  file as it was: the job it kills is still in it. */
  const JOBS = join(config, 'jobs.json')
  let batches = { ca2: null, sr6: null }, jobsChain = Promise.resolve()
  function saveJobs() {
    if (stopped) return jobsChain
    const jobs = [...running ? [running] : [], ...queue].map(({ game, id, steps }) => ({ game, id, steps }))
    for (const [game, b] of Object.entries(batches)) if (b && !b.queued.some(id => busy(id, game))) batches[game] = null // finished
    const text = JSON.stringify({ jobs, batches }) + '\n', idle = !jobs.length && !batches.ca2 && !batches.sr6
    // (nothing left: no file, so an idle server's backup holds none)
    jobsChain = jobsChain.then(() => idle ? rm(JOBS, { force: true }) : mkdir(config, { recursive: true }).then(() => writeAtomic(JOBS, text)))
      .catch(e => console.error(`couldn’t save the job queue: ${e.message}`))
    return jobsChain
  }

  async function pump() {
    if (running || packing || stopped || !queue.length) return
    running = queue.shift()
    try {
      for (const args of running.steps) {
        if (stopped) break
        const r = await importer(args)
        if (stopped) break // the server is stopping: the job stays in jobs.json for the next start (resume)
        if (r.code === 0) continue
        const st = attr(rootTag(await readOr(join(AREAS[running.game].library, running.id, 'status.xml')), 'status'), 'state')
        const why = (await redact(r.err)).trim().split('\n').slice(-12).join('\n')
        // the importer records its own failures cleanly; anything else (crash, timeout, no Python) is ours to report
        if (st !== 'failed' || r.signal) await setStatus(running.id, 'failed', why || `the importer stopped with exit code ${r.code}`, running.game)
        break
      }
    } finally {
      running = null
      saveJobs()
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

  async function book(id, game = 'ca2') {
    const dir = join(AREAS[game].library, id)
    const [imp, status, upload, reviewHead] = await Promise.all([...['import.xml', 'status.xml', 'upload.xml'].map(f => readOr(join(dir, f))), head(join(dir, 'review.xml'))])
    const rv = rootTag(reviewHead, 'review')
    const it = rootTag(imp, 'import'), st = rootTag(status, 'status')
    const counts = Object.fromEntries([...(imp ?? '').matchAll(/<file\b[^>]*>/g)].map(m => [attr(m[0], 'name'), Number(attr(m[0], 'entries'))]))
    // a busy book shows its job (Waiting; Importing… and its step; Removing), never its last state or error, which its
    // status.xml may hold until the job's first step writes (if the new import fails, its own error shows)
    const now = attr(st, 'state'), job = running?.game === game && running.id === id ? running : null
    const cmd = job?.steps.at(-1)?.[AREAS[game].pre.length]
    // a folder with no status yet (its PDF put there by hand or a restore, never imported): not imported, nothing running
    const state = !busy(id, game) ? now ?? 'uploaded' : !job ? 'queued' : cmd === 'run' ? 'importing' : cmd === 'remove' ? 'removing'
      : STEPS.includes(now) ? now : 'queued'
    return {
      id, file: attr(rootTag(upload, 'upload'), 'file') ?? attr(it, 'file'), state, ...state === 'importing' && STEPS.includes(now) ? { step: now } : {},
      message: status && (!busy(id, game) || now === 'queued' || STEPS.includes(now)) ? unesc(status.replace(/^[\s\S]*?<status\b[^>]*>|<\/status>[\s\S]*$/g, '')) : '',
      source: attr(it, 'source'), name: attr(it, 'name'), canon: attr(it, 'canon') === undefined ? undefined : attr(it, 'canon') === 'true',
      recipe: attr(it, 'recipe'), imported: attr(it, 'imported'), counts, busy: busy(id, game),
      ...attr(it, 'extra') ? { extra: attr(it, 'extra').split(' ').filter(Boolean) } : {}, // further sources (an SR6 city chapter)
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

  async function upload(req, res, send, game = 'ca2') {
    const area = AREAS[game]
    if (!/^application\/pdf\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'only PDF files can be uploaded' })
    if (Number(req.headers['content-length']) > MAX_PDF) {
      res.setHeader('Connection', 'close')
      return send(res, 413, { error: 'the file is larger than 500 MB' })
    }
    const id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
    // streamed to a hidden folder (not a book id, so not listed), then made the entry: a new one, or the same file's
    const tmp = join(area.library, `.upload-${id}`), file = safeName(req.headers['x-filename'])
    await mkdir(tmp, { recursive: true })
    const sha = createHash('sha256')
    let size = 0
    try {
      await pipeline(req, async function* (src) {
        for await (const c of src) {
          if ((size += c.length) > MAX_PDF) throw fail(413, 'the file is larger than 500 MB')
          sha.update(c)
          yield c
        }
      }, createWriteStream(join(tmp, 'original.pdf'), { flags: 'wx' }))
      const fh = await open(join(tmp, 'original.pdf'))
      const head = Buffer.alloc(5)
      await fh.read(head, 0, 5, 0).finally(() => fh.close())
      if (head.toString('latin1') !== '%PDF-') throw fail(415, 'this file is not a PDF')
    } catch (e) {
      await rm(tmp, { recursive: true, force: true })
      if (e.code === 413) res.setHeader('Connection', 'close')
      return send(res, typeof e.code === 'number' ? e.code : 500, { error: e.code === 413 || e.code === 415 ? e.message : 'upload failed' })
    }
    const hex = sha.digest('hex')
    // the same file again (same game, same sha256): its entry is imported again in place, whatever its state (another
    // printing has another sha256: a new entry). Busy: refused. Read by AI: kept as it is (a re-import drops the review's entries)
    const same = (await entries(game)).filter(e => e.sha === hex).sort(newestFirst)[0]
    if (same && (busy(same.id, game) || same.recipe === 'ai')) {
      await rm(tmp, { recursive: true, force: true })
      return busy(same.id, game) ? send(res, 409, { error: 'this book is already being imported or removed; try again when it’s done' })
        : send(res, 202, { id: same.id })
    }
    const dir = join(area.library, same?.id ?? id)
    if (same) {
      await rename(join(tmp, 'original.pdf'), join(dir, 'original.pdf'))
      await rm(tmp, { recursive: true, force: true })
    } else await rename(tmp, dir)
    await writeAtomic(join(dir, 'upload.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<upload file="${esc(file)}" size="${size}" sha256="${hex}" uploaded="${new Date().toISOString()}"/>\n`)
    if (game === 'ca2') await dropPackMarks(hex) // a book file uploaded again: chosen over a loaded data pack, as with Re-import
    await setStatus(same?.id ?? id, 'queued', '', game)
    enqueue(same?.id ?? id, [...same ? [[...area.pre, 'remove', dir, '--custom', area.custom]] : [],
      [...area.pre, 'run', dir, '--custom', area.custom, '--file', file]], game)
    return send(res, 202, { id: same?.id ?? id })
  }

  async function aiSettings(game = 'ca2') {
    const xml = (await readOr(join(aiConfig(game), 'ai-providers.xml'), `<ca2:aiproviders xmlns:ca2="${CONFIG_NS}" version="1"/>`))
      .replace(/^\s*<\?xml[^>]*\?>\s*/, '').trim()
    const keys = await readOr(join(aiConfig(game), 'ai-keys.xml'), '')
    const set = p => new RegExp(`<key\\s+provider="${p}"\\s*>\\s*[^<\\s]`).test(keys)
    const summary = PROVIDERS.map(p => `  <key provider="${p}" set="${set(p)}"/>\n`).join('')
    const out = /\/>$/.test(xml) && !/<\/ca2:aiproviders>$/.test(xml)
      ? xml.replace(/\s*\/>$/, `>\n${summary}</ca2:aiproviders>`)
      : xml.replace(/<\/ca2:aiproviders>$/, `${summary}</ca2:aiproviders>`)
    return `<?xml version="1.0" encoding="UTF-8"?>\n${out}\n`
  }

  // never log or echo this route's body: it holds API keys
  async function putKeys(req, game = 'ca2') {
    const text = await body(req, 64 * 1024)
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw fail(400, 'bad keys document')
    const keys = [...text.matchAll(/<key\s+provider="([a-z]+)"\s*(?:\/>|>([^<]*)<\/key>)/g)].filter(m => PROVIDERS.includes(m[1]))
    if (!keys.length) throw fail(400, 'no <key provider="…"> for a known provider')
    for (const [, provider, value = ''] of keys) await setKey(provider, unesc(value).trim(), game)
  }

  /** `fn` after the chain's previous call (the request is counted by track()). */
  function serial(chain, fn) {
    const run = chains[chain].then(fn)
    chains[chain] = run.catch(() => {})
    return run
  }

  function setKey(provider, value, game) {
    return serial('key', async () => {
      await mkdir(AREAS[game].library, { recursive: true })
      const r = await importer(['set-key', AREAS[game].library, provider], { input: value, timeout: 30000 })
      if (r.code !== 0) throw fail(500, 'couldn’t store the key: ' + (await redact(r.err)).trim().split('\n').pop())
    })
  }

  /** Save ai-providers.xml through the importer: the parser that later reads the file for a call is the one that
   *  checks it and compares base URLs (a provider whose address changed has its key cleared first; a key is only
   *  sent to the address it was entered for). Queued with the key writes, which it may make. */
  function putSettings(xml, game = 'ca2') {
    return serial('key', async () => {
      await mkdir(AREAS[game].library, { recursive: true })
      const r = await importer(['set-settings', '--library', AREAS[game].library], { input: xml, timeout: 30000 })
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(400, why || 'these aren’t provider settings')
      const out = rootTag(r.out, 'result')
      if (r.code !== 0 || !out) throw fail(500, 'couldn’t save the settings: ' + why)
      return (attr(out, 'cleared') ?? '').split(' ').filter(Boolean)
    })
  }

  /** The provider's model ids. Read-only, so outside the job queue and the key chain but one at a time; the importer
   *  reads the saved address before the key, and only the provider id comes from the request. */
  async function listModels(provider, game = 'ca2') {
    if (!PROVIDERS.includes(provider)) throw fail(400, 'unknown provider')
    const run = listChain.then(() => importer(['list-models', provider, '--library', AREAS[game].library], { timeout: 60000 }))
    listChain = run
    const r = await run
    if (r.code === 0) return r.out.split('\n').map(s => s.trim()).filter(Boolean)
    const why = (await redact(r.err)).trim().split('\n').pop()
    throw fail(502, r.code === 3 && why ? why : 'the importer couldn’t ask the provider' + (why ? `: ${why}` : ''))
  }

  /** Is the provider connected? `importer test-ai`: the saved address, model and key, a tiny fixed prompt. */
  async function testProvider(provider, game = 'ca2') {
    if (!PROVIDERS.includes(provider)) throw fail(400, 'unknown provider')
    if (testing) throw Object.assign(fail(429, 'a connection test is already running; wait for it'), { retryAfter: 5 })
    const now = Date.now()
    while (tests.length && tests[0] < now - 60000) tests.shift()
    if (tests.length >= 10) throw Object.assign(fail(429, 'that’s 10 tests in a minute; wait a moment'), { retryAfter: Math.ceil((tests[0] + 60000 - now) / 1000) })
    tests.push(now)
    testing = importer(['test-ai', provider, '--library', AREAS[game].library], { timeout: 30000 })
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
  async function askAvailable(game = 'ca2') {
    const xml = await readOr(join(aiConfig(game), 'ai-providers.xml'), '')
    const use = attr(rootTag(xml, 'ca2:aiproviders'), 'use')
    const p = use && [...xml.matchAll(/<provider\b[^>]*>/g)].map(m => m[0]).find(t => attr(t, 'id') === use)
    if (!p || attr(p, 'enabled') !== 'true') return false
    const key = new RegExp(`<key\\s+provider="${use}"\\s*>\\s*[^<\\s]`).test(await readOr(join(aiConfig(game), 'ai-keys.xml'), ''))
    return key || (use === 'openai' && !!attr(p, 'baseUrl'))
  }

  async function ask(req, who, game = 'ca2') {
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) throw fail(415, 'send { question } as application/json')
    let question, scope
    try { ({ question, scope } = JSON.parse(await body(req, 8192)) ?? {}) } catch (e) { throw e.code === 413 ? e : fail(400, 'send { question } as JSON') }
    question = typeof question === 'string' ? clean(question).replace(/\s+/g, ' ').trim() : ''
    if (!question || question.length > MAX_QUESTION) throw fail(400, `a question is 1–${MAX_QUESTION} characters`)
    if (!await askAvailable(game)) throw fail(409, `Ask the rules isn’t set up${game === 'sr6' ? ' for Shadowrun 6' : ''}: the admin chooses an AI provider and its key in AI settings`)
    if (asking.has(who.id)) throw Object.assign(fail(429, 'your last question is still being answered; wait for it'), { retryAfter: 5 })
    if (asking.size >= ASK_AT_ONCE) throw Object.assign(fail(429, 'Ask the rules is busy; try again in a moment'), { retryAfter: 5 })
    const limit = who.dailyQuestions ?? null
    if (limit != null && usedToday(who.id) >= limit)
      throw Object.assign(fail(429, limitReached(limit)),
        { retryAfter: Math.ceil((Date.parse(`${utcDay()}T00:00:00Z`) + 86400e3 - Date.now()) / 1000) })
    asking.add(who.id)
    let r
    try {
      const area = AREAS[game]
      r = await importer([...area.pre, 'ask', '--custom', area.custom, '--library', area.library, ...(scope === 'rules' ? ['--scope', 'rules'] : [])],
        { input: question, timeout: askTimeout })
    } finally { asking.delete(who.id) }
    console.log(`ask${game === 'sr6' ? ' (sr6)' : ''}: ${who.username} at ${new Date().toISOString()}`) // never the question or the answer
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
    const sources = (Array.isArray(out.sources) ? out.sources : []).slice(0, 8).map(s => ({ source: text(s?.source), page: text(s?.page), title: text(s?.title), kind: text(s?.kind), id: text(s?.id) }))
    return { answer: (await redact(String(out.answer ?? ''))).slice(0, 6000), sources, covered: out.covered === true, used: usedToday(who.id), limit }
  }

  /** One `importer edit …` call after the previous one; exit 3 is a refusal whose reason goes back as a 400. */
  function edit(args, input, area = AREAS.ca2) {
    return serial('edit', async () => {
      const r = await importer([...area.pre, 'edit', ...args, '--custom', area.custom], { input, timeout: 60000 })
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(400, why || 'the importer refused the edit')
      if (r.code !== 0) throw fail(500, 'couldn’t save the edit: ' + why)
      return r.out
    })
  }

  async function edits(req, res, url, send, who, game = 'ca2') {
    const p = url.pathname, method = req.method, area = AREAS[game]
    if (p === '/api/edits' && method === 'GET') {
      const xml = (await readOr(join(area.custom, 'edits', 'edits.xml'), '')).replace(/<!--[\s\S]*?-->/g, '')
      const kind = Object.fromEntries(Object.entries(area.kinds).map(([k, t]) => [t, k]))
      // entries only: an SR6 entry's parts can share a kind's tag (a priority's <metatype>, a critter's <gear>) but have no id
      return send(res, 200, [...xml.matchAll(/<([a-z]+)\b[^>]*>/g)].filter(m => Object.hasOwn(kind, m[1]) && attr(m[0], 'id'))
        .map(m => ({ kind: kind[m[1]], id: attr(m[0], 'id') })))
    }
    if (p === '/api/edits/sources' && game === 'sr6') return send(res, 404, { error: 'not found' }) // S1: no SR6 house sources
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
    if (!Object.hasOwn(area.kinds, m[1])) throw fail(400, game === 'ca2' ? 'kind is amps, items or rules' : 'unknown kind')
    if (!ENTRY_ID.test(id)) throw fail(400, 'bad entry id')
    if (method === 'PUT') {
      await edit(['set', m[1], id, '--by', who.username], xmlBody(await body(req, MAX_EDIT), 'edit'), area)
      return send(res, 204, '', 'text/plain')
    }
    if (method === 'DELETE') return send(res, 200, { removed: attr(rootTag(await edit(['remove', m[1], id], undefined, area), 'result'), 'removed') === 'true' })
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
      if (r.locked !== undefined && typeof r.locked !== 'boolean') throw fail(400, 'a rule is locked (true) or not (false)')
      if (!name && text) throw fail(400, 'a house rule needs a name')
      if (name.length > 120 || text.length > 4000) throw fail(400, 'a house rule’s name is 120 characters at most, its description 4,000')
      return `  <rule id="${id}" on="${r.on}"${r.locked ? ' locked="true"' : ''}>${name ? `<name>${esc(name)}</name><text>${esc(text)}</text>` : ''}</rule>\n`
    })
    await serial('table', () => writeAtomic(join(customDir, 'table-rules.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n'
      + `<ca2:tablerules xmlns:ca2="${CONFIG_NS}" version="1">\n${rows.join('')}</ca2:tablerules>\n`))
    return send(res, 204, '', 'text/plain')
  }

  /** The SR6 creation rules (custom/sr6/creation.xml), all at once: Game data sends the whole list on every save. */
  async function creation(req, res, send) {
    const path = join(AREAS.sr6.custom, 'creation.xml')
    if (req.method === 'GET') return send(res, 200, readSettings(await readOr(path, '')))
    if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'send the creation rules as application/json' })
    let b
    try { b = JSON.parse(await body(req, 1024 * 1024)) } catch (e) { throw e.code === 413 ? e : fail(400, 'send { settings: [{ key, value, source?, page? }] } as JSON') }
    if (!Array.isArray(b?.settings)) throw fail(400, `send { settings: [{ key, value, source?, page? }] }, ${MAX_SETTINGS} settings at most`)
    const rows = creationSettings(b.settings).map(s => `  ${settingXml(s)}\n`)
    await mkdir(AREAS.sr6.custom, { recursive: true })
    await serial('creation', () => writeAtomic(path, '<?xml version="1.0" encoding="UTF-8"?>\n'
      + `<sr6:creation xmlns:sr6="urn:chummer-sr6:config:1" version="1">\n${rows.join('')}</sr6:creation>\n`))
    return send(res, 204, '', 'text/plain')
  }

  /** The game's Library entries with a PDF's sha256: [{ id, sha, state, recipe, when (uploaded, else imported) }]. */
  async function entries(game) {
    const lib = AREAS[game].library, out = []
    for (const d of await readdir(lib, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory() || !BOOK_ID.test(d.name)) continue
      const [up, imp, st] = await Promise.all([['upload.xml', 'upload'], ['import.xml', 'import'], ['status.xml', 'status']]
        .map(async ([f, root]) => rootTag(await readOr(join(lib, d.name, f)), root)))
      out.push({ id: d.name, sha: attr(up, 'sha256') ?? attr(imp, 'sha256') ?? '', state: attr(st, 'state'), recipe: attr(imp, 'recipe'),
        when: attr(up, 'uploaded') ?? attr(imp, 'imported') ?? '' })
    }
    return out.filter(e => SHA256.test(e.sha))
  }
  const newestFirst = (a, b) => b.when.localeCompare(a.when) || b.id.localeCompare(a.id)
  /** Before 0.9.4 every upload was a new entry, so one PDF uploaded twice (a failed book tried again) left two. Per game and
   *  sha256 one stays: the newest whose import went through (KEEP), else the newest. The others go by the usual remove
   *  (--files; outputs the kept copy also holds stay, the index and sources are rebuilt). A data pack's mark on that file
   *  (core-rebuild.xml, found by sha256) moves to the entry kept. */
  async function dedupe() {
    for (const game of Object.keys(AREAS)) {
      const lib = AREAS[game].library, groups = new Map()
      for (const e of await entries(game)) if (!busy(e.id, game)) groups.set(e.sha, [...groups.get(e.sha) ?? [], e])
      for (const g of groups.values()) {
        if (g.length < 2) continue
        g.sort(newestFirst)
        const keep = g.find(e => KEEP.includes(e.state)) ?? g[0], drop = g.filter(e => e !== keep)
        const kept = rootTag(await readOr(join(lib, keep.id, 'core-rebuild.xml')), 'rebuild')
        for (const e of drop) {
          const mark = await readOr(join(lib, e.id, 'core-rebuild.xml'))
          if (mark && (!kept || (attr(rootTag(mark, 'rebuild'), 'pack') && !attr(kept, 'pack')))) await writeAtomic(join(lib, keep.id, 'core-rebuild.xml'), mark)
          await setStatus(e.id, 'queued', `The same file as ${keep.id}: this copy is removed`, game)
          enqueue(e.id, [[...AREAS[game].pre, 'remove', join(lib, e.id), '--custom', AREAS[game].custom, '--files']], game)
        }
        const name = attr(rootTag(await readOr(join(lib, keep.id, 'upload.xml')), 'upload'), 'file') ?? keep.id
        console.log(`Books${game === 'sr6' ? ' (SR6)' : ''}: ${name} was uploaded ${g.length} times: kept ${keep.id}, removing ${drop.map(e => e.id).join(', ')}`)
      }
    }
  }

  /** After a restart no job is running. The jobs left in jobs.json run again, in their order (the running one first);
   *  then, in both games and in upload order, a book still showing a job (queued, importing, …) or a restart's failure
   *  (`Interrupted by a restart`, or the `stopped (SIGTERM…)` 0.10.2 wrote for the book it killed) is re-imported if it
   *  can be (its PDF, not read by AI), else marked interrupted. A Re-import all left mid-way goes on (its batch kept).
   *  jobs: false after a restore (a backup's own jobs.json is not run). */
  async function resume({ jobs = true } = {}) {
    let saved = null
    try { saved = jobs ? JSON.parse(await readOr(JOBS, 'null')) : null } catch { saved = null }
    if (saved?.batches) batches = { ...batches, ...saved.batches }
    for (const j of saved?.jobs ?? []) {
      if (!AREAS[j?.game] || !BOOK_ID.test(j.id ?? '') || busy(j.id, j.game) || !Array.isArray(j.steps)) continue
      if (!await stat(join(AREAS[j.game].library, j.id)).then(() => true, () => false)) continue // removed meanwhile
      await setStatus(j.id, 'queued', 'Resumed after a restart', j.game)
      queue.push({ game: j.game, id: j.id, steps: j.steps })
    }
    const live = ['queued', 'converting', 'identifying', 'extracting', 'proposing', 'applying']
    for (const [game, area] of Object.entries(AREAS)) {
      const ids = (await readdir(area.library, { withFileTypes: true }).catch(() => []))
        .filter(d => d.isDirectory() && BOOK_ID.test(d.name)).map(d => d.name).sort()
      for (const id of ids) {
        if (busy(id, game)) continue
        const dir = join(area.library, id), status = await readOr(join(dir, 'status.xml'))
        const st = attr(rootTag(status, 'status'), 'state')
        const cut = live.includes(st) || (st === 'failed' && /Interrupted by a restart|^stopped (?:by a restart|\(SIG)/m.test(unesc(status ?? '')))
        if (!cut) continue
        const pdf = await stat(join(dir, 'original.pdf')).then(() => true, () => false)
        if (pdf && attr(rootTag(await readOr(join(dir, 'import.xml')), 'import'), 'recipe') !== 'ai') {
          await queueReimport(id, game, { start: false, message: 'Resumed after a restart' })
        } else if (st !== 'failed' || !/Interrupted by a restart/.test(status)) {
          await setStatus(id, 'failed', 'Interrupted by a restart — re-import', game)
        }
      }
    }
    saveJobs() // (a finished batch goes there) // (the caller starts the queue: at start-up once an interrupted data pack is recovered)
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
  // pump() resolves when its first job ends: started (and dedupe, rebuildCore) must not wait for a resumed import
  const started = resume().then(recoverCore).then(() => { pump() }).then(dedupe).then(rebuildCore).catch(e => console.error(e.stack))
  for (const a of Object.values(AREAS)) { // uploads cut off by a stop
    try {
      for (const f of readdirSync(a.library)) if (f.startsWith('.upload-')) rmSync(join(a.library, f), { recursive: true, force: true })
    } catch { /* no folder yet */ }
  }
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
    await resume({ jobs: false })
    pump()
    void rebuildCore().catch(e => console.error(e.stack)) // a backup from before the core data was imported
    const why = (await redact(r.err)).trim().split('\n').pop()
    if (r.code === 3) throw fail(400, why || 'the backup was refused')
    if (r.code !== 0) return send(res, 500, { error: `the restore failed (${why || `exit code ${r.code}`}); the server’s earlier data is in its safety backup in library/.backups` })
    return send(res, 200, { ok: true })
  }

  /** `game` 'sr6': an /api/sr6/… request with the prefix taken off (server.mjs); see sr6(). */
  async function handle(req, res, url, send, who, game = 'ca2') {
    const p = url.pathname, method = req.method
    if (game === 'sr6') return sr6(req, res, url, send, who)
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
    if (p === '/api/books' && (method === 'POST' || method === 'GET')) return books(req, res, send)
    if (await ai(req, res, url, send, who) !== false) return
    if (p === '/api/edits' || p.startsWith('/api/edits/')) return edits(req, res, url, send, who)
    if (p === '/api/table-rules') return tableRules(req, res, send)
    if (p === '/api/samples') return sampleSets(req, res, send)

    if (p === '/api/books/reimport-all') return reimportAll(req, res, send)
    const m = p.match(/^\/api\/(books|review)\/([^/]+)(?:\/(report|reimport|ai))?$/)
    return m ? bookRoute(req, res, url, send, m) : false
  }

  /** The game's AI: its settings, keys, model list and test, and Ask the rules (the same routes for both games); false: not one. */
  async function ai(req, res, url, send, who, game = 'ca2') {
    const p = url.pathname, method = req.method
    if (p === '/api/ai-settings' && method === 'GET') return send(res, 200, await aiSettings(game), 'application/xml; charset=utf-8')
    if (p === '/api/ai-settings' && method === 'PUT') {
      const cleared = await putSettings(await body(req), game)
      return send(res, 200, cleared.length ? { cleared, message: 'Key cleared because the address changed — enter it again' } : { cleared })
    }
    if (p === '/api/ai-test' && method === 'POST') return send(res, 200, await testProvider(url.searchParams.get('provider') ?? '', game))
    if (p === '/api/ai-models' && method === 'GET') {
      const provider = url.searchParams.get('provider') ?? '', ids = await listModels(provider, game)
      return send(res, 200, provider === 'anythingllm' // the importer prints slug<TAB>name
        ? { workspaces: ids.map(l => ({ slug: l.split('\t')[0], name: l.slice(l.indexOf('\t') + 1) })) } : { models: ids })
    }
    if (p === '/api/ask' && method === 'GET')
      return send(res, 200, { available: await askAvailable(game), limit: who.dailyQuestions ?? null, used: usedToday(who.id) })
    if (p === '/api/ask' && method === 'POST') return send(res, 200, await ask(req, who, game))
    if (p === '/api/ask') return send(res, 405, { error: 'method not allowed' })
    if (p === '/api/ai-keys' && method === 'PUT') {
      await putKeys(req, game)
      return send(res, 204, '', 'text/plain')
    }
    return false
  }

  /** GET /api/books (the list) and POST (an upload) in the game's area. */
  async function books(req, res, send, game = 'ca2') {
    if (req.method === 'POST') return upload(req, res, send, game)
    const lib = AREAS[game].library
    await mkdir(lib, { recursive: true })
    const ids = (await readdir(lib, { withFileTypes: true })).filter(d => d.isDirectory() && BOOK_ID.test(d.name)).map(d => d.name).sort()
    return send(res, 200, await Promise.all(ids.map(id => book(id, game))))
  }

  /** The SR6 area: the books routes without AI book import, review or data pack, the edits without house sources (S1), the
   *  creation rules (S2) and its own AI (settings, keys, Ask the rules). Any other path: false (server.mjs answers 404). */
  async function sr6(req, res, url, send, who) {
    const p = url.pathname
    if (await ai(req, res, url, send, who, 'sr6') !== false) return
    if (p === '/api/books' && (req.method === 'POST' || req.method === 'GET')) return books(req, res, send, 'sr6')
    if (p === '/api/edits' || p.startsWith('/api/edits/')) return edits(req, res, url, send, who, 'sr6')
    if (p === '/api/creation') return creation(req, res, send)
    if (p === '/api/books/reimport-all') return reimportAll(req, res, send, 'sr6')
    const m = p.match(/^\/api\/(books)\/([^/]+)(?:\/(report|reimport))?$/)
    return m ? bookRoute(req, res, url, send, m, 'sr6') : false
  }

  /** Clear a book's outputs and import it again from its original.pdf (the converted book.md reused when the importer
   *  finds it made from the same file by the same converter). The caller checked it isn't busy or read by AI. */
  async function queueReimport(id, game, { start = true, message = '' } = {}) {
    const area = AREAS[game], dir = bookDir(id, game)
    const imp = rootTag(await readOr(join(dir, 'import.xml')), 'import')
    const file = attr(imp, 'file') ?? attr(rootTag(await readOr(join(dir, 'upload.xml')), 'upload'), 'file')
    // the admin chose the book over a loaded data pack: its pack marks go (this folder's, and any for the same file)
    if (game === 'ca2') {
      if (attr(rootTag(await readOr(join(dir, 'core-rebuild.xml')), 'rebuild'), 'pack')) await rm(join(dir, 'core-rebuild.xml'), { force: true })
      await dropPackMarks(attr(imp, 'sha256'))
    }
    await setStatus(id, 'queued', message, game)
    const steps = [[...area.pre, 'remove', dir, '--custom', area.custom],
      [...area.pre, 'run', dir, '--custom', area.custom, '--reuse', ...(file ? ['--file', file] : [])]]
    if (start) enqueue(id, steps, game)
    else queue.push({ game, id, steps }) // (resume: the caller saves and starts the queue once all are in)
  }

  /** POST /api/[sr6/]books/reimport-all: every book folder with its PDF, in upload order (ids sort by time). One at a
   *  time, so a second click finds the first one's books busy instead of queueing them twice. */
  let reimporting = Promise.resolve()
  async function reimportAll(req, res, send, game = 'ca2') {
    if (req.method === 'GET') { // the batch still running (one a restart resumed too), for a page opened meanwhile
      const b = batches[game]
      return send(res, 200, b && b.queued.some(id => busy(id, game)) ? b : { queued: [], skipped: [] })
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
    const run = reimporting.then(() => queueAll(game))
    reimporting = run.catch(() => {})
    const r = await run
    if (r.queued.length) { batches[game] = r; await saveJobs() }
    return send(res, 202, r)
  }
  async function queueAll(game) {
    const lib = AREAS[game].library
    await mkdir(lib, { recursive: true })
    const ids = (await readdir(lib, { withFileTypes: true })).filter(d => d.isDirectory() && BOOK_ID.test(d.name)).map(d => d.name).sort()
    const queued = [], skipped = []
    for (const id of ids) {
      const dir = join(lib, id)
      const why = busy(id, game) ? 'busy' : !await stat(join(dir, 'original.pdf')).then(() => true, () => false) ? 'no PDF'
        : attr(rootTag(await readOr(join(dir, 'import.xml')), 'import'), 'recipe') === 'ai' ? 'read by AI' : null
      if (why) { skipped.push({ id, why }); continue }
      await queueReimport(id, game)
      queued.push(id)
    }
    return { queued, skipped }
  }

  /** One book's routes: m = [, books|review, id, action]. */
  async function bookRoute(req, res, url, send, m, game = 'ca2') {
    const method = req.method, area = AREAS[game]
    const [, kind, rawId, action] = m
    let id
    try { id = decodeURIComponent(rawId) } catch { throw fail(400, 'bad book id') }
    const dir = bookDir(id, game)
    const status = await readOr(join(dir, 'status.xml'))
    const hasUpload = await readOr(join(dir, 'upload.xml')) ?? await readOr(join(dir, 'import.xml'))
    if (status == null && hasUpload == null) return send(res, 404, { error: 'no such book' })
    const imp = rootTag(await readOr(join(dir, 'import.xml')), 'import')
    const state = attr(rootTag(status, 'status'), 'state')
    const needsQuiet = () => { if (busy(id, game)) throw fail(409, 'this book is busy; wait for it to finish') }

    if (kind === 'review') {
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
      await queueReimport(id, game)
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
      await setStatus(id, 'queued', '', game)
      enqueue(id, [[...area.pre, 'remove', dir, '--custom', area.custom, ...(url.searchParams.get('files') === '1' ? ['--files'] : [])]], game)
      return send(res, 202, { id })
    }
    return send(res, 405, { error: 'method not allowed' })
  }

  // shutdown: stop the running importer (the next start marks its book interrupted) and any model list
  // and backups being made; pending restore uploads and unfetched backups are deleted
  const stop = () => {
    stopped = true
    child?.kill(); listChild?.kill(); testChild?.kill()
    for (const p of spawned) p.kill()
    for (const map of [uploads, downloads, packs, packUploads]) for (const t of [...map.keys()]) rmSync(take(map, t), { recursive: true, force: true })
  }
  return { handle, stop, track, started, libraryDir: resolve(libraryDir) }
}
