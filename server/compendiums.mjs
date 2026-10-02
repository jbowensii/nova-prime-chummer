// Compendiums: a GM's own amps, items, vehicles and NPCs in one data-format file (<ca2:data kind="compendium">, see
// docs/data-format.md), kept in characters/.compendiums/<owner>/<id>.xml (+ .trash/). Editors and the admin only: need()
// gives players 403 on every /api/compendiums route, and a request that waited for the lock checks the role again.
//
//   GET    /api/compendiums        -> [{ id, file, rev, xml, owner, ownerName }] those the caller may read: their own; the
//                                    admin: everyone's; an editor: sharing="table" ones, and sharing="campaign" ones whose
//                                    campaign both they and the owner GM
//   PUT    /api/compendiums/:id    body: the file (up to 20 MB); If-Match: <rev> or ?force=1, as for runners; the server
//                                  sets rev and updatedAt. The owner only (403 on an id another account holds). The source id
//                                  is fixed once saved and unique across the books' sources and every compendium (409)
//   DELETE /api/compendiums/:id    moves it to .trash/ as <id>-<ms since 1970>.xml
import { mkdir, readdir, readFile, rename, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { attr, writeAtomic } from './books.mjs'

const MAX = 20 * 1024 * 1024 // embedded NPC portraits
const ID = /^[0-9a-f]{12}$/
const SOURCE_ID = /^[A-Z][A-Z0-9-]{0,19}$/ // books.mjs's
const SHARING = ['private', 'campaign', 'table']
// the root first (after the XML declaration), in the data namespace, its attributes as the app writes them (double-quoted,
// < and > escaped): the server edits that tag (rev, updatedAt)
const ROOT = /^\s*(?:<\?xml[^?]*\?>\s*)?(<ca2:data(?:\s+[\w:.-]+="[^"<>]*")*\s*>)/
const fail = (code, message) => Object.assign(new Error(message), { code })

/** The file's root tag, when it is a compendium's; else null. */
function rootOf(xml) {
  const tag = xml.match(ROOT)?.[1]
  return tag && attr(tag, 'xmlns:ca2') === 'urn:chummer-anarchy2:data:1' && attr(tag, 'kind') === 'compendium' ? tag : null
}
function setAttr(xml, name, value) {
  const tag = xml.match(ROOT)[1], re = new RegExp(`\\s${name}="[^"]*"`)
  const next = re.test(tag) ? tag.replace(re, ` ${name}="${value}"`) : tag.replace(/\s*>$/, ` ${name}="${value}">`)
  return xml.replace(tag, next)
}

export function compendiumsApi({ charDir, customDir, staticDir, lock, auth, campaigns }) {
  const root = join(charDir, '.compendiums'), folder = u => join(root, u) // a username never starts with a dot

  async function index(owner) {
    const out = []
    for (const file of (await readdir(folder(owner)).catch(() => [])).filter(f => ID.test(f.replace(/\.xml$/, '')) && f.endsWith('.xml'))) {
      const xml = await readFile(join(folder(owner), file), 'utf8'), tag = rootOf(xml)
      if (tag) out.push({ id: file.slice(0, -4), file, rev: Number(attr(tag, 'rev') ?? 0), xml, owner, tag })
    }
    return out
  }
  const all = async () => (await Promise.all(auth.usernames().map(index))).flat()
  /** Every source id the books use: the shipped list, the imported books', house sources, the catalog edits'. */
  async function bookSources() {
    const files = [join(staticDir, 'data', 'sources.xml'), ...['imported/sources.xml', 'sources.xml', 'edits/sources.xml'].map(f => join(customDir, f))]
    const texts = await Promise.all(files.map(f => readFile(f, 'utf8').catch(() => '')))
    return new Set(texts.flatMap(t => [...t.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<source\b[^>]*\sid="([^"]*)"/g)].map(m => m[1])))
  }
  async function readable(me) {
    const out = []
    for (const c of await all()) {
      const sharing = attr(c.tag, 'sharing'), cid = attr(c.tag, 'campaign')
      if (c.owner === me.username || me.role === 'admin' || sharing === 'table'
        || (sharing === 'campaign' && cid && await campaigns.leads(me.username, cid) && await campaigns.leads(c.owner, cid))) out.push(c)
    }
    return out
  }
  async function body(req, res) {
    const big = () => { res.setHeader('Connection', 'close'); return fail(413, 'a compendium can’t be larger than 20 MB') }
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
      return send(res, 200, (await readable(me)).map(({ id, file, rev, xml, owner }) => ({ id, file, rev, xml, owner, ownerName: auth.nameOf(owner) })))
    }
    const m = p.match(/^\/api\/compendiums\/([^/]+)$/)
    if (!m) return send(res, 404, { error: 'not found' })
    let id
    try { id = decodeURIComponent(m[1]) } catch { id = '' }
    if (!ID.test(id)) return send(res, 400, { error: 'bad id' })
    if (req.method !== 'DELETE' && req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
    const xml = req.method === 'PUT' ? await body(req, res) : null
    let tag = null
    if (xml != null) {
      tag = rootOf(xml)
      if (!tag || attr(tag, 'id') !== id) return send(res, 400, { error: 'body is not a compendium file for this id' })
      const name = attr(tag, 'name')?.trim(), sharing = attr(tag, 'sharing'), cid = attr(tag, 'campaign')
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
      const everyone = await all(), existing = everyone.find(c => c.owner === me.username && c.id === id)
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
      const source = attr(tag, 'source'), cid = attr(tag, 'campaign')
      if (existing && attr(existing.tag, 'source') !== source) return send(res, 400, { error: 'a compendium’s source id can’t change' })
      if (!existing && ((await bookSources()).has(source) || everyone.some(c => attr(c.tag, 'source') === source)))
        return send(res, 409, { error: `the source id ${source} is taken; choose another` })
      if (cid && !await campaigns.leads(me.username, cid)) return send(res, 400, { error: 'you can only share a compendium with a campaign you GM' })
      if (existing && url.searchParams.get('force') !== '1' && String(existing.rev) !== String(req.headers['if-match'] ?? ''))
        return send(res, 409, { error: 'conflict', rev: existing.rev, file: existing.file, updatedAt: attr(existing.tag, 'updatedAt') })
      const rev = (existing?.rev ?? 0) + 1, updatedAt = new Date().toISOString(), file = `${id}.xml`
      await mkdir(dir, { recursive: true })
      await writeAtomic(join(dir, file), setAttr(setAttr(xml, 'rev', rev), 'updatedAt', updatedAt))
      return send(res, existing ? 200 : 201, { rev, file, updatedAt })
    })
  }

  return { handle, root, folder }
}
