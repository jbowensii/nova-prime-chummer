// Compendiums: a GM's own entries and NPCs in one data-format file of their game, one store per game (server.mjs makes two):
//   Anarchy: <ca2:data kind="compendium"> (docs/data-format.md) in characters/.compendiums/<owner>/<id>.xml (+ .trash/) at
//            /api/compendiums*
//   SR6:     <sr6:data kind="compendium"> (docs/sr6-data-format.md) in characters/sr6/.compendiums/<owner>/<id>.xml at
//            /api/sr6/compendiums* (api() strips /sr6; the routes below are the same)
// Editors and the admin only but /shared: need() gives players 403 on every other route, and a request that waited for the
// lock checks the role again. Each store takes only its own game's root and refuses a body naming the other game's namespaces anywhere (an
// embedded runner or entry from the other game); campaign sharing and source ids are that game's only.
//
//   GET    /api/compendiums        -> [{ id, file, rev, xml, owner, ownerName }] those the caller may read: their own; the
//                                    admin: everyone's; an editor: sharing="table" ones, and sharing="campaign" ones whose
//                                    campaign both they and the owner GM
//   PUT    /api/compendiums/:id    body: the file (up to 20 MB); If-Match: <rev> or ?force=1, as for runners; the server
//                                  sets rev and updatedAt. The owner only (403 on an id another account holds). The source id
//                                  is fixed once saved and unique across the books' sources and every compendium (409)
//   DELETE /api/compendiums/:id    moves it to .trash/ as <id>-<ms since 1970>.xml
//   GET    /api/compendiums/shared -> the same rows, for anyone signed in (players' runners use their entries; read only):
//                                    sharing="table" ones, and sharing="campaign" ones whose campaign the caller is a GM or
//                                    member of while the owner GMs it. Never private ones, and never their NPCs (taken out)
import { mkdir, readdir, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { attr, writeAtomic } from './books.mjs'
import { GAMES } from './games.mjs'

const MAX = 20 * 1024 * 1024 // embedded NPC portraits
const ID = /^[0-9a-f]{12}$/
const SOURCE_ID = /^[A-Z][A-Z0-9-]{0,19}$/ // books.mjs's
const SHARING = ['private', 'campaign', 'table']
const fail = (code, message) => Object.assign(new Error(message), { code })
// the other game's namespace where a plain-text check can't see it: written with a character or entity reference, or
// declared in a DTD. Linear: an xmlns value ends at its closing quote.
const HIDDEN_NS = /<!DOCTYPE|\sxmlns(?::[\w.-]+)?="[^"]*&/i

// an embedded NPC (any prefix, or none): a <character> element and everything in it. Characters don't nest.
const OPEN = /<(?:[\w.-]+:)?character\b/g,
  CLOSE = /<\/(?:[\w.-]+:)?character\s*>/g
/** The compendium file without its NPCs, for players; null when one can't be taken out cleanly (never sent then).
 *  Linear: an NPC ends at its first '>' when that is "/>", else at the first closing tag after it. One with neither means
 *  no later one can close either, so the file is refused there rather than rescanned from every opening tag. */
export function withoutNpcs(xml) {
  let out = '',
    at = 0,
    open
  for (OPEN.lastIndex = 0; (open = OPEN.exec(xml));) {
    const after = OPEN.lastIndex,
      gt = xml.indexOf('>', after)
    let end
    if (gt > 0 && xml[gt - 1] === '/') end = gt + 1
    else {
      CLOSE.lastIndex = after
      if (!CLOSE.exec(xml)) return null
      end = CLOSE.lastIndex
    }
    out += xml.slice(at, open.index)
    at = OPEN.lastIndex = end
  }
  out += xml.slice(at)
  return /<(?:[\w.-]+:)?character\b|<!DOCTYPE|<!\[CDATA\[/i.test(out) ? null : out
}

/** game: GAMES.ca2 or GAMES.sr6 (its data root and the other game's namespace); home: that game's characters folder;
 *  sourceFiles: its books' source lists (missing ones are skipped); campaigns: that game's. */
export function compendiumsApi({ game = GAMES.ca2, home, sourceFiles, lock, auth, campaigns }) {
  const root = join(home, '.compendiums'),
    folder = u => join(root, u) // a username never starts with a dot
  // the root first (after the XML declaration), in the game's data namespace, its attributes as the app writes them
  // (double-quoted, < and > escaped): the server edits that tag (rev, updatedAt). Linear: each attribute ends at its quote.
  const ROOT = new RegExp(`^\\s*(?:<\\?xml[^?]*\\?>\\s*)?(<${game.data.tag}(?:\\s+[\\w:.-]+="[^"<>]*")*\\s*>)`)
  const xmlns = `xmlns:${game.data.tag.split(':')[0]}`
  /** The file's root tag, when it is a compendium of this game; else null. */
  function rootOf(xml) {
    const tag = xml.match(ROOT)?.[1]
    return tag && attr(tag, xmlns) === game.data.ns && attr(tag, 'kind') === 'compendium' ? tag : null
  }
  function setAttr(xml, name, value) {
    const tag = xml.match(ROOT)[1],
      re = new RegExp(`\\s${name}="[^"]*"`)
    const next = re.test(tag) ? tag.replace(re, ` ${name}="${value}"`) : tag.replace(/\s*>$/, ` ${name}="${value}">`)
    return xml.replace(tag, next)
  }

  async function index(owner) {
    const out = []
    for (const file of (await readdir(folder(owner)).catch(() => [])).filter(f => ID.test(f.replace(/\.xml$/, '')) && f.endsWith('.xml'))) {
      const xml = await readFile(join(folder(owner), file), 'utf8'),
        tag = rootOf(xml)
      if (tag) out.push({ id: file.slice(0, -4), file, rev: Number(attr(tag, 'rev') ?? 0), xml, owner, tag })
    }
    return out
  }
  const all = async () => (await Promise.all(auth.usernames().map(index))).flat()
  /** Every source id this game's books use: the shipped list, the imported books', house sources, the catalog edits'. */
  async function bookSources() {
    const texts = await Promise.all(sourceFiles.map(f => readFile(f, 'utf8').catch(() => '')))
    return new Set(texts.flatMap(t => [...t.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<source\b[^>]*\sid="([^"]*)"/g)].map(m => m[1])))
  }
  async function readable(me) {
    const out = []
    let camp = null // campaigns.xml, read once and only for a campaign-shared row
    for (const c of await all()) {
      const sharing = attr(c.tag, 'sharing'),
        cid = attr(c.tag, 'campaign')
      if (
        c.owner === me.username ||
        me.role === 'admin' ||
        sharing === 'table' ||
        (sharing === 'campaign' && cid && (camp ??= await campaigns.snapshot()).leads(me.username, cid) && camp.leads(c.owner, cid))
      )
        out.push(c)
    }
    return out
  }
  /** For anyone: the table ones and those shared with a campaign `me` is in (GM or member) that the owner still GMs. */
  async function shared(me) {
    const out = []
    let camp = null // campaigns.xml, read once and only for a campaign-shared row
    for (const c of await all()) {
      const sharing = attr(c.tag, 'sharing'),
        cid = attr(c.tag, 'campaign')
      if (sharing === 'table' || (sharing === 'campaign' && cid && (camp ??= await campaigns.snapshot()).holds(me.username, cid) && camp.leads(c.owner, cid)))
        out.push(c)
    }
    return out
  }
  async function body(req, res) {
    const big = () => {
      res.setHeader('Connection', 'close')
      return fail(413, 'a compendium can’t be larger than 20 MB')
    }
    if (Number(req.headers['content-length']) > MAX) throw big()
    const chunks = []
    let size = 0
    for await (const c of req) {
      if ((size += c.length) > MAX) throw big()
      chunks.push(c)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  async function handle(req, res, url, send, who) {
    const p = url.pathname
    if (!/^\/api\/compendiums(\/|$)/.test(p)) return false
    if (p === '/api/compendiums') {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      const me = auth.current(who.id)
      if (!me || !['admin', 'editor'].includes(me.role)) return send(res, 403, { error: 'your account can’t do this' })
      return send(
        res,
        200,
        (await readable(me)).map(({ id, file, rev, xml, owner }) => ({ id, file, rev, xml, owner, ownerName: auth.nameOf(owner) })),
      )
    }
    if (p === '/api/compendiums/shared') {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      const me = auth.current(who.id)
      if (!me) return send(res, 401, { error: 'sign in first' })
      const rows = []
      for (const { id, file, rev, xml, owner } of await shared(me)) {
        const bare = withoutNpcs(xml)
        if (bare != null) rows.push({ id, file, rev, xml: bare, owner, ownerName: auth.nameOf(owner) })
      }
      return send(res, 200, rows)
    }
    const m = p.match(/^\/api\/compendiums\/([^/]+)$/)
    if (!m) return send(res, 404, { error: 'not found' })
    let id
    try {
      id = decodeURIComponent(m[1])
    } catch {
      id = ''
    }
    if (!ID.test(id)) return send(res, 400, { error: 'bad id' })
    if (req.method !== 'DELETE' && req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
    const xml = req.method === 'PUT' ? await body(req, res) : null
    let tag = null
    if (xml != null) {
      if (xml.includes(game.foreign) || HIDDEN_NS.test(xml)) return send(res, 400, { error: 'this is the other game’s file' })
      tag = rootOf(xml)
      if (!tag || attr(tag, 'id') !== id) return send(res, 400, { error: 'body is not a compendium file for this id' })
      const name = attr(tag, 'name')?.trim(),
        sharing = attr(tag, 'sharing'),
        cid = attr(tag, 'campaign')
      if (!name || name.length > 120) return send(res, 400, { error: 'a compendium needs a name (up to 120 characters)' })
      if (!SOURCE_ID.test(attr(tag, 'source') ?? '')) return send(res, 400, { error: 'a source id is A–Z, 0–9 and -, starting with a letter (up to 20)' })
      if (!SHARING.includes(sharing)) return send(res, 400, { error: 'sharing is private, campaign or table' })
      if ((sharing === 'campaign') !== (cid != null) || (cid != null && !ID.test(cid)))
        return send(res, 400, { error: 'a campaign is named only when the compendium is shared with one' })
    }
    return lock(async () => {
      // the account as it is now: a rename while this request waited moved the folder, a disable, delete or demotion ends it
      const me = auth.current(who.id)
      if (!me) return send(res, 401, { error: 'sign in first' })
      if (!['admin', 'editor'].includes(me.role)) return send(res, 403, { error: 'your account can’t do this' })
      const everyone = await all(),
        existing = everyone.find(c => c.owner === me.username && c.id === id)
      if (!existing && everyone.some(c => c.id === id))
        return send(res, 403, { error: 'this compendium belongs to another account; only its owner can change it' })
      const dir = folder(me.username)
      if (req.method === 'DELETE') {
        if (!existing) return send(res, 404, { error: 'no such compendium' })
        await mkdir(join(dir, '.trash'), { recursive: true })
        await rename(join(dir, existing.file), join(dir, '.trash', `${id}-${Date.now()}.xml`))
        res.writeHead(204).end()
        return
      }
      const source = attr(tag, 'source'),
        cid = attr(tag, 'campaign')
      if (existing && attr(existing.tag, 'source') !== source) return send(res, 400, { error: 'a compendium’s source id can’t change' })
      if (!existing && ((await bookSources()).has(source) || everyone.some(c => attr(c.tag, 'source') === source)))
        return send(res, 409, { error: `the source id ${source} is taken; choose another` })
      if (cid && !(await campaigns.leads(me.username, cid))) return send(res, 400, { error: 'you can only share a compendium with a campaign you GM' })
      if (existing && url.searchParams.get('force') !== '1' && String(existing.rev) !== String(req.headers['if-match'] ?? ''))
        return send(res, 409, { error: 'conflict', rev: existing.rev, file: existing.file, updatedAt: attr(existing.tag, 'updatedAt') })
      const rev = (existing?.rev ?? 0) + 1,
        updatedAt = new Date().toISOString(),
        file = `${id}.xml`
      await mkdir(dir, { recursive: true })
      await writeAtomic(join(dir, file), setAttr(setAttr(xml, 'rev', rev), 'updatedAt', updatedAt))
      return send(res, existing ? 200 : 201, { rev, file, updatedAt })
    })
  }

  /** Every compendium's source id (books.mjs refuses them for a new house source). */
  const sources = async () => new Set((await all()).map(c => attr(c.tag, 'source')))
  return { handle, root, folder, sources }
}
