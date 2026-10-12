// The Books API's Library: PDF uploads into a game's library/ (each queued as an import), the book list and one book's
// routes (report, re-import, AI proposals, review, remove). Routes and roles: the top of server/books.mjs.
import { createHash, randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { BOOK_ID, SOURCE_ID, attr, body, clean, esc, fail, head, readOr, rootTag, safeName, unesc, writeAtomic, xmlBody } from './common.mjs'

const MAX_PDF = 500 * 1024 * 1024
const STEPS = ['converting', 'identifying', 'extracting', 'proposing', 'applying'] // a job's steps, as the importer writes them
const SHA256 = /^[0-9a-f]{64}$/

/** The core files named by import.xml rows of `kind`: core-unread (a recipe couldn't read them; the AI can propose any
 *  table's rows) or core-ai (read by AI from that book: to check against it). */
const coreRows = (imp, kind) => [...(imp ?? '').matchAll(/<row\b[^>]*>/g)].filter(m => attr(m[0], 'kind') === kind).map(m => attr(m[0], 'file'))
const coreUnread = imp => coreRows(imp, 'core-unread')

/** ctx (books.mjs): AREAS, customDir, libraryDir, the job queue (jobs.mjs) and dropPackMarks, queueReimport (resume.mjs). */
export function libraryApi(ctx) {
  const { AREAS, customDir, libraryDir } = ctx
  const { busy, bookDir, setStatus, enqueue, importer, redact } = ctx

  async function book(id, game = 'ca2') {
    const dir = join(AREAS[game].library, id)
    const [imp, status, upload, reviewHead] = await Promise.all([...['import.xml', 'status.xml', 'upload.xml'].map(f => readOr(join(dir, f))), head(join(dir, 'review.xml'))])
    const rv = rootTag(reviewHead, 'review')
    const it = rootTag(imp, 'import'), st = rootTag(status, 'status')
    const counts = Object.fromEntries([...(imp ?? '').matchAll(/<file\b[^>]*>/g)].map(m => [attr(m[0], 'name'), Number(attr(m[0], 'entries'))]))
    // a busy book shows its job (Waiting; Importing… and its step; Removing), never its last state or error, which its
    // status.xml may hold until the job's first step writes (if the new import fails, its own error shows)
    const running = ctx.running, now = attr(st, 'state'), job = running?.game === game && running.id === id ? running : null
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
    if (game === 'ca2') await ctx.dropPackMarks(hex) // a book file uploaded again: chosen over a loaded data pack, as with Re-import
    await setStatus(same?.id ?? id, 'queued', '', game)
    enqueue(same?.id ?? id, [...same ? [[...area.pre, 'remove', dir, '--custom', area.custom]] : [],
      [...area.pre, 'run', dir, '--custom', area.custom, '--file', file]], game)
    return send(res, 202, { id: same?.id ?? id })
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

  /** GET /api/books (the list) and POST (an upload) in the game's area. */
  async function books(req, res, send, game = 'ca2') {
    if (req.method === 'POST') return upload(req, res, send, game)
    const lib = AREAS[game].library
    await mkdir(lib, { recursive: true })
    const ids = (await readdir(lib, { withFileTypes: true })).filter(d => d.isDirectory() && BOOK_ID.test(d.name)).map(d => d.name).sort()
    return send(res, 200, await Promise.all(ids.map(id => book(id, game))))
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
        : ['apply-review', dir, '--custom', customDir, '--source', source, `--name=${clean(name)}`, '--canon', canon]]) // one argument, as add-source
      return send(res, 202, { id })
    }

    if (action === 'report' && method === 'GET')
      return imp ? send(res, 200, await readFile(join(dir, 'import.xml'), 'utf8'), 'application/xml; charset=utf-8') : send(res, 404, { error: 'not imported yet' })
    if (action === 'reimport' && method === 'POST') {
      needsQuiet()
      if (attr(imp, 'recipe') === 'ai') throw fail(409, 'a book read by AI can’t be re-imported; remove it, or apply its review again')
      await ctx.queueReimport(id, game)
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

  return { books, bookRoute, entries, newestFirst }
}
