/** Book NPC helpers for the NPC lists: which book NPCs to load, tidying their copies, and the list's grouping. Pure. */
import { unedited } from '../../../features/runner-store/runnerList'
import { SR6_NPC_KINDS, type Sr6Character } from '../../formats/domain/character'
import type { Sr6Catalog, Sr6Entry } from '../../formats/domain/types'
import { bookNpcKey, bookNpcVersions, NPC_KINDS, type BookNpcVersion } from '../../runner-builder/domain/creation/npc'

export const nameOf = (ch: Sr6Character) => ch.identity.streetName || ch.identity.name || 'Unnamed NPC'

/** The book NPCs' versions (bookNpcVersions); a compendium's (a source of origin user) never: those are moved, not copied. */
export const versionsOf = (entries: Sr6Entry[], sources: Sr6Catalog['sources']) =>
  bookNpcVersions(
    entries.filter(e => sources.get(e.source)?.origin !== 'user'),
    sources,
  )

/** The book NPCs Load book NPCs adds, each with the name it loads under: per version, its earliest printing, unless the
 *  book key of one of its printings is the sampleKey of one of `mine` (a renamed copy counts). */
export function bookNpcsToLoad(entries: Sr6Entry[], mine: Sr6Character[], sources: Sr6Catalog['sources']): { e: Sr6Entry; name: string }[] {
  const have = new Set(mine.map(ch => ch.sampleKey))
  return versionsOf(entries, sources)
    .filter(v => !v.entries.some(e => have.has(bookNpcKey(e))))
    .map(v => ({ e: v.entries[0], name: v.name }))
}

/** Tidy book copies: among `mine`'s untouched book copies (a book key the catalog has, unedited since loaded: saved once),
 *  one per version stays, the copy of its earliest printing (then the oldest); the others go to the NPC trash. The one
 *  that stays is renamed when its name isn't its version's ("Fuzzbeast #2"). NPCs the GM made or changed never count. */
export function tidyBookCopies<S extends { ch: Sr6Character; rev?: number }>(mine: S[], entries: Sr6Entry[], sources: Sr6Catalog['sources']) {
  const at = new Map(versionsOf(entries, sources).flatMap(v => v.entries.map((e, i) => [bookNpcKey(e), { v, i }] as const)))
  const copies = new Map<BookNpcVersion, { s: S; i: number }[]>()
  for (const s of mine) {
    const a = s.ch.sampleKey ? at.get(s.ch.sampleKey) : undefined
    if (a && unedited(s.ch, s.rev)) copies.set(a.v, [...(copies.get(a.v) ?? []), { s, i: a.i }])
  }
  const trash: S[] = [],
    rename: { s: S; name: string }[] = []
  for (const [v, cs] of copies) {
    const [keep, ...extra] = cs.sort((a, b) => a.i - b.i || a.s.ch.updatedAt.localeCompare(b.s.ch.updatedAt))
    trash.push(...extra.map(x => x.s))
    if (nameOf(keep.s.ch) !== v.name) rename.push({ s: keep.s, name: v.name })
  }
  return { trash, rename }
}

/** A copy of a book sample contact that 0.9.0 loaded as a grunt of group Contact. */
export const oldContact = (ch: Sr6Character) => !!ch.sampleKey && ch.npc?.kind === 'grunt' && ch.npc.group === 'Contact' && ch.npc.rating == null

/** Grunts by Professional Rating, lowest first; null (none printed) last. */
export function byRating(entries: Sr6Entry[]): [number | null, Sr6Entry[]][] {
  const groups = new Map<number | null, Sr6Entry[]>()
  for (const e of entries) {
    const r = Number(e.attrs.rating) || null
    groups.set(r, [...(groups.get(r) ?? []), e])
  }
  return [...groups].sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
}

/** The list's groups, in kind order then rating (none last), each keeping the list's order: "Grunts, Professional Rating 2",
 *  "Contacts", "Critters", "Spirits, Force 4", "Sprites, Level 3". */
export function npcGroups<T extends { ch: Sr6Character }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, { at: number; r: number; rows: T[] }>()
  for (const x of rows) {
    const npc = x.ch.npc,
      kind = npc?.kind ?? 'grunt',
      k = NPC_KINDS[kind],
      r = npc?.rating
    const label = `${k.label}s${k.rating ? (r != null ? `, ${k.rating.label} ${r}` : `, no ${k.rating.label}`) : ''}`
    const g = groups.get(label) ?? { at: SR6_NPC_KINDS.indexOf(kind), r: r ?? Infinity, rows: [] }
    groups.set(label, { ...g, rows: [...g.rows, x] })
  }
  return [...groups].sort(([, a], [, b]) => a.at - b.at || a.r - b.r).map(([label, g]) => [label, g.rows])
}

/** The Professional Ratings the grunts in the list have, lowest first (the picker beside the search). */
export const gruntRatings = (rows: { ch: Sr6Character }[]) =>
  [...new Set(rows.flatMap(({ ch }) => (ch.npc?.kind === 'grunt' && ch.npc.rating != null ? [ch.npc.rating] : [])))].sort((a, b) => a - b)
/** The rows at a Professional Rating ('': all of them); a rating leaves out whatever has none (contacts, critters). */
export const atRating = <T extends { ch: Sr6Character }>(rows: T[], pr: string): T[] =>
  pr === '' ? rows : rows.filter(({ ch }) => ch.npc?.rating === Number(pr) && ch.npc.kind === 'grunt')
