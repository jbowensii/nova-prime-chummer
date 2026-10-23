// The Books API's catalog edits (custom/edits/, through `importer edit`), house sources, the GM's table rules, the example
// sets and SR6's creation rules (custom/sr6/creation.xml; a campaign's own: server/campaigns.mjs). Routes and roles:
// server/books.mjs.
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { CONFIG_NS, SOURCE_ID, attr, body, clean, esc, fail, readOr, rootTag, serializer, writeAtomic, xmlBody } from './common.mjs'

const ENTRY_ID = /^[a-z0-9][a-z0-9.-]{0,99}$/ // importer/edits.py's ID, bounded
const MAX_TABLE_RULES = 200 // tablerules.xsd
const MAX_SETTINGS = 500,
  SETTING_KEY = /^[A-Za-z0-9.:_-]{1,80}$/ // creation.xsd (SR6)
const MAX_EDIT = 1024 * 1024 + 4096 // the importer's cap on one entry and its description, plus the <edit> wrapper
const SET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/ // a folder in custom/samples/, and each file in it
const BUILTIN = { name: 'Built-in samples (first release)', canon: true } // custom/samples/builtin/ without a set.xml

/** SR6 creation settings as creation.xsd allows them: [{ key, value, source?, page? }] tidied (page a number), or a 400 for
 *  the first bad one. The server's default (PUT /api/sr6/creation) and a campaign's own (server/campaigns.mjs). */
export function creationSettings(list) {
  if (!Array.isArray(list) || list.length > MAX_SETTINGS) throw fail(400, `send settings as [{ key, value, source?, page? }], ${MAX_SETTINGS} at most`)
  const seen = new Set()
  return list.map(s => {
    const key = String(s?.key ?? ''),
      value = clean(String(s?.value ?? '')).trim()
    const source = s?.source == null ? '' : String(s.source),
      page = s?.page == null ? '' : String(s.page)
    if (!SETTING_KEY.test(key)) throw fail(400, 'a setting’s key is 1 to 80 letters, digits and . : _ -')
    if (seen.has(key)) throw fail(400, `the setting ${key} is set twice`)
    seen.add(key)
    if (!value || value.length > 200) throw fail(400, `the value of ${key} is 1 to 200 characters`)
    if (source && !SOURCE_ID.test(source)) throw fail(400, `the source of ${key} is a book id such as CRB`)
    if (page && !/^[1-9]\d{0,5}$/.test(page)) throw fail(400, `the page of ${key} is a whole number from 1`)
    return { key, value, ...(source ? { source } : {}), ...(page ? { page: Number(page) } : {}) }
  })
}
/** One checked setting as creation.xsd's <setting/>. */
export const settingXml = s => `<setting key="${s.key}" value="${esc(s.value)}"${s.source ? ` source="${s.source}"` : ''}${s.page ? ` page="${s.page}"` : ''}/>`
/** The <setting/> tags in `xml` as [{ key, value, source?, page? }]. */
export const readSettings = xml =>
  [...xml.matchAll(/<setting\b[^>]*>/g)].map(([t]) => {
    const source = attr(t, 'source'),
      page = attr(t, 'page')
    return { key: attr(t, 'key'), value: attr(t, 'value'), ...(source ? { source } : {}), ...(page ? { page: Number(page) } : {}) }
  })

/** ctx (books.mjs): AREAS, compendiumSources and the importer (jobs.mjs). */
export function editsApi(ctx) {
  const { AREAS, compendiumSources, importer, redact } = ctx
  const customDir = AREAS.ca2.custom // (the example sets and the table rules are Anarchy's)
  // edits (one fixed .tmp name), the table rules and the creation rules: each one at a time
  const serial = serializer()

  /** One `importer edit …` call after the previous one; exit 3 is a refusal whose reason goes back as a 400. */
  function edit(args, input, area = AREAS.ca2) {
    return serial('edit', async () => {
      const r = await importer([...area.pre, 'edit', ...args, '--custom', area.custom], { input, timeout: 60000 })
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(400, why || 'the importer refused the edit')
      if (r.code !== 0) throw fail(500, 'couldn’t save the edit: ' + why)
      return r.out
    })
  }

  async function edits(req, res, url, send, who, game = 'ca2') {
    const p = url.pathname,
      method = req.method,
      area = AREAS[game]
    if (p === '/api/edits' && method === 'GET') {
      const xml = (await readOr(join(area.custom, 'edits', 'edits.xml'), '')).replace(/<!--[\s\S]*?-->/g, '')
      const kind = Object.fromEntries(Object.entries(area.kinds).map(([k, t]) => [t, k]))
      // entries only: an SR6 entry's parts can share a kind's tag (a priority's <metatype>, a critter's <gear>) but have no id
      return send(
        res,
        200,
        [...xml.matchAll(/<([a-z]+)\b[^>]*>/g)]
          .filter(m => Object.hasOwn(kind, m[1]) && attr(m[0], 'id'))
          .map(m => ({ kind: kind[m[1]], id: attr(m[0], 'id') })),
      )
    }
    if (p === '/api/edits/sources' && game === 'sr6') return send(res, 404, { error: 'not found' }) // S1: no SR6 house sources
    if (p === '/api/edits/sources') {
      if (method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'send the source as application/json' })
      let b
      try {
        b = JSON.parse(await body(req, 4096))
      } catch (e) {
        throw e.code === 413 ? e : fail(400, 'send { id, name } as JSON')
      }
      const name = clean(String(b?.name ?? '')).trim()
      if (!SOURCE_ID.test(b?.id ?? '') || !name || name.length > 120) throw fail(400, 'a source needs an id (A–Z, 0–9, -, starting with a letter) and a name')
      if ((await compendiumSources()).has(b.id)) throw fail(409, `the source id ${b.id} is a compendium’s; choose another`)
      await edit(['add-source', b.id, `--name=${name}`]) // one argument: a name starting with "-" isn't an option
      return send(res, 204, '', 'text/plain')
    }
    const m = p.match(/^\/api\/edits\/([a-z]+)\/([^/]+)$/)
    if (!m) return send(res, 404, { error: 'not found' })
    let id
    try {
      id = decodeURIComponent(m[2])
    } catch {
      throw fail(400, 'bad entry id')
    }
    if (!Object.hasOwn(area.kinds, m[1])) throw fail(400, game === 'ca2' ? 'kind is amps, items or rules' : 'unknown kind')
    if (!ENTRY_ID.test(id)) throw fail(400, 'bad entry id')
    if (method === 'PUT') {
      await edit(['set', m[1], id, '--by', who.username], xmlBody(await body(req, MAX_EDIT), 'edit'), area)
      return send(res, 204, '', 'text/plain')
    }
    if (method === 'DELETE')
      return send(res, 200, { removed: attr(rootTag(await edit(['remove', m[1], id], undefined, area), 'result'), 'removed') === 'true' })
    return send(res, 405, { error: 'method not allowed' })
  }

  /** The example sets: every custom/samples/<set>/ folder and its character files. A set without set.xml is named after
   *  its folder and isn't canon, except "builtin" (the first release's runners, built from the core rulebook only). */
  async function sampleSets(req, res, send) {
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
    const root = join(customDir, 'samples'),
      sets = []
    for (const d of (await readdir(root, { withFileTypes: true }).catch(() => [])).filter(d => d.isDirectory() && SET_ID.test(d.name))) {
      const tag = rootTag(await readOr(join(root, d.name, 'set.xml')), 'ca2:sampleset')
      const def = d.name === 'builtin' ? BUILTIN : { name: d.name, canon: false }
      const samples = []
      for (const f of (await readdir(join(root, d.name)).catch(() => [])).filter(f => f.endsWith('.xml') && f !== 'set.xml' && SET_ID.test(f)).sort()) {
        const ch = rootTag(await readOr(join(root, d.name, f), ''), 'ca2:character')
        if (ch) samples.push({ name: attr(ch, 'streetName') || attr(ch, 'name') || f.replace(/\.xml$/, ''), href: `samples/${d.name}/${f}` })
      }
      sets.push({ id: d.name, name: attr(tag, 'name') || def.name, canon: tag ? ['true', '1'].includes(attr(tag, 'canon')) : def.canon, samples })
    }
    return send(res, 200, { sets: sets.sort((a, b) => a.id.localeCompare(b.id)) })
  }

  /** The GM's table rules, all at once: the Rules page sends the whole list on every change. */
  async function tableRules(req, res, send) {
    if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'send the table rules as application/json' })
    let b
    try {
      b = JSON.parse(await body(req, 1024 * 1024))
    } catch (e) {
      throw e.code === 413 ? e : fail(400, 'send { rules: [{ id, on, name?, text? }] } as JSON')
    }
    if (!Array.isArray(b?.rules) || b.rules.length > MAX_TABLE_RULES)
      throw fail(400, `send { rules: [{ id, on, name?, text? }] }, ${MAX_TABLE_RULES} rules at most`)
    const seen = new Set()
    const rows = b.rules.map(r => {
      const id = String(r?.id ?? ''),
        name = clean(String(r?.name ?? '')).trim(),
        text = clean(String(r?.text ?? '')).trim()
      if (!ENTRY_ID.test(id) || seen.has(id)) throw fail(400, 'each rule needs an id of its own')
      seen.add(id)
      if (typeof r.on !== 'boolean') throw fail(400, 'a rule is on (true) or off (false)')
      if (r.locked !== undefined && typeof r.locked !== 'boolean') throw fail(400, 'a rule is locked (true) or not (false)')
      if (!name && text) throw fail(400, 'a house rule needs a name')
      if (name.length > 120 || text.length > 4000) throw fail(400, 'a house rule’s name is 120 characters at most, its description 4,000')
      return `  <rule id="${id}" on="${r.on}"${r.locked ? ' locked="true"' : ''}>${name ? `<name>${esc(name)}</name><text>${esc(text)}</text>` : ''}</rule>\n`
    })
    await serial('table', () =>
      writeAtomic(
        join(customDir, 'table-rules.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n' + `<ca2:tablerules xmlns:ca2="${CONFIG_NS}" version="1">\n${rows.join('')}</ca2:tablerules>\n`,
      ),
    )
    return send(res, 204, '', 'text/plain')
  }

  /** The SR6 creation rules (custom/sr6/creation.xml), all at once: Game data sends the whole list on every save. */
  async function creation(req, res, send) {
    const path = join(AREAS.sr6.custom, 'creation.xml')
    if (req.method === 'GET') return send(res, 200, readSettings(await readOr(path, '')))
    if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { error: 'send the creation rules as application/json' })
    let b
    try {
      b = JSON.parse(await body(req, 1024 * 1024))
    } catch (e) {
      throw e.code === 413 ? e : fail(400, 'send { settings: [{ key, value, source?, page? }] } as JSON')
    }
    if (!Array.isArray(b?.settings)) throw fail(400, `send { settings: [{ key, value, source?, page? }] }, ${MAX_SETTINGS} settings at most`)
    const rows = creationSettings(b.settings).map(s => `  ${settingXml(s)}\n`)
    await mkdir(AREAS.sr6.custom, { recursive: true })
    await serial('creation', () =>
      writeAtomic(
        path,
        '<?xml version="1.0" encoding="UTF-8"?>\n' + `<sr6:creation xmlns:sr6="urn:chummer-sr6:config:1" version="1">\n${rows.join('')}</sr6:creation>\n`,
      ),
    )
    return send(res, 204, '', 'text/plain')
  }

  return { edits, sampleSets, tableRules, creation }
}
