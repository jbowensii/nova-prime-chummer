// The runner list's helpers, shared by both games' runner and NPC lists: order and search, other accounts' groups, and
// whether a copy is still as loaded.
import type { Character } from '../../ca2/formats/domain/types'
import type { Stored, Unreadable } from '../../core/ui-kit/repoContext'

export type SortBy = 'az' | 'za' | 'recent'
/** What the list's sort and search read (a runner of either game). */
type Listed = Pick<Character, 'identity' | 'updatedAt'>
/** The A–Z key: street name, else real name; accents, case and punctuation (O'Neil, "Doc") don't count. */
export const sortKey = (ch: Pick<Character, 'identity'>) =>
  (ch.identity.streetName || ch.identity.name)
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .toLowerCase()
/** The runner list's order: A–Z (the default), Z–A or newest edit first; unnamed runners last. `q` keeps those whose
 *  street name or real name contains it. */
export function arrange<T extends Listed>(rows: Stored<T>[], sort: SortBy, q: string): Stored<T>[] {
  const want = q.trim().toLowerCase()
  const hit = (s: Stored<T>) => !want || [s.ch.identity.streetName, s.ch.identity.name].some(n => n.toLowerCase().includes(want))
  const az = (a: Stored<T>, b: Stored<T>) => {
    const x = sortKey(a.ch),
      y = sortKey(b.ch)
    return !x !== !y ? (x ? -1 : 1) : x.localeCompare(y)
  }
  const by =
    sort === 'recent'
      ? (a: Stored<T>, b: Stored<T>) => b.ch.updatedAt.localeCompare(a.ch.updatedAt) || az(a, b)
      : sort === 'za'
        ? (a: Stored<T>, b: Stored<T>) => (!sortKey(a.ch) !== !sortKey(b.ch) ? az(a, b) : az(b, a))
        : az
  return rows.filter(hit).sort(by)
}
/** Other accounts' runners (the admin's view, an editor's campaigns), one group per owner: every owner with a runner
 *  or with a file that couldn't be read, so nothing is hidden. Rows sorted as the list is. */
export function ownerGroups<T extends Listed>(others: Stored<T>[], unreadable: Unreadable[], sort: SortBy, q: string) {
  const groups = new Map<string, { name: string; rows: Stored<T>[]; broken: Unreadable[] }>()
  const group = (owner: string, name?: string) => groups.get(owner) ?? groups.set(owner, { name: name ?? owner, rows: [], broken: [] }).get(owner)!
  for (const s of others) group(s.owner!, s.ownerName).rows.push(s)
  for (const u of unreadable) group(u.owner!, u.ownerName).broken.push(u)
  return [...groups].map(([owner, g]) => ({ owner, ...g, rows: arrange(g.rows, sort, q) }))
}

/** Loaded and never changed since. A load records the file's date as lastExportedAt (a copy from before that counts as
 *  loaded at the earliest date among copies of the same character from the same source: `loaded`). On the server: saved
 *  once (rev 1; any save after the load is an edit) and not dated after that load (a file changed outside the app). In
 *  browser storage (no rev): still dated exactly as loaded. */
export const unedited = (ch: Pick<Character, 'updatedAt' | 'lastExportedAt'>, rev?: number, loaded = ch.updatedAt) =>
  rev != null ? rev <= 1 && ch.updatedAt <= (ch.lastExportedAt ?? loaded) : ch.updatedAt === (ch.lastExportedAt ?? loaded)
