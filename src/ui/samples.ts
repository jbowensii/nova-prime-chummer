// The imported books' sample runners in a library: which sample a runner is (a stable key, not its id: a re-import can
// give a sample a new file id, and each account gets copies with ids of its own), and which copies are unmodified
// duplicates the library's tidy-up may move to the trash.
import { characterToXml } from '../engine'
import type { Character } from '../model/types'

const slug = (s: string) => s.normalize('NFKD').toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-') || 'runner'
/** "<source>.<name slug>": the source and the sample's own name, as the samples list gives them. */
export const sampleKey = (source: string, name: string) => `${source.toLowerCase()}.${slug(name)}`

/** The sample a runner was loaded from: its recorded key, or for one loaded before keys were recorded, its origin (the
 *  sample's source) and name. null: not a sample. */
export const keyOf = (ch: Character) =>
  ch.sampleKey ?? (ch.origin ? sampleKey(ch.origin, ch.identity.streetName || ch.identity.name) : null)

/** The samples list's rows, each with its key; a second sample of the same name in one source gets "-2", and so on. */
export function keyed<T extends { source: string; name: string }>(rows: T[]): (T & { key: string })[] {
  const seen = new Map<string, number>()
  return rows.map(r => {
    const base = sampleKey(r.source, r.name), n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...r, key: n > 1 ? `${base}-${n}` : base }
  })
}

/** Everything but the id, the timestamps and the key: two copies with the same fingerprint are the same runner. */
const fingerprint = (ch: Character) => characterToXml({ ...ch, id: '', updatedAt: '', lastExportedAt: undefined, sampleKey: undefined })

/** The unmodified duplicate samples among `runners` (one account's own): a sample runner identical to an earlier copy of the
 *  same sample apart from id and timestamps. The oldest copy stays; an edited copy is never one. */
export function duplicateSamples(runners: Character[]): Character[] {
  const kept = new Map<string, Set<string>>(), out: Character[] = []
  for (const ch of [...runners].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    const key = keyOf(ch)
    if (!key) continue
    const f = fingerprint(ch), have = kept.get(key) ?? new Set()
    if (have.has(f)) out.push(ch)
    else kept.set(key, have.add(f))
  }
  return out
}
