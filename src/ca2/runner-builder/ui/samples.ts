// The example characters: the imported books' sample runners (custom/imported/samples.xml) and the server's example sets
// (custom/samples/<set>/, GET /api/samples). A character is its name; each has at most one canon version (from a canon
// book or a canon set) and one non-canon version. A library holds one copy per key "<name slug>|canon" or
// "<name slug>|noncanon", recorded on the copy as sampleKey, so loading again, a re-import with new ids or an old copy
// of the same character never adds a second one.
import { characterToXml, xmlToCharacter } from '../../formats/domain/charxml'
import { parseCharacterFile } from '../../formats/domain/file'
import type { Character } from '../../formats/domain/types'
import { unedited } from '../../../features/runner-store/runnerList'

/** What the library needs of a source: canon, and when its book was imported. Looked up case-insensitively. */
export type SourceInfo = { canon: boolean; imported?: string }
export type Sources = (id: string) => SourceInfo | undefined

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-') || 'runner'
export const exampleKey = (name: string, canon: boolean) => `${slug(name)}|${canon ? 'canon' : 'noncanon'}`

/** A character file: our XML, or the older .ca2.json. */
export const readCharacterFile = (text: string) => (text.trimStart().startsWith('<') ? xmlToCharacter(text) : parseCharacterFile(text))

/** The rows of an importer list, custom/imported/samples.xml (<sample>) or npcs.xml (<npc>): url, name and source of each
 *  file (none before any import or when it can't be read). */
async function importedList(kind: 'samples' | 'npcs') {
  const res = await fetch(`./custom/imported/${kind}.xml`, { cache: 'no-cache' }).catch(() => null)
  const xml = res?.ok ? new DOMParser().parseFromString(await res.text(), 'text/xml') : null
  return xml?.documentElement.localName === kind
    ? [...xml.documentElement.getElementsByTagName(kind.slice(0, -1))].map(s => ({
        url: `./custom/imported/${s.getAttribute('href')}`,
        name: s.getAttribute('name') ?? '',
        source: s.getAttribute('source') ?? '',
      }))
    : []
}

/** The imported books' sample runners (custom/imported/samples.xml). Canon: the book's source. */
export const bookSamples = async (sources: Sources): Promise<Example[]> =>
  (await importedList('samples')).map(s => ({ ...s, canon: !!sources(s.source)?.canon }))

/** The imported books' NPCs, critters and spirits (custom/imported/npcs.xml). */
export const bookNpcs = () => importedList('npcs')

/** Fetches and reads one example character file; a fetch that fails reads as "couldn’t be fetched.". */
export async function readSample(url: string) {
  const res = await fetch(url).catch(() => null)
  if (!res?.ok) return { ok: false as const, reason: 'couldn’t be fetched.' }
  return readCharacterFile(await res.text())
}

/** Which version wins, as a sortable string: a book's over a set's, then the newest import. */
const rank = (source: SourceInfo | undefined) => (source ? `1|${source.imported ?? ''}` : '0|')

/** The key a runner counts under: its recorded key, with a book's copy's canon-ness as its book (origin) has it now (the
 *  flag may have changed since the copy was loaded; the copy is the same book's character); for a copy loaded before keys
 *  had this form, its sampleKey ("<source>.<name slug>", 0.4.1) or origin gives the source and so the canon-ness; a
 *  first-release built-in copy (id "sample-…", no origin) is canon. null: not an example character. */
export function keyOf(ch: Character, sources: Sources): string | null {
  if (ch.sampleKey?.includes('|')) {
    const book = ch.origin ? sources(ch.origin) : undefined
    return book ? `${ch.sampleKey.slice(0, ch.sampleKey.lastIndexOf('|'))}|${book.canon ? 'canon' : 'noncanon'}` : ch.sampleKey
  }
  if (ch.sampleKey) {
    const dot = ch.sampleKey.indexOf('.')
    return `${ch.sampleKey.slice(dot + 1)}|${sources(ch.sampleKey.slice(0, dot))?.canon ? 'canon' : 'noncanon'}`
  }
  const name = ch.identity.streetName || ch.identity.name
  if (ch.origin) return exampleKey(name, !!sources(ch.origin)?.canon)
  return ch.id.startsWith('sample-') ? exampleKey(name, true) : null
}

/** A row of the example list: `source` is the book's source id, or none for an example set's runner (canon: the set's). */
export interface Example {
  url: string
  name: string
  source?: string
  set?: string
  canon: boolean
}

/** The version to load of each key: a canon book's over a set's (the newest import among books), the first on a tie.
 *  Two runners of the same name in one book or set are two characters: the second gets "-2" (as 0.4.1's keys did). */
export function chooseExamples(rows: Example[], sources: Sources): (Example & { key: string })[] {
  const best = new Map<string, Example & { key: string }>(),
    seen = new Map<string, number>()
  for (const r of rows) {
    const base = slug(r.name),
      from = `${r.source ?? ''}/${r.set ?? ''}/${base}`,
      n = (seen.get(from) ?? 0) + 1
    seen.set(from, n)
    const key = exampleKey(n > 1 ? `${base}-${n}` : base, r.canon),
      have = best.get(key)
    if (!have || rank(r.source ? sources(r.source) : undefined) > rank(have.source ? sources(have.source) : undefined)) best.set(key, { ...r, key })
  }
  return [...best.values()]
}

/** Where a copy came from: its book (origin, or a 0.4.1 sampleKey's source), else none (an example set). */
const sourceOf = (ch: Character) => ch.origin ?? (ch.sampleKey && !ch.sampleKey.includes('|') ? ch.sampleKey.split('.')[0] : undefined)

/** Everything but the id, the timestamps, the key and the campaign: two copies with the same fingerprint are the same runner. */
const fingerprint = (ch: Character) => characterToXml({ ...ch, id: '', updatedAt: '', lastExportedAt: undefined, sampleKey: undefined, campaign: undefined })

type Row = { ch: Character; rev?: number }

/** The extra copies among `runners` (one account's own): per key (keyOf), every copy beyond one. First, copies from before the "|" keys (0.4.0 and 0.4.1 stamped lastExportedAt at load time, so the
 *  date rule can't tell) that are identical apart from ids, dates and keys: the oldest stays, the rest are extra. Then
 *  edited copies always stay (and every unedited one is extra); otherwise the preferred version stays (a book's over a
 *  set's, the newest import), then the newest copy (the newer example file), the first on a tie. */
export function extraCopies(runners: Row[], sources: Sources): Character[] {
  const groups = new Map<string, Row[]>()
  for (const r of runners) {
    const key = keyOf(r.ch, sources)
    if (key) groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const out: Character[] = []
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const old = new Map<string, Row>()
    const when = (ch: Character) => `${ch.updatedAt}|${ch.lastExportedAt ?? ''}` // the oldest: then the first loaded
    for (const r of [...g].sort((a, b) => when(a.ch).localeCompare(when(b.ch)))) {
      if (r.ch.sampleKey?.includes('|')) continue
      const f = fingerprint(r.ch),
        first = old.get(f)
      if (first) {
        out.push(r.ch)
        g.splice(g.indexOf(r), 1)
      } else old.set(f, r)
    }
    if (g.length < 2) continue
    const loaded = new Map<string, string>()
    for (const { ch } of g) {
      const k = sourceOf(ch) ?? ''
      if (!loaded.has(k) || ch.updatedAt < loaded.get(k)!) loaded.set(k, ch.updatedAt)
    }
    const fresh = g.filter(r => unedited(r.ch, r.rev, loaded.get(sourceOf(r.ch) ?? '')))
    if (fresh.length < g.length) {
      out.push(...fresh.map(r => r.ch))
      continue
    }
    const score = (ch: Character) => `${rank(sourceOf(ch) ? sources(sourceOf(ch)!) : undefined)}|${ch.updatedAt}`
    const keep = g.reduce((a, b) => (score(b.ch) > score(a.ch) ? b : a))
    out.push(...g.filter(r => r !== keep).map(r => r.ch))
  }
  return out
}

/** Find duplicates: runners (or NPCs) that are the same character, by street name, real name (trimmed, any case) and
 *  metatype, whatever else differs (two loads of one example from two versions of its file, an edited copy). Each group
 *  lists the copy to keep first: an edited one (saved again: rev 2 or more) over an unedited one, then the newest. */
export function sameRunners<R extends Row>(runners: R[]): R[][] {
  const key = ({ ch }: Row) => [ch.identity.streetName, ch.identity.name].map(x => (x ?? '').trim().toLowerCase()).join('|') + `|${ch.identity.metatype}`
  const groups = new Map<string, R[]>()
  for (const r of runners) if (r.ch.identity.streetName?.trim() || r.ch.identity.name?.trim()) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]) // unnamed: can't tell
  const score = (r: Row) => `${(r.rev ?? 1) > 1 ? 1 : 0}|${r.ch.updatedAt}`
  return [...groups.values()].filter(g => g.length > 1).map(g => [...g].sort((a, b) => score(b).localeCompare(score(a))))
}
