// One-time move of the old three-folder data (characters/, custom/, library/) into the Config/Data/Library layout (server/layout.mjs).
// Design: docs/plans/desktop-phase2-migration-2026-10-23.md (§3 mapping, §4 algorithm, §5 guard, §6 accounts).
//
//   node server/migrate.mjs [--apply] [--data-path D] [--char-dir D --custom-dir D --library-dir D] [--port N]
//
// With the server STOPPED. Without --apply it is a dry run: it prints every old -> new path with its sha256 and the old
// roots' move to _to_delete/, and touches nothing. --apply: backup first, then move each file (rename, re-read, compare sha256),
// then the old roots to <dataPath>/_to_delete/<ISO>/. Nothing is ever deleted. The manifest (Backups/migration-manifest-*.json) is
// the resume log: a second --apply after a crash picks up where it stopped. No old tree: nothing to do.
//
// Refuses when: the job queue isn't drained (jobs.json lists a job or a batch), something answers on the server's port, a
// target already exists, two sources map to one target, an old root overlaps the new layout, or the backup can't be written.
// An account literally named "sr6" would share characters/sr6/ with the SR6 game's folder; it is renamed sr6-1 (sr6-2, …).
// Env: the old roots come from CHAR_DIR / CUSTOM_DIR / LIBRARY_DIR (or DATA_PATH/{characters,custom,library}), server/config.mjs.
//
// Two volumes (Docker: old per-folder mounts, new layout on the data mount): rename() throws EXDEV, so the file is copied to a temp
// in the target folder, published by rename, and checked by sha256 like any move. The ORIGINAL STAYS where it is (never deleted); the
// old root then can't move aside either, which is a notice, not a failure. A copied-and-verified original no longer counts as old data
// (oldTreeFiles), so a second run, and the server's start-up guard, see nothing to do.
// ponytail: a rewritten file (sr6-account users.xml) copied across devices differs from its original, so that original keeps counting.
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, open, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveConfig } from './config.mjs'
import { PRIVATE, dataLayout } from './layout.mjs'

const SKIP = /^\.(restore|upload)-|^\.backup\..*\.tmp$/ // scratch the server deletes on start (books.mjs); travels with the old root
const USERNAME = /^[a-z0-9][a-z0-9._-]{1,31}$/
const AI_FILES = new Set(['ai-providers.xml', 'ai-keys.xml'])
const iso = () => new Date().toISOString().replace(/[:.]/g, '-')
const isWin = process.platform === 'win32' || process.platform === 'darwin' // case-insensitive file systems
const same = p => (isWin ? p.toLowerCase() : p)
const exists = p =>
  stat(p).then(
    () => true,
    () => false,
  )
const readOr = (p, d = '') => readFile(p, 'utf8').catch(() => d)

function sha256(path) {
  return new Promise((ok, no) => {
    const h = createHash('sha256')
    createReadStream(path)
      .on('error', no)
      .on('data', d => h.update(d))
      .on('end', () => ok(h.digest('hex')))
  })
}

/** Every regular file under `root` as { path, segs }; symlinks and the like come back as { path, segs, odd }. */
async function walk(root, segs = []) {
  const out = []
  let ents
  try {
    ents = await readdir(join(root, ...segs), { withFileTypes: true })
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return out // no such folder: nothing there
    return [{ path: join(root, ...segs), segs, odd: true, unreadable: e.code ?? e.message }] // fail closed: never "empty"
  }
  for (const d of ents) {
    const s = [...segs, d.name]
    if (d.isDirectory()) out.push(...(await walk(root, s)))
    else out.push({ path: join(root, ...s), segs: s, odd: !d.isFile() })
  }
  return out
}

/** The old roots from the resolved config (or the tests' options). */
const oldRoots = c => ({ charDir: resolve(c.charDir), customDir: resolve(c.customDir), libraryDir: resolve(c.libraryDir) })

/** The old files that have a place in the new layout (scratch and unresolved ones don't count): the migrator's idempotency key
 *  and the server's start-up guard. */
export async function oldTreeFiles(cfg) {
  const r = oldRoots(cfg),
    map = mappers(dataLayout(cfg.dataPath), null)
  const files = []
  for (const [root, fn] of [
    [r.charDir, map.chars],
    [r.customDir, map.custom],
    [r.libraryDir, map.library],
  ])
    for (const f of await walk(root)) {
      const to = f.odd ? null : fn(f.segs)
      if (to && to !== 'skip' && !f.unreadable && (await exists(to)) && (await sha256(to)) === (await sha256(f.path))) continue // copied across devices already
      if ((to && to !== 'skip') || f.unreadable) files.push(f) // an unreadable folder counts: the guard must not say "no old data\"
    }
  return files
}

/** Where each old file goes (§3), or 'skip' (scratch), or null (no home: left where it is, listed as unresolved).
 *  `rename`: the new name of an account called sr6, else null. */
function mappers(T, rename) {
  const G = T.games
  const acct = u => (u === 'sr6' && rename ? rename : u)
  const tail = rest => [acct(rest[0]), ...rest.slice(1)]
  const dot = (h, rest, area) =>
    h === '.npcs'
      ? [area.npcs, tail(rest)]
      : h === '.compendiums'
        ? [area.compendiums, tail(rest)]
        : h === '.designs' && area.designs
          ? [area.designs, tail(rest)]
          : null

  /** characters/ */
  const chars = p => {
    if (p.some(s => SKIP.test(s))) return 'skip'
    const [h, ...rest] = p
    const d = dot(h, rest, G.ca2)
    if (d) return rest.length ? join(d[0], ...d[1]) : null
    if (h === '.designs') return null // Anarchy has no designs
    if (h === 'sr6') {
      // an account called sr6 owns characters/sr6/ as far as the old server knew (its runners and their .trash); the rest of that
      // folder is the SR6 game's, which the old server froze meanwhile (games.mjs legacy())
      if (rename && (rest.length === 1 || rest[0] === '.trash')) return join(G.ca2.chars, rename, ...rest)
      const [h2, ...r2] = rest
      const d2 = dot(h2, r2, G.sr6)
      if (d2) return r2.length ? join(d2[0], ...d2[1]) : null
      if (h2 === '.designs') return null
      if (h2 === '.trash') return join(G.sr6.chars, ...rest)
      return rest.length >= 2 ? join(G.sr6.chars, ...tail(rest)) : null
    }
    return join(G.ca2.chars, ...p) // an account's folder (with its .trash), a loose pre-account runner, the loose .trash
  }
  /** custom/ */
  const custom = p => {
    if (p.some(s => SKIP.test(s))) return 'skip'
    if (p[0] === 'sr6') return p.length > 1 && !PRIVATE.has(same(p[1])) ? join(G.sr6.custom, ...p.slice(1)) : null
    return PRIVATE.has(same(p[0])) ? null : join(G.ca2.custom, ...p)
  }
  /** library/ */
  const library = p => {
    if (p.some(s => SKIP.test(s))) return 'skip'
    const [h, ...rest] = p
    if (h === '.config') return rest.length === 1 && AI_FILES.has(rest[0]) ? join(G.ca2.ai, '.config', ...rest) : join(T.config, ...rest)
    if (h === '.backups') return join(T.backups, ...rest)
    if (h === 'backgrounds') return join(G.ca2.assets, ...p)
    if (h === 'sr6') {
      if (rest[0] === '.config') return join(G.sr6.ai, ...rest)
      if (rest[0] === 'backgrounds') return join(G.sr6.assets, ...rest)
      return rest.length >= 2 ? join(G.sr6.library, ...rest) : null
    }
    return p.length >= 2 ? join(G.ca2.library, ...p) : null // library/<book id>/…
  }
  return { chars, custom, library }
}

/** Username references in the files that moved: `to` replaces sr6. */
const REWRITES = to => ({
  users: x => x.replace(/\busername="sr6"/g, `username="${to}"`),
  reset: x => x.replace(/(<(?:\w+:)?reset\b[^>]*\buser=")sr6(")/g, `$1${to}$2`),
  campaigns: x => x.replace(/(<(?:gm|member)\b[^>]*\buser=")sr6(")/g, `$1${to}$2`).replace(/(<lock\b[^>]*\bby=")sr6(")/g, `$1${to}$2`),
})

/** §5: the job queue is drained when jobs.json is absent or lists nothing. -> null, or why not. */
async function busy(files) {
  for (const f of files) {
    let text
    try {
      text = await readFile(f, 'utf8')
    } catch (e) {
      if (e.code === 'ENOENT') continue // no queue file: idle
      return `${f} can’t be read (${e.code ?? e.message}), so the job queue can’t be checked` // fail closed
    }
    let j
    try {
      j = JSON.parse(text)
    } catch {
      return `${f} can’t be read, so the job queue can’t be checked`
    }
    const b = j?.batches ?? {}
    if ((j?.jobs ?? []).length || Object.values(b).some(Boolean))
      return 'An import was in progress. Start the app, let the book queue finish, then migrate. (' + f + ')'
  }
  return null
}

/** The plan: every move with its sha256, the renames, what has no home, and why it can't go ahead (`refused`). */
export async function plan(cfg, { sha = sha256 } = {}) {
  const T = dataLayout(cfg.dataPath),
    old = oldRoots(cfg)
  const out = { dataPath: T.root, roots: old, entries: [], skipped: [], unresolved: [], renames: [], refused: [], toDelete: null }
  // the old roots must be apart from the new layout's folders
  for (const [name, r] of Object.entries(old))
    for (const n of [T.config, join(T.root, 'Data'), join(T.root, 'Library'), T.backups, T.logs])
      if (same(r) === same(n) || same(r).startsWith(same(n) + sep) || same(n).startsWith(same(r) + sep))
        out.refused.push(`the old ${name} (${r}) overlaps the new ${n}; point the old folders elsewhere`)
  if (out.refused.length) return out

  const resumeJobs = join(T.config, 'jobs.json')
  const why = await busy([join(old.libraryDir, '.config', 'jobs.json'), resumeJobs])
  if (why) out.refused.push(why)

  const users = await readOr(join(old.libraryDir, '.config', 'users.xml'))
  const names = new Set([...users.matchAll(/\busername="([^"]+)"/g)].map(m => m[1].toLowerCase()))
  let rename = null
  if (names.has('sr6')) {
    const taken = new Set(names)
    for (const dir of [
      old.charDir,
      join(old.charDir, '.npcs'),
      join(old.charDir, '.compendiums'),
      join(old.charDir, 'sr6'),
      join(old.charDir, 'sr6', '.npcs'),
      join(old.charDir, 'sr6', '.compendiums'),
      join(old.charDir, 'sr6', '.designs'),
    ])
      for (const d of await readdir(dir).catch(() => [])) taken.add(d.toLowerCase())
    for (let i = 1; !rename; i++) if (!taken.has(`sr6-${i}`) && USERNAME.test(`sr6-${i}`)) rename = `sr6-${i}`
    out.renames.push({ from: 'sr6', to: rename })
  }
  const map = mappers(T, rename)
  const rw = rename ? REWRITES(rename) : null
  const targets = new Map()
  for (const [root, fn, label] of [
    [old.charDir, map.chars, 'characters'],
    [old.customDir, map.custom, 'custom'],
    [old.libraryDir, map.library, 'library'],
  ]) {
    for (const f of await walk(root)) {
      const to = f.odd ? null : fn(f.segs)
      if (f.unreadable) out.refused.push(`${f.path} can’t be read (${f.unreadable}); fix its permissions, then migrate`)
      else if (to === 'skip') out.skipped.push(f.path)
      else if (!to) out.unresolved.push({ path: f.path, why: f.odd ? 'not a regular file' : `no place for ${label}/${f.segs.join('/')} in the new layout` })
      else {
        const name = f.segs.at(-1)
        const rewrite = !rw
          ? undefined
          : name === 'users.xml' && label === 'library'
            ? 'users'
            : name === 'reset.xml' && label === 'library'
              ? 'reset'
              : name === 'campaigns.xml' && label === 'custom'
                ? 'campaigns'
                : undefined
        const s = await stat(f.path)
        out.entries.push({ src: f.path, dst: to, size: s.size, sha256: await sha(f.path), state: 'pending', ...(rewrite ? { rewrite } : {}) })
        const k = same(to)
        targets.set(k, [...(targets.get(k) ?? []), f.path])
      }
    }
  }
  for (const [to, srcs] of targets) if (srcs.length > 1) out.refused.push(`${srcs.length} files map to ${to}: ${srcs.join(', ')}`)
  for (const e of out.entries) if (await exists(e.dst)) out.refused.push(`${e.dst} already exists (from ${e.src}); the new layout must start empty`)
  out.entries.sort((a, b) => (a.src < b.src ? -1 : 1))
  return out
}

/** The text of a plan: one line per move, `sha256  size  old -> new`. */
export function describe(p) {
  const L = [`Migration into ${p.dataPath}`, `Old folders: ${Object.values(p.roots).join(', ')}`]
  for (const r of p.renames)
    L.push(
      `NOTICE: the account "${r.from}" shares characters/${r.from}/ with the SR6 game folder; it is renamed "${r.to}" (users, campaigns, recovery code, its folders).`,
    )
  for (const e of p.entries) L.push(`${e.sha256}  ${e.size}  ${e.src} -> ${e.dst}${e.rewrite ? `  [rewrites the name in ${e.rewrite}]` : ''}`)
  for (const u of p.unresolved) L.push(`UNRESOLVED (stays where it is): ${u.path} (${u.why})`)
  L.push(`${p.entries.length} files to move, ${p.skipped.length} scratch files left in the old folders, ${p.unresolved.length} unresolved.`)
  L.push(
    `Then the old folders move to ${join(p.dataPath, '_to_delete', '<ISO time>')}${p.unresolved.length ? ' (not while anything is unresolved)' : ''}. Nothing is deleted.`,
  )
  for (const r of p.refused) L.push(`REFUSED: ${r}`)
  return L.join('\n')
}

/** Number of entries in a zip (its end-of-central-directory record). */
async function zipEntries(path) {
  const fh = await open(path, 'r')
  try {
    const size = (await fh.stat()).size,
      n = Math.min(size, 70000),
      buf = Buffer.alloc(n)
    await fh.read(buf, 0, n, size - n)
    for (let i = n - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) return buf.readUInt16LE(i + 10)
    return 0
  } finally {
    await fh.close()
  }
}

/** The standard backup (`python -m importer backup`, the POST /api/backup scope) of the three old folders. -> { entries } */
function pythonBackup({ python = 'python3', importerRoot, version }) {
  return (roots, out) =>
    new Promise((ok, no) => {
      const [cmd, ...pre] = [].concat(python)
      const p = spawn(
        cmd,
        [
          ...pre,
          '-m',
          'importer',
          'backup',
          '--characters',
          roots.charDir,
          '--custom',
          roots.customDir,
          '--library',
          roots.libraryDir,
          '--out',
          out,
          ...(version ? ['--version', version] : []),
        ],
        {
          cwd: importerRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'),
          windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        },
      )
      let err = ''
      p.stderr.on('data', d => (err = (err + d).slice(-2000)))
      p.on('error', no)
      p.on('close', code =>
        code === 0 ? zipEntries(out).then(entries => ok({ entries }), no) : no(new Error(`the backup failed (exit ${code}): ${err.trim()}`)),
      )
    })
}

async function save(path, m) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, JSON.stringify(m, null, 1) + '\n')
  await rename(tmp, path)
}

/** A resumed rewrite entry whose file is already the rewritten one (the crash came after the rewrite, before the manifest said so):
 *  the kept pre-rename copy, rewritten, is exactly what is there. */
async function rewrittenFrom(e, rewrites, copyDir) {
  if (!e.rewrite) return false
  const orig = join(copyDir, 'pre-rename', basename(dirname(e.dst)) + '-' + basename(e.dst))
  try {
    return rewrites[e.rewrite](await readFile(orig, 'utf8')) === (await readFile(e.dst, 'utf8'))
  } catch {
    return false
  }
}

/** Move one entry and check it. Resumable: a rename that happened before a crash (source gone, target there) is verified, not repeated. */
async function move(e, m, rewrites, copyDir) {
  if (e.state === 'pending') {
    const src = await exists(e.src),
      dst = await exists(e.dst)
    // both there: a cross-device copy that finished before a crash or an earlier run (the source stays); fine if the target is right
    if (src && dst && (await sha256(e.dst)) !== e.sha256 && !(await rewrittenFrom(e, rewrites, copyDir)))
      throw new Error(`both ${e.src} and ${e.dst} exist and differ`)
    if (!src && !dst) throw new Error(`${e.src} is gone and ${e.dst} was never made`)
    if (src && !dst) {
      await mkdir(dirname(e.dst), { recursive: true })
      try {
        await rename(e.src, e.dst)
      } catch (err) {
        if (err.code !== 'EXDEV') throw err
        const tmp = `${e.dst}.${randomBytes(4).toString('hex')}.tmp`
        await copyFile(e.src, tmp)
        await rename(tmp, e.dst) // same device: whole or not at all; the source stays
      }
    }
    if ((await sha256(e.dst)) !== e.sha256 && !(await rewrittenFrom(e, rewrites, copyDir)))
      throw new Error(`${e.dst} doesn’t match its checksum after the move`)
    e.state = 'moved'
  }
  if (e.state === 'moved') {
    if (e.rewrite) {
      const orig = join(copyDir, 'pre-rename', basename(dirname(e.dst)) + '-' + basename(e.dst))
      if (!(await exists(orig))) {
        await mkdir(dirname(orig), { recursive: true })
        await writeFile(orig, await readFile(e.dst)) // the moved file as it was, kept
      }
      const text = await readFile(e.dst, 'utf8'),
        next = rewrites[e.rewrite](text)
      if (next !== text) {
        const tmp = `${e.dst}.${randomBytes(4).toString('hex')}.tmp`
        await writeFile(tmp, next)
        await rename(tmp, e.dst) // whole or not at all
      }
    }
    e.state = 'done'
  }
}

/** Move an old root aside; a mount point can't be renamed, so then its contents go one by one. -> null, or why not. */
async function aside(root, to) {
  try {
    await mkdir(dirname(to), { recursive: true })
    await rename(root, to)
    return null
  } catch (e) {
    try {
      await mkdir(to, { recursive: true })
      for (const d of await readdir(root)) await rename(join(root, d), join(to, d))
      return null
    } catch (e2) {
      if (e2.code === 'EXDEV' || e.code === 'EXDEV')
        return { notice: `NOTICE: the old folder ${root} was left in place because it is on a separate volume; its data was copied and checked, not moved.` }
      return `${root} couldn’t be moved to ${to}: ${e2.message} (${e.code})`
    }
  }
}

/** Docker: --apply onto a data path that isn't a mount point lands in the container's own layer and is wiped on restart (the
 *  same-device case a cross-device check can't see). -> null, or why not. `env` ({ container, mounts }) is for the tests. */
export async function containerGuard(dataPath, env = {}) {
  const inDocker = env.container ?? (await exists('/.dockerenv'))
  if (!inDocker) return null
  const why = `Running in a container, and ${dataPath} is not a mounted volume, so migrated data would be lost on restart. Mount a persistent volume or bind mount at the data path (the Unraid/Docker template mounts /data), then run again.`
  try {
    const real = await realpath(dataPath)
    const mounts = env.mounts ?? (await readFile('/proc/self/mountinfo', 'utf8'))
    const at = mounts.split('\n').map(l => l.split(' ')[4]?.replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))))
    return at.includes(real) ? null : why
  } catch {
    return why // can't tell: fail closed
  }
}

/**
 * cfg: resolveConfig's result (dataPath, charDir, customDir, libraryDir, python, ...).
 * opts: apply (else dry run), isServing (async -> bool), backup (async (roots, out) -> { entries }), log (line -> void).
 * -> { status: 'noop' | 'refused' | 'planned' | 'applied' | 'partial', plan, manifest?, backup?, toDelete?, problems? }
 */
export async function migrate(cfg, { apply = false, isServing, backup = pythonBackup(cfg), log = console.log, guard = containerGuard } = {}) {
  const T = dataLayout(cfg.dataPath)
  // a half-done run: its manifest is the resume log
  const prior = (await readdir(T.backups).catch(() => [])).filter(f => /^migration-manifest-.*\.json$/.test(f)).sort()
  let manifestPath = null,
    m = null
  for (const f of prior.reverse()) {
    const j = JSON.parse(await readFile(join(T.backups, f), 'utf8'))
    if (!j.complete) {
      manifestPath = join(T.backups, f)
      m = j
      break
    }
  }
  let p
  if (m) {
    p = { skipped: [], ...m, refused: [], unresolved: m.unresolved ?? [] }
    const why = await busy([join(T.config, 'jobs.json'), join(oldRoots(cfg).libraryDir, '.config', 'jobs.json')])
    if (why) p.refused.push(why)
  } else {
    if (!(await oldTreeFiles(cfg)).length) return { status: 'noop', message: 'No old data to migrate.' }
    p = await plan(cfg)
  }
  log(describe(p))
  if (p.refused.length) return { status: 'refused', plan: p }
  if (!apply) return { status: 'planned', plan: p }
  if (isServing && (await isServing())) {
    p.refused.push('The server is running. Stop it, then migrate.')
    return { status: 'refused', plan: p }
  }

  if (!m) {
    const bad = await guard(T.root)
    if (bad) {
      p.refused.push(bad)
      return { status: 'refused', plan: p }
    }
  }
  const stamp = iso(),
    toDelete = m?.toDelete ?? join(T.root, '_to_delete', stamp)
  if (!m) {
    // backup first (§4 step 2): no zip, or one with nothing in it, and nothing moves
    await mkdir(T.backups, { recursive: true })
    const out = join(T.backups, `pre-migration-${stamp}.zip`)
    const r = await backup(p.roots, out).catch(e => ({ error: e.message }))
    if (r.error || !(r.entries > 0) || !(await exists(out)) || (await stat(out)).size === 0) {
      p.refused.push(`The pre-migration backup couldn’t be made${r.error ? ` (${r.error})` : ' (it is empty)'}; nothing was moved.`)
      return { status: 'refused', plan: p }
    }
    manifestPath = join(T.backups, `migration-manifest-${stamp}.json`)
    m = {
      version: 1,
      created: stamp,
      complete: false,
      backup: out,
      toDelete,
      dataPath: p.dataPath,
      roots: p.roots,
      renames: p.renames,
      entries: p.entries,
      unresolved: p.unresolved,
    }
    await save(manifestPath, m)
    log(`Backup: ${out} (${r.entries} entries). Manifest: ${manifestPath}`)
  }

  const rewrites = REWRITES(m.renames[0]?.to ?? '')
  const problems = []
  let n = 0
  try {
    for (const e of m.entries) {
      if (e.state === 'done') continue
      try {
        await move(e, m, rewrites, toDelete)
      } catch (err) {
        problems.push(`${e.src}: ${err.message}`)
        break // a failed move stops the run; the manifest says where, a second --apply resumes
      }
      if (e.rewrite || ++n % 50 === 0) await save(manifestPath, m) // a rewritten file is changed in place: say so at once
    }
  } finally {
    await save(manifestPath, m)
  }
  if (problems.length) return { status: 'partial', plan: p, manifest: manifestPath, problems }

  // §4 step 5: the old roots (now holding scratch, empty folders and anything unresolved) go to _to_delete, never deleted
  if (!m.unresolved.length) {
    for (const [name, root] of Object.entries(m.roots)) {
      if (!(await exists(root))) continue
      const bad = await aside(root, join(toDelete, name))
      if (bad?.notice) log(bad.notice)
      else if (bad) problems.push(bad)
    }
    if (!problems.length) m.complete = true
  }
  m.toDelete = toDelete
  await save(manifestPath, m)
  log(m.complete ? `Done. The old folders are in ${toDelete}; empty it when you are sure.` : 'Done moving; some old folders stay (see above).')
  return { status: problems.length ? 'partial' : 'applied', plan: p, manifest: manifestPath, toDelete, problems }
}

/** Is something listening on 127.0.0.1:port? (The migrator's "server stopped" check.) */
export const listening = port =>
  new Promise(ok => {
    const s = connect({ port, host: '127.0.0.1' }, () => (s.destroy(), ok(true)))
    s.on('error', () => ok(false))
    s.setTimeout(1500, () => (s.destroy(), ok(false)))
  })

/** The server's start-up guard: the message to stop with when the old tree still holds data, else null. */
export async function startGuard(cfg) {
  if (!(await oldTreeFiles(cfg)).length) return null
  return `This data is still in the old layout (${Object.values(oldRoots(cfg)).join(', ')}). With the server stopped, run: node server/migrate.mjs --apply`
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const cfg = resolveConfig(argv, process.env)
  const r = await migrate(cfg, { apply: argv.includes('--apply'), isServing: () => listening(cfg.port) })
  if (r.status === 'noop') console.log(r.message)
  if (r.problems?.length) console.error(r.problems.join('\n'))
  if (r.status === 'planned') console.log('Dry run only. Add --apply to migrate.')
  process.exit(['noop', 'planned', 'applied'].includes(r.status) ? 0 : 1)
}
