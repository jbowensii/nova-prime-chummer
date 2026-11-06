// Books API: PDF uploads into the Library, one importer job at a time, AI settings and the review queue.
// Who may call each route is server/auth.mjs's role table (need()): everything here is admin only, except the
// edits and the table rules (admin and editors; GET /api/edits and /api/sr6/creation: anyone signed in), SR6's
// creation rules (the server default: the admin), the example sets (GET, anyone signed in) and Ask the rules (/api/ask and
// /api/sr6/ask: anyone signed in); `who` is the signed-in user.
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
//                                     workspace); each game's Ask reads only its own data (importer/ask.py). The daily limit is
//                                     the account's, counted apart for each game
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
//   /api/sr6/books, /api/sr6/books/reimport-all, /api/sr6/books/:id[/report|/reimport], DELETE /api/sr6/books/:id[?files=1],
//   /api/sr6/edits[/:kind/:id]   the same for the Shadowrun 6 area
//                                     (library/sr6/, custom/sr6/, `importer sr6 …`; edit kinds: SR6_KINDS and samplefixes, existing entries only);
//                                     no AI book import, review, data pack or house sources there (404). One job queue for both games
//   GET    /api/sr6/creation          anyone signed in: the SR6 creation rules as [{ key, value, source?, page? }] ([] when none)
//   GET|POST /api/sr6/books/clear/(npcs|samples)  admin: the loaded book copies (sampleKey) in npcs/ or characters/ -> trash (server/sr6clear.mjs)
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
//                                     and has its key; limit: the account's dailyQuestions, null for none; used: answered today for this game, UTC)
//   POST   /api/ask                   anyone signed in: { question, scope? } (500 characters at most; scope "rules": the rules only,
//                                     the Rules page's search) -> { answer, sources: [{ source, page, title, kind, id }], covered, used, limit } through `importer ask` (60 s); one at a time per account and
//                                     ASK_AT_ONCE on the server (429); every question that reached the provider counts against the day's
//                                     limit, whatever came back (429 + Retry-After until UTC midnight); one the books don't cover without
//                                     asking it is free. Only the username and the time are logged; counts in library/.config/ask-counts.xml
//   POST   /api/backup[?keys=1]     makes the zip of characters/, custom/ and library/ (keys=1: with the API keys) -> { token };
//                                     one at a time (409); the zip waits 10 min for its token
//   GET    /api/backup/:token         the zip, once, as nova-prime-chummer-backup-<date>.zip
//   POST   /api/restore?preview=1     body: a backup zip -> { token, manifest }; the zip waits 30 min for its token
//   POST   /api/restore/:token        replaces all three folders from that zip (a safety backup is kept) -> { ok }
//                                     409 while a job, a write or a backup runs; every other write gets 409 while it runs
//   POST   /api/datapack              makes the data pack of custom/imported/core/ -> { token };
//                                     the zip waits 10 min for its token; 409 when there is no core data
//   GET    /api/datapack/:token       the pack, once, as nova-prime-chummer-datapack-<date>.zip
//   POST   /api/datapack/import       body: a data pack zip (50 MB at most), checked in full (importer/datapack.py check)
//                                     -> { token, pack: { app, created, files: [name…], replaces: [name…] } } (replaces: the core
//                                     files the server has now); the zip waits 30 min for its token, one pending at a time
//   POST   /api/datapack/import/:token loads that pack -> { files: [name…] }, the core files it replaced; 409 while a job or
//                                     another pack runs, and jobs wait for it. All are counted writes (track), so a restore
//                                     and they exclude each other.
//
// The code is in the modules booksApi wires together over one shared context (ctx): server/jobs.mjs (the importer, the
// job queue and the server-wide write lock), library.mjs (uploads, the list, one book's routes), resume.mjs (re-imports,
// Re-import all, what a start picks up again), ai.mjs, edits.mjs (edits, house sources, table rules, samples, SR6
// creation), backup.mjs (backup, restore, data packs) and common.mjs (the helpers they share).
import { readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { aiApi } from './ai.mjs'
import { backupApi } from './backup.mjs'
import { body } from './common.mjs'
import { editsApi } from './edits.mjs'
import { SR6_KINDS } from './games.mjs'
import { jobsApi } from './jobs.mjs'
import { libraryApi } from './library.mjs'
import { resumeApi } from './resume.mjs'
import { clearApply, clearPlan } from './sr6clear.mjs'

// ours in library/.backups (a download's folder holds its zip), and a killed restore's safety-backup temp
const TEMP_ZIP = /^(download|pack)-[0-9a-f]+$|^(upload|pack)-[0-9a-f]+\.zip$|^\.backup\..*\.tmp$/
const EDIT_KINDS = { amps: 'amp', items: 'item', rules: 'rule' }

export function booksApi({
  layout, // server/layout.mjs
  python = 'python3',
  importerRoot,
  version = 'unknown',
  restoreTtl = 30 * 60 * 1000,
  downloadTtl = 10 * 60 * 1000,
  askTimeout = 60000,
  onRestore = async () => {},
  awsConfigPath = async () => null, // the S3 settings file's path (the awsConfig setting, read when used)
  compendiumSources = async () => new Set(),
}) {
  const backups = layout.backups
  const { ca2: A, sr6: S } = layout.games
  // each game's books and catalog (server/games.mjs), run as `python -m importer [sr6] …`: library, custom (the importer's
  // --custom: imported/, edits/, …) and ai (the importer's --library for AI settings: .config/ in it). One job queue for both.
  const AREAS = {
    ca2: { library: A.library, custom: A.custom, ai: A.ai, pre: [], kinds: EDIT_KINDS },
    // (samplefixes: a book sample runner's printed line corrected, importer/sr6/edits.py)
    sr6: { library: S.library, custom: S.custom, ai: S.ai, pre: ['sr6'], kinds: { ...SR6_KINDS, samplefixes: 'samplefix' } },
  }
  // the modules' shared state; each adds its functions for the others (jobs first: the rest take theirs when made). They
  // depend on each other both ways (library calls resume's ctx.queueReimport, resume library's ctx.entries): a module
  // destructures from ctx only what the ones wired before it added, and reads a later one's as ctx.<name> when called,
  // so the wiring order below matters
  const ctx = {
    layout,
    python,
    importerRoot,
    version,
    restoreTtl,
    downloadTtl,
    askTimeout,
    onRestore,
    awsConfigPath,
    compendiumSources,
    AREAS,
    config: layout.config, // account-global files: jobs.json, ask-counts.xml
    backups,
    queue: [],
    running: null, // the job queue (the running job not in it)
    spawned: new Set(), // backup and ask processes, stopped with the server
    // the server-wide write lock: counted writes (track), a backup being made, a restore, a data pack being made or loaded
    lock: { writes: 0, zipping: 0, restoring: false, packing: false },
    batches: { ca2: null, sr6: null },
  } // each game's last Re-import all (jobs.json)
  const jobs = jobsApi(ctx)
  Object.assign(ctx, jobs)
  Object.assign(ctx, libraryApi(ctx))
  Object.assign(ctx, resumeApi(ctx))
  const { ai } = aiApi(ctx),
    { edits, sampleSets, tableRules, creation } = editsApi(ctx),
    backup = backupApi(ctx)
  const { books, bookRoute, reimportAll, track, pump } = ctx

  // pump() resolves when its first job ends: started (and dedupe, rebuildCore) must not wait for a resumed import
  const started = ctx
    .resume()
    .then(ctx.recoverCore)
    .then(() => {
      pump()
    })
    .then(ctx.dedupe)
    .then(ctx.rebuildCore)
    .catch(e => console.error(e.stack))
  for (const a of Object.values(AREAS)) {
    // uploads cut off by a stop
    try {
      for (const f of readdirSync(a.library)) if (f.startsWith('.upload-')) rmSync(join(a.library, f), { recursive: true, force: true })
    } catch {
      /* no folder yet */
    }
  }
  // zips left by a stop mid-download, mid-preview or mid-restore
  try {
    for (const f of readdirSync(backups, { withFileTypes: true })) if (TEMP_ZIP.test(f.name)) rmSync(join(backups, f.name), { recursive: true, force: true })
  } catch {
    /* no .backups yet */
  }
  // a killed restore's unpack and swap folders, at the top of each data folder (importer/backup.py; the safety backup
  // in library/.backups holds everything the old ones did)
  for (const d of layout.kind === 'data' ? [layout.root] : [layout.charDir, layout.customDir, layout.libraryDir]) {
    try {
      for (const f of readdirSync(d)) if (/^\.restore-(old|new|done)-/.test(f)) rmSync(join(d, f), { recursive: true, force: true })
    } catch {
      /* no folder yet */
    }
  }

  /** `game` 'sr6': an /api/sr6/… request with the prefix taken off (server.mjs); see sr6(). */
  async function handle(req, res, url, send, who, game = 'ca2') {
    const p = url.pathname,
      method = req.method
    if (game === 'sr6') return sr6(req, res, url, send, who)
    if (p === '/api/backup' && method === 'POST') return backup.makeBackup(req, res, url, send, who)
    const bt = p.match(/^\/api\/backup\/([^/]+)$/)
    if (bt && method === 'GET') return backup.sendZip('backup', bt[1], res, who)
    if (p === '/api/backup' || bt) return send(res, 405, { error: 'method not allowed' })
    if (p === '/api/restore' && method === 'POST' && url.searchParams.get('preview') === '1') return backup.preview(req, res, send, who)
    const rt = p.match(/^\/api\/restore\/([^/]+)$/)
    if (rt && method === 'POST') return backup.restore(rt[1], send, res, who)
    if (p === '/api/restore' || rt) return send(res, 405, { error: 'method not allowed' })
    if (p === '/api/cloud-backup') {
      if (method === 'GET') return send(res, 200, { backups: await backup.cloudList() })
      if (method === 'POST') return send(res, 200, await backup.cloudBackup())
      return send(res, 405, { error: 'method not allowed' })
    }
    if (p === '/api/cloud-backup/restore' && method === 'POST') return backup.cloudRestore(JSON.parse((await body(req, 4096)) || '{}').key ?? null, send, res)
    if (p === '/api/datapack' && method === 'POST') return backup.makePack(res, send, who)
    if (p === '/api/datapack/import' && method === 'POST') return backup.previewPack(req, res, send, who)
    const lt = p.match(/^\/api\/datapack\/import\/([^/]+)$/)
    if (lt && method === 'POST') return backup.loadPack(lt[1], res, send, who)
    if (lt) return send(res, 405, { error: 'method not allowed' })
    const pt = p.match(/^\/api\/datapack\/([^/]+)$/)
    if (pt && method === 'GET' && pt[1] !== 'import') return backup.sendZip('datapack', pt[1], res, who)
    if (p === '/api/datapack' || pt) return send(res, 405, { error: 'method not allowed' })
    if (p === '/api/books' && (method === 'POST' || method === 'GET')) return books(req, res, send)
    if ((await ai(req, res, url, send, who)) !== false) return
    if (p === '/api/edits' || p.startsWith('/api/edits/')) return edits(req, res, url, send, who)
    if (p === '/api/table-rules') return tableRules(req, res, send)
    if (p === '/api/samples') return sampleSets(req, res, send)

    if (p === '/api/books/reimport-all') return reimportAll(req, res, send)
    const m = p.match(/^\/api\/(books|review)\/([^/]+)(?:\/(report|reimport|ai))?$/)
    return m ? bookRoute(req, res, url, send, m) : false
  }

  /** The SR6 area: the books routes without AI book import, review or data pack, the edits without house sources (S1), the
   *  creation rules (S2) and its own AI (settings, keys, Ask the rules). Any other path: false (server.mjs answers 404). */
  async function sr6(req, res, url, send, who) {
    const p = url.pathname
    if ((await ai(req, res, url, send, who, 'sr6')) !== false) return
    if (p === '/api/books' && (req.method === 'POST' || req.method === 'GET')) return books(req, res, send, 'sr6')
    if (p === '/api/edits' || p.startsWith('/api/edits/')) return edits(req, res, url, send, who, 'sr6')
    if (p === '/api/creation') return creation(req, res, send)
    if (p === '/api/books/reimport-all') return reimportAll(req, res, send, 'sr6')
    const cl = p.match(/^\/api\/books\/clear\/(npcs|samples)$/)
    const store = cl && (cl[1] === 'npcs' ? S.npcs : S.chars)
    if (cl && req.method === 'GET') return send(res, 200, await clearPlan(store))
    if (cl && req.method === 'POST') {
      const base = layout.root ?? layout.charDir
      return send(res, 200, await clearApply(store, { base, backups, trash: join(base, '_to_delete') }))
    }
    if (cl) return send(res, 405, { error: 'method not allowed' })
    const m = p.match(/^\/api\/(books)\/([^/]+)(?:\/(report|reimport))?$/)
    return m ? bookRoute(req, res, url, send, m, 'sr6') : false
  }

  // shutdown: stop the running importer (the next start runs its job again: it stays in jobs.json, resume.mjs) and any model list
  // and backups being made; pending restore uploads and unfetched backups are deleted
  const stop = () => {
    jobs.stop()
    backup.stop()
  }
  return { handle, stop, track, started, libraryDir: resolve(A.library) }
}
