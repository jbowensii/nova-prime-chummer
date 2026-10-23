// The Books API's re-imports: one book's (queueReimport), Re-import all, and what a start (or a restore) picks up again:
// the jobs a restart cut off (resume), the same PDF uploaded twice (dedupe), the core data built by the import
// (rebuildCore, with the data pack's marks) and a data pack import killed mid-swap (recoverCore).
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { BOOK_ID, attr, esc, readOr, rootTag, unesc, writeAtomic } from './common.mjs'

const KEEP = ['done', 'skipped', 'superseded'] // an import that went through (of one file's entries, the newest of these stays)
// the core files (as src/ca2/catalog/domain/load.ts CORE_FILES, importer/__init__.py CORE_FILES)
const CORE_FILES = [
  'ampeffects',
  'amptypes',
  'armor',
  'attributes',
  'levels',
  'lifestyles',
  'metatypes',
  'packages',
  'pricing',
  'skills',
  'vehicles',
  'weapons',
]

/** ctx (books.mjs): AREAS, version, queue, batches, the job queue (jobs.mjs), entries (library.mjs). */
export function resumeApi(ctx) {
  const { AREAS, version, queue } = ctx
  const customDir = AREAS.ca2.custom,
    libraryDir = AREAS.ca2.library // (the core data is Anarchy's)
  const { busy, bookDir, setStatus, enqueue, saveJobs, importer, redact, jobsFile } = ctx

  /** Clear a book's outputs and import it again from its original.pdf (the converted book.md reused when the importer
   *  finds it made from the same file by the same converter). The caller checked it isn't busy or read by AI. */
  async function queueReimport(id, game, { start = true, message = '' } = {}) {
    const area = AREAS[game],
      dir = bookDir(id, game)
    const imp = rootTag(await readOr(join(dir, 'import.xml')), 'import')
    const file = attr(imp, 'file') ?? attr(rootTag(await readOr(join(dir, 'upload.xml')), 'upload'), 'file')
    // the admin chose the book over a loaded data pack: its pack marks go (this folder's, and any for the same file)
    if (game === 'ca2') {
      if (attr(rootTag(await readOr(join(dir, 'core-rebuild.xml')), 'rebuild'), 'pack')) await rm(join(dir, 'core-rebuild.xml'), { force: true })
      await dropPackMarks(attr(imp, 'sha256'))
    }
    await setStatus(id, 'queued', message, game)
    const steps = [
      [...area.pre, 'remove', dir, '--custom', area.custom],
      [...area.pre, 'run', dir, '--custom', area.custom, '--reuse', ...(file ? ['--file', file] : [])],
    ]
    if (start) enqueue(id, steps, game)
    else queue.push({ game, id, steps }) // (resume: the caller saves and starts the queue once all are in)
  }

  /** POST /api/[sr6/]books/reimport-all: every book folder with its PDF, in upload order (ids sort by time). One at a
   *  time, so a second click finds the first one's books busy instead of queueing them twice. */
  let reimporting = Promise.resolve()
  async function reimportAll(req, res, send, game = 'ca2') {
    if (req.method === 'GET') {
      // the batch still running (one a restart resumed too), for a page opened meanwhile
      const b = ctx.batches[game]
      return send(res, 200, b && b.queued.some(id => busy(id, game)) ? b : { queued: [], skipped: [] })
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
    const run = reimporting.then(() => queueAll(game))
    reimporting = run.catch(() => {})
    const r = await run
    if (r.queued.length) {
      ctx.batches[game] = r
      await saveJobs()
    }
    return send(res, 202, r)
  }
  async function queueAll(game) {
    const lib = AREAS[game].library
    await mkdir(lib, { recursive: true })
    const ids = (await readdir(lib, { withFileTypes: true }))
      .filter(d => d.isDirectory() && BOOK_ID.test(d.name))
      .map(d => d.name)
      .sort()
    const queued = [],
      skipped = []
    for (const id of ids) {
      const dir = join(lib, id)
      const why = busy(id, game)
        ? 'busy'
        : !(await stat(join(dir, 'original.pdf')).then(
              () => true,
              () => false,
            ))
          ? 'no PDF'
          : attr(rootTag(await readOr(join(dir, 'import.xml')), 'import'), 'recipe') === 'ai'
            ? 'read by AI'
            : null
      if (why) {
        skipped.push({ id, why })
        continue
      }
      await queueReimport(id, game)
      queued.push(id)
    }
    return { queued, skipped }
  }

  /** Before 0.9.4 every upload was a new entry, so one PDF uploaded twice (a failed book tried again) left two. Per game and
   *  sha256 one stays: the newest whose import went through (KEEP), else the newest. The others go by the usual remove
   *  (--files; outputs the kept copy also holds stay, the index and sources are rebuilt). A data pack's mark on that file
   *  (core-rebuild.xml, found by sha256) moves to the entry kept. */
  async function dedupe() {
    for (const game of Object.keys(AREAS)) {
      const lib = AREAS[game].library,
        groups = new Map()
      for (const e of await ctx.entries(game)) if (!busy(e.id, game)) groups.set(e.sha, [...(groups.get(e.sha) ?? []), e])
      for (const g of groups.values()) {
        if (g.length < 2) continue
        g.sort(ctx.newestFirst)
        const keep = g.find(e => KEEP.includes(e.state)) ?? g[0],
          drop = g.filter(e => e !== keep)
        const kept = rootTag(await readOr(join(lib, keep.id, 'core-rebuild.xml')), 'rebuild')
        for (const e of drop) {
          const mark = await readOr(join(lib, e.id, 'core-rebuild.xml'))
          if (mark && (!kept || (attr(rootTag(mark, 'rebuild'), 'pack') && !attr(kept, 'pack'))))
            await writeAtomic(join(lib, keep.id, 'core-rebuild.xml'), mark)
          await setStatus(e.id, 'queued', `The same file as ${keep.id}: this copy is removed`, game)
          enqueue(e.id, [[...AREAS[game].pre, 'remove', join(lib, e.id), '--custom', AREAS[game].custom, '--files']], game)
        }
        const name = attr(rootTag(await readOr(join(lib, keep.id, 'upload.xml')), 'upload'), 'file') ?? keep.id
        console.log(
          `Books${game === 'sr6' ? ' (SR6)' : ''}: ${name} was uploaded ${g.length} times: kept ${keep.id}, removing ${drop.map(e => e.id).join(', ')}`,
        )
      }
    }
  }

  /** After a restart no job is running. The jobs left in jobs.json run again, in their order (the running one first);
   *  then, in both games and in upload order, a book still showing a job (queued, importing, …) or a restart's failure
   *  (`Interrupted by a restart`, or the `stopped (SIGTERM…)` 0.10.2 wrote for the book it killed) is re-imported if it
   *  can be (its PDF, not read by AI), else marked interrupted. A Re-import all left mid-way goes on (its batch kept).
   *  jobs: false after a restore (a backup's own jobs.json is not run). */
  async function resume({ jobs = true } = {}) {
    let saved
    try {
      saved = jobs ? JSON.parse(await readOr(jobsFile, 'null')) : null
    } catch {
      saved = null
    }
    if (saved?.batches) ctx.batches = { ...ctx.batches, ...saved.batches }
    for (const j of saved?.jobs ?? []) {
      if (!AREAS[j?.game] || !BOOK_ID.test(j.id ?? '') || busy(j.id, j.game) || !Array.isArray(j.steps)) continue
      if (
        !(await stat(join(AREAS[j.game].library, j.id)).then(
          () => true,
          () => false,
        ))
      )
        continue // removed meanwhile
      await setStatus(j.id, 'queued', 'Resumed after a restart', j.game)
      queue.push({ game: j.game, id: j.id, steps: j.steps })
    }
    const live = ['queued', 'converting', 'identifying', 'extracting', 'proposing', 'applying']
    for (const [game, area] of Object.entries(AREAS)) {
      const ids = (await readdir(area.library, { withFileTypes: true }).catch(() => []))
        .filter(d => d.isDirectory() && BOOK_ID.test(d.name))
        .map(d => d.name)
        .sort()
      for (const id of ids) {
        if (busy(id, game)) continue
        const dir = join(area.library, id),
          status = await readOr(join(dir, 'status.xml'))
        const st = attr(rootTag(status, 'status'), 'state')
        const cut = live.includes(st) || (st === 'failed' && /Interrupted by a restart|^stopped (?:by a restart|\(SIG)/m.test(unesc(status ?? '')))
        if (!cut) continue
        const pdf = await stat(join(dir, 'original.pdf')).then(
          () => true,
          () => false,
        )
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
    await writeAtomic(
      join(libraryDir, crb.id, 'core-rebuild.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<rebuild sha256="${esc(crb.sha)}" version="${esc(version)}" tried="${new Date().toISOString()}"/>\n`,
    )
    for (const b of books.sort((x, y) => x.order - y.order)) {
      const dir = join(libraryDir, b.id)
      await setStatus(b.id, 'queued', 'Re-importing to build the core data')
      enqueue(b.id, [
        ['remove', dir, '--custom', customDir],
        ['run', dir, '--custom', customDir, ...(b.file ? ['--file', b.file] : [])],
      ])
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
      const path = join(libraryDir, d.name, 'import.xml'),
        xml = await readOr(path)
      const next = xml?.replace(/[ \t]*<row\b[^>]*\/>\n?/g, r => (attr(r, 'kind') === 'core-ai' && files.includes(attr(r, 'file')) ? '' : r))
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

  return { queueReimport, reimportAll, resume, dedupe, rebuildCore, dropPackMarks, dropCoreAi, recoverCore, coreBooks }
}
