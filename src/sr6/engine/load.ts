// Build the Shadowrun 6 catalog from its XML files (docs/sr6-data-format.md), apart from Anarchy's: every file must be an
// <sr6:data kind="…"> in SR6's namespace, so an Anarchy file is refused. Load order (collectSr6Files): the shipped
// sources, the imported sources, the imported books' files (custom/sr6/imported/index.xml), the private texts each source
// names, then the edits layer (custom/sr6/edits/edits.xml, texts.xml). Same id replaces, <remove id> deletes; sources
// merge by id; an edit replaces the entry (the book's version kept in `original`), and an empty description keeps the
// book's text.
import type { SourceFile } from '../../engine/load'
import { SR6_KINDS, type Sr6Catalog, type Sr6Entry, type Sr6Kind, type Sr6Source } from '../model/types'

export const SR6_NS = 'urn:chummer-sr6:data:1'
const KIND_OF_TAG = new Map(Object.entries(SR6_KINDS).map(([k, v]) => [v.tag, k as Sr6Kind]))
const KINDS = new Set(Object.keys(SR6_KINDS))
const OWN = new Set(['id', 'source', 'page'])
const SHIPPED = 'data/sr6/'
const CUSTOM = 'custom/sr6/'

/** The key of an entry in Sr6Catalog.original (ids are unique within a kind). */
export const entryKey = (kind: Sr6Kind, id: string) => `${kind}/${id}`

const attrsOf = (el: Element, skip = new Set<string>()) =>
  Object.fromEntries([...el.attributes].filter(a => !skip.has(a.name)).map(a => [a.name, a.value]))

function toEntry(el: Element, kind: Sr6Kind): Sr6Entry {
  const kids = [...el.children]
  const e: Sr6Entry = {
    id: el.getAttribute('id') ?? '', kind, name: kids.find(k => k.localName === 'name')?.textContent ?? '',
    source: el.getAttribute('source') ?? '', page: Number(el.getAttribute('page')) || 0, attrs: attrsOf(el, new Set([...OWN, 'by'])),
    parts: kids.filter(k => k.localName !== 'name' && k.localName !== 'text').map(k => ({ tag: k.localName, attrs: attrsOf(k), text: k.textContent ?? '' })),
    text: kids.find(k => k.localName === 'text')?.textContent ?? '',
  }
  if (!e.id) throw new Error(`a <${el.localName}> has no id`)
  return e
}

function toSource(el: Element, origin: Sr6Source['origin']): Sr6Source {
  const a = (n: string) => el.getAttribute(n) ?? undefined
  return { id: a('id') ?? '', name: el.getElementsByTagName('name')[0]?.textContent ?? '', publisher: a('publisher') ?? '',
    canon: a('canon') === 'true', texts: a('texts'), file: a('file'), sha256: a('sha256'), imported: a('imported'), origin }
}

/** As src/engine/load.ts mergeSource: an imported book the app also ships stays the shipped description, plus the
 * upload's file and checksum. */
function mergeSource(prev: Sr6Source | undefined, s: Sr6Source): Sr6Source {
  if (!prev) return s
  if (s.origin === 'imported' && prev.origin === 'shipped')
    return { ...prev, file: s.file, sha256: s.sha256, imported: s.imported, texts: prev.texts ?? s.texts, origin: 'imported' }
  return { ...prev, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) }
}

export function buildSr6Catalog(files: SourceFile[]): Sr6Catalog {
  const c: Sr6Catalog = { entries: Object.fromEntries(Object.keys(SR6_KINDS).map(k => [k, new Map()])) as Sr6Catalog['entries'],
    sources: new Map(), original: new Map(), files: [], errors: [] }
  for (const f of files) {
    const doc = new DOMParser().parseFromString(f.xml, 'text/xml')
    const perr = doc.getElementsByTagName('parsererror')[0]
    if (perr) { c.errors.push({ file: f.file, message: `XML parse error: ${perr.textContent?.trim().split('\n')[0]}` }); continue }
    const root = doc.documentElement, kind = root.getAttribute('kind') ?? ''
    if (root.localName !== 'data' || root.namespaceURI !== SR6_NS) { c.errors.push({ file: f.file, message: 'not an SR6 data file' }); continue }
    const els = [...root.children]
    try {
      if (kind === 'sources') {
        const origin = f.file.startsWith(SHIPPED) ? 'shipped' : 'imported'
        for (const s of els.filter(el => el.localName === 'source').map(el => toSource(el, origin))) c.sources.set(s.id, mergeSource(c.sources.get(s.id), s))
      } else if (kind === 'texts') {
        for (const el of els) {
          const e = KINDS.has(el.getAttribute('of') ?? '') ? c.entries[el.getAttribute('of') as Sr6Kind].get(el.getAttribute('id') ?? '') : undefined
          if (e) e.text = el.textContent ?? ''
        }
      } else if (kind === 'edits') {
        const edits = els.map(el => {
          const k = KIND_OF_TAG.get(el.localName)
          if (!k) throw new Error(`<${el.localName}> isn’t an SR6 entry`)
          return toEntry(el, k)
        })
        els.forEach((el, i) => {
          const e = edits[i], map = c.entries[e.kind], prev = map.get(e.id)
          if (prev && !prev.edited) c.original.set(entryKey(e.kind, e.id), prev)
          if (!e.text && prev) e.text = prev.text
          map.set(e.id, { ...e, edited: true, by: el.getAttribute('by') ?? undefined })
        })
      } else if (KINDS.has(kind)) {
        const k = kind as Sr6Kind, tag = SR6_KINDS[k].tag
        const bad = els.find(el => el.localName !== tag && el.localName !== 'remove')
        if (bad) throw new Error(`<${bad.localName}> doesn’t belong in a ${kind} file (<${tag}> entries only)`)
        const entries = els.filter(el => el.localName === tag).map(el => toEntry(el, k))
        for (const e of entries) c.entries[k].set(e.id, e)
        for (const el of els.filter(el => el.localName === 'remove')) c.entries[k].delete(el.getAttribute('id') ?? '')
      } else throw new Error(`unknown kind "${kind}"`)
    } catch (e) {
      c.errors.push({ file: f.file, message: (e as Error).message }); continue
    }
    c.files.push({ file: f.file, kind, entries: els.filter(el => el.localName !== 'remove').length })
  }
  return c
}

const hrefs = (index: string) => [...index.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<file\s+href="([^"]+)"/g)].map(m => m[1])

/** Every SR6 file, in load order (see the top of this file). `get` returns a file's text, or null when it isn't there;
 * `missing` lists the files an index or source names that weren't. */
export async function collectSr6Files(get: (path: string) => Promise<string | null>): Promise<{ files: SourceFile[]; missing: string[] }> {
  const files: SourceFile[] = [], missing: string[] = []
  const add = async (path: string, listed = false) => {
    const xml = await get(path)
    if (xml != null) files.push({ file: path, xml, overlay: !path.startsWith(SHIPPED) })
    else if (listed) missing.push(path)
    return xml
  }
  const sources = [await add(`${SHIPPED}sources.xml`, true), await add(`${CUSTOM}imported/sources.xml`)]
  const index = await get(`${CUSTOM}imported/index.xml`)
  for (const href of index ? hrefs(index) : []) await add(`${CUSTOM}imported/${href}`, true)
  for (const t of new Set([...sources.join('').matchAll(/\btexts="([^"]+)"/g)].map(m => m[1]))) await add(CUSTOM + t)
  for (const e of ['edits', 'texts']) await add(`${CUSTOM}edits/${e}.xml`)
  return { files, missing }
}

/** Fetch and build the SR6 catalog. An unreachable server fails the load; missing custom files are listed as errors. */
export async function loadSr6Catalog(base = './'): Promise<Sr6Catalog> {
  const get = (path: string) => fetch(base + path, { cache: 'no-cache' })
    .then(r => r.ok ? r.text() : null, e => { if (path.startsWith(SHIPPED)) throw e; return null })
  const { files, missing } = await collectSr6Files(get)
  const c = buildSr6Catalog(files)
  for (const m of missing) c.errors.push({ file: m, message: 'could not be fetched' })
  return c
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attrList = (a: Record<string, string>) => Object.entries(a).map(([k, v]) => ` ${k}="${esc(v)}"`).join('')

/** The entry element for an edit body (PUT sr6/edits/<kind>/<id>): id, source, page, its attributes, <name>, its parts
 * as they are, and an empty <text/> (descriptions go in the edit's <description>). */
export function sr6EntryXml(e: Sr6Entry): string {
  const tag = SR6_KINDS[e.kind].tag
  const parts = e.parts.map(p => p.text ? `<${p.tag}${attrList(p.attrs)}>${esc(p.text)}</${p.tag}>` : `<${p.tag}${attrList(p.attrs)}/>`).join('')
  return `<${tag}${attrList({ id: e.id, source: e.source, page: String(e.page), ...e.attrs })}><name>${esc(e.name)}</name>${parts}<text/></${tag}>`
}
