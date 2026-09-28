// Old runners store unscoped catalogIds (spec §4 last bullet). rescope maps an entry whose
// catalogId isn't in the catalog to `<source>.<id>` using its snapshot's source, falling back
// to any scoped entry with the same normalized name and type/kind.
import { normalizeName } from './dupes'
import type { AmpEntry, Catalog, Character, ItemEntry } from '../model/types'

function rescopeAmp(c: Catalog, e: AmpEntry): AmpEntry {
  if (!e.catalogId || c.amps.has(e.catalogId)) return e
  const source = e.snapshot?.source?.toLowerCase()
  const scoped = source ? `${source}.${e.catalogId}` : undefined
  if (scoped && c.amps.has(scoped)) return { ...e, catalogId: scoped }
  const name = normalizeName(e.snapshot?.name ?? e.name)
  const match = [...c.amps.values()].find(a => a.type === e.type && normalizeName(a.name) === name)
  return match ? { ...e, catalogId: match.id } : e
}

function rescopeItem(c: Catalog, e: ItemEntry): ItemEntry {
  if (!e.catalogId || c.items.has(e.catalogId)) return e
  const source = e.snapshot?.source?.toLowerCase()
  const scoped = source ? `${source}.${e.catalogId}` : undefined
  if (scoped && c.items.has(scoped)) return { ...e, catalogId: scoped }
  const name = normalizeName(e.snapshot?.name ?? e.name)
  const match = [...c.items.values()].find(i => i.kind === e.kind && normalizeName(i.name) === name)
  return match ? { ...e, catalogId: match.id } : e
}

function mapUnlessSame<T>(arr: T[], fn: (e: T) => T): T[] {
  const out = arr.map(fn)
  return out.some((e, i) => e !== arr[i]) ? out : arr
}

/** Rescope every amp/item on the runner (build + career events) whose catalogId is stale.
 * Returns `ch` unchanged (same identity) when nothing needed remapping. */
export function rescope(c: Catalog, ch: Character): Character {
  const amps = mapUnlessSame(ch.build.amps, e => rescopeAmp(c, e))
  const items = mapUnlessSame(ch.build.items, e => rescopeItem(c, e))
  const career = mapUnlessSame(ch.career, ev => {
    if (ev.type === 'buy') { const item = rescopeItem(c, ev.item); return item === ev.item ? ev : { ...ev, item } }
    if (ev.type === 'amp-add') { const amp = rescopeAmp(c, ev.amp); return amp === ev.amp ? ev : { ...ev, amp } }
    if (ev.type === 'amp-modify') {
      const before = rescopeAmp(c, ev.before), after = rescopeAmp(c, ev.after)
      return before === ev.before && after === ev.after ? ev : { ...ev, before, after }
    }
    return ev
  })
  if (amps === ch.build.amps && items === ch.build.items && career === ch.career) return ch
  return { ...ch, build: { ...ch.build, amps, items }, career }
}
