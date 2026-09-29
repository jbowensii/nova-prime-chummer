// Campaigns: custom/campaigns.xml (campaigns.xsd), written by the server under the runners' write lock; never served as a
// file. See docs/superpowers/specs/2026-09-29-campaigns-ask-rules-design.md §2. A runner joins a campaign with its own
// campaign="<id>" attribute, which server.mjs keeps through saves (a new file never brings one); it counts while the campaign
// exists and the runner's owner is one of its GMs or members. Assigning or removing doesn't change the runner's rev. A trashed
// runner leaves its campaign (server.mjs); a restored one keeps a campaign only while its owner is still in it.
//
//   GET    /api/campaigns                       -> [campaign] the caller's (the admin: all)
//   POST   /api/campaigns                       admin, editors: { name, note? } -> 201 campaign; the caller is its GM
//   GET    /api/campaigns/:id                   -> campaign (its GMs, members, and the admin)
//   PUT    /api/campaigns/:id                   GM/admin: any of { name, note, archived } -> campaign
//   DELETE /api/campaigns/:id                   GM/admin: -> 204; 409 while runners are in it
//   POST   /api/campaigns/:id/members           GM/admin: { user } -> campaign
//   DELETE /api/campaigns/:id/members/:user     GM/admin: -> campaign; that player's runners leave it (they stay theirs)
//   POST   /api/campaigns/:id/gms               admin: { user } (an admin or editor) -> campaign
//   DELETE /api/campaigns/:id/gms/:user         GM/admin: -> campaign; 409 for its last GM
//   POST   /api/campaigns/:id/runners           the owner, a GM or member of it: { id } -> campaign; 409 while the runner is in
//                                               another one (one campaign per runner: copy it) or this one is archived
//   DELETE /api/campaigns/:id/runners/:runner   its owner, or a GM/admin of the campaign -> campaign
// campaign: { id, name, note, archived, created, you: gm | admin | member, gms: [{ username, name }], members: [same],
//   runners: [{ key, mine, ownerName, streetName, level, package, id, owner, file }] } (key: opaque, for lists; file: the sheet
//   in GET /api/characters). A member gets the roster only: names without usernames, and no id, owner or file (id: their own)
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { attr, esc, rootTag, unesc, writeAtomic } from './books.mjs'

const NS = 'urn:chummer-anarchy2:config:1'
export const CAMPAIGN_ID = /^[0-9a-f]{12}$/
const MAX_NAME = 80, MAX_NOTE = 4000
// eslint-disable-next-line no-control-regex
const oneLine = s => String(s ?? '').replace(/[\x00-\x1f\x7f]/g, '').trim()
// eslint-disable-next-line no-control-regex
const text = s => String(s ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ufffe\uffff]/g, '').trim()
const fail = (code, message) => Object.assign(new Error(message), { code })
const iso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z')
const charTag = xml => rootTag(xml, 'ca2:character')

/** A runner's campaign id (null: none, or not one this server could have written). */
export const campaignOf = xml => { const v = attr(charTag(xml), 'campaign'); return v && CAMPAIGN_ID.test(v) ? v : null }
/** The runner's XML with campaign="<id>" on its root, or none (id null). */
export const setCampaign = (xml, id) => xml.replace(/<ca2:character\b[^>]*>/, tag => {
  const bare = tag.replace(/\scampaign="[^"]*"/g, '')
  return id ? bare.replace(/\s*>$/, ` campaign="${id}">`) : bare
})

export function parseCampaigns(xml) {
  return [...xml.matchAll(/<campaign\b[^>]*?(?:\/>|>[\s\S]*?<\/campaign>)/g)].map(([m]) => {
    const tag = rootTag(m, 'campaign'), users = el => [...m.matchAll(new RegExp(`<${el}\\b[^>]*>`, 'g'))].map(([t]) => attr(t, 'user'))
    return { id: attr(tag, 'id'), name: attr(tag, 'name') ?? '', created: attr(tag, 'created') ?? iso(), archived: attr(tag, 'archived') === 'true',
      note: unesc(m.match(/<note>([\s\S]*?)<\/note>/)?.[1] ?? ''), gms: users('gm'), members: users('member') }
  }).filter(c => CAMPAIGN_ID.test(c.id ?? ''))
}
const campaignsXml = list => '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Campaigns (campaigns.xsd). Written by the server. -->\n'
  + `<ca2:campaigns xmlns:ca2="${NS}" version="1">\n${list.map(c => `  <campaign id="${esc(c.id)}" name="${esc(c.name)}" created="${esc(c.created)}"${
    c.archived ? ' archived="true"' : ''}>\n${c.note ? `    <note>${esc(c.note)}</note>\n` : ''}${
    c.gms.map(u => `    <gm user="${esc(u)}"/>\n`).join('')}${c.members.map(u => `    <member user="${esc(u)}"/>\n`).join('')}  </campaign>\n`).join('')}</ca2:campaigns>\n`

/** `lock`: the runners' write lock (server.mjs), which account changes hold too; `auth`: server/auth.mjs's api;
 *  `runnersOf(username)` -> [{ file, id, rev, xml }]; `writeRunner(username, file, xml)` writes one atomically. */
export function campaignsApi({ customDir, lock, auth, runnersOf, writeRunner }) {
  const path = join(customDir, 'campaigns.xml')
  const load = async () => parseCampaigns(await readFile(path, 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e }))
  const save = async list => { await mkdir(customDir, { recursive: true }); await writeAtomic(path, campaignsXml(list)) }

  const staff = u => ['admin', 'editor'].includes(auth.roleOf(u))
  const isGm = (c, u) => c.gms.includes(u) && staff(u) // a GM demoted to player keeps only a member's view
  const inIt = (c, u) => c.gms.includes(u) || c.members.includes(u)
  const manages = (c, me) => me.role === 'admin' || isGm(c, me.username)
  /** The runners in `c`: its GMs' and members' with campaign="<id>". */
  async function runners(c) {
    const out = []
    for (const owner of new Set([...c.gms, ...c.members])) for (const r of await runnersOf(owner)) if (campaignOf(r.xml) === c.id) out.push({ ...r, owner })
    return out
  }
  async function view(c, me) {
    const you = isGm(c, me.username) ? 'gm' : me.role === 'admin' ? 'admin' : 'member'
    // a member gets names only: no usernames, and a runner's id only for their own (to take it out)
    const roster = you === 'member'
    const person = username => roster ? { name: auth.nameOf(username) } : { username, name: auth.nameOf(username) }
    return { id: c.id, name: c.name, note: c.note, archived: c.archived, created: c.created, you, gms: c.gms.map(person), members: c.members.map(person),
      runners: (await runners(c)).map(r => {
        const t = charTag(r.xml), a = n => unesc(t.match(new RegExp(`\\s${n}="([^"]*)"`))?.[1] ?? '')
        const mine = r.owner === me.username, key = createHash('sha256').update(`${c.id}/${r.owner}/${a('id')}`).digest('hex').slice(0, 12)
        return { key, mine, ownerName: auth.nameOf(r.owner), streetName: a('streetName') || 'Unnamed runner', level: a('level'), package: a('package'),
          ...roster && !mine ? {} : { id: a('id') }, ...roster ? {} : { owner: r.owner, file: r.file } }
      }) }
  }
  const leave = async (c, owner) => { // `owner`'s runners in `c` leave it
    for (const r of await runnersOf(owner)) if (campaignOf(r.xml) === c.id) await writeRunner(owner, r.file, setCampaign(r.xml, null))
  }
  const account = u => {
    const n = oneLine(u).toLowerCase()
    if (!auth.usernames().includes(n)) throw fail(404, 'no such account')
    return n
  }
  const fields = (b, c = {}) => {
    const out = {}
    if (!c.id || 'name' in b) {
      out.name = oneLine(b.name)
      if (!out.name || out.name.length > MAX_NAME) throw fail(400, `a campaign’s name is 1–${MAX_NAME} characters`)
    }
    if ('note' in b) {
      out.note = text(b.note)
      if (out.note.length > MAX_NOTE) throw fail(400, `a note is ${MAX_NOTE} characters at most`)
    }
    if (c.id && 'archived' in b) {
      if (typeof b.archived !== 'boolean') throw fail(400, 'archived is true or false')
      out.archived = b.archived
    }
    return out
  }

  /** The campaign routes; false for any other path. */
  async function handle(req, res, url, send, who) {
    const p = url.pathname
    if (p !== '/api/campaigns' && !p.startsWith('/api/campaigns/')) return false
    const m = p.match(/^\/api\/campaigns(?:\/([0-9a-f]{12})(?:\/(members|gms|runners)(?:\/([^/]+))?)?)?$/)
    if (!m) return send(res, 404, { error: 'not found' })
    const [, id, part, raw] = m
    let key = null
    if (raw != null) try { key = decodeURIComponent(raw) } catch { return send(res, 400, { error: 'bad name' }) }
    const want = !id ? ['GET', 'POST'] : !part ? ['GET', 'PUT', 'DELETE'] : key == null ? ['POST'] : ['DELETE']
    if (!want.includes(req.method)) return send(res, 405, { error: 'method not allowed' })

    if (req.method === 'GET') {
      const list = (await load()).filter(c => (!id || c.id === id) && (who.role === 'admin' || inIt(c, who.username)))
      if (id && !list.length) return send(res, 404, { error: 'no such campaign' })
      const out = []
      for (const c of list) out.push(await view(c, who))
      return send(res, 200, id ? out[0] : out)
    }
    const b = req.method === 'POST' || req.method === 'PUT' ? await auth.json(req) : {}
    return lock(async () => {
      const me = auth.current(who.id) // as it is now: renamed, demoted, disabled or deleted while this waited
      if (!me) return send(res, 401, { error: 'sign in first' })
      const list = await load()
      if (!id) {
        if (!staff(me.username)) throw fail(403, 'only the admin and editors run campaigns')
        let cid
        do cid = randomBytes(6).toString('hex'); while (list.some(c => c.id === cid))
        const c = { id: cid, note: '', archived: false, created: iso(), ...fields(b), gms: [me.username], members: [] }
        list.push(c)
        await save(list)
        return send(res, 201, await view(c, me))
      }
      const c = list.find(x => x.id === id)
      if (!c || !(me.role === 'admin' || inIt(c, me.username))) throw fail(404, 'no such campaign')
      const done = async (changed = true) => { if (changed) await save(list); return send(res, 200, await view(c, me)) }
      if (part === 'runners') {
        if (req.method === 'POST') {
          const r = (await runnersOf(me.username)).find(x => x.id === String(b.id ?? ''))
          if (!r) throw fail(404, 'no such runner of yours')
          if (!inIt(c, me.username)) throw fail(403, 'join this campaign first: its GM adds players')
          if (c.archived) throw fail(409, 'this campaign is archived')
          const other = campaignOf(r.xml), there = other && other !== id && list.find(x => x.id === other)
          if (there && inIt(there, me.username)) throw fail(409, `this runner is in ${there.name}: remove it there first, or copy it`)
          if (other !== id) await writeRunner(me.username, r.file, setCampaign(r.xml, id))
          return done(false)
        }
        const r = (await runners(c)).find(x => x.id === key)
        if (!r) throw fail(404, 'that runner isn’t in this campaign')
        if (r.owner !== me.username && !manages(c, me)) throw fail(403, 'only its owner or a GM can take a runner out of a campaign')
        await writeRunner(r.owner, r.file, setCampaign(r.xml, null))
        return done(false)
      }
      if (!manages(c, me)) throw fail(403, 'only its GMs and the admin can change a campaign')
      if (!part && req.method === 'PUT') { Object.assign(c, fields(b, c)); return done() }
      if (!part) { // DELETE
        if ((await runners(c)).length) throw fail(409, 'this campaign still has runners: they leave it first')
        list.splice(list.indexOf(c), 1)
        await save(list)
        return send(res, 204, '', 'text/plain')
      }
      const role = part === 'gms' ? 'gms' : 'members'
      if (req.method === 'POST') {
        const u = account(b.user)
        if (role === 'gms' && me.role !== 'admin') throw fail(403, 'only the admin adds co-GMs')
        if (role === 'gms' && !staff(u)) throw fail(400, 'a GM is an admin or an editor')
        if (c[role].includes(u)) return done(false)
        c[role].push(u)
        return done()
      }
      const u = oneLine(key).toLowerCase()
      if (!c[role].includes(u)) throw fail(404, `${u} isn’t ${role === 'gms' ? 'a GM' : 'a member'} of this campaign`)
      if (role === 'gms' && c.gms.length === 1) throw fail(409, 'a campaign always has a GM: add another one first')
      c[role] = c[role].filter(x => x !== u)
      await save(list)
      if (!inIt(c, u)) await leave(c, u)
      return done(false)
    })
  }

  return {
    handle,
    /** Whether `owner`'s runner may keep campaign="<id>": it exists and they are a GM or member of it. */
    holds: async (owner, id) => (await load()).some(c => c.id === id && inIt(c, owner)),
    /** Another account's runners the editor `me` may read: those in the campaigns they GM (the admin reads everyone's). */
    async readable(me) {
      const seen = new Set(), out = []
      for (const c of await load()) if (isGm(c, me.username)) for (const r of await runners(c))
        if (r.owner !== me.username && !seen.has(`${r.owner}/${r.file}`)) { seen.add(`${r.owner}/${r.file}`); out.push(r) }
      return out
    },
    /** A username changed (under the lock, before users.xml is saved). */
    async rename(from, to) {
      const list = await load()
      let changed = false
      for (const c of list) for (const k of ['gms', 'members']) if (c[k].includes(from)) { c[k] = c[k].map(u => u === from ? to : u); changed = true }
      if (changed) await save(list)
    },
    /** An account is deleted (under the lock; it has no runners): its memberships and GM roles go; a campaign left without
     *  a GM gets the first other admin. */
    async drop(u) {
      const list = await load(), admin = auth.usernames().find(x => x !== u && auth.roleOf(x) === 'admin')
      if (!admin && list.some(c => c.gms.length === 1 && c.gms[0] === u))
        throw fail(409, 'this account is the only GM of a campaign and there is no other enabled admin to take it over')
      let changed = false
      for (const c of list) {
        if (!inIt(c, u)) continue
        changed = true
        c.members = c.members.filter(x => x !== u)
        c.gms = c.gms.filter(x => x !== u)
        if (!c.gms.length && admin) c.gms.push(admin)
      }
      if (changed) await save(list)
    },
  }
}
