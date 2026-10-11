// Old runners store unscoped catalogIds (spec §4 last bullet), and ids of entries since split into levels (a family's
// id, engine/levels.ts levelFor: the level its effects rate as). rescope maps an entry whose
// catalogId isn't in the catalog to `<source>.<id>` using its snapshot's source, falling back
// to any scoped entry with the same normalized name and type/kind. When several books match by
// name, the canon one wins; among ties (or several non-canon), the lowest source id wins, so the
// pick never depends on Map iteration order.
import { isCanon } from './canon'
import { normalizeName } from './dupes'
import { levelFor } from './levels'
import type { AmpEntry, Catalog, Character, ItemEntry } from '../model/types'

function pickBest<T extends { source: string }>(c: Catalog, matches: T[]): T | undefined {
  return matches.reduce<T | undefined>((best, m) => {
    if (!best) return m
    const mCanon = isCanon(c, m), bCanon = isCanon(c, best)
    if (mCanon !== bCanon) return mCanon ? m : best
    return m.source.localeCompare(best.source) < 0 ? m : best
  }, undefined)
}

function rescopeAmp(c: Catalog, e: AmpEntry): AmpEntry {
  if (!e.catalogId || c.amps.has(e.catalogId)) return e
  // an entry the book prints with levels, split since into one entry per level (engine/levels.ts): its level
  const level = levelFor(c, e)
  if (level) return { ...e, catalogId: level.id }
  const source = e.snapshot?.source?.toLowerCase()
  if (source && e.catalogId.startsWith(`${source}.`)) return e // already scoped: an entry that is gone (a compendium's), kept as it is
  const scoped = source ? `${source}.${e.catalogId}` : undefined
  if (scoped && c.amps.has(scoped)) return { ...e, catalogId: scoped }
  const scopedLevel = scoped ? levelFor(c, { ...e, catalogId: scoped }) : undefined
  if (scopedLevel) return { ...e, catalogId: scopedLevel.id }
  const name = normalizeName(e.snapshot?.name ?? e.name)
  const match = pickBest(c, [...c.amps.values()].filter(a => a.type === e.type && normalizeName(a.name) === name))
  return match ? { ...e, catalogId: match.id } : e
}

function rescopeItem(c: Catalog, e: ItemEntry): ItemEntry {
  if (!e.catalogId || c.items.has(e.catalogId)) return e
  const source = e.snapshot?.source?.toLowerCase()
  if (source && e.catalogId.startsWith(`${source}.`)) return e // already scoped: an entry that is gone (a compendium's), kept as it is
  const scoped = source ? `${source}.${e.catalogId}` : undefined
  if (scoped && c.items.has(scoped)) return { ...e, catalogId: scoped }
  const name = normalizeName(e.snapshot?.name ?? e.name)
  const match = pickBest(c, [...c.items.values()].filter(i => i.kind === e.kind && normalizeName(i.name) === name))
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
