// Build the Shadowrun 6 catalog from its XML files (docs/sr6-data-format/kinds.md), apart from Anarchy's: every file must be an
// <sr6:data kind="…"> in SR6's namespace, so an Anarchy file is refused. Load order (collectSr6Files): the shipped
// sources, the imported sources, the imported books' files (custom/sr6/imported/index.xml), the optional data set's while
// the table's cl6OnlyData is on (custom/sr6/cl6only/index.xml: entries under sources of their own), the private texts each source
// names, the edits layer (custom/sr6/edits/edits.xml, texts.xml), then the GMs' compendiums this account can read (`extra`,
// kind="compendium"). Same id replaces, <remove id> deletes; sources merge by id; an edit replaces the entry (the book's
// version kept in `original`), and an empty description keeps the book's text. A compendium never replaces anything: one
// whose source id is already a book's is skipped, and so is an entry whose id another source's entry holds.
import type { SourceFile } from '../../../core/shared/source'
import { SR6_KINDS, type Sr6Catalog, type Sr6Entry, type Sr6Kind, type Sr6Source } from '../../formats/domain/types'
import { openIssues } from '../../../core/shared/formula'
import { readSr6Compendium, sr6CompendiumSource } from '../../formats/domain/compendium'
import { bookValue, ratingRange, type Find } from './values'
import { expandLevels } from './levels'
import { entryKey } from './names'
import { SR6_NS, toEntry } from '../../formats/domain/entryxml'

// (the entry codec lives in entryxml.ts, apart from the loader, so compendium.ts and charxml.ts read entries without
// importing the loader that imports them)
export { SR6_NS, sr6EntryXml, toEntry } from '../../formats/domain/entryxml'

const KIND_OF_TAG = new Map(Object.entries(SR6_KINDS).map(([k, v]) => [v.tag, k as Sr6Kind]))
const KINDS = new Set(Object.keys(SR6_KINDS))
const SHIPPED = 'data/sr6/'
const CUSTOM = 'custom/sr6/'
const CL6ONLY = `${CUSTOM}cl6only/`

function toSource(el: Element, origin: Sr6Source['origin']): Sr6Source {
  const a = (n: string) => el.getAttribute(n) ?? undefined
  return {
    id: a('id') ?? '',
    name: el.getElementsByTagName('name')[0]?.textContent ?? '',
    publisher: a('publisher') ?? '',
    canon: a('canon') === 'true',
    published: a('published'),
    cat: a('cat'),
    texts: a('texts'),
    file: a('file'),
    sha256: a('sha256'),
    imported: a('imported'),
    origin,
  }
}

/** As src/ca2/catalog/domain/load.ts mergeSource: an imported book the app also ships stays the shipped description, plus the
 * upload's file and checksum. */
function mergeSource(prev: Sr6Source | undefined, s: Sr6Source): Sr6Source {
  if (!prev) return s
  if (s.origin === 'imported' && prev.origin === 'shipped')
    return { ...prev, file: s.file, sha256: s.sha256, imported: s.imported, texts: prev.texts ?? s.texts, origin: 'imported' }
  return { ...prev, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) }
}

const MISC = String.raw`(?:\s|<!--(?:(?!--)[\s\S])*-->)*` // whitespace and comments
const ATTRS = String.raw`((?:\s+[\w:.-]+="[^"<&\t\n\r]*")*)\s*`
const PLAIN_ROOT = new RegExp(String.raw`^(?:<\?xml[^>]*\?>)?${MISC}<([A-Za-z_][\w.-]*):data${ATTRS}>([\s\S]*)</\1:data>${MISC}$`)
const PLAIN_TEXT = new RegExp(String.raw`<text${ATTRS}>([^<]*)</text>`, 'g')
const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const attrMap = (s: string) => {
  const a = new Map<string, string>()
  for (const [, k, v] of s.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    if (a.has(k)) return null
    a.set(k, v)
  }
  return a
}
/** A texts file's <text of id> elements read without the DOM (the books' texts are tens of megabytes: parsing them was
 *  most of the catalog's load), or null for anything but the plain shape the importer and the edits layer write: an SR6
 *  texts root holding only <text> elements of text, the five named entities and no CR, control character or `]]>`. A
 *  null file is read with the DOM, as before, which reports what's wrong with it. */
export function plainTexts(xml: string): { of: string; id: string; text: string }[] | null {
  if (!xml.includes('kind="texts"')) return null
  const m = PLAIN_ROOT.exec(xml),
    root = m && attrMap(m[2])
  if (!m || !root || root.get(`xmlns:${m[1]}`) !== SR6_NS || root.get('kind') !== 'texts') return null
  const out: { of: string; id: string; text: string }[] = []
  let ok = true
  const rest = m[3].replace(PLAIN_TEXT, (_, attrs: string, raw: string) => {
    const a = attrMap(attrs)
    // eslint-disable-next-line no-control-regex
    if (!a || /[\x00-\x08\x0b\x0c\x0e-\x1f\r]|]]>/.test(raw)) ok = false
    const text = raw.replace(/&([a-z]*);?/g, (all, name: string) => {
      if (!all.endsWith(';') || !(name in ENTITY)) ok = false
      return ENTITY[name] ?? ''
    })
    out.push({ of: a?.get('of') ?? '', id: a?.get('id') ?? '', text })
    return ''
  })
  return ok && !rest.trim() ? out : null
}

export function buildSr6Catalog(files: SourceFile[]): Sr6Catalog {
  const c: Sr6Catalog = {
    entries: Object.fromEntries(Object.keys(SR6_KINDS).map(k => [k, new Map()])) as Sr6Catalog['entries'],
    sources: new Map(),
    original: new Map(),
    moved: new Map(),
    files: [],
    errors: [],
  }
  for (const f of files) {
    const plain = plainTexts(f.xml)
    if (plain) {
      for (const t of plain) {
        const e = KINDS.has(t.of) ? c.entries[t.of as Sr6Kind].get(t.id) : undefined
        if (e) e.text = t.text
      }
      c.files.push({ file: f.file, kind: 'texts', entries: plain.length })
      continue
    }
    const doc = new DOMParser().parseFromString(f.xml, 'text/xml')
    const perr = doc.getElementsByTagName('parsererror')[0]
    if (perr) {
      c.errors.push({ file: f.file, message: `XML parse error: ${perr.textContent?.trim().split('\n')[0]}` })
      continue
    }
    const root = doc.documentElement,
      kind = root.getAttribute('kind') ?? ''
    if (root.localName !== 'data' || root.namespaceURI !== SR6_NS) {
      c.errors.push({ file: f.file, message: 'not an SR6 data file' })
      continue
    }
    let els = [...root.children]
    if (kind === 'compendium') {
      const r = readSr6Compendium(f.xml)
      if (!r.ok) {
        c.errors.push({ file: f.file, message: r.error })
        continue
      }
      const comp = r.compendium
      // a book's source id (imported after the compendium was made): the book keeps it, the compendium waits
      if (c.sources.has(comp.source)) {
        c.errors.push({ file: f.file, message: `its source id ${comp.source} is already a book’s; its entries didn’t load` })
        continue
      }
      c.sources.set(comp.source, sr6CompendiumSource({ ...comp, owner: f.owner, ownerName: f.publisher }))
      let n = 0
      for (const e of comp.entries) {
        const had = c.entries[e.kind].get(e.id)
        if (had && had.source !== comp.source) {
          c.errors.push({ file: f.file, message: `<${SR6_KINDS[e.kind].tag}> ${e.id}: ${had.source} already has that id; it didn’t load` })
          continue
        }
        c.entries[e.kind].set(e.id, e)
        n++
      }
      c.files.push({ file: f.file, kind, entries: n }) // its NPCs aren't catalog entries
      continue
    }
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
        // a book sample runner's printed lines corrected: not a catalog entry (src/sr6/runner-builder/domain/creation/samplefix.ts)
        for (const el of els.filter(x => x.localName === 'samplefix')) {
          const a = (n: string) => el.getAttribute(n) ?? ''
          c.sampleFixes ??= new Map()
          c.sampleFixes.set(a('id'), {
            id: a('id'),
            source: a('source'),
            page: Number(a('page')) || 0,
            by: el.getAttribute('by') ?? undefined,
            name: [...el.children].find(k => k.localName === 'name')?.textContent ?? '',
            text: [...el.children].find(k => k.localName === 'text')?.textContent ?? '',
            corrects: [...el.children]
              .filter(k => k.localName === 'correct')
              .map(k => ({
                item: k.getAttribute('item') ?? '',
                field: (k.getAttribute('field') ?? 'rating') as 'rating',
                from: k.getAttribute('from') ?? '',
                to: k.getAttribute('to') ?? '',
                ...(k.getAttribute('note') ? { note: k.getAttribute('note')! } : {}),
              })),
          })
        }
        els = els.filter(x => x.localName !== 'samplefix')
        const edits = els.map(el => {
          const k = KIND_OF_TAG.get(el.localName)
          if (!k) throw new Error(`<${el.localName}> isn’t an SR6 entry`)
          return toEntry(el, k)
        })
        els.forEach((el, i) => {
          const e = edits[i],
            map = c.entries[e.kind],
            prev = map.get(e.id)
          if (prev && !prev.edited) c.original.set(entryKey(e.kind, e.id), prev)
          if (!e.text && prev) e.text = prev.text
          const book = c.original.get(entryKey(e.kind, e.id))
          if (book) {
            // a field the edit sets otherwise drops the book's formula and issue for it (the book's stay in `original`);
            // the edit's own formulas win, the book's fill in the rest
            const changed = (f: string) => (e.attrs[f] ?? '') !== (book.attrs[f] ?? '')
            const own = new Set(e.formulas?.map(f => f.field))
            const formulas = [...(e.formulas ?? []), ...(book.formulas ?? []).filter(f => !own.has(f.field) && !changed(f.field))]
            const issues = openIssues(book.issues, changed) ?? []
            if (formulas.length) e.formulas = formulas
            else delete e.formulas
            if (issues.length) e.issues = issues
            else delete e.issues
          }
          map.set(e.id, { ...e, edited: true, by: el.getAttribute('by') ?? undefined })
        })
      } else if (KINDS.has(kind)) {
        const k = kind as Sr6Kind,
          tag = SR6_KINDS[k].tag
        const bad = els.find(el => el.localName !== tag && el.localName !== 'remove')
        if (bad) throw new Error(`<${bad.localName}> doesn’t belong in a ${kind} file (<${tag}> entries only)`)
        const entries = els.filter(el => el.localName === tag).map(el => toEntry(el, k))
        for (const e of entries) c.entries[k].set(e.id, e)
        // an id the entry had in an earlier import (importer/sr6/moved.py): resolveEntry finds it under the old one
        els.forEach(el => {
          for (const a of el.children)
            if (a.localName === 'alias' && a.getAttribute('id')) {
              const from = a.getAttribute('kind') ?? k
              if (KINDS.has(from)) c.moved.set(entryKey(from as Sr6Kind, a.getAttribute('id')!), { kind: k, id: el.getAttribute('id') ?? '' })
            }
        })
        for (const el of els.filter(el => el.localName === 'remove')) c.entries[k].delete(el.getAttribute('id') ?? '')
      } else throw new Error(`unknown kind "${kind}"`)
    } catch (e) {
      c.errors.push({ file: f.file, message: (e as Error).message })
      continue
    }
    c.files.push({ file: f.file, kind, entries: els.filter(el => el.localName !== 'remove').length })
  }
  formulaIssues(c)
  expandLevels(c) // (one entry per level, after the edits so an edit on the rated entry reaches every level)
  return c
}

/** A formula that can't be worked out (it can't be read, or refers to an entry or value that isn't there) is an issue of
 *  its entry, so Game data, the pickers and Review show it; the entry stays unpriced, never 0. Checked at its lowest rating. */
function formulaIssues(c: Sr6Catalog) {
  const find = catalogFind(c)
  for (const map of Object.values(c.entries))
    for (const e of map.values())
      for (const f of e.formulas ?? []) {
        const r = bookValue(e, f.field, ratingRange(e.attrs.rating)[0], find)
        if (r.error && !e.issues?.some(x => x.field === f.field))
          e.issues = [...(e.issues ?? []), { field: f.field, code: 'unreadable', note: `its formula: ${r.error}` }]
      }
}

/** The entry of (kind, id), the rated parent of a family of levels (out of the lists, still read by id: levels.ts), or
 *  the one an old id (an earlier import's, see Sr6Catalog.moved) now names: it may be of another kind. */
export function resolveEntry(c: Pick<Sr6Catalog, 'entries' | 'moved' | 'levels'>, kind: Sr6Kind, id: string): Sr6Entry | undefined {
  const e = c.entries[kind]?.get(id) ?? c.levels?.get(entryKey(kind, id))?.parent
  if (e) return e
  const m = c.moved?.get(entryKey(kind, id))
  return m && (c.entries[m.kind].get(m.id) ?? c.levels?.get(entryKey(m.kind, m.id))?.parent)
}

/** The catalog's entries by kind and id (a family's parent too), for a formula's ref(). */
export const catalogFind =
  (c: Sr6Catalog): Find =>
  (kind, id) =>
    KINDS.has(kind) ? (c.entries[kind as Sr6Kind].get(id) ?? c.levels?.get(entryKey(kind as Sr6Kind, id))?.parent) : undefined

const hrefs = (index: string) => [...index.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<file\s+href="([^"]+)"/g)].map(m => m[1])

/** Every SR6 file, in load order (see the top of this file). `get` returns a file's text, or null when it isn't there;
 * `missing` lists the files an index or source names that weren't. cl6only: the optional data set too
 * (custom/sr6/cl6only/index.xml and its files, after the books': the table's cl6OnlyData setting); off, none of it. */
export async function collectSr6Files(
  get: (path: string) => Promise<string | null>,
  extra: SourceFile[] = [],
  cl6only = false,
): Promise<{ files: SourceFile[]; missing: string[] }> {
  const files: SourceFile[] = [],
    missing: string[] = []
  // each file's fetch starts as soon as its name is known (a few hundred one after another were seconds of round
  // trips); they are still added in load order
  const asked = new Map<string, Promise<string | null>>()
  const fetchOnce = (path: string) => asked.get(path) ?? asked.set(path, get(path)).get(path)!
  const add = async (path: string, listed = false) => {
    const xml = await fetchOnce(path)
    if (xml != null) files.push({ file: path, xml, overlay: !path.startsWith(SHIPPED) })
    else if (listed) missing.push(path)
    return xml
  }
  const first = [
    `${SHIPPED}sources.xml`,
    `${CUSTOM}imported/sources.xml`,
    `${CUSTOM}imported/index.xml`,
    ...['edits', 'texts'].map(e => `${CUSTOM}edits/${e}.xml`),
  ]
  first.forEach(fetchOnce)
  const module = cl6only ? fetchOnce(`${CL6ONLY}index.xml`) : null
  const sources = [await add(first[0], true), await add(first[1])]
  const index = await fetchOnce(first[2])
  const listed = await module
  if (cl6only && listed == null) missing.push(`${CL6ONLY}index.xml`)
  const books = [
    ...(index ? hrefs(index) : []).map(href => `${CUSTOM}imported/${href}`),
    ...(listed ? hrefs(listed) : []).filter(href => /^[\w.-]+\.xml$/.test(href) && !href.startsWith('.')).map(href => CL6ONLY + href),
  ]
  const texts = [...new Set([...sources.join('').matchAll(/\btexts="([^"]+)"/g)].map(m => CUSTOM + m[1]))]
  ;[...books, ...texts].forEach(fetchOnce)
  for (const path of books) await add(path, true)
  for (const path of texts) await add(path)
  for (const path of first.slice(3)) await add(path)
  files.push(...extra)
  return { files, missing }
}

/** Fetch and build the SR6 catalog, plus `extra` overlay files (the readable compendiums, src/sr6/compendiums/ui/compendiumStore.ts)
 * and, with cl6only, the optional data set. An unreachable server fails the load; missing custom files are listed as errors. */
export async function loadSr6Catalog(base = './', extra: SourceFile[] = [], cl6only = false): Promise<Sr6Catalog> {
  const get = (path: string) =>
    fetch(base + path, { cache: 'no-cache' }).then(
      r => (r.ok ? r.text() : null),
      e => {
        if (path.startsWith(SHIPPED)) throw e
        return null
      },
    )
  const { files, missing } = await collectSr6Files(get, extra, cl6only)
  const c = buildSr6Catalog(files)
  for (const m of missing) c.errors.push({ file: m, message: 'could not be fetched' })
  return c
}
