// Duplicates: entries of the same type whose names match once case, punctuation and a "(Type)" suffix
// are ignored (spec §4). All are kept; pickers tell them apart by the Non-canon badge when the canon
// status differs, else by a label with each one's book.
import type { Catalog, Ref } from '../model/types'
import { isCanon } from './canon'

export const normalizeName = (s: string) => s.toLowerCase()
  .replace(/\s*\((cyberware|bioware|quality|adept power|equipment|weapon|vehicle|drone)\)\s*$/i, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()

const entries = (c: Catalog): [key: string, e: Ref][] => [
  ...[...c.amps.values()].map(a => [`${a.type}|${normalizeName(a.name)}`, a] as [string, Ref]),
  ...[...c.items.values()].map(i => [`${i.kind}|${normalizeName(i.name)}`, i] as [string, Ref]),
  ...[...c.rules.values()].map(r => [`rule|${normalizeName(r.title)}`, r] as [string, Ref]),
]

const cache = new WeakMap<Catalog, { groups: Map<string, string[]>; byId: Map<string, Ref[]> }>()
function index(c: Catalog) {
  let x = cache.get(c)
  if (!x) {
    const all = new Map<string, Ref[]>()
    for (const [k, e] of entries(c)) all.set(k, [...all.get(k) ?? [], e])
    const dupes = [...all].filter(([, g]) => g.length > 1)
    x = { groups: new Map(dupes.map(([k, g]) => [k, g.map(e => e.id)])), byId: new Map(dupes.flatMap(([, g]) => g.map(e => [e.id, g]))) }
    cache.set(c, x)
  }
  return x
}

/** Every duplicate group: key `type|normalized name` (amps by amp type, items by kind, rules) → entry ids. */
export const dupeGroups = (c: Catalog): Map<string, string[]> => index(c).groups

export type DupeLabel = { kind: 'badge' } | { kind: 'book'; text: string; title: string }

/** How a picker tells `id` apart from its duplicates: the Non-canon badge when its canon status is unique
 * in the group, else a label with its book; null when it has no duplicates. */
export function dupeLabel(c: Catalog, id: string): DupeLabel | null {
  const group = index(c).byId.get(id)
  if (!group) return null
  const self = group.find(e => e.id === id)!
  // the badge tells this one apart only when no other entry in the group shares its canon status
  if (group.filter(e => isCanon(c, e) === isCanon(c, self)).length === 1) return { kind: 'badge' }
  const source = self.source
  return { kind: 'book', text: source, title: c.sources.get(source)?.name ?? source }
}
