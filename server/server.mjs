// Chummer Anarchy 2.0 server: serves the built app and stores runners as XML files, one folder per account
// (characters/<username>/, deleted ones in its .trash/). No dependencies. Accounts, sessions and the role table:
// server/auth.mjs; every /api route but health, sign-in, setup and /api/auth/me needs a session, and so does /custom/. A
// request that names the account its page was signed in as (X-CA2-User) is refused (401) when the session is another's.
// Two games (server/games.mjs), kept apart: Shadowrun Anarchy 2.0 in characters/ (<username>/, .npcs/, .compendiums/,
// .trash/) and custom/ (campaigns.xml, imported/, edits/, ...) at the routes below; Shadowrun 6 the same shape in
// characters/sr6/ (<username>/, .npcs/, .compendiums/, .trash/) and custom/sr6/ (campaigns.xml) at /api/sr6/ + characters,
// npcs, trash, npcs/trash, campaigns, compendiums, backgrounds, books, edits and creation (books.mjs in its SR6 area: library/sr6/,
// custom/sr6/; every other /api/sr6/ path: 404). Each game's store takes only its own root (sr6:character or ca2:character, first in the file,
// in its namespace); a campaign holds only its game's runners and NPCs. Accounts span both: a rename moves both games'
// folders and memberships, a delete retires both. While an account called sr6 from before exists (its runners are in
// characters/sr6/), every /api/sr6/ route answers 409 and nothing of the SR6 area is read or written.
//
//   GET    /api/health                   -> { ok, storage: "server" }
//   GET    /api/characters               -> [{ file, rev, xml, owner, ownerName }] the caller's runners; the admin: everyone's;
//                                           an editor: also those in the campaigns they GM (owner: the username, ownerName: the
//                                           account's name). PUT and DELETE act on the caller's own only (403 on a runner id another
//                                           account holds). A save keeps the stored runner's campaign="…" (a new one gets none):
//                                           /api/campaigns sets it
//   PUT    /api/characters/:id           body: character XML
//          If-Match: <rev>                  refuse with 409 if the stored file has moved on
//          ?force=1                         overwrite anyway
//          ?filename=<name>                 file name for a new runner (else from the street name)
//   DELETE /api/characters/:id           moves the file to .trash/ as <name>-<ms since 1970>.xml
//   GET    /api/trash                    -> { user, name, items: [{ file, id, name, deletedAt }] } the caller's trash, newest first
//   POST   /api/trash/:file/restore      back into the library -> { file, id, name, copy }; copy: the id was taken, so it came
//                                        back with a new id and "(restored copy)" after its street name
//   DELETE /api/trash/:file              deletes that file for good; DELETE /api/trash empties the trash -> { deleted }
//                                        (body { files: [...] }: only those, e.g. the ones the page showed)
//          ?user=<username>              the admin: another account's trash (everyone else: 403)
//   /api/npcs, /api/npcs/:id, /api/npcs/trash*   the same routes for NPCs (characters with an <npc> block, which a PUT must
//                                        have), kept in characters/.npcs/<username>/ (+ .trash/): admin and editors only (403 for
//                                        players). GET: the caller's; the admin: everyone's; an editor: also those shared with the
//                                        campaigns they GM (read only). /api/campaigns/:id/npcs shares one
//   /api/auth/*, /api/setup*, /api/users* accounts (server/auth.mjs)
//   /api/campaigns*                      campaigns (server/campaigns.mjs)
//   /api/compendiums*                    GMs' compendiums in characters/.compendiums/<username>/ (server/compendiums.mjs);
//                                        /api/sr6/compendiums* the SR6 ones in characters/sr6/.compendiums/<username>/;
//                                        GET .../compendiums/shared: the table and campaign ones a player may use, no NPCs
//   /api/backgrounds*                    background art from library/backgrounds (server/backgrounds.mjs);
//                                        /api/sr6/backgrounds* SR6's own set from library/sr6/backgrounds
//   /api/auth/oidc/*, /api/auth-settings  Sign in with Authelia and its settings (server/oidc.mjs)
//   /api/books, /api/review, /api/ai-*, /api/edits, /api/table-rules, /api/samples, /api/backup, /api/restore, /api/datapack   the PDF importer, catalog
//                                        edits, backup and restore, data packs (server/books.mjs); LIBRARY_DIR is never served
//   /custom/sr6/*                        the Shadowrun 6 catalog from CUSTOM_DIR/sr6 (this exact lowercase prefix; never campaigns.xml)
//   /custom/*                            house-rule overlays from CUSTOM_DIR (never campaigns.xml, never custom/sr6/ in any other spelling)
//   everything else                      the built app (STATIC_DIR)
import { createServer as httpServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'
import { authApi } from './auth.mjs'
import { backgroundsApi } from './backgrounds.mjs'
import { booksApi, rootTag, unesc, writeAtomic } from './books.mjs'
import { campaignOf, campaignsApi, setCampaign } from './campaigns.mjs'
import { compendiumsApi } from './compendiums.mjs'
import { GAMES, scoped } from './games.mjs'
import { oidcApi } from './oidc.mjs'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.xsd': 'application/xml' }
const MAX_BODY = 5 * 1024 * 1024
const gzipAsync = promisify(gzip)
const ID = /^[A-Za-z0-9._-]{1,80}$/
const TRASH_FILE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,150}\.xml$/ // a file in .trash/: no separators, no leading dot
const CA2 = GAMES.ca2.tag

// the root's attribute, still escaped (rootTag: linear on a body whose root never closes)
const rootAttr = (xml, name, tag = CA2) => rootTag(xml, tag)?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
const slug = s => (s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'runner'
const fail = (code, message) => Object.assign(new Error(message), { code })
// on every response. The built app loads only its own scripts, styles and fonts; inline style attributes (React) and
// data:/blob: images (portraits) are allowed; nothing may frame it.
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
}

function setRev(xml, rev, tag = CA2) {
  return xml.replace(new RegExp(`<${tag}\\b[^>]*>`), t =>
    /\srev="[^"]*"/.test(t) ? t.replace(/\srev="[^"]*"/, ` rev="${rev}"`) : t.replace(/\sid="/, ` rev="${rev}" id="`))
}

/** A trashed runner restored next to one with its id: a new id, rev 1 and "(restored copy)" after its street name (or name). */
export function restoredCopy(xml, id, tag = CA2) {
  return setRev(xml.replace(new RegExp(`<${tag}\\b[^>]*>`), t => {
    const street = t.match(/\sstreetName="([^"]*)"/)?.[1] || t.match(/\sname="([^"]*)"/)?.[1] || 'Unnamed runner' // still escaped
    // a copy is in no campaign
    return t.replace(/\s(id|streetName|campaign)="[^"]*"/g, '').replace(new RegExp(`^<${tag}`), `$& id="${id}" streetName="${street} (restored copy)"`)
  }), 1, tag)
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..') // where `python -m importer` runs
const inside = (path, dir) => path === dir || path.startsWith(dir + sep)
// the app version for backups: VERSION (written by the Dockerfile, which ships no package.json), else package.json
const VERSION = (() => {
  try { return readFileSync(join(ROOT, 'VERSION'), 'utf8').trim() } catch { /* not in the image */ }
  try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version } catch { return 'unknown' }
})()

export function createServer({ staticDir, charDir, customDir, libraryDir, python = 'python3', restoreTtl, downloadTtl, askTimeout, trustProxy = '', publicUrl = '', accountKeys, oidc: oidcOpts = {} }) {
  staticDir = resolve(staticDir); charDir = resolve(charDir); customDir = resolve(customDir)
  libraryDir = resolve(libraryDir ?? join(charDir, '..', 'library'))
  let auth = null
  const books = booksApi({ charDir, customDir, libraryDir, python, importerRoot: ROOT, version: VERSION, restoreTtl, downloadTtl, askTimeout,
    onRestore: () => auth.reload(oidc.issuer()), // the restored auth.xml's issuer
    compendiumSources: () => compendiums.ca2.sources() }) // a house source never takes an Anarchy compendium's id (SR6 has none)
  // runner writes, and the account changes that move runner folders: one at a time
  // ponytail: one lock for every account's runners; per-folder locks if saves ever queue up
  let chain = Promise.resolve()
  const lock = fn => { const run = chain.then(fn); chain = run.catch(() => {}); return run }
  async function freeName(dir, base) {
    const taken = new Set((await readdir(dir).catch(() => [])).map(f => f.toLowerCase()))
    for (let i = 1; ; i++) {
      const name = `${base}${i > 1 ? `-${i}` : ''}.xml`
      if (!taken.has(name.toLowerCase())) return name
    }
  }
  const exists = path => stat(path).then(() => true, () => false)
  const base = file => file.replace(/\.xml$/, '')
  /** Every file of the folder `from` into `to`, each under a free name there (prefixed). */
  async function moveAll(from, to, prefix = '') {
    const files = (await readdir(from, { withFileTypes: true }).catch(() => [])).filter(d => d.isFile())
    if (files.length) await mkdir(to, { recursive: true })
    for (const f of files) await rename(join(from, f.name), join(to, await freeName(to, prefix + base(f.name))))
  }
  // the games whose folders account changes touch: while an account called sr6 from before SR6 exists, its runner folder is
  // characters/sr6/, so nothing of the SR6 area is read or written (its routes answer 409)
  const legacy = () => auth.usernames().includes(GAMES.sr6.sub)
  const live = () => legacy() ? [games.ca2] : [games.ca2, games.sr6]
  /** Runner folders for auth.mjs, which calls these under `lock`. Both games' (adopt: Anarchy's; move: the given game's). */
  const runners = {
    async count(u) {
      let n = 0
      for (const g of live()) n += (await readdir(g.folder(u)).catch(() => [])).filter(f => f.endsWith('.xml')).length
      return n
    },
    /** A new account's folders must not exist yet: runners, NPCs or compendiums left there would silently become the new
     *  account's. */
    async free(u) {
      for (const [f, label] of stores()) if (await exists(f(u))) throw fail(409, `${label}${u} already exists; move it away first`)
    },
    async rename(from, to) {
      const moves = [] // runners, then NPCs, then compendiums; Anarchy's, then SR6's
      for (const m of stores()) if (await exists(m[0](from))) moves.push(m)
      for (const [f, label] of moves) if (await exists(f(to))) throw fail(409, `${label}${to} already exists; move it away first`)
      const done = [], renamed = []
      try {
        for (const [f] of moves) { await rename(f(from), f(to)); done.push(f) }
        for (const g of live()) { await g.campaigns.rename(from, to); renamed.push(g) }
      } catch (e) {
        // users.xml keeps the old name: so do the campaigns and the folders
        for (const g of renamed.reverse()) await g.campaigns.rename(to, from).catch(e2 => console.error(`campaigns keep ${to} for ${from}: ${e2.message}`))
        for (const f of done.reverse()) await rename(f(to), f(from))
        throw e
      }
    },
    /** The upgrade: runners at the top of characters/ (and its .trash/) from before accounts go to the first admin. */
    async adopt(u) {
      const folder = games.ca2.folder
      const top = (await readdir(charDir, { withFileTypes: true }).catch(() => [])).filter(d => d.isFile() && d.name.endsWith('.xml'))
      if (top.length) await mkdir(folder(u), { recursive: true })
      for (const f of top) await rename(join(charDir, f.name), join(folder(u), await freeName(folder(u), base(f.name))))
      await moveAll(join(charDir, '.trash'), join(folder(u), '.trash'))
      await rmdir(join(charDir, '.trash')).catch(() => {})
    },
    /** game: 'ca2' or 'sr6' (auth.mjs checks it); SR6's is refused while an account called sr6 holds its folder. */
    async move(from, file, to, game = 'ca2') {
      if (game === 'sr6' && legacy()) throw fail(409, 'rename the account sr6 first')
      const folder = games[game === 'sr6' ? 'sr6' : 'ca2'].folder
      if (!await exists(join(folder(from), file))) throw fail(404, 'no such runner')
      await mkdir(folder(to), { recursive: true })
      const name = await freeName(folder(to), base(file))
      await rename(join(folder(from), file), join(folder(to), name))
      return name
    },
    /** A deleted account (no runners left): each game's part (gameStore retire), then each game's compendiums and their
     *  trash go to that game's .compendiums/.trash/, named after it. */
    async retire(u) {
      for (const g of live()) await g.campaigns.drop(u, true) // refused before anything moves
      for (const g of live()) await g.retire(u)
      for (const c of legacy() ? [compendiums.ca2] : [compendiums.ca2, compendiums.sr6])
        for (const d of [join(c.folder(u), '.trash'), c.folder(u)]) {
          await moveAll(d, join(c.root, '.trash'), `${u}-`)
          await rmdir(d).catch(() => {})
        }
    },
  }

  /** One game's runner and NPC stores, campaigns and trash (server/games.mjs): Anarchy's in characters/ and custom/ as
   *  always, SR6's the same shape in characters/sr6/ and custom/sr6/. A body must have the game's root, first in the file,
   *  in its namespace. Its routes are the unprefixed ones (api() strips /api/sr6). */
  function gameStore(g) {
    const tag = g.tag, home = g.sub ? join(charDir, g.sub) : charDir, label = g.sub ? `characters/${g.sub}/` : 'characters/'
    // a comment never runs past its own -->: with a lazy [\s\S]*? one comment could swallow the next ones, and a body of
    // ~40 empty comments then took the whole server minutes to refuse (exponential backtracking)
    const NS = new RegExp(`^\\uFEFF?\\s*(?:<\\?xml\\b[^>]*\\?>\\s*)?(?:<!--(?:(?!-->)[\\s\\S])*-->\\s*)*<${tag}\\b[^>]*\\sxmlns:${tag.split(':')[0]}="${g.ns}"`)
    const WELL = new RegExp(`^<${tag}(?:\\s+[\\w:.-]+="[^"<>]*")*\\s*>$`)
    /** An <npc> block first in the root (a closed root: WELL passed). Root only, by rootTag: a pattern tried at every later
     *  <tag in the body backtracked quadratically. */
    const isNpc = xml => { const r = rootTag(xml, tag); return /^\s*<npc[\s/>]/.test(xml.slice(xml.indexOf(r) + r.length)) }
    const attrOf = (xml, name) => rootAttr(xml, name, tag)
    const folder = username => join(home, username) // auth.mjs's USERNAME: no separators, never starts with a dot
    // NPCs: <home>/.npcs/<username>/; a dot folder, so never an account's (a username never starts with a dot)
    const npcRoot = join(home, '.npcs'), npcFolder = username => join(npcRoot, username)

    // each file as index() read it, kept while its size, time and inode stay: every list and every save read all of an
    // account's files again (a GM with the books' thousand NPCs: half a second a request)
    // ponytail: a deleted file's entry stays until restart (a few KB each); evict on delete if that ever matters
    const indexed = new Map()
    async function index(dir) {
      const files = (await readdir(dir).catch(() => [])).filter(f => f.endsWith('.xml'))
      return Promise.all(files.map(async file => {
        const path = join(dir, file), s = await stat(path), key = `${s.size}/${s.mtimeMs}/${s.ino}`
        if (indexed.get(path)?.key === key) return indexed.get(path).entry
        const xml = await readFile(path, 'utf8')
        const entry = { file, id: attrOf(xml, 'id'), rev: Number(attrOf(xml, 'rev') ?? 0), xml }
        indexed.set(path, { key, entry })
        return entry
      }))
    }

    const campaigns = campaignsApi({ customDir: g.sub ? join(customDir, g.sub) : customDir, tag, lock, auth, runnersOf: u => index(folder(u)),
      writeRunner: (u, file, xml) => writeAtomic(join(folder(u), file), xml),
      npcsOf: u => index(npcFolder(u)), writeNpc: (u, file, xml) => writeAtomic(join(npcFolder(u), file), xml), creation: g.id === 'sr6' })
    // the two stores the character and trash routes serve; NPCs: admin and editors only (need() gates /api/npcs, and a
    // request that waited for the lock checks the role again)
    const RUNNERS = { folder, noun: 'runner', holds: (u, c) => campaigns.holds(u, c), readable: me => campaigns.readable(me) }
    const NPCS = { folder: npcFolder, noun: 'NPC', npc: true, holds: (u, c) => campaigns.leads(u, c), readable: me => campaigns.readableNpcs(me) }
    const refused = (kind, me) => kind.npc && !['admin', 'editor'].includes(me.role)

    /** The character, NPC and trash routes (see the top of this file). */
    async function handle(req, res, url, who) {
      const t = url.pathname.match(/^\/api\/(npcs\/)?trash(\/|$)/)
      if (t) return trash(req, res, url, who, t[1] ? NPCS : RUNNERS)
      const kind = /^\/api\/npcs(\/|$)/.test(url.pathname) ? NPCS : RUNNERS
      if (url.pathname === (kind.npc ? '/api/npcs' : '/api/characters') && req.method === 'GET') {
        const owners = [who.username, ...(who.role === 'admin' ? auth.usernames().filter(u => u !== who.username) : [])]
        const out = []
        for (const owner of owners) for (const { file, rev, xml } of await index(kind.folder(owner))) out.push({ file, rev, xml, owner, ownerName: auth.nameOf(owner) })
        if (who.role === 'editor') for (const { file, rev, xml, owner } of await kind.readable(who)) out.push({ file, rev, xml, owner, ownerName: auth.nameOf(owner) })
        return send(res, 200, out)
      }
      const m = url.pathname.match(kind.npc ? /^\/api\/npcs\/([^/]+)$/ : /^\/api\/characters\/([^/]+)$/)
      if (!m) return send(res, 404, { error: 'not found' })
      const id = decodeURIComponent(m[1])
      if (!ID.test(id)) return send(res, 400, { error: 'bad id' })
      if (req.method !== 'DELETE' && req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
      const xml = req.method === 'PUT' ? await readBody(req) : null
      if (xml != null && (!NS.test(xml) || attrOf(xml, 'id') !== id))
        return send(res, 400, { error: 'body is not a character file for this id' })
      // the root's attributes as the app writes them (double-quoted, < and > escaped): the server edits that tag (rev, campaign)
      // (a root that never closes: refused here, not a 500)
      if (xml != null && !WELL.test(rootTag(xml, tag) ?? ''))
        return send(res, 400, { error: 'the character element’s attributes aren’t well formed' })
      if (xml != null && kind.npc && !isNpc(xml))
        return send(res, 400, { error: 'an NPC file has an <npc> block' })
      // and the other way: an NPC never lands in a runner folder, which players' paths list
      if (xml != null && !kind.npc && isNpc(xml))
        return send(res, 400, { error: 'this is an NPC, not a runner: NPCs are saved in the NPC area' })
      return lock(async () => {
        // the account as it is now: a rename while this request waited moved the folder, a disable or delete ends it
        const me = auth.current(who.id)
        if (!me) return send(res, 401, { error: 'sign in first' })
        if (refused(kind, me)) return send(res, 403, { error: 'your account can’t do this' })
        const dir = kind.folder(me.username)
        const existing = (await index(dir)).find(c => c.id === id)
        if (!existing) for (const u of auth.usernames())
          if (u !== me.username && (await index(kind.folder(u))).some(c => c.id === id))
            return send(res, 403, { error: `this ${kind.noun} belongs to another account; only its owner can change it` })
        if (req.method === 'DELETE') {
          if (!existing) return send(res, 404, { error: `no such ${kind.noun}` })
          await mkdir(join(dir, '.trash'), { recursive: true })
          const to = join(dir, '.trash', `${base(existing.file)}-${Date.now()}.xml`)
          if (campaignOf(existing.xml, tag)) { // a trashed runner leaves its campaign
            await writeAtomic(to, setCampaign(existing.xml, null, tag))
            await unlink(join(dir, existing.file))
          } else await rename(join(dir, existing.file), to)
          res.writeHead(204).end()
          return
        }
        const ifMatch = req.headers['if-match']
        if (existing && url.searchParams.get('force') !== '1' && String(existing.rev) !== String(ifMatch ?? ''))
          return send(res, 409, { error: 'conflict', rev: existing.rev, file: existing.file, updatedAt: attrOf(existing.xml, 'updatedAt') })
        const rev = (existing?.rev ?? 0) + 1
        await mkdir(dir, { recursive: true })
        const file = existing?.file ?? await freeName(dir, slug(url.searchParams.get('filename') || attrOf(xml, 'streetName') || attrOf(xml, 'name')))
        // the campaign is the stored runner's (set by /api/campaigns), never the body's
        await writeAtomic(join(dir, file), setRev(setCampaign(xml, existing && campaignOf(existing.xml, tag), tag), rev, tag))
        return send(res, existing ? 200 : 201, { rev, file })
      })
    }

    /** The Trash page's routes (see the top of this file), for runners or NPCs (`kind`). Players and editors: their own trash
     *  only; the admin: ?user=. */
    async function trash(req, res, url, who, kind) {
      const m = url.pathname.match(/^\/api\/(?:npcs\/)?trash(?:\/([^/]+)(\/restore)?)?$/)
      if (!m) return send(res, 404, { error: 'not found' })
      let file = null
      if (m[1] != null) {
        try { file = decodeURIComponent(m[1]) } catch { file = '' }
        if (!TRASH_FILE.test(file) || file.includes('..')) return send(res, 400, { error: 'bad file name' })
      }
      const want = !file ? ['GET', 'DELETE'] : m[2] ? ['POST'] : ['DELETE']
      if (!want.includes(req.method)) return send(res, 405, { error: 'method not allowed' })
      const whose = me => {
        const u = url.searchParams.get('user') ?? me.username
        if (u !== me.username && me.role !== 'admin') throw fail(403, 'only the admin can open another account’s trash')
        if (!auth.usernames().includes(u)) throw fail(404, 'no such account')
        return u
      }
      /** The runner files in a trash folder: regular files with a trash name (no links, no folders called *.xml). */
      const files = async dir => (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter(d => d.isFile() && TRASH_FILE.test(d.name)).map(d => d.name)
      if (req.method === 'GET') {
        const user = whose(who), dir = join(kind.folder(user), '.trash'), items = []
        for (const f of await files(dir)) {
          const [xml, s] = await Promise.all([readFile(join(dir, f), 'utf8'), stat(join(dir, f))]).catch(() => [])
          if (!xml) continue
          const at = Number(f.match(/-(\d{13})\.xml$/)?.[1] ?? s.mtimeMs)
          items.push({ file: f, id: attrOf(xml, 'id') ?? '', name: unesc(attrOf(xml, 'streetName') || attrOf(xml, 'name') || '') || base(f),
            deletedAt: new Date(at).toISOString() })
        }
        return send(res, 200, { user, name: auth.nameOf(user), items: items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)) })
      }
      return lock(async () => {
        const me = auth.current(who.id) // as it is now (renamed, disabled or deleted while this waited)
        if (!me) return send(res, 401, { error: 'sign in first' })
        if (refused(kind, me)) return send(res, 403, { error: 'your account can’t do this' })
        const user = whose(me), home = kind.folder(user), dir = join(home, '.trash')
        if (!file) {
          // { files: [...] }: only those (what the page showed), each checked; no body: all of them
          const body = await readBody(req)
          let only = null
          if (body.trim()) {
            try { only = JSON.parse(body).files } catch { /* checked below */ }
            if (!Array.isArray(only) || only.length > 10000 || !only.every(f => typeof f === 'string')) return send(res, 400, { error: 'body is { files: [file names] }' })
          }
          let deleted = 0
          for (const f of await files(dir)) if (!only || only.includes(f)) { await unlink(join(dir, f)); deleted++ }
          return send(res, 200, { deleted })
        }
        const path = join(dir, file)
        if (!inside(path, dir) || !(await lstat(path).catch(() => null))?.isFile()) return send(res, 404, { error: `no such ${kind.noun} in the trash` })
        if (req.method === 'DELETE') { await unlink(path); res.writeHead(204).end(); return }
        const xml = await readFile(path, 'utf8')
        // the other game's file (or anything else) never comes back here
        if (!NS.test(xml)) return send(res, 400, { error: `this file isn’t a${kind.npc ? 'n' : ''} ${kind.noun}, so it can’t be restored` })
        let id = attrOf(xml, 'id') ?? ''
        let taken = !ID.test(id)
        for (const u of auth.usernames()) if (!taken && (await index(kind.folder(u))).some(c => c.id === id)) taken = true
        await mkdir(home, { recursive: true })
        const name = await freeName(home, base(file).replace(/-\d{13}$/, '') || 'runner')
        if (taken) {
          id = randomUUID()
          const tmp = join(home, `.${name}.tmp`)
          await writeFile(tmp, restoredCopy(xml, id, tag), 'utf8')
          await rename(tmp, join(home, name))
          await unlink(path) // a crash before this leaves it in the trash too: nothing is lost
        } else if (campaignOf(xml, tag) && !await kind.holds(user, campaignOf(xml, tag))) { // its campaign is gone, or the owner left it
          await writeAtomic(join(home, name), setCampaign(xml, null, tag))
          await unlink(path)
        } else await rename(path, join(home, name))
        const after = await readFile(join(home, name), 'utf8')
        return send(res, 200, { file: name, id, name: unesc(attrOf(after, 'streetName') || attrOf(after, 'name') || ''), copy: taken })
      })
    }

    /** A deleted account (no runners left), after its campaign roles are dropped: its trash goes to <home>/.trash/, its
     *  NPCs and their trash to <home>/.npcs/.trash/, named after it; then its folders go. */
    async function retire(u) {
      await campaigns.drop(u)
      for (const [d, to] of [[join(folder(u), '.trash'), join(home, '.trash')], [folder(u), null],
        [join(npcFolder(u), '.trash'), join(npcRoot, '.trash')], [npcFolder(u), join(npcRoot, '.trash')]]) {
        if (to) await moveAll(d, to, `${u}-`)
        await rmdir(d).catch(() => {})
      }
    }

    return { handle, campaigns, retire, folder, stores: [[folder, label], [npcFolder, `${label}.npcs/`]] }
  }

  let oidc = null
  auth = authApi({ libraryDir, trustProxy, lock, track: books.track, runners, accountKeys, publicUrl, oidcOn: () => oidc.enabled() }) // accountKeys: tests
  const games = { ca2: gameStore(GAMES.ca2), sr6: gameStore(GAMES.sr6) }
  // each game's book source lists: the shipped one, the imported books', house sources, the catalog edits'
  const sourceFiles = (data, custom) => [join(data, 'sources.xml'), ...['imported/sources.xml', 'sources.xml', 'edits/sources.xml'].map(f => join(custom, f))]
  const compendiums = {
    ca2: compendiumsApi({ home: charDir, sourceFiles: sourceFiles(join(staticDir, 'data'), customDir), lock, auth, campaigns: games.ca2.campaigns }),
    sr6: compendiumsApi({ game: GAMES.sr6, home: join(charDir, GAMES.sr6.sub), sourceFiles: sourceFiles(join(staticDir, 'data', 'sr6'), join(customDir, 'sr6')),
      lock, auth, campaigns: games.sr6.campaigns }),
  }
  const stores = () => [...games.ca2.stores, [compendiums.ca2.folder, 'characters/.compendiums/'],
    ...legacy() ? [] : [...games.sr6.stores, [compendiums.sr6.folder, 'characters/sr6/.compendiums/']]]
  // each game's own art set: Anarchy's in library/backgrounds/, SR6's in library/sr6/backgrounds/ (SR6's starts with our circuit board)
  const backgrounds = { ca2: backgroundsApi({ libraryDir, auth }), sr6: backgroundsApi({ libraryDir: join(libraryDir, GAMES.sr6.sub), auth,
    seed: { file: join(ROOT, 'server', 'defaults', 'sr6-circuit.webp'), name: 'Circuit board (default)' }, track: books.track }) }
  oidc = oidcApi({ libraryDir, auth, track: books.track, ...oidcOpts }) // oidcOpts: tests (timeouts, size cap, key-set refetch gap)

  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
    res.end(type === 'application/json' ? JSON.stringify(body) : body)
  }

  async function readBody(req) {
    const chunks = []
    let size = 0
    for await (const c of req) {
      size += c.length
      if (size > MAX_BODY) throw Object.assign(new Error('file too large'), { code: 413 })
      chunks.push(c)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  // a served file's gzip, kept while the file is unchanged (the SR6 books' texts are tens of megabytes of XML)
  const zipped = new Map()
  /** A file under `base`: a validator (ETag), so the browser's copy is reused while the file is unchanged (304), and
   *  gzip for text the browser takes it for. */
  async function serveFile(res, base, rel, req) {
    const path = resolve(base, '.' + rel)
    if (!inside(path, base)) return send(res, 403, { error: 'forbidden' })
    if (inside(path, libraryDir)) return null // even when the Library is mounted inside a served folder
    try {
      const s = await stat(path)
      if (s.isDirectory()) return serveFile(res, base, rel.replace(/\/?$/, '/index.html'), req)
      const type = TYPES[extname(path)] ?? 'application/octet-stream', text = /^text\/|xml|json|svg/.test(type)
      const etag = `W/"${s.size.toString(36)}-${Math.floor(s.mtimeMs).toString(36)}"`
      const head = { 'Content-Type': type, 'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        ETag: etag, ...text ? { Vary: 'Accept-Encoding' } : {} }
      if (req?.headers['if-none-match'] === etag) { res.writeHead(304, head).end(); return true }
      let body = await readFile(path)
      if (text && body.length > 1024 && /\bgzip\b/.test(req?.headers['accept-encoding'] ?? '')) {
        let z = zipped.get(path)
        if (z?.etag !== etag) zipped.set(path, z = { etag, body: await gzipAsync(body) })
        body = z.body
        head['Content-Encoding'] = 'gzip'
      }
      res.writeHead(200, head).end(body)
    } catch {
      return null
    }
    return true
  }

  /** Is `asked` (a path under `dir`, the request's `path`) one of the campaigns.xml files, which hold who plays where and GM
   *  notes and go only through /api/campaigns? By name in `dir` (any case, trailing dots and spaces: Windows'), by Windows'
   *  stream and short-name syntax, and by the file itself against both games' (a hard link, a name the check didn't think of). */
  async function customGuard(dir, asked, path) {
    const secret = join(dir, 'campaigns.xml')
    if (/[:~]/.test(path) || asked.replace(/[. ]+$/, '').toLowerCase() === secret.toLowerCase()) return true
    const [a, ...b] = await Promise.all([asked, join(customDir, 'campaigns.xml'), join(customDir, 'sr6', 'campaigns.xml')].map(p => stat(p).catch(() => null)))
    return b.some(f => a && f && a.dev === f.dev && a.ino === f.ino)
  }

  async function api(req, res, url, who) {
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, storage: 'server' })
    const s = scoped(url.pathname)
    if (s.game === 'sr6') { // the SR6 area: its game stores only, as the same routes without the prefix
      if (legacy()) return send(res, 409, { error: 'rename the account sr6 first' })
      const u = new URL(url)
      u.pathname = s.path
      if (/^\/api\/campaigns(\/|$)/.test(s.path)) return games.sr6.campaigns.handle(req, res, u, send, who)
      if (/^\/api\/(characters|npcs|trash)(\/|$)/.test(s.path)) return games.sr6.handle(req, res, u, who)
      if (await compendiums.sr6.handle(req, res, u, send, who) !== false) return
      if (await backgrounds.sr6.handle(req, res, u, send, who) !== false) return
      if (/^\/api\/(books|edits|creation)(\/|$)/.test(s.path) && await books.handle(req, res, u, send, who, 'sr6') !== false) return
      return send(res, 404, { error: 'not found' })
    }
    if (await oidc.handle(req, res, url, send, who) !== false) return
    if (await auth.handle(req, res, url, send, who) !== false) return
    if (await books.handle(req, res, url, send, who) !== false) return
    if (await games.ca2.campaigns.handle(req, res, url, send, who) !== false) return
    if (await compendiums.ca2.handle(req, res, url, send, who) !== false) return
    if (await backgrounds.ca2.handle(req, res, url, send, who) !== false) return
    return games.ca2.handle(req, res, url, who)
  }

  const server = httpServer(async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)
    try {
      const url = new URL(req.url, 'http://x')
      if (url.pathname.startsWith('/api/')) {
        const who = auth.gate(req, res, url, send) // the Origin check and the role table
        if (who === false) return
        // every write except backup and restore themselves is counted for its whole life: a restore waits for it, and it
        // is refused while a restore runs
        return await (req.method === 'GET' || /^\/api\/(backup|restore)(\/|$)/.test(url.pathname)
          ? api(req, res, url, who) : books.track(() => api(req, res, url, who)))
      }
      if (url.pathname.startsWith('/custom/')) { // imported book data: signed-in users only
        if (!auth.session(req, res)) return send(res, 401, 'sign in first', 'text/plain')
        // the Shadowrun 6 area's catalog: only at this exact lowercase prefix, only from custom/sr6/
        const sr6 = url.pathname.startsWith('/custom/sr6/')
        if (sr6 && legacy()) return send(res, 404, 'not found', 'text/plain') // an account called sr6 from before: no SR6 area
        const dir = sr6 ? join(customDir, 'sr6') : customDir, rel = url.pathname.slice(sr6 ? '/custom/sr6'.length : '/custom'.length)
        const asked = resolve(dir, '.' + rel)
        // Anarchy's /custom/: custom/sr6/ never, in any case or spelling (SR6's is the branch above)
        const top = relative(customDir, asked).split(sep)[0].replace(/[. ]+$/, '').toLowerCase()
        if ((!sr6 && top === 'sr6') || await customGuard(dir, asked, url.pathname)) return send(res, 404, 'not found', 'text/plain')
        if (await serveFile(res, dir, rel, req)) return
        return send(res, 404, 'not found', 'text/plain')
      }
      if (await serveFile(res, staticDir, url.pathname, req)) return
      if (!extname(url.pathname) && await serveFile(res, staticDir, '/index.html', req)) return // SPA
      send(res, 404, 'not found', 'text/plain')
    } catch (e) {
      if (res.headersSent) return res.destroy()
      const code = [400, 401, 403, 404, 409, 413, 415, 429, 502].includes(e.code) ? e.code : 500
      if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter))
      send(res, code, { error: code === 500 ? 'server error' : e.message })
      if (code === 500) console.error(e.stack) // never a request body
    }
  })
  server.requestTimeout = 3600 * 1000 // a 20 GB backup upload over a slow network (Node's default is 5 min)
  server.stopJobs = () => { books.stop(); auth.stop() }
  server.started = books.started // the start-up checks (interrupted jobs, core data re-import) have queued their jobs
  return server
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 80)
  const server = createServer({
    staticDir: process.env.STATIC_DIR ?? new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
    charDir: process.env.CHAR_DIR ?? '/data/characters',
    customDir: process.env.CUSTOM_DIR ?? '/data/custom',
    libraryDir: process.env.LIBRARY_DIR ?? '/data/library',
    python: process.env.PYTHON ?? 'python3',
    trustProxy: process.env.TRUST_PROXY ?? '', // comma-separated IPs or CIDRs of the reverse proxy
    publicUrl: process.env.PUBLIC_URL ?? '', // the app's one public address (Origin check, Authelia redirect URI)
  })
  server.listen(port, () => console.log(`chummer-anarchy2 on :${port}`))
  // docker stop: end the importer job too (the next start marks its book interrupted); sessions.xml is saved
  const quit = () => { server.stopJobs(); server.close(); setTimeout(() => process.exit(0), 2000).unref() }
  process.on('SIGTERM', quit)
  process.on('SIGINT', quit)
}
