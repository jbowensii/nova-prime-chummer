// The example characters: the imported books' sample runners (custom/imported/samples.xml) and the server's example sets
// (custom/samples/<set>/, GET /api/samples). A character is its name; each has at most one canon version (from a canon
// book or a canon set) and one non-canon version. A library holds one copy per key "<name slug>|canon" or
// "<name slug>|noncanon", recorded on the copy as sampleKey, so loading again, a re-import with new ids or an old copy
// of the same character never adds a second one.
import type { Character } from '../model/types'

/** What the library needs of a source: canon, and when its book was imported. Looked up case-insensitively. */
export type SourceInfo = { canon: boolean; imported?: string }
export type Sources = (id: string) => SourceInfo | undefined

const slug = (s: string) => s.normalize('NFKD').toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-') || 'runner'
export const exampleKey = (name: string, canon: boolean) => `${slug(name)}|${canon ? 'canon' : 'noncanon'}`

/** Which version wins, as a sortable string: a book's over a set's, then the newest import. */
const rank = (source: SourceInfo | undefined) => source ? `1|${source.imported ?? ''}` : '0|'

/** The key a runner counts under: its recorded key; for a copy loaded before keys had this form, its sampleKey
 *  ("<source>.<name slug>", 0.4.1) or origin gives the source and so the canon-ness; a first-release built-in copy (id
 *  "sample-…", no origin) is canon. null: not an example character. */
export function keyOf(ch: Character, sources: Sources): string | null {
  if (ch.sampleKey?.includes('|')) return ch.sampleKey
  if (ch.sampleKey) {
    const dot = ch.sampleKey.indexOf('.')
    return `${ch.sampleKey.slice(dot + 1)}|${sources(ch.sampleKey.slice(0, dot))?.canon ? 'canon' : 'noncanon'}`
  }
  const name = ch.identity.streetName || ch.identity.name
  if (ch.origin) return exampleKey(name, !!sources(ch.origin)?.canon)
  return ch.id.startsWith('sample-') ? exampleKey(name, true) : null
}

/** A row of the example list: `source` is the book's source id, or none for an example set's runner (canon: the set's). */
export interface Example { url: string; name: string; source?: string; set?: string; canon: boolean }

/** The version to load of each key: a canon book's over a set's (the newest import among books), the first on a tie. */
export function chooseExamples(rows: Example[], sources: Sources): (Example & { key: string })[] {
  const best = new Map<string, Example & { key: string }>()
  for (const r of rows) {
    const key = exampleKey(r.name, r.canon), have = best.get(key)
    if (!have || rank(r.source ? sources(r.source) : undefined) > rank(have.source ? sources(have.source) : undefined)) best.set(key, { ...r, key })
  }
  return [...best.values()]
}

/** Loaded and never changed since: saved once (rev 1, or no rev in browser storage) and still dated as loaded (a load
 *  records that date as lastExportedAt; a copy from before that counts as loaded at the earliest date among copies of the
 *  same character from the same source: `loaded`). */
export const unedited = (ch: Character, rev?: number, loaded = ch.updatedAt) => (rev ?? 1) <= 1 && ch.updatedAt === (ch.lastExportedAt ?? loaded)

/** Where a copy came from: its book (origin, or a 0.4.1 sampleKey's source), else none (an example set). */
const sourceOf = (ch: Character) => ch.origin ?? (ch.sampleKey && !ch.sampleKey.includes('|') ? ch.sampleKey.split('.')[0] : undefined)

/** The extra copies among `runners` (one account's own): per key, every copy beyond one. Edited copies always stay (and
 *  then every unedited one is extra); otherwise the preferred version stays (a book's over a set's, the newest import),
 *  the oldest on a tie. */
export function extraCopies(runners: { ch: Character; rev?: number }[], sources: Sources): Character[] {
  const groups = new Map<string, { ch: Character; rev?: number }[]>()
  for (const r of runners) {
    const key = keyOf(r.ch, sources)
    if (key) groups.set(key, [...groups.get(key) ?? [], r])
  }
  const out: Character[] = []
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const loaded = new Map<string, string>()
    for (const { ch } of g) { const k = sourceOf(ch) ?? ''; if (!loaded.has(k) || ch.updatedAt < loaded.get(k)!) loaded.set(k, ch.updatedAt) }
    const fresh = g.filter(r => unedited(r.ch, r.rev, loaded.get(sourceOf(r.ch) ?? '')))
    if (fresh.length < g.length) { out.push(...fresh.map(r => r.ch)); continue }
    const score = (ch: Character) => rank(sourceOf(ch) ? sources(sourceOf(ch)!) : undefined)
    const keep = g.reduce((a, b) => score(b.ch) > score(a.ch) || (score(b.ch) === score(a.ch) && b.ch.updatedAt < a.ch.updatedAt) ? b : a)
    out.push(...g.filter(r => r !== keep).map(r => r.ch))
  }
  return out
}
