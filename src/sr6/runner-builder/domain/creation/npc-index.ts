// NPC catalog index: the per-catalog WeakMap cache of name lookups the matchers share.
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import { matchKey, normName } from '../../../catalog/domain/names'
import { type Index } from './npc-types'

const indexes = new WeakMap<Sr6Catalog['entries'], Index>()
export function indexOf(c: Sr6Catalog): Index {
  let x = indexes.get(c.entries)
  if (x) return x
  x = { exact: new Map(), loose: new Map(), categories: new Map(), classes: new Map(), initials: new Map(), mids: new Map() }
  const add = <K>(m: Map<K, Sr6Entry[]>, k: K, e: Sr6Entry) => m.set(k, [...(m.get(k) ?? []), e])
  const loose = new Map<Sr6Kind, Map<string, Sr6Entry[]>>()
  const each = (k: Sr6Kind, name: string, e: Sr6Entry) => {
    add(x!.exact, `${k}/${normName(name)}`, e)
    add(loose.get(k) ?? loose.set(k, new Map()).get(k)!, matchKey(name), e)
  }
  for (const [k, map] of Object.entries(c.entries) as [Sr6Kind, Map<string, Sr6Entry>][])
    for (const e of map.values()) {
      each(k, e.name, e)
      if (e.attrs.category) add(x.categories.get(k) ?? x.categories.set(k, new Map()).get(k)!, matchKey(e.attrs.category), e)
      if (e.attrs.class && (k === 'gear' || k === 'weapons')) add(x.classes, e.attrs.class, e)
      const words = normName(e.name)
        .split(' ')
        .filter(w => !['and', 'of', 'the'].includes(w))
      if (words.length >= 3) add(x.initials, words.map(w => w[0]).join(''), e)
      // (and without a leading brand: `AAS` is `Securetech Armor Augmentation System`)
      if (words.length >= 4)
        add(
          x.initials,
          words
            .slice(1)
            .map(w => w[0])
            .join(''),
          e,
        )
    }
  // a variant named alone is the entry's (`Reakt`: Genotype Enhancement (Reakt); `Savior System`: Therapeutic Nanites (Savior
  // System) Nanites, the nanites before the colony): inside an entry's name, or of an augmentation family of three or more;
  // none when two families have it (`Plastic`, `Large`)
  const family = new Map<string, number>()
  const fam = (e: Sr6Entry) => e.name.match(/^(.*?)\s*\(([^()]+)\)$/)
  for (const e of c.entries.augmentations?.values() ?? []) {
    const m = fam(e)
    if (m) family.set(matchKey(m[1]), (family.get(matchKey(m[1])) ?? 0) + 1)
  }
  const raw: [string, string, Sr6Entry][] = []
  for (const k of ['gear', 'augmentations'] as const)
    for (const e of c.entries[k]?.values() ?? []) {
      const mid = e.name.match(/^(.*?)\s*\(([^()]+)\)\s+\S+$/),
        end = k === 'augmentations' ? fam(e) : null
      if (mid) raw.push([mid[2], matchKey(mid[1]), e])
      else if (end && (family.get(matchKey(end[1])) ?? 0) >= 3 && /[a-z]{4}/i.test(end[2]) && !/^(?:rating|level)/i.test(end[2]))
        raw.push([end[2], matchKey(end[1]), e])
    }
  // (every family that has the variant counts, small or large)
  const stems = new Map<string, Set<string>>()
  const seen = (v: string, stem: string) => stems.set(matchKey(v), (stems.get(matchKey(v)) ?? new Set()).add(stem))
  for (const [v, stem] of raw) seen(v, stem)
  for (const e of c.entries.augmentations?.values() ?? []) {
    const m = fam(e)
    if (m) seen(m[2], matchKey(m[1]))
  }
  for (const [v, , e] of raw.sort((a, b) => Number(/nanites$/i.test(b[2].name)) - Number(/nanites$/i.test(a[2].name))))
    if (stems.get(matchKey(v))!.size === 1) add(x.mids, matchKey(v), e)
  // a rated family's name (`Glow Eyes`, its levels `Glow Eyes 1`…): its lowest level
  for (const f of c.levels?.values() ?? []) {
    const e = f.parent && c.entries[f.kind].get(f.levels.get(Math.min(...f.levels.keys()))!)
    if (e && !x.exact.has(`${f.kind}/${normName(f.parent!.name)}`)) each(f.kind, f.parent!.name, e)
  }
  for (const [k, m] of loose)
    x.loose.set(
      k,
      [...m].map(([key, entries]) => ({ key, entries })),
    )
  indexes.set(c.entries, x)
  return x
}
