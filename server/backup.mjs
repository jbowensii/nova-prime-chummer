// The Books API's backup and restore of characters/, custom/ and library/, and the data pack of custom/imported/core/
// (`importer backup|restore|datapack`). Each takes the server-wide write lock (ctx.lock, jobs.mjs): a restore runs with
// no write, job or zip under way and refuses every write meanwhile; a backup or a pack excludes a restore and each other.
// Routes and roles: server/books.mjs.
import { randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, rmSync } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { attr, esc, fail, head, rootTag, writeAtomic } from './common.mjs'

const MAX_PACK = 50 * 1024 * 1024
const MAX_ZIP = 20 * 1024 ** 3 // restore --check's limit on what a zip unpacks to: any backup the app makes fits
const RESTORE_TIMEOUT = 4 * 3600 * 1000 // the safety backup and the unpack each copy everything

/** ctx (books.mjs): the folders, backups, version, restoreTtl, downloadTtl, onRestore, queue, spawned, lock, the job queue
 *  (jobs.mjs) and resume, rebuildCore, coreBooks, dropCoreAi (resume.mjs). */
export function backupApi(ctx) {
  const { charDir, customDir, libraryDir, backups, version, restoreTtl, downloadTtl, onRestore, queue, spawned, lock } = ctx
  const { importer, redact, noRestore, pump } = ctx

  const dirArgs = () => ['--characters', charDir, '--custom', customDir, '--library', libraryDir, '--version', version]
  const tempZip = kind => join(backups, `${kind}-${randomBytes(12).toString('hex')}.zip`)

  /** Tokens for a made backup or data pack (downloads, packs) and an uploaded one (uploads, packUploads): random, single
   *  use, and each map holds one at a time (a new one drops the old). The path is deleted on expiry, on replacement and on stop; on use, by the caller.
   *  A token works only for the account that was given it (`user`: its id; undefined: expiry and stop). */
  const downloads = new Map(),
    uploads = new Map(),
    packs = new Map(),
    packUploads = new Map() // token -> { path, timer, user }
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
    if (lock.zipping) throw fail(409, 'a backup is already being made; wait for it to finish')
    if (lock.packing) throw fail(409, 'a data pack is being made or loaded; try again when it’s done')
    lock.zipping++
    const folder = join(backups, `download-${randomBytes(12).toString('hex')}`),
      out = join(folder, 'backup.zip')
    let gone = false,
      r
    res.on('close', () => {
      if (res.writableFinished) return
      gone = true
      for (const p of spawned) if (p.tag === out) p.kill()
    })
    try {
      await mkdir(folder, { recursive: true })
      r = await importer(['backup', ...dirArgs(), '--out', out, ...(url.searchParams.get('keys') === '1' ? ['--keys'] : [])], {
        timeout: RESTORE_TIMEOUT,
        tag: out,
      })
    } finally {
      lock.zipping--
    }
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
    const out = join(folder, `${kind}.zip`),
      date = new Date().toISOString().slice(0, 10)
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': (await stat(out)).size,
      'Content-Disposition': `attachment; filename="chummer-anarchy2-${kind}-${date}.zip"`,
      'Cache-Control': 'no-store',
    })
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
      const folders = Object.fromEntries(
        [...r.out.matchAll(/<folder\b[^>]*>/g)].map(f => [attr(f[0], 'name'), { files: Number(attr(f[0], 'files')), bytes: Number(attr(f[0], 'bytes')) }]),
      )
      const token = await issue(uploads, file, restoreTtl, who.id)
      return send(res, 200, {
        token,
        manifest: {
          app: attr(m, 'app'),
          created: attr(m, 'created'),
          keys: attr(m, 'keys') === 'yes',
          users: Number(attr(m, 'users')),
          authSecret: attr(m, 'authSecret') === 'yes',
          files: Number(attr(m, 'files')),
          bytes: Number(attr(m, 'bytes')),
          folders,
        },
      })
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
    if (lock.packing) throw fail(409, 'a data pack is being made or loaded; try again when it’s done')
    // a book's import rewrites the core files one by one: a pack made meanwhile could mix old and new tables
    if (ctx.running || queue.length) throw fail(409, 'a book is being imported or read by AI; try again when it’s done')
    lock.packing = true
    const folder = join(backups, `pack-${randomBytes(12).toString('hex')}`)
    let r
    try {
      await mkdir(folder, { recursive: true })
      r = await importer(['datapack', 'export', '--custom', customDir, '--out', join(folder, 'datapack.zip'), '--version', version], { timeout: 5 * 60000 })
    } finally {
      lock.packing = false
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
    await pipeline(
      req,
      async function* (src) {
        for await (const c of src) {
          if ((size += c.length) > max) throw fail(413, big)
          yield c
        }
      },
      createWriteStream(file, { flags: 'wx', mode: 0o600 }),
    )
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
    if (lock.packing) throw fail(409, 'a data pack is being made or loaded; try again when it’s done')
    if (ctx.running || queue.length) throw fail(409, 'a book is being imported or read by AI; try again when it’s done')
    if (lock.zipping) throw fail(409, 'a backup is being made; try again when it’s done') // it would copy the swap's folders
    const file = take(packUploads, token, who.id)
    lock.packing = true
    try {
      const r = await importer(['datapack', 'import', file, '--custom', customDir], { timeout: 5 * 60000 })
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(400, why || 'this file isn’t a data pack from this app')
      const out = rootTag(r.out, 'result')
      if (r.code !== 0 || !out) return send(res, 500, { error: `couldn’t load the data pack (${why})` })
      // the core now comes from the pack: the start-up re-import leaves it alone (rebuildCore)
      const files = (attr(out, 'files') ?? '').split(' ').filter(Boolean)
      try {
        // the pack is in: a failed mark is logged, not reported as a failed upload
        const crb = (await ctx.coreBooks()).find(b => b.order === 0)
        if (crb)
          await writeAtomic(
            join(libraryDir, crb.id, 'core-rebuild.xml'),
            `<?xml version="1.0" encoding="UTF-8"?>\n<rebuild sha256="${esc(crb.sha)}" pack="${new Date().toISOString()}" files="${esc(files.join(' '))}"/>\n`,
          )
      } catch (e) {
        console.error(`the data pack is loaded, but the start-up re-import mark wasn’t written: ${e.message}`)
      }
      await ctx.dropCoreAi(files).catch(e => console.error(`the data pack is loaded, but a book still says it read a table by AI: ${e.message}`))
      return send(res, 200, { files })
    } finally {
      lock.packing = false
      await rm(file, { force: true })
      pump()
    }
  }

  async function restore(token, send, res, who) {
    if (!/^[0-9a-f]{32}$/.test(token)) throw fail(404, 'this restore has expired; choose the file again')
    noRestore()
    if (ctx.running || queue.length) throw fail(409, 'a book is being imported or read by AI; try again when it’s done')
    if (lock.writes) throw fail(409, 'a save or an upload is running; try again when it’s done')
    if (lock.zipping) throw fail(409, 'a backup is being made; try again when it’s done')
    const file = take(uploads, token, who.id)
    if (!file) throw fail(404, 'this restore has expired; choose the file again')
    lock.restoring = true
    let r
    try {
      r = await importer(['restore', '--apply', file, ...dirArgs()], { timeout: RESTORE_TIMEOUT })
    } finally {
      await rm(file, { force: true })
      await onRestore().catch(e => console.error(e.stack)) // the accounts come from the restored users.xml; every session ends
      lock.restoring = false // only now: a sign-in in between would check the old accounts
    }
    await ctx.resume({ jobs: false })
    pump()
    void ctx.rebuildCore().catch(e => console.error(e.stack)) // a backup from before the core data was imported
    const why = (await redact(r.err)).trim().split('\n').pop()
    if (r.code === 3) throw fail(400, why || 'the backup was refused')
    if (r.code !== 0)
      return send(res, 500, {
        error: `the restore failed (${why || `exit code ${r.code}`}); the server’s earlier data is in its safety backup in library/.backups`,
      })
    return send(res, 200, { ok: true })
  }

  /** Shutdown: pending restore uploads and unfetched backups and packs are deleted. */
  const stop = () => {
    for (const map of [uploads, downloads, packs, packUploads]) for (const t of [...map.keys()]) rmSync(take(map, t), { recursive: true, force: true })
  }

  return { makeBackup, sendZip, preview, restore, makePack, previewPack, loadPack, stop }
}
