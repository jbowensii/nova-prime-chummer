// The Books API's importer processes (`python -m importer …`, argument arrays, no shell), the one job queue for both games
// (library/.config/jobs.json, so a restart picks it up: resume.mjs) and the server-wide write lock (track) that a backup,
// a restore and a data pack share with every write. The lock's state is ctx.lock, read and set by backup.mjs too.
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { BOOK_ID, attr, clean, esc, fail, readOr, rootTag, unesc, writeAtomic } from './common.mjs'

const JOB_TIMEOUT = 6 * 3600 * 1000 // ponytail: one cap for all jobs; an AI run over a big book takes hours (it resumes if cut)

/** ctx (books.mjs): AREAS, customDir, config, python, importerRoot, queue, spawned, lock, batches; sets ctx.running. */
export function jobsApi(ctx) {
  const { AREAS, customDir, config, queue, spawned, lock } = ctx
  const [cmd, ...pre] = [].concat(ctx.python)
  let child = null,
    listChild = null,
    testChild = null
  let stopped = false // stop(): no job step starts afterwards (a step that ended as it was killed queued the next one)

  const bookDir = (id, game = 'ca2') => {
    if (!BOOK_ID.test(id)) throw fail(400, 'bad book id')
    return join(AREAS[game].library, id)
  }
  const busy = (id, game = 'ca2') => (ctx.running?.game === game && ctx.running.id === id) || queue.some(j => j.game === game && j.id === id)

  /** A game's AI settings and keys: Anarchy's in library/.config, SR6's in library/sr6/.config (backup.py ALL_KEYS). */
  const aiConfig = game => join(AREAS[game].library, '.config')
  /** Keys (both games'), bearer tokens and key-looking strings out of worker output before it reaches status.xml. */
  async function redact(text) {
    const keys = (await Promise.all(Object.keys(AREAS).map(g => readOr(join(aiConfig(g), 'ai-keys.xml'), ''))))
      .flatMap(x => [...x.matchAll(/<key\b[^>]*>([^<]+)<\/key>/g)])
      .map(m => unesc(m[1]).trim())
    for (const k of keys.filter(k => k.length >= 4)) text = text.split(k).join('[key]')
    return text.replace(/\b(sk-|AIza|xai-|gsk_)[\w-]{6,}/g, '[key]').replace(/(Bearer|x-api-key:?|api[_-]?key[=:])\s*\S+/gi, '$1 [key]')
  }

  function importer(args, { input, timeout = JOB_TIMEOUT, tag } = {}) {
    return new Promise(done => {
      let out = '',
        err = ''
      const p = spawn(cmd, [...pre, '-m', 'importer', ...args], {
        cwd: ctx.importerRoot,
        timeout,
        windowsHide: true,
        // PYTHONIOENCODING: else Windows' code page mangles the ’ in messages; CA2_CUSTOM_DIR: where the core files are
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', CA2_CUSTOM_DIR: customDir },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const cmd0 = args[0] === 'sr6' ? args[1] : args[0] // `sr6 edit` is an edit, never the job
      if (cmd0 === 'list-models') listChild = p
      else if (cmd0 === 'test-ai') testChild = p
      else if (cmd0 === 'backup' || cmd0 === 'ask') {
        p.tag = tag
        spawned.add(p)
        p.on('close', () => spawned.delete(p))
      } else if (!['set-key', 'set-settings', 'edit', 'restore', 'datapack'].includes(cmd0) && !args.includes('--dry-run')) child = p
      p.stdout.on('data', d => {
        out = (out + d).slice(-65536)
      })
      p.stderr.on('data', d => {
        err = (err + d).slice(-4000)
      })
      p.on('error', e => {
        err += e.message
      })
      // (a signal: the server stopping it, or the time limit; `stopped (SIG…` is what 0.10.2 wrote for both)
      p.on('close', (code, signal) =>
        done({
          code: code ?? -1,
          signal,
          out,
          err: !signal ? err : stopped ? `${err}\nstopped by a restart (${signal})` : `${err}\ntimed out after ${timeout / 1000}s (${signal})`,
        }),
      )
      p.stdin.on('error', () => {})
      p.stdin.end(input ?? '')
    })
  }

  async function setStatus(id, state, message = '', game = 'ca2') {
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n<status state="${state}" updated="${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}">${esc(clean(message))}</status>\n`
    await writeAtomic(join(AREAS[game].library, id, 'status.xml'), text).catch(() => {}) // the folder may be gone (delete with files)
  }

  const noRestore = () => {
    if (lock.restoring) throw fail(409, 'a restore is running; try again when it’s done')
  }

  /** A request that writes: refused (409) during a restore, and counted from its first line to its last so a restore waits
   *  for it. server.mjs runs every non-GET request except backup and restore themselves through this. */
  function track(fn) {
    noRestore()
    lock.writes++
    return Promise.resolve()
      .then(fn)
      .finally(() => {
        lock.writes--
      })
  }

  function enqueue(id, steps, game = 'ca2') {
    queue.push({ game, id, steps })
    saveJobs()
    pump()
  }

  /** The job queue (the running job first) and each game's last Re-import all, in library/.config/jobs.json, so a
   *  restart (an update recreating the container mid-queue) picks them up where they were (resume). A stop leaves the
   *  file as it was: the job it kills is still in it. */
  const JOBS = join(config, 'jobs.json')
  let jobsChain = Promise.resolve()
  function saveJobs() {
    if (stopped) return jobsChain
    const { running, batches } = ctx
    const jobs = [...(running ? [running] : []), ...queue].map(({ game, id, steps }) => ({ game, id, steps }))
    for (const [game, b] of Object.entries(batches)) if (b && !b.queued.some(id => busy(id, game))) batches[game] = null // finished
    const text = JSON.stringify({ jobs, batches }) + '\n',
      idle = !jobs.length && !batches.ca2 && !batches.sr6
    // (nothing left: no file, so an idle server's backup holds none)
    jobsChain = jobsChain
      .then(() => (idle ? rm(JOBS, { force: true }) : mkdir(config, { recursive: true }).then(() => writeAtomic(JOBS, text))))
      .catch(e => console.error(`couldn’t save the job queue: ${e.message}`))
    return jobsChain
  }

  async function pump() {
    if (ctx.running || lock.packing || stopped || !queue.length) return
    const running = (ctx.running = queue.shift())
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
      ctx.running = null
      saveJobs()
      pump()
    }
  }

  /** Shutdown: no job step starts again; the running importer, any model list or test, and backups and questions end. */
  function stop() {
    stopped = true
    child?.kill()
    listChild?.kill()
    testChild?.kill()
    for (const p of spawned) p.kill()
  }

  return { bookDir, busy, aiConfig, redact, importer, setStatus, noRestore, track, enqueue, saveJobs, pump, stop, jobsFile: JOBS }
}
